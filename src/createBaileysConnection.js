const qrcode = require('qrcode');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, makeInMemoryStore } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const pino = require('pino'); // Add pino for logging

const sessions = new Map();
const sessionsDir = path.join(process.cwd(), 'whatsapp-sessions');
const connectionStates = new Map();
const SESSION_RETRY_DELAYS = new Map();
const QR_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const MAX_SESSION_RETRIES = 2;


/* THIS IS A API WHICH USES BAILEYS TO CONNECT TO WHATSAPP WEB AND FORWARD MESSAGES TO THE WEBHOOK  
https://github.com/WhiskeySockets/Baileys.git
Documentation: https://whiskeysockets.dev/Baileys/
*/



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



function ensureSessionDir(sessionDir) {
    if (!fs.existsSync(sessionDir)) {
        console.log(`Creating session directory at ${sessionDir}`);
        fs.mkdirSync(sessionDir, { recursive: true });
    }
}

async function startBaileysConnection(sessionId = 'default') {
    const sessionDir = path.join(sessionsDir, sessionId);
    ensureSessionDir(sessionDir);

    const logger = pino({ level: 'debug' }); // Unified logger
    let store;

    try {
        store = makeInMemoryStore({ logger });
        console.log(`Starting session ${sessionId}`);
        
        const retryInfo = SESSION_RETRY_DELAYS.get(sessionId) || { count: 0, lastAttempt: 0 };
        const now = Date.now();
        
        if (retryInfo.count >= MAX_SESSION_RETRIES) {
            console.log(`Session ${sessionId} exceeded max retries`);
            await cleanupSession(sessionId, null, sessionDir);
            return null;
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger,
            defaultQueryTimeoutMs: 60000,
            sessionId,
            browser: ['Ubuntu', 'Chrome', '22.04.4'], // Match test.js
            version: [2, 3000, 1019707846], // Match test.js
            qrTimeout: QR_TIMEOUT,
        });

        store.bind(sock.ev);
        console.log(`Binding store for ${sessionId}`);
        const storeFile = path.join(sessionDir, 'store.json');
        setInterval(() => store.writeToFile(storeFile), 30000); // Increase to 30s

        sessions.set(sessionId, { sock, store });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`Connection closed for ${sessionId}: Status ${statusCode}`, lastDisconnect?.error, 'Reconnecting:', shouldReconnect);
                if (shouldReconnect) {
                    SESSION_RETRY_DELAYS.set(sessionId, { count: retryInfo.count + 1, lastAttempt: now });
                    setTimeout(() => startBaileysConnection(sessionId), 2000); // Delay retry
                }
            } else if (connection === 'open') {
                console.log(`Opened connection for ${sessionId}`);
                connectionStates.set(sessionId, { state: 'open' });
            }
        });

        sock.ev.on('creds.update', saveCreds);
        return sock;
    } catch (error) {
        console.error(`Error for session ${sessionId}:`, error);
        SESSION_RETRY_DELAYS.set(sessionId, { count: retryInfo.count + 1, lastAttempt: Date.now() });
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
          //  await fs.promises.rm(sessionDir, { recursive: true });
          //  console.log(`cleanupSession #876: Deleted session directory for ${sessionId}`);
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
    
    if (!session?.store) {
        console.log(`fetchSessionContacts: No valid store found for ${sessionId}`);
        return null;
    }

    try {
        const contacts = session.store.contacts;
        
        if (!contacts || Object.keys(contacts).length === 0) {
            console.log(`fetchSessionContacts: No contacts found in store for ${sessionId}`);
            return [];
        }

        const contactsArray = Object.entries(contacts)
            .filter(([id]) => id.endsWith('@s.whatsapp.net'))
            .map(([id, contact]) => ({
                id: id,
                name: contact.name || contact.notify || id.split('@')[0],
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

async function completeSessionWipeout() {
    try {
        // Close and cleanup all active sessions
        for (const [sessionId, session] of sessions.entries()) {
            if (session?.sock) {
                await cleanupSession(sessionId, session.sock, path.join(sessionsDir, sessionId));
            }
        }

        // Clear all maps
        sessions.clear();
        connectionStates.clear();
        SESSION_RETRY_DELAYS.clear();

        // Remove the entire sessions directory
        if (fs.existsSync(sessionsDir)) {
            await fs.promises.rm(sessionsDir, { recursive: true, force: true });
            console.warn('completeSessionWipeout: All session directories removed');
        }

        return true;
    } catch (error) {
        console.error('completeSessionWipeout: Error during wipeout:', error);
        return false;
    }
}

// Update exports
module.exports = { 
    startBaileysConnection,
    getSession, 
    sessions,
    connectionStates,
    validateSession,
    isSessionActive, 
    cleanupSession,
    fetchChatHistory,
    getStoreData,
    fetchSessionContacts,
    completeSessionWipeout
};
