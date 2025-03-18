require('dotenv').config();

const express = require('express');
const { startBaileysConnection, getSession, sessions, connectionStates, getStoreData, restartAllSessions, completeSessionWipeout } = require('./createBaileysConnection');
const { restoreSessions } = require('./restoreSessions');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const { gracefulShutdown, setWebSocketServer } = require('./shutdown');

// Import the new send routes
const sendRoutes = require('./send');

const handleUpdateServer = require('./updateServer');

const handleReaction = require('./reactions');

const contactsRoutes = require('./routes/contacts');

let isStarting = false;
let lastStartAttempt = 0;
const MIN_RESTART_INTERVAL = 30000; // 30 seconds
const baileysApp = express();
// Add a default value for serverIP if not defined in .env
const serverIP = process.env.SERVER_IP || 'http://localhost:4001/';
let wss;

/* this is a Express server to send and receive whatsapp messages using baileys.*/

//git add . && git commit -m "update" && git push



// Restore sessions before starting the server
async function startServer() {
    const currentTime = Date.now();
    console.log(`🍪 BAILEYS SERVER:  \nstartServer: Initializing server\n`);
    
    // Prevent multiple simultaneous start attempts
    if (isStarting) {
        console.log(` BAILE 🧜‍♀️🧜‍♀️ \n 🍪 BAILEYS SERVER:  \nstartServer: Server is already starting\n`);
        process.exit(1);
    }

    // Check if we're restarting too quickly
    if (currentTime - lastStartAttempt < MIN_RESTART_INTERVAL) {
        console.error(`startServer: Restarting too quickly. Waiting ${MIN_RESTART_INTERVAL / 1000} seconds before next attempt\n`);
        process.exit(1);
    }

    isStarting = true;
    lastStartAttempt = currentTime;
    
    try {

        if (process.env.RESTARTS_SESSION_ON_SERVER_START === 'true') {
            await restoreSessions(); //restore sessions from the sessions folder
        }
        
        // Initialize WebSocket only if not already running
        if (!wss || wss.readyState === WebSocket.CLOSED) {
            initializeWebSocket();
        }
        
        baileysApp.listen(4001, () => {
            isStarting = false;
            console.log(` BAILE 🧜‍♀️🧜‍♀️ \n 🍪 BAILEYS SERVER:  \nstartServer: Baileys service running on port 4001\n`);
        });
    } catch (error) {
        console.error(`startServer: Error starting server: ${error}\n`);
        isStarting = false;
        process.exit(1);
    }
}

// Only apply JSON middleware to POST and PUT requests
baileysApp.use((req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT') {
        express.json()(req, res, next);
    } else {
        next();
    }
});

// Add static files middleware
baileysApp.use(express.static(path.join(__dirname, 'public')));

// Mount send routes
baileysApp.use('/send', sendRoutes);

baileysApp.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//start a new session
baileysApp.post("/start", async (req, res) => {
    let { sessionId } = req.body;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ /start #543: Creating session with ID: ${sessionId}`);
    
    try {
        let sessionDir = path.join(process.cwd(), 'whatsapp-sessions', sessionId);
        if (!fs.existsSync(sessionDir)) {
            console.log(` BAILE ��‍♀️🧜‍♀️ /start #544: Creating new session directory for ${sessionId}`);
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        let files = fs.readdirSync(sessionDir);
        let isNewSession = files.length === 0;

        if (!isNewSession) {
            return res.status(400).send({ 
                error: "Session already exists",
                message: "Please delete the existing session before creating a new one" 
            });
        }

        // Create a promise that will resolve when QR code is generated
        let qrPromise = new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                reject(new Error('QR code generation timeout'));
            }, 30000); // 30 second timeout

            // Create a new socket connection
            startBaileysConnection(sessionId).then(sock => {
                sock.ev.on('connection.update', async ({ qr }) => {
                    if (qr) {
                        try {
                            let qrImage = await QRCode.toDataURL(qr);
                            
                            // Store QR code in session
                            if (sessions.has(sessionId)) {
                                sessions.get(sessionId).qrCode = qrImage;
                                clearTimeout(timeout);
                                resolve();
                            }
                            
                            // Broadcast QR code to WebSocket clients
                            if (wss) {
                                wss.clients.forEach((client) => {
                                    if (client.readyState === WebSocket.OPEN) {
                                        client.send(JSON.stringify({
                                            type: 'qr',
                                            sessionId: sessionId,
                                            qr: qrImage
                                        }));
                                    }
                                });
                            }
                            
                        } catch (err) {
                            console.error(`/start #545: Error generating QR: ${err}`);
                        }
                    }
                });
            });
        });

        res.status(200).send({ 
            status: "success",
            message: "Session initiated",
            sessionId: sessionId
        });

    } catch (error) {
        console.error(`/start #98564: Error creating session: ${error}`);
        res.status(500).send({ error: "Failed to create connection" });
    }
});

//route get session connection
baileysApp.get("/session/:sessionId", async (req, res) => {
    let { sessionId } = req.params;
    let client = getSession(sessionId);
    res.send({ status: "success", session: client });
});



const validatePhoneNumber = (req, res, next) => {
    let phoneNumber = req.body.jid || req.params.jid || req.query.jid;

    try {
        if (!phoneNumber) {
            throw new Error('Phone number is required');
        }

        // Clean the phone number
        let cleanPhone = phoneNumber
            .trim()
            .replace(/@s\.whatsapp\.net/g, '')  // Remove any existing @s.whatsapp.net
            .replace(/@c\.us/g, '')             // Remove any @c.us
            .replace(/\D/g, '');                // Remove all non-digits

        // Validate length (between 10 and 15 digits)
        if (cleanPhone.length < 10 || cleanPhone.length > 15) {
            throw new Error('Phone number must be between 10 and 15 digits');
        }

        // Add @s.whatsapp.net suffix if not a group chat
        req.body.jid = cleanPhone + '@s.whatsapp.net';
        
        next();
    } catch (error) {
        console.log(` BAILE 🧜‍♀️🧜‍♀️ validatePhoneNumber #032: Error: ${error.message}`);
        res.status(400).json({
            error: 'Invalid phone number',
            details: error.message
        });
    }
};

const validateMessageBody = (req, res, next) => {
    let { sessionId } = req.body;
   // console.log(` BAILE 🧜‍♀️🧜‍♀️ validateMessageBody #002: Validating message body for sessionId: ${sessionId}`);

    if (!sessionId) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            details: 'sessionId is required'
        });
    }

    next();
};


//send-text
baileysApp.post("/send-message", validatePhoneNumber, validateMessageBody, async (req, res) => {
  let { sessionId, jid, message } = req.body;
  //console.log(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: /send-message: Request params - sessionId: ${sessionId}, jid: ${jid}, message: ${message}\n`);
  
  if (!sessionId || !jid || !message) {
    return res.status(400).send({ error: "Missing required fields" });
  }
  if ( message.length < 2 ) {
    return res.status(400).send({ error: "Message too short" });
  }
  
  try {
    let client = getSession(sessionId);
    if (!client) {
      //console.log(` BAILE 🧜‍♀️🧜‍♀️ \n 🍪 BAILEYS SERVER:  \n/send-message: No session found for sessionId: \n${sessionId}\n`);
      return res.status(404).send({ error: "no session found" });
    }

    // Format JID if needed
    if (!jid.includes('@')) {
      // Assume it's a phone number if no @ is present
      jid = `${jid}@s.whatsapp.net`;
    }
    
    // Validate JID format
    if (!jid.match(/^[0-9]+@(s\.whatsapp\.net|g\.us)$/)) {
      throw new Error("Invalid JID format");
    }

    // Update presence to 'composing'
    await client.sendPresenceUpdate('composing', jid);

    //RANDOM DELAY
    const randomDelay = Math.floor(Math.random() * 1030) + 500; // Random delay.
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    const sentMessage = await client.sendMessage(jid, { text: message });
    res.status(200).send({
        status: "200 - Message sent successfully",
        messageId: sentMessage.key.id,
            sessionId,
            jid,
            type: 'text',
            timestamp: new Date().toISOString(),
                fromMe: sentMessage.key.fromMe,
                remoteJid: sentMessage.key.remoteJid
        
    });
  } catch (error) {
    console.error(`/send-message: Error sending message: ${error}\n`);
    res.status(500).send({ 
      error: "Message not sent",
      details: error.message 
    });
  }
});

baileysApp.get("/list-sessions", (req, res) => {
  //  console.log(` BAILE 🧜‍♀️🧜‍♀️ \n 🍪 BAILEYS SERVER:  \n/list-sessions: Retrieving all active sessions\n`);
    
    try {
        let activeSessions = Array.from(sessions.keys());

        // Log all sessions details
        console.log(` BAILE 🧜‍♀️🧜‍♀️ \n 🍪 BAILEYS SERVER:  \n/list-sessions: Found ${activeSessions.length} active sessions`);
        activeSessions.forEach(sessionId => {
            const session = sessions.get(sessionId);
            console.log(` - Session ID: ${sessionId}`);
            console.log(`   Status: ${session?.state || 'unknown'}`);
            console.log(`   Connected: ${session?.client?.user ? 'Yes' : 'No'}`);
            if (session?.client?.user) {
                console.log(`   User: ${session.client.user.name || 'Unknown'} (${session.client.user.id.split('@')[0]})`);
            }
        });
        res.send({ 
            status: "success", 
            sessions: activeSessions,
            count: activeSessions.length 
        });
    } catch (error) {
        console.error(`/list-sessions: Error listing sessions: ${error}\n`);
        res.status(500).send({ error: "Failed to list sessions" });
    }
});

baileysApp.delete("/session/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    const sessionDir = path.join(process.cwd(), 'whatsapp-sessions', sessionId);
    const storeFile = path.join(sessionDir, 'store.json');
    
    console.log(` BAILE 🧜‍♀️🧜‍♀️ deleteSession #543: Attempting to delete session: ${sessionId}`);
    
    try {
        // Ensure session directory exists
        if (!fs.existsSync(sessionDir)) {
            console.log(` BAILE 🧜‍♀️🧜‍♀️ deleteSession #544: Session directory doesn't exist: ${sessionDir}`);
            return res.status(404).send({ 
                error: "Session not found",
                details: "Session directory does not exist"
            });
        }

        let client = getSession(sessionId);
        if (client) {
            // Safely close the connection if client exists
            try {
                if (client.ws && client.ws.readyState !== WebSocket.CLOSED) {
                    await client.end();
                    console.log(` BAILE 🧜‍♀️🧜‍♀️ deleteSession #545: Closed connection for session: ${sessionId}`);
                }
            } catch (closeError) {
                console.log(` BAILE 🧜‍♀️🧜‍♀️ deleteSession #546: Non-critical error while closing connection: ${closeError}`);
            }
            
            // Remove from sessions map
            sessions.delete(sessionId);
        }
        
        // Delete store.json if it exists
        if (fs.existsSync(storeFile)) {
            fs.unlinkSync(storeFile);
            console.log(` BAILE 🧜‍♀️🧜‍♀️ deleteSession #547: Deleted store file: ${storeFile}`);
        }
        
        // Delete session directory
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(` BAILE 🧜‍♀️🧜‍♀️ deleteSession #548: Deleted session directory: ${sessionDir}`);
        
        res.send({ 
            status: "success", 
            message: "Session deleted successfully",
            details: {
                sessionId,
                directoryRemoved: true
            }
        });
    } catch (error) {
        console.error(`deleteSession #549: Error deleting session: ${error}`);
        res.status(500).send({ 
            error: "Failed to delete session",
            details: error.message,
            sessionId
        });
    }
});

baileysApp.get("/session-status/:sessionId", (req, res) => {
    let { sessionId } = req.params;
    //console.log(` BAILE 🧜‍♀️🧜‍♀️ \n 🍪 BAILEYS SERVER:  \n/session-status/${sessionId}: Fetching status\n`);
    
    try {
        let client = getSession(sessionId);
        let state = connectionStates.get(sessionId);
        
        // Add connection verification
        let isConnected = client && state && state.state === 'open';
        
        console.log(` BAILE 🧜‍♀️🧜‍♀️ /session-status/${sessionId}: Connection state: ${state ? state.state : 'unknown'}, isConnected: ${isConnected}`);
        
        res.send({
            status: "success",
            exists: !!client,
            connectionState: state || { state: 'unknown' },
            isConnected: isConnected
        });
    } catch (error) {
        console.error(`/session-status/${sessionId}: Error fetching status: ${error}\n`);
        res.status(500).send({ error: "Failed to fetch session status" });
    }
});

// Get session info (contacts, chats, etc.)
baileysApp.get("/session-info/:sessionId", async (req, res) => {
    let { sessionId } = req.params;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ \n 🍪 BAILEYS SERVER:  \n/session-info/${sessionId}: Fetching CONTACTS, CHATS, MESSAGES\n`);
    
    try {
        let session = sessions.get(sessionId);
        if (!session?.sock) {
            console.error(`/session-info: No session found for ${sessionId}\n`);
            return res.status(404).send({ 
                error: "Session not found",
                sessionId 
            });
        }

        let store = session.store;
        if (!store) {
            console.error(`/session-info: No store found for session ${sessionId}\n`);
            return res.status(500).send({ 
                error: "Store not initialized",
                sessionId 
            });
        }

        // Use the new getStoreData function
        let storeData = await getStoreData(store, sessionId);

        console.log(` BAILE 🧜‍♀️🧜‍♀️ \n 🍪 BAILEYS SERVER:  \n/session-info: Store data retrieved:
            Contacts: ${Object.keys(storeData.contacts || {}).length}
            Chats: ${(storeData.chats || []).length}
            Messages: ${(storeData.messages || []).length}\n`);

        res.send({
            status: "success",
            sessionId,
            info: storeData,
            summary: {
                contacts: Object.keys(storeData.contacts || {}).length,
                chats: (storeData.chats || []).length,
                messages: (storeData.messages || []).length
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`/session-info/${sessionId}: Error fetching info: ${error}\n`);
        res.status(500).send({ 
            error: "Failed to fetch session info",
            details: error.message,
            sessionId
        });
    }
});



baileysApp.post("/send-image", validateMessageBody, async (req, res) => {
    let { sessionId, jid, imageUrl, caption, viewOnce } = req.body;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ /send-image #432: Request params - sessionId: ${sessionId}, jid: ${jid}, imageUrl: ${imageUrl}, caption: ${caption}, viewOnce: ${viewOnce}`);
    
    try {
        let client = getSession(sessionId);
        if (!client) {
            throw new Error("Session not found");
        }

        // Format JID if needed
        if (!jid.includes('@')) {
            jid = `${jid}@s.whatsapp.net`;
        }
        
        // Validate JID format
        if (!jid.match(/^[0-9]+@(s\.whatsapp\.net|g\.us)$/)) {
            throw new Error("Invalid JID format");
        }
        
        await client.sendMessage(jid, {
            image: { url: imageUrl || 'https://www.svgrepo.com/show/508699/landscape-placeholder.svg' },
            caption: caption || 'hello!',
            viewOnce: viewOnce || false
        });

        res.status(200).send({ status: "200 - Image sent successfully" });
    } catch (error) {
        console.error(`/send-image: Error sending image: ${error}\n`);
        res.status(500).send({ 
            error: "Image not sent",
            details: error.message 
        });
    }
});

// Add this route after the /send-message route
baileysApp.post("/send-video", validatePhoneNumber, async (req, res) => {
    // Variables at the top
    let { sessionId, jid, videoUrl, caption, gifPlayback, viewOnce } = req.body;
    
    console.log(` BAILE 🧜‍♀️🧜‍♀️ sendVideo #543: Sending video to ${jid} from session ${sessionId}`);

    // Input validation
    if (!sessionId || !jid || !videoUrl) {
        return res.status(400).send({ 
            error: "Missing required fields",
            details: "sessionId, jid, and videoUrl are required" 
        });
    }

    try {
        let client = getSession(sessionId);
        if (!client) {
            console.log(` BAILE 🧜‍♀️🧜‍♀️ sendVideo #544: No session found for ${sessionId}`);
            return res.status(404).send({ error: "No session found" });
        }

        // Format JID if needed
        if (!jid.includes('@')) {
            jid = `${jid}@s.whatsapp.net`;
        }
        
        // Validate JID format
        if (!jid.match(/^[0-9]+@(s\.whatsapp\.net|g\.us)$/)) {
            throw new Error("Invalid JID format");
        }
   
        // Random delay for more natural behavior
        const randomDelay = Math.floor(Math.random() * 3000) + 1000;
        await new Promise(resolve => setTimeout(resolve, randomDelay));

        // Send video message
        await client.sendMessage(jid, {
            video: { url: videoUrl },
            caption: caption || '',
            gifPlayback: gifPlayback || false,
            viewOnce: viewOnce || false
        });

        res.send({ 
            status: "success",
            message: "Video sent successfully" 
        });

    } catch (error) {
        console.error(` BAILE 🧜‍♀️🧜‍♀️ sendVideo #545: Error sending video: ${error}`);
        res.status(500).send({ 
            error: "Failed to send video",
            details: error.message 
        });
    }
});

baileysApp.post("/send-audio", validatePhoneNumber, async (req, res) => {
    // Variables at the top
    let { sessionId, jid, audioUrl, seconds = 0 } = req.body;
    
    console.log(` BAILE 🧜‍♀️🧜‍♀️ sendAudio #432: Sending voice note to ${jid} from session ${sessionId}`);

    // Input validation
    if (!sessionId || !jid || !audioUrl) {
        return res.status(400).send({ 
            error: "Missing required fields",
            details: "sessionId, jid, and audioUrl are required" 
        });
    }

    try {
        let client = getSession(sessionId);
        if (!client) {
            console.log(` BAILE 🧜‍♀️🧜‍♀️ sendAudio #433: No session found for ${sessionId}`);
            return res.status(404).send({ error: "No session found" });
        }

        // Format JID if needed
        if (!jid.includes('@')) {
            jid = `${jid}@s.whatsapp.net`;
        }
        
        // Validate JID format
        if (!jid.match(/^[0-9]+@(s\.whatsapp\.net|g\.us)$/)) {
            throw new Error("Invalid JID format");
        }

        // Update presence to 'recording'
        await client.sendPresenceUpdate('recording', jid);

        // Random delay for more natural behavior
        const randomDelay = Math.floor(Math.random() * 3000) + 1000;
        await new Promise(resolve => setTimeout(resolve, randomDelay));

        // Send voice note
        await client.sendMessage(jid, {
            audio: { url: audioUrl },
            mimetype: 'audio/mp4',
            ptt: true, // This makes it a voice note
            seconds: seconds
        });

        // Set presence back to available
        await client.sendPresenceUpdate('available', jid);

        res.send({ 
            status: "success",
            message: "Voice note sent successfully",
            details: {
                duration: seconds
            }
        });

    } catch (error) {
        console.error(` BAILE 🧜‍♀️🧜‍♀️ sendAudio #434: Error sending voice note: ${error}`);
        // Try to reset presence state in case of error
        try {
            await client?.sendPresenceUpdate('available', jid);
        } catch {}
        
        res.status(500).send({ 
            error: "Failed to send voice note",
            details: error.message 
        });
    }
});

// Add error handling middleware
baileysApp.use((err, req, res, next) => {
    console.error(`Global Error Handler: ${err.stack}\n`);
    res.status(500).send({ error: 'Something broke!' });
});

// Add basic security middleware
baileysApp.use((req, res, next) => {
    // Add basic security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

baileysApp.get('/health', (req, res) => {
    console.log(` BAILE 🧜‍♀️🧜‍♀️ \n 🍪 BAILEYS SERVER:  \n/health: Checking service health\n`);
    res.send({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        activeSessions: sessions.size
    });
});

// Add detailed status route
baileysApp.get('/status', (req, res) => {
    console.log(` BAILE 🧜‍♀️🧜‍♀️ \n 🍪 BAILEYS SERVER:  \n/status: Checking detailed server status\n`);
    
    const serverStatus = {
        status: 'online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        serverInfo: {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage()
        },
        whatsappStatus: {
            activeSessions: sessions.size,
            connectionStates: Object.fromEntries(connectionStates),
            serverIP: serverIP
        },
        websocketStatus: {
            isRunning: wss && wss.readyState === WebSocket.OPEN,
            port: 4002,
            connections: wss ? wss.clients.size : 0
        }
    };

    res.send(serverStatus);
});

// Define the getServerStatus function
function getServerStatus(req, res) {
    // Variables at the top
    let diskInfo;
    
    
    try {
        // Use '/' to get root filesystem info
        diskInfo = fs.statfsSync('/');
        
        // Calculate disk space in bytes
        const totalDisk = diskInfo.blocks * diskInfo.bsize;
        const freeDisk = diskInfo.bfree * diskInfo.bsize;
        const usedDisk = totalDisk - freeDisk;

        // Convert bytes to human readable format
        const formatBytes = (bytes) => {
            if (bytes === 0) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
        };

        const totalRAM = os.totalmem();
        const freeRAM = os.freemem();
        const usedRAM = totalRAM - freeRAM;
        const cpuCount = os.cpus().length;
        const cpuUsage = os.loadavg()[0]; // 1-minute load average
        const cpuFree = cpuCount - cpuUsage;

  /*       console.log(` BAILE 🧜‍♀️🧜‍♀️ getServerStatus #544: System resources:
            RAM - Total: ${formatBytes(totalRAM)}, Used: ${formatBytes(usedRAM)}
            Disk - Total: ${formatBytes(totalDisk)}, Used: ${formatBytes(usedDisk)}
            CPU - Cores: ${cpuCount}, Usage: ${cpuUsage.toFixed(2)}`);
 */
        res.send({
            status: "success",
            ram: {
                total: formatBytes(totalRAM),
                used: formatBytes(usedRAM), 
                free: formatBytes(freeRAM)
            },
            cpu: {
                total: cpuCount,
                used: cpuUsage.toFixed(2),
                free: cpuFree.toFixed(2)
            },
            disk: {
                total: formatBytes(totalDisk),
                used: formatBytes(usedDisk),
                free: formatBytes(freeDisk)
            }
        });
    } catch (error) {
        res.status(500).send({ 
            error: "Failed to get server status",
            details: error.message 
        });
    }
}

// Set up the route
baileysApp.get('/server-status', getServerStatus);

// Keep the process running and handle shutdown gracefully
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Add new endpoints for specific data retrieval
baileysApp.get("/session-chats/:sessionId", async (req, res) => {
    let { sessionId } = req.params;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ \n 🍪 BAILEYS SERVER: /session-chats/${sessionId}: Fetching chats\n`);
    
    try {
        let session = sessions.get(sessionId);
        if (!session?.store) {
            throw new Error("Session or store not found");
        }

        let chats = await session.store.chats.all();
        console.log(` BAILE 🧜‍♀️🧜‍♀️ /session-chats: Retrieved ${chats.length} chats for ${sessionId}\n`);

        res.send({
            status: "success",
            sessionId,
            chats: chats,
            count: chats.length
        });
    } catch (error) {
        console.error(`/session-chats: Error: ${error}\n`);
        res.status(500).send({ error: "Failed to fetch chats" });
    }
});

// Add this route to handle QR code requests
baileysApp.get("/session-qr/:sessionId", async (req, res) => {
    let { sessionId } = req.params;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ /session-qr #543: Fetching QR for session ${sessionId}`);
    
    try {
        let session = sessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ 
                error: "Session not found",
                message: "No active session found with this ID"
            });
        }

        if (!session.qrCode) {
            return res.status(404).json({ 
                error: "QR not available",
                message: "QR code not yet generated or session already connected"
            });
        }

        // Send QR code as image
        let qrImage = session.qrCode.split(',')[1]; // Remove data:image/png;base64,
        let qrBuffer = Buffer.from(qrImage, 'base64');
        
        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': qrBuffer.length,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(qrBuffer);
        
    } catch (error) {
        console.error(`/session-qr #544: Error serving QR: ${error}`);
        res.status(500).json({ 
            error: "Failed to serve QR code",
            details: error.message
        });
    }
});

function initializeWebSocket() {
    try {
        // Check if WebSocket server is already running
        if (wss && wss.readyState !== WebSocket.CLOSED) {
            console.log(` BAILE 🧜‍♀️🧜‍♀️ initializeWebSocket #542: WebSocket server already running, skipping initialization`);
            return;
        }

        // Check if port is in use
        const net = require('net');
        const tester = net.createServer()
            .once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.warn(` BAILE 🧜‍♀️🧜‍♀️ initializeWebSocket #543: Port 4002 is already in use, skipping WebSocket initialization`);
                    return;
                }
            })
            .once('listening', () => {
                tester.close();
                // Port is free, create WebSocket server
                wss = new WebSocket.Server({ 
                    port: 4002,
                    host: '0.0.0.0'  // Listen on all network interfaces
                });
                
                // Register the WebSocket server with the shutdown handler
                setWebSocketServer(wss);
                
                console.log(` BAILE 🧜‍♀️🧜‍♀️ initializeWebSocket #544: Server initialized on port 4002`);
                
                wss.on('connection', (ws) => {
                    console.log(` BAILE 🧜‍♀️🧜‍♀️ initializeWebSocket #545: Client connected`);
                    
                    // Send initial connection confirmation with sessions info
                    ws.send(JSON.stringify({
                        type: 'connection',
                        status: 'connected',
                        sessions: Array.from(sessions.keys()) // Convert sessions Map keys to array
                    }));
                    
                    ws.on('error', (error) => {
                        console.log(` BAILE 🧜‍♀️🧜‍♀️ initializeWebSocket #546: Error: ${error}`);
                    });

                    ws.on('close', () => {
                        console.log(` BAILE 🧜‍♀️🧜‍♀️ initializeWebSocket #547: Client disconnected`);
                    });
                });

                wss.on('error', (error) => {
                    console.error(`initializeWebSocket #548: Server error: ${error}`);
                });
            });

    } catch (error) {
        console.error(`initializeWebSocket #549: Failed to initialize WebSocket server: ${error}`);
        throw error; // Rethrow to be caught by startServer
    }
}

// Ensure WebSocket server is initialized
initializeWebSocket();

// Replace the entire /update-server route with:
baileysApp.post('/update-server', (req, res, next) => {
    handleUpdateServer(req, res, next);
});

baileysApp.post("/reconnect/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    let timeout;
    
    try {
        console.log(`[reconnect] Attempting to reconnect session: ${sessionId}`);
        
        if (!sessionId) {
            return res.status(400).send({
                status: "error",
                message: "Missing sessionId parameter"
            });
        }

        const sessionDir = path.join(process.cwd(), 'whatsapp-sessions', sessionId);
        if (!fs.existsSync(sessionDir)) {
            return res.status(404).send({
                status: "error",
                message: "Session directory not found"
            });
        }

        // Set timeout for reconnection attempt
        timeout = setTimeout(() => {
            return res.status(408).send({
                status: "error",
                message: "Reconnection timeout"
            });
        }, 30000);

        // Close existing session if any
        const existingSession = sessions.get(sessionId);
        if (existingSession?.sock) {
            try {
                console.log(`[reconnect] Closing existing session: ${sessionId}`);
                await existingSession.sock.logout();
                await existingSession.sock.end();
                sessions.delete(sessionId);
            } catch (err) {
                console.warn(`[reconnect] Error closing session: ${err.message}`);
            }
        }

        // Start new connection
        console.log(`[reconnect] Starting new connection for: ${sessionId}`);
        const sock = await startBaileysConnection(sessionId);
        
        if (!sock) {
            throw new Error("Failed to create new connection");
        }

        clearTimeout(timeout);
        res.status(200).send({
            status: "success",
            message: "Session reconnected successfully"
        });

    } catch (error) {
        clearTimeout(timeout);
        console.error(`[reconnect] Error:`, error);
        res.status(500).send({
            status: "error",
            message: error.message
        });
    }
});

// Replace the entire react-message route with:
baileysApp.post("/react-message", handleReaction.handleReaction);

// Add this with other route declarations
baileysApp.use('/contacts', contactsRoutes);

// Add this new route after your other session management routes
baileysApp.post("/restart-all-sessions", async (req, res) => {
    console.log(`[/restart-all-sessions] Initiating full sessions restart`);
    
    try {
        const results = await restoreSessions();
        
        const response = {
            status: "success",
            message: "Sessions restart completed",
            summary: {
                total: results.success.length + results.failed.length,
                successful: results.success.length,
                failed: results.failed.length
            },
            details: {
                success: results.success,
                failed: results.failed
            },
            timestamp: new Date().toISOString()
        };

        console.log(`[/restart-all-sessions] Completed with ${results.success.length} successful and ${results.failed.length} failed`);
        res.status(200).send(response);

    } catch (error) {
        console.error(`[/restart-all-sessions] Error:`, error);
        res.status(500).send({
            status: "error",
            message: "Failed to restart sessions",
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Add wipeout route before other routes
baileysApp.post("/wipeout", async (req, res) => {
    try {
        const result = await completeSessionWipeout();
        if (result) {
            res.status(200).json({ success: true, message: 'All sessions wiped out successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to wipe out all sessions' });
        }
    } catch (error) {
        console.error('Wipeout route error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

startServer();

console.log(` BAILE 🧜‍♀️🧜‍♀️ Server running at \n ${serverIP}dashboard \n`);
