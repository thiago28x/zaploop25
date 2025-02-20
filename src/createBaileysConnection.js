const qrcode = require('qrcode');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason, 
    makeInMemoryStore 
} = require('@whiskeysockets/baileys');
let path = require('path');
let fs = require('fs');
let fetch = require('node-fetch');
let sessions = new Map();
let sessionsDir = path.join(process.cwd(), 'whatsapp-sessions');
const handleNewMessage = require('./newmessage');
const { storeMedia } = require('./downloadmedia');
const WebSocket = require('ws');


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
    syncFullHistory: true,
    // Add contacts configuration
    contacts: {
        syncOnConnect: true  // Ensure contacts sync on connection
    }
};

// Add at the top with other constants
let QR_TIMEOUT = 2 * 60 * 1000; // 2 minutes in milliseconds
let MAX_SESSION_RETRIES = 2;
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
    let store = makeInMemoryStore(storeConfig);

    console.log(`startBaileysConnection #542: Starting session ${sessionId} with store: ${store}`);

    // Check retry info
    let retryInfo = SESSION_RETRY_DELAYS.get(sessionId) || { count: 0, lastAttempt: 0 };
    let now = Date.now();
    
    if (retryInfo.count >= MAX_SESSION_RETRIES) {
        console.log(`startBaileysConnection #870: Session ${sessionId} exceeded maximum retry attempts`);
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
            console.log(`startBaileysConnection #544: Creating sessions directory at ${sessionDir}`);
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Load auth state - REMOVED auth files check
        console.log(`startBaileysConnection #231: Loading auth state for ${sessionId}`);
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
                    console.log(`startBaileysConnection #878: QR code timeout reached for ${sessionId}`);
                    await cleanupSession(sessionId, sock, sessionDir);
                    throw new Error('QR code timeout reached');
                }

                qrCode = qr;
                try {
                    qrCodeImage = await qrcode.toDataURL(qr, {
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

        // Modify the messages.upsert event handler
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            // Check for media in messages
            for (const message of messages) {
                if (message.message) {
                    const mediaPath = await storeMedia(sessionId, message, sock);
                    if (mediaPath) {
                        console.log(`startBaileysConnection: Media stored at ${mediaPath}`);
                    }
                }
            }
            
            await handleNewMessage(sessionId, messages, type);
            
            // Add WebSocket broadcast for incoming messages
            if (type === 'notify') {
                for (const message of messages) {
                    // Extract relevant message content
                    const messageContent = {
                        sessionId,
                        jid: message.key.remoteJid,
                        sender: message.key.fromMe ? 'me' : message.pushName || message.key.remoteJid,
                        text: message.message?.conversation || 
                              message.message?.extendedTextMessage?.text ||
                              message.message?.imageMessage?.caption ||
                              message.message?.videoMessage?.caption ||
                              null,
                        timestamp: message.messageTimestamp,
                        type: 'incoming_message'
                    };

                    // Broadcast to all connected WebSocket clients
                    if (global.wss) {
                        global.wss.clients.forEach((client) => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify(messageContent));
                            }
                        });
                    }
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
                    console.log(`startBaileysConnection #873: QR code timeout reached for ${sessionId}`);
                    await cleanupSession(sessionId, sock, sessionDir);
                    throw new Error('QR code timeout reached');
                }
            }

            if (connection === 'close') {
                let disconnectReason = lastDisconnect?.error?.output?.statusCode;
                // For 'default' session, always try to reconnect regardless of retry count
                let shouldReconnect = sessionId === 'default' || 
                                    (disconnectReason !== DisconnectReason.loggedOut && 
                                     disconnectReason !== DisconnectReason.connectionClosed &&
                                     retryInfo.count < MAX_SESSION_RETRIES);
                
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
                   // console.log(`\n 🍪 BAILEYS SERVER: ${sessionId}: Syncing chats\n`);
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
                    /* {"chats":[],"contacts":{},"messages":{},"labels":[],"labelAssociations":[]} */
                }
            } catch (error) {
                console.error(`startBaileysConnection: Error writing contacts to store: ${error}\n`);
            }
        });

        // Add message history sync handler
        sock.ev.on('messaging-history.set', () => {
            try {
                if (ensureSessionDir(sessionDir)) {
                 //   console.log(`\n 🍪 BAILEYS SERVER: ${sessionId}: Syncing message history\n`);
                    store.writeToFile(path.join(sessionDir, 'store.json'));
                }
            } catch (error) {
                console.error(`startBaileysConnection: Error writing message history to store: ${error}\n`);
            }
        });

        // Add these inside startBaileysConnection after creating the sock
        // Handle contact updates
        sock.ev.on('contacts.upsert', async contacts => {
            console.log(`⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐\ncontacts.upsert: Received ${contacts.length} contacts update for session ${sessionId}`);
            try {
                // Save to store
                if (ensureSessionDir(sessionDir)) {
                    await store.writeToFile(path.join(sessionDir, 'store.json'));
                }
            } catch (error) {
                console.error(`contacts.upsert: Error saving contacts for ${sessionId}:`, error);
            }
        });

        // Handle initial contacts set
        sock.ev.on('contacts.set', async ({ contacts }) => {
            console.log(`contacts.set: Received initial contacts for session ${sessionId}`);
            try {
                if (ensureSessionDir(sessionDir)) {
                    await store.writeToFile(path.join(sessionDir, 'store.json'));
                }
            } catch (error) {
                console.error(`contacts.set: Error saving initial contacts for ${sessionId}:`, error);
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
    // Variables at the top
    const session = sessions.get(sessionId);
    const connectionState = connectionStates.get(sessionId);
    
    console.log(`cleanupSession #543: Starting cleanup check for session ${sessionId}`);
    
    // Check if session is active/connected
    if (connectionState?.state === 'open' || session?.sock?.user) {
        console.log(`cleanupSession #778: Skipping cleanup - Session ${sessionId} is still active`);
        return false;
    }
    
    try {
        // Remove from all tracking maps
        sessions.delete(sessionId);
        connectionStates.delete(sessionId);
        SESSION_RETRY_DELAYS.delete(sessionId);
        
        // Close socket
        if (sock) {
            // Remove all event listeners from sock.ev
            if (sock.ev) {
                sock.ev.removeAllListeners();
            }
            // Close the socket connection
            if (typeof sock.end === 'function') {
                sock.end();
            } else if (typeof sock.close === 'function') {
                sock.close();
            } else if (typeof sock.logout === 'function') {
                await sock.logout();
            }
        }
        
        // Remove session directory
        if (fs.existsSync(sessionDir)) {
            await fs.promises.rm(sessionDir, { recursive: true });
            console.log(`cleanupSession #876: Deleted session directory for ${sessionId}`);
        }
        
        return true;
    } catch (error) {
        console.error(`cleanupSession #544: Error cleaning up session ${sessionId}: ${error}`);
        return false;
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

// Add this new function after the store configuration
async function fetchSessionContacts(sessionId) {
    const session = sessions.get(sessionId);
    
    console.log(`fetchSessionContacts: Attempting to fetch contacts for session ${sessionId}`);
    
    if (!session?.sock) {
        console.log(`fetchSessionContacts: No valid session found for ${sessionId}`);
        return null;
    }

    try {
        // Get contacts directly from the socket
        const contacts = await session.sock.store.contacts;
        console.log(`fetchSessionContacts: Raw contacts object:`, contacts);
        
        if (!contacts) {
            console.log(`fetchSessionContacts: No contacts found in store for ${sessionId}`);
            return [];
        }

        // Convert contacts object to array and filter out non-contact entries
        const contactsArray = Object.entries(contacts)
            .filter(([id]) => id.endsWith('@s.whatsapp.net'))
            .map(([id, contact]) => ({
                id: id,
                name: contact.name || contact.notify || (id ? id.split('@')[0] : 'Unknown'),
                number: id ? id.split('@')[0] : '',
                notify: contact.notify || '',
                verifiedName: contact.verifiedName || '',
                pushName: contact.pushName || '',
                status: contact.status || '',
                imgUrl: contact.imgUrl || '',
                isBusiness: Boolean(contact.isBusiness),
                isGroup: id.endsWith('@g.us'),
                isUser: id.endsWith('@s.whatsapp.net'),
                lastSeen: contact.lastSeen || null
            }));

        console.log(`fetchSessionContacts: Found ${contactsArray.length} contacts for ${sessionId}`);
        return contactsArray;
    } catch (error) {
        console.error(`fetchSessionContacts: Error fetching contacts:`, error);
        return null;
    }
}

// Modify the getStoreData function
async function getStoreData(store, sessionId) {
    // Variables at the top
    let storeData = {
        contacts: [],
        chats: [],
        messages: []
    };

    try {
        console.log(`getStoreData: Fetching store data for session ${sessionId}`);
        
        // Fetch contacts using the new function
        try {
            storeData.contacts = await fetchSessionContacts(sessionId) || [];
            console.log(`getStoreData: Retrieved ${storeData.contacts.length} contacts`);
        } catch (error) {
            console.error(`getStoreData: Error fetching contacts: ${error}`);
            storeData.contacts = [];
        }

        // Fetch chats - Chats are accessible via store.chats.all()
        try {
            storeData.chats = store.chats.all();
            console.log(`getStoreData #789: Retrieved ${storeData.chats.length} chats`);
        } catch (error) {
            console.error(`getStoreData #432: Error fetching chats: ${error}`);
            handleStoreError(error, 'chats fetch');
        }

        // Fetch messages - Messages should be fetched per chat using loadMessages
        try {
            // We'll get messages for each chat
            for (const chat of storeData.chats) {
                const chatMessages = await store.loadMessages(chat.id, 50); // Fetch last 50 messages
                storeData.messages.push(...chatMessages);
            }
            console.log(`getStoreData #965: Retrieved ${storeData.messages.length} messages`);
        } catch (error) {
            console.error(`getStoreData #123: Error fetching messages: ${error}`);
            handleStoreError(error, 'messages fetch');
        }

        return storeData;
    } catch (error) {
        console.error(`getStoreData: General store error: ${error}`);
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
    getStoreData,
    fetchSessionContacts  // Add the new function to exports
};
