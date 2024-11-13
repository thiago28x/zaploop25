let makeWASocket = require("@whiskeysockets/baileys").default;
let { useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
let path = require('path');
let fs = require('fs');
let fetch = require('node-fetch');
let sessions = new Map();
let sessionsDir = path.join(process.cwd(), 'whatsapp-sessions');
let { makeInMemoryStore } = require("@whiskeysockets/baileys");


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
    // Initialize store with config
    let store = makeInMemoryStore(storeConfig);
    
    // Add retry mechanism
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
        try {
            // Check if session already exists
            if (sessions.has(sessionId)) {
                console.log(`startBaileysConnection: Session ${sessionId} already exists\n`);
                return sessions.get(sessionId);
            }
            
            // Create sessions directory if it doesn't exist
            if (!fs.existsSync(sessionDir)) {
                console.log(`startBaileysConnection: Creating sessions directory at ${sessionDir}\n`);
                fs.mkdirSync(sessionDir, { recursive: true });
            }

            // Load auth state
            console.log(`startBaileysConnection: Loading auth state\n`);
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
                },
                // Add QR code generation callback
                generateHighQualityQRCode: true
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

            // Add QR code event handler
            let qrCode = null;
            sock.ev.on('connection.update', ({ qr }) => {
                if (qr) qrCode = qr;
            });

            // Add message handling
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                let webhookUrl = process.env.WEBHOOK_URL;
                
                console.log(`startBaileysConnection: Processing messages.upsert event for session ${sessionId}\n`);
                
                //if fromMe, skip
                if (messages[0]?.key?.fromMe) {
                    console.log(`startBaileysConnection: Skipping message from self\n`);
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
                            from: message.key.remoteJid,
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
                                'X-WhatsApp-Session': sessionId
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

            // Improve connection update handling
            sock.ev.on('connection.update', (update) => {
                let { connection, lastDisconnect, qr } = update;
                
                // Add null check for connection
                if (!connection) {
                    console.log(`startBaileysConnection: Received update without connection state for ${sessionId}\n`);
                    return;
                }

                console.log(`startBaileysConnection: Session ${sessionId} connection status: ${connection}\n`);
                
                connectionStates.set(sessionId, {
                    state: connection,
                    qr: qr,
                    lastUpdate: new Date().toISOString()
                });

                if (connection === 'close') {
                    let disconnectReason = lastDisconnect?.error?.output?.statusCode;
                    let shouldReconnect = (disconnectReason !== DisconnectReason.loggedOut && 
                                         disconnectReason !== DisconnectReason.connectionClosed);
                    
                    console.log(`startBaileysConnection: Session ${sessionId} disconnect reason: ${disconnectReason}\n`);
                    console.log(`startBaileysConnection: Session ${sessionId} should reconnect: ${shouldReconnect}\n`);
                    
                    if (shouldReconnect) {
                        sessions.delete(sessionId);
                        startBaileysConnection(sessionId);
                    } else {
                        // Properly cleanup the terminated session
                        console.log(`startBaileysConnection: Terminating session ${sessionId}\n`);
                        sessions.delete(sessionId);
                        connectionStates.delete(sessionId);
                        
                        // Delete session files
                        if (fs.existsSync(sessionDir)) {
                            try {
                                fs.rmSync(sessionDir, { recursive: true });
                                console.log(`startBaileysConnection: Deleted session directory for ${sessionId}\n`);
                            } catch (error) {
                                console.error(`startBaileysConnection: Error deleting session directory: ${error}\n`);
                            }
                        }
                        
                        // Close the socket connection
                        if (sock) {
                            sock.end();
                            sock.removeAllListeners();
                        }
                    }
                }
            });

            // Add error event handler
            sock.ev.on('error', (error) => {
                console.error(`startBaileysConnection: Socket error for session ${sessionId}: ${error}\n`);
            });

            // Store session with its store
            sessions.set(sessionId, { sock, store });

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

            // Periodically write store to prevent data loss
            const writeInterval = setInterval(() => {
                if (sessions.has(sessionId)) {
                    try {
                        // Check if session directory exists before writing
                        if (ensureSessionDir(sessionDir)) {
                            const storeFile = path.join(sessionDir, 'store.json');
                            store.writeToFile(storeFile);
                            console.log(`\n 🍪 BAILEYS SERVER: ${sessionId}: Store auto-saved\n`);
                        } else {
                            console.error(`startBaileysConnection: Cannot write store file - directory not accessible\n`);
                        }
                    } catch (error) {
                        console.error(`startBaileysConnection: Error writing store file: ${error}\n`);
                    }
                } else {
                    clearInterval(writeInterval);
                }
            }, 10000); // Every 10 seconds

            // Add cleanup for the interval when session ends
            sock.ev.on('connection.update', ({ connection }) => {
                if (connection === 'close') {
                    clearInterval(writeInterval);
                }
            });

            return sock;
        } catch (error) {
            console.error(`startBaileysConnection: Error attempt ${retries + 1}/${maxRetries}: ${error}\n`);
            retries++;
            if (retries === maxRetries) {
                throw new Error(`Failed to create connection after ${maxRetries} attempts`);
            }
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
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

// Add cleanup helper function
async function cleanupSession(sessionId, sock, sessionDir) {
    console.log(`cleanupSession: Starting cleanup for session ${sessionId}\n`);
    
    try {
        // Remove from maps
        sessions.delete(sessionId);
        connectionStates.delete(sessionId);
        
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
        console.error(`cleanupSession: Error cleaning up session ${sessionId}: ${error}\n`);
    }
}

// Add session status check function
function isSessionActive(sessionId) {
    let session = sessions.get(sessionId);
    let state = connectionStates.get(sessionId);
    
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
