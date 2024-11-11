let makeWASocket = require("@whiskeysockets/baileys").default;
let { useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
let path = require('path');
let fs = require('fs');

let sessions = new Map();
let sessionsDir = path.join(process.cwd(), 'whatsapp-sessions');

// Add connection state tracking
let connectionStates = new Map();

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

async function startBaileysConnection(sessionId = 'default') {
    let sessionDir = path.join(process.cwd(), 'whatsapp-sessions', sessionId);
    
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
                markOnlineOnConnect: false, // Add this for better connection handling
                retryRequestDelayMs: 2000,
                connectTimeoutMs: 30000,
                defaultQueryTimeoutMs: 60000,
                // Add message retry options
                msgRetryCounterMap: {},
                getMessage: async (key) => {
                    return {
                        conversation: 'Message not found in store'
                    };
                }
            });

            // Add message handling
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                console.log(`startBaileysConnection: New message in session ${sessionId}, type: ${type}\n`);
                
                for (let message of messages) {
                    console.log(`startBaileysConnection: Message from ${message.key.remoteJid}\n`);
                    // Handle message here or emit to a message handler
                }
            });

            // Improve connection update handling
            sock.ev.on('connection.update', (update) => {
                let { connection, lastDisconnect, qr } = update;
                console.log(`startBaileysConnection: Session ${sessionId} connection status: ${connection}\n`);
                
                connectionStates.set(sessionId, {
                    state: connection,
                    qr: qr,
                    lastUpdate: new Date().toISOString()
                });

                if (connection === 'close') {
                    let shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
                    console.log(`startBaileysConnection: Session ${sessionId} reconnecting: ${shouldReconnect}\n`);
                    
                    if (shouldReconnect) {
                        sessions.delete(sessionId);
                        startBaileysConnection(sessionId);
                    } else {
                        // Handle logout case
                        sessions.delete(sessionId);
                        connectionStates.delete(sessionId);
                        // Optionally delete session files
                        if (fs.existsSync(sessionDir)) {
                            fs.rmSync(sessionDir, { recursive: true });
                        }
                    }
                }
            });

            // Store session
            sessions.set(sessionId, sock);

            // Handle connection updates
            sock.ev.on('creds.update', saveCreds);

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
    console.log(`getSession: Retrieving session ${sessionId}\n`);
    return sessions.get(sessionId);
}

module.exports = { 
    startBaileysConnection, 
    getSession,
    restoreSessions,
    sessions,
    connectionStates,
    validateSession
};
