let makeWASocket = require("@whiskeysockets/baileys").default;
let { useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
let path = require('path');
let fs = require('fs');
let fetch = require('node-fetch');
let sessions = new Map();
let sessionsDir = path.join(process.cwd(), 'whatsapp-sessions');
let { makeInMemoryStore } = require("@whiskeysockets/baileys");
let QRCode = require('qrcode');


/* THIS IS A API WHICH USES BAILEYS TO CONNECT TO WHATSAPP WEB AND FORWARD MESSAGES TO THE WEBHOOK  
https://github.com/WhiskeySockets/Baileys.git
Documentation: https://whiskeysockets.dev/Baileys/
*/

// Add connection state tracking
let connectionStates = new Map();

// Add store configuration
const storeConfig = {
    // Time to keep messages in memory
    maxMessagesInMemory: 100,
    // Message retention time (24 hours)
    messageRetentionTime: 24 * 60 * 60 * 1000,
    // Enable message history syncing
    syncFullHistory: true
};

// Add at the top with other constants
let QR_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds
let MAX_SESSION_RETRIES = 3;
let SESSION_RETRY_DELAYS = new Map(); // Track retry attempts and timestamps

// Add function to restore sessions on startup
async function restoreSessions() {
    console.log(`restoreSessions: Starting to restore previous sessions\n`);
    
    // Create sessions directory if it doesn't exist
    if (!fs.existsSync(sessionsDir)) {
        console.log(`restoreSessions: Creating sessions directory\n`);
        fs.mkdirSync(sessionsDir, { recursive: true });
        return;
    }

    // Read all session directories
    let sessionDirs = fs.readdirSync(sessionsDir);
    console.log(`restoreSessions: Found ${sessionDirs.length} previous sessions\n`);

    // Restore each session
    for (let sessionId of sessionDirs) {
        try {
            console.log(`restoreSessions: Restoring session ${sessionId}\n`);
            await startBaileysConnection(sessionId);
        } catch (error) {
            console.error(`restoreSessions: Error restoring session ${sessionId}: ${error}\n`);
        }
    }
}

// Add this helper function at the top with other functions
function ensureSessionDir(sessionDir) {
    try {
        if (!fs.existsSync(sessionDir)) {
            console.log(`ensureSessionDir: Creating session directory at ${sessionDir}\n`);
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        return true;
    } catch (error) {
        console.error(`ensureSessionDir: Error creating directory: ${error}\n`);
        return false;
    }
}

async function startBaileysConnection(sessionId = 'default') {
    let sessionDir = path.join(process.cwd(), 'whatsapp-sessions', sessionId);
    
    // Check if session directory exists before proceeding
    if (!fs.existsSync(sessionDir)) {
        console.log(`startBaileysConnection #432: Session directory not found for ${sessionId}`);
        throw new Error('Session directory not found');
    }

    // Check if auth files exist in the directory
    let authFiles = fs.readdirSync(sessionDir);
    if (!authFiles.length) {
        console.log(`startBaileysConnection #433: No auth files found in session directory ${sessionId}`);
        throw new Error('No authentication files found');
    }

    let store = makeInMemoryStore(storeConfig);
    
    // Rest of retry checking logic
    let retryInfo = SESSION_RETRY_DELAYS.get(sessionId) || { count: 0, lastAttempt: 0 };
    let now = Date.now();
    
    if (retryInfo.count >= MAX_SESSION_RETRIES) {
        console.log(`startBaileysConnection #876: Session ${sessionId} exceeded maximum retry attempts`);
        await cleanupSession(sessionId, null, sessionDir);
        SESSION_RETRY_DELAYS.delete(sessionId);
        throw new Error('Maximum retry attempts exceeded');
    }

    // Update retry info
    retryInfo.count++;
    retryInfo.lastAttempt = now;
    SESSION_RETRY_DELAYS.set(sessionId, retryInfo);

    // Add variables for QR timeout
    let qrStartTime = null;
    
    try {
        // Check if session already exists
        if (sessions.has(sessionId)) {
            console.log(`startBaileysConnection #543: Session ${sessionId} already exists`);
            return sessions.get(sessionId);
        }
        
        // Create sessions directory if it doesn't exist
        if (!fs.existsSync(sessionDir)) {
            console.log(`startBaileysConnection: Creating sessions directory at ${sessionDir}\n`);
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Load auth state
        console.log(`startBaileysConnection: Loading auth state #231\n`);
        let { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        // Create WA Socket connection
        let sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            markOnlineOnConnect: false,
            retryRequestDelayMs: 2000,
            connectTimeoutMs: 30000,
            defaultQueryTimeoutMs: 60000,
            browser: ['MacBook', 'Safari', '10.15.7'],
            // Add message retry options
            msgRetryCounterMap: {},
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id)
                    return msg?.message || null
                }
                return {
                    conversation: 'Message not found in store'
                }
            }
        });

        // Bind store to socket events
        store.bind(sock.ev);

        // Save store data to file
        const storeFile = path.join(sessionDir, 'store.json');
        store.writeToFile(storeFile);

        // Load store data on startup
        if (fs.existsSync(storeFile)) {
            store.readFromFile(storeFile);
        }

        // Modified QR code event handler with timeout
        let qrCode = null;
        let qrCodeImage = null;
        sock.ev.on('connection.update', async ({ qr, connection }) => {
            if (qr) {
                // Initialize QR start time if this is the first QR code
                if (!qrStartTime) {
                    qrStartTime = Date.now();
                    console.log(`startBaileysConnection #654: Starting QR timeout timer for ${sessionId}`);
                }

                // Check if we've exceeded the QR timeout
                if (Date.now() - qrStartTime > QR_TIMEOUT) {
                    console.log(`startBaileysConnection #876: QR code timeout reached for ${sessionId}`);
                    await cleanupSession(sessionId, sock, sessionDir);
                    throw new Error('QR code timeout reached');
                }

                qrCode = qr;
                try {
                    qrCodeImage = await QRCode.toDataURL(qr, {
                        errorCorrectionLevel: 'H',
                        margin: 1,
                        scale: 8,
                        width: 256
                    });
                    console.log(`startBaileysConnection: New QR code generated at ${qrCode}\n`);
                } catch (err) {
                    console.error(`startBaileysConnection: Error generating QR PNG: ${err} #432\n`);
                }
            }
        });

        // Add message handling
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            let webhookUrl = process.env.WEBHOOK_URL;
            
            console.log(`startBaileysConnection: Processing messages.upsert event for session ${sessionId}\n`);
            
            //if fromMe, skip
            if (messages[0]?.key?.fromMe) {
                return;
            }

            console.log(`startBaileysConnection: New message in ${sessionId}, type: ${type}\n`);
            
            for (let message of messages) {
                let msg = message.message;
                if (!msg) {
                    console.log(`startBaileysConnection: Skipping empty message\n`);
                    continue;
                }

                try {
                    // Extract message content based on type
                    let messageContent = {
                        id: message.key.id,
                        from: message.key.remoteJid?.trim()
                            .replace(/@s\.whatsapp\.net/g, '')
                            .replace(/@c\.us/g, '')
                            .replace(/\D/g, ''),
                        timestamp: message.messageTimestamp,
                        type: Object.keys(msg)[0], // Gets the message type (conversation, imageMessage, etc.)
                        text: msg.conversation || 
                             msg.extendedTextMessage?.text || 
                             msg.imageMessage?.caption ||
                             msg.videoMessage?.caption ||
                             msg.documentMessage?.caption || 
                             null,
                        // Media content
                        mediaUrl: msg.imageMessage?.url || 
                                msg.videoMessage?.url || 
                                msg.documentMessage?.url || 
                                null,
                        mimetype: msg.imageMessage?.mimetype || 
                                 msg.videoMessage?.mimetype || 
                                 msg.documentMessage?.mimetype || 
                                 null,
                        // Document specific
                        fileName: msg.documentMessage?.fileName || null,
                        // Contact card
                        vCard: msg.contactMessage?.vcard || null,
                        // Location
                        location: msg.locationMessage ? {
                            latitude: msg.locationMessage.degreesLatitude,
                            longitude: msg.locationMessage.degreesLongitude,
                            name: msg.locationMessage.name || null
                        } : null,
                        // Raw message object for complete data
                        rawMessage: message
                    };

                    let webhookPayload = {
                        sessionId,
                        messageType: type,
                        message: messageContent,
                        timestamp: new Date().toISOString()
                    };

                    console.log(`🐸 startBaileysConnection: Sending webhook payload for message ${message.key.id}\n`);
                   // console.log(`startBaileysConnection: Message content type: ${messageContent.type}\n`);
                    
                    let response = await fetch(webhookUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Origin': 'zaploop',
                        },
                        body: JSON.stringify(webhookPayload)
                    });

                    if (!response.ok) {
                        throw new Error(`Webhook request failed with status ${response.status}`);
                    }

                   // console.log(`startBaileysConnection: Successfully forwarded message ${message.key.id} to webhook\n`);
                } catch (error) {
                    console.error(`startBaileysConnection: Error processing message ${message?.key?.id}: ${error}\n`);
                }
            }
        });

        // Modified connection update handler
        sock.ev.on('connection.update', async (update) => {
            let { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                if (!qrStartTime) {
                    qrStartTime = Date.now();
                    console.log(`startBaileysConnection #654: Starting QR timeout timer for ${sessionId}`);
                }

                if (Date.now() - qrStartTime > QR_TIMEOUT) {
                    console.log(`startBaileysConnection #876: QR code timeout reached for ${sessionId}`);
                    await cleanupSession(sessionId, sock, sessionDir);
                    throw new Error('QR code timeout reached');
                }
            }

            if (connection === 'close') {
                let disconnectReason = lastDisconnect?.error?.output?.statusCode;
                let shouldReconnect = disconnectReason !== DisconnectReason.loggedOut && 
                                    disconnectReason !== DisconnectReason.connectionClosed &&
                                    retryInfo.count < MAX_SESSION_RETRIES;
                
                console.log(`startBaileysConnection #789: Session ${sessionId} disconnect reason: ${disconnectReason}`);
                console.log(`startBaileysConnection #790: Session ${sessionId} retry count: ${retryInfo.count}/${MAX_SESSION_RETRIES}`);
                
                if (shouldReconnect) {
                    console.log(`startBaileysConnection #791: Attempting retry for ${sessionId}`);
                    sessions.delete(sessionId);
                    await startBaileysConnection(sessionId);
                } else {
                    console.log(`startBaileysConnection #792: Terminating session ${sessionId}`);
                    await cleanupSession(sessionId, sock, sessionDir);
                    SESSION_RETRY_DELAYS.delete(sessionId);
                }
            }

            if (connection === 'open') {
                // Reset retry count on successful connection
                SESSION_RETRY_DELAYS.delete(sessionId);
            }
        });

        // Add error event handler
        sock.ev.on('error', (error) => {
            console.error(`startBaileysConnection: Socket error for session ${sessionId}: ${error}\n`);
        });

        // Store session with its store and QR code
        sessions.set(sessionId, { sock, store, qrCode, qrCodeImage });

        // Handle connection updates
        sock.ev.on('creds.update', saveCreds);

        // Add store sync event handler
        sock.ev.on('chats.set', () => {
            try {
                if (ensureSessionDir(sessionDir)) {
                    console.log(`\n 🍪 BAILEYS SERVER: ${sessionId}: Syncing chats\n`);
                    store.writeToFile(path.join(sessionDir, 'store.json'));
                }
            } catch (error) {
                console.error(`startBaileysConnection: Error writing chats to store: ${error}\n`);
            }
        });

        // Add contacts sync handler
        sock.ev.on('contacts.set', () => {
            try {
                if (ensureSessionDir(sessionDir)) {
                    console.log(`\n 🍪 BAILEYS SERVER: ${sessionId}: Syncing contacts\n`);
                    store.writeToFile(path.join(sessionDir, 'store.json'));
                }
            } catch (error) {
                console.error(`startBaileysConnection: Error writing contacts to store: ${error}\n`);
            }
        });

        // Add message history sync handler
        sock.ev.on('messaging-history.set', () => {
            try {
                if (ensureSessionDir(sessionDir)) {
                    console.log(`\n 🍪 BAILEYS SERVER: ${sessionId}: Syncing message history\n`);
                    store.writeToFile(path.join(sessionDir, 'store.json'));
                }
            } catch (error) {
                console.error(`startBaileysConnection: Error writing message history to store: ${error}\n`);
            }
        });

        return sock;
    } catch (error) {
        console.error(`startBaileysConnection #877: Error for session ${sessionId}: ${error}`);
        throw error;
    }
}

// Add session validation
function validateSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Invalid session ID');
    }
    if (sessionId.length < 3 || sessionId.length > 50) {
        throw new Error('Session ID must be between 3 and 50 characters');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
        throw new Error('Session ID contains invalid characters');
    }
    return true;
}

// Add function to get existing session
function getSession(sessionId = 'default') {
    const session = sessions.get(sessionId);
    return session?.sock || null;
}

// Modify cleanupSession to also clean up retry tracking
async function cleanupSession(sessionId, sock, sessionDir) {
    console.log(`cleanupSession #543: Starting cleanup for session ${sessionId}`);
    
    try {
        // Remove from all tracking maps
        sessions.delete(sessionId);
        connectionStates.delete(sessionId);
        SESSION_RETRY_DELAYS.delete(sessionId);
        
        // Close socket
        if (sock) {
            sock.end();
            sock.removeAllListeners();
        }
        
        // Remove session directory
        if (fs.existsSync(sessionDir)) {
            await fs.promises.rm(sessionDir, { recursive: true });
            console.log(`cleanupSession: Deleted session directory for ${sessionId}\n`);
        }
    } catch (error) {
        console.error(`cleanupSession #544: Error cleaning up session ${sessionId}: ${error}`);
    }
}

// Add session status check function
function isSessionActive(sessionId) {
    let session = sessions.get(sessionId);
    let state = connectionStates.get(sessionId);
654    
    return !!(session && state && state.state === 'open');
}

// Add function to fetch chat history
async function fetchChatHistory(sessionId, jid, limit = 50) {
    try {
        const session = sessions.get(sessionId);
        if (!session?.store) {
            throw new Error('Session store not found');
        }

        const messages = await session.store.loadMessages(jid, limit);
        return messages;
    } catch (error) {
        console.error(`fetchChatHistory: Error fetching chat history: ${error}\n`);
    }
}

// Add store error handling helper
function handleStoreError(error, operation) {
    console.error(`Store ${operation} error: ${error}\n`);
    // You could implement retry logic here
    return null;
}

// Remove the try-catch block at the bottom and create a new function
async function getStoreData(store, sessionId) {
    let storeData = {
        contacts: {},
        chats: [],
        messages: []
    };

    try {
        console.log(`getStoreData: Fetching store data for session ${sessionId}\n`);
        
        // Fetch contacts
        try {
            storeData.contacts = await store.contacts.all();
            console.log(`getStoreData: Retrieved ${Object.keys(storeData.contacts).length} contacts\n`);
        } catch (error) {
            console.error(`getStoreData: Error fetching contacts: ${error}\n`);
            handleStoreError(error, 'contacts fetch');
        }

        // Fetch chats
        try {
            storeData.chats = await store.chats.all();
            console.log(`getStoreData: Retrieved ${storeData.chats.length} chats\n`);
        } catch (error) {
            console.error(`getStoreData: Error fetching chats: ${error}\n`);
            handleStoreError(error, 'chats fetch');
        }

        // Fetch messages
        try {
            storeData.messages = await store.messages.all();
            console.log(`getStoreData: Retrieved ${storeData.messages.length} messages\n`);
        } catch (error) {
            console.error(`getStoreData: Error fetching messages: ${error}\n`);
            handleStoreError(error, 'messages fetch');
        }

        return storeData;
    } catch (error) {
        console.error(`getStoreData: General store error: ${error}\n`);
        handleStoreError(error, 'general store operation');
        return storeData;
    }
}

// Update exports
module.exports = { 
    startBaileysConnection, 
    getSession,
    restoreSessions,
    sessions,
    connectionStates,
    validateSession,
    isSessionActive,
    cleanupSession,
    fetchChatHistory,
    getStoreData  // Add the new function to exports
};
