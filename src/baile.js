const express = require('express');
const { startBaileysConnection, getSession, restoreSessions, sessions, connectionStates, getStoreData } = require('./createBaileysConnection');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const os = require('os');
const WebSocket = require('ws');
const QRCode = require('qrcode');
let isStarting = false;
let lastStartAttempt = 0;
const MIN_RESTART_INTERVAL = 30000; // 30 seconds
const baileysApp = express();
const serverIP = "http://209.145.62.86:4001/"
let wss;

/* this is a Express server to send and receive whatsapp messages using baileys.*/

//git add . && git commit -m "update" && git push



// Restore sessions before starting the server
async function startServer() {
    const currentTime = Date.now();
    console.log(`\n 🍪 BAILEYS SERVER:  \nstartServer: Initializing server\n`);
    
    // Prevent multiple simultaneous start attempts
    if (isStarting) {
        console.log(`\n 🍪 BAILEYS SERVER:  \nstartServer: Server is already starting\n`);
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
        await restoreSessions();
        
        // Initialize WebSocket before starting Express
        initializeWebSocket();
        
        baileysApp.listen(4001, () => {
            isStarting = false;
            console.log(`\n 🍪 BAILEYS SERVER:  \nstartServer: Baileys service running on port 4001\n`);
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

baileysApp.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//start a new session
baileysApp.post("/start", async (req, res) => {
    let { sessionId } = req.body;
    console.log(`/start #543: Creating session with ID: ${sessionId}`);
    
    try {
        let sessionDir = path.join(process.cwd(), 'whatsapp-sessions', sessionId);
        if (!fs.existsSync(sessionDir)) {
            console.log(`/start #544: Creating new session directory for ${sessionId}`);
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
    console.log(`validatePhoneNumber #004: Validating phone number: ${phoneNumber}`);

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
        
        console.log(`validatePhoneNumber #001: Cleaned phone number: ${req.body.jid}`);
        next();
    } catch (error) {
        console.log(`validatePhoneNumber #032: Error: ${error.message}`);
        res.status(400).json({
            error: 'Invalid phone number',
            details: error.message
        });
    }
};

const validateMessageBody = (req, res, next) => {
    let { sessionId } = req.body;
    console.log(`validateMessageBody #002: Validating message body for sessionId: ${sessionId}`);

    if (!sessionId) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            details: 'sessionId is required'
        });
    }

    next();
};

baileysApp.post("/send-message", validatePhoneNumber, validateMessageBody, async (req, res) => {
  let { sessionId, jid, message } = req.body;
  //console.log(`\n💫BAILEYS SERVER: /send-message: Request params - sessionId: ${sessionId}, jid: ${jid}, message: ${message}\n`);
  
  try {
    let client = getSession(sessionId);
    if (!client) {
      //console.log(`\n 🍪 BAILEYS SERVER:  \n/send-message: No session found for sessionId: \n${sessionId}\n`);
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

    //RANDOM DELAY
    const randomDelay = Math.floor(Math.random() * 5000) + 1000; // Random delay between 1 and 5 seconds
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    // Update presence to 'composing'
    await client.sendPresenceUpdate('composing', jid);
    await new Promise(resolve => setTimeout(resolve, randomDelay)); // Wait for 2.5 seconds

    await client.sendMessage(jid, { text: message });
    res.send({ status: "Message sent" });
  } catch (error) {
    console.error(`/send-message: Error sending message: ${error}\n`);
    res.status(500).send({ 
      error: "Message not sent",
      details: error.message 
    });
  }
});

baileysApp.get("/list-sessions", (req, res) => {
    console.log(`\n 🍪 BAILEYS SERVER:  \n/list-sessions: Retrieving all active sessions\n`);
    
    try {
        let activeSessions = Array.from(sessions.keys());
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
    let { sessionId } = req.params;
    console.log(`deleteSession #543: Attempting to delete session: ${sessionId}`);
    
    try {
        let client = getSession(sessionId);
        if (!client) {
            console.log(`deleteSession #544: No session found for ID: ${sessionId}`);
            return res.status(404).send({ error: "Session not found" });
        }
        
        // Safely close the connection
        try {
            if (client.ws && client.ws.readyState !== WebSocket.CLOSED) {
                await client.end();
            }
        } catch (closeError) {
            console.log(`deleteSession #545: Non-critical error while closing connection: ${closeError}`);
            // Continue with deletion even if connection close fails
        }
        
        // Remove from sessions map
        sessions.delete(sessionId);
        
        // Delete session directory if exists
        let sessionDir = path.join(process.cwd(), 'whatsapp-sessions', sessionId);
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true });
            console.log(`deleteSession #546: Deleted session directory: ${sessionDir}`);
        }
        
        res.send({ 
            status: "success", 
            message: "Session deleted successfully" 
        });
    } catch (error) {
        console.error(`deleteSession #547: Error deleting session: ${error}`);
        res.status(500).send({ 
            error: "Failed to delete session",
            details: error.message 
        });
    }
});

baileysApp.get("/session-status/:sessionId", (req, res) => {
    let { sessionId } = req.params;
    console.log(`\n 🍪 BAILEYS SERVER:  \n/session-status/${sessionId}: Fetching status\n`);
    
    try {
        let client = getSession(sessionId);
        let state = connectionStates.get(sessionId);
        
        // Add connection verification
        let isConnected = client && state && state.state === 'open';
        
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
    console.log(`\n 🍪 BAILEYS SERVER:  \n/session-info/${sessionId}: Fetching info\n`);
    
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

        console.log(`\n 🍪 BAILEYS SERVER:  \n/session-info: Store data retrieved:
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
    console.log(`/send-image #432: Request params - sessionId: ${sessionId}, jid: ${jid}, imageUrl: ${imageUrl}, caption: ${caption}, viewOnce: ${viewOnce}`);
    
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
    console.log(`\n 🍪 BAILEYS SERVER:  \n/health: Checking service health\n`);
    res.send({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        activeSessions: sessions.size
    });
});

// Define the getServerStatus function
function getServerStatus(req, res) {
    const diskInfo = fs.statSync('/');
    
    // Add safety checks
    const blkSize = diskInfo.blksize || 4096; // Use 4096 as fallback block size
    const totalDisk = (diskInfo.blocks || 0) * blkSize;
    const freeDisk = (diskInfo.bfree || 0) * blkSize;
    const usedDisk = totalDisk - freeDisk;

    // Convert bytes to human readable format
    const formatBytes = (bytes) => {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
        }
        return `${bytes.toFixed(2)} ${units[i]}`;
    };

    const totalRAM = os.totalmem();
    const freeRAM = os.freemem();
    const usedRAM = totalRAM - freeRAM;
    const cpuCount = os.cpus().length;
    const cpuUsage = os.loadavg()[0]; // 1-minute load average
    const cpuFree = cpuCount - cpuUsage;

    console.log(`\n 🍪 BAILEYS SERVER:  \n\n BAILEYS SERVER: getServerStatus: System resources status:\n` +
        `RAM - Total: ${formatBytes(totalRAM)}, Used: ${formatBytes(usedRAM)}, Free: ${formatBytes(freeRAM)}\n` +
        `CPU - Total Cores: ${cpuCount}, Used: ${cpuUsage.toFixed(2)}, Free: ${cpuFree.toFixed(2)}\n` + 
        `Disk - Total: ${formatBytes(totalDisk)}, Used: ${formatBytes(usedDisk)}, Free: ${formatBytes(freeDisk)}\n`);

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
            total: formatBytes(diskInfo.blocks * diskInfo.blksize),
            used: formatBytes((diskInfo.blocks - diskInfo.bfree) * diskInfo.blksize),
            free: formatBytes(diskInfo.bfree * diskInfo.blksize)
        }
    });
}

// Set up the route
baileysApp.get('/server-status', getServerStatus);

// Add at the bottom of the file
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
    let isShuttingDown = false;  // Prevent multiple shutdown attempts
    let shutdownTimeout = 10000; // 10 seconds timeout
    
    console.log(`\n  BAILEYS SERVER:  \n\n 🍪 BAILEYS SERVER:  \n gracefulShutdown: Received shutdown signal\n`);
    
    if (isShuttingDown) {
        console.log(`\n 🍪 BAILEYS SERVER:  \ngracefulShutdown: Shutdown already in progress\n`);
        return;
    }
    
    isShuttingDown = true;
    
    try {
        // Set a timeout for forced shutdown
        let forceShutdown = setTimeout(() => {
            console.error(`gracefulShutdown: Forced shutdown after ${shutdownTimeout}ms timeout\n`);
            process.exit(1);
        }, shutdownTimeout);
        
        // Close the Express server first
        if (baileysApp.server) {
            console.log(`\n 🍪 BAILEYS SERVER:  \ngracefulShutdown: Closing Express server\n`);
            await new Promise(resolve => baileysApp.server.close(resolve));
        }
        
        // Close all WhatsApp connections gracefully
        for (let [sessionId, client] of sessions) {
            console.log(`\n 🍪 BAILEYS SERVER:  \ngracefulShutdown: Closing session ${sessionId}\n`);
            await client.end();
        }
        
        // Clear all maps
        sessions.clear();
        connectionStates.clear();
        
        clearTimeout(forceShutdown);
        console.log(`\n 🍪 BAILEYS SERVER:  \ngracefulShutdown: Shutdown completed successfully\n`);
        process.exit(0);
    } catch (error) {
        console.error(`gracefulShutdown: Error during shutdown: ${error}\n`);
        process.exit(1);
    }
}

// Add new endpoints for specific data retrieval
baileysApp.get("/session-chats/:sessionId", async (req, res) => {
    let { sessionId } = req.params;
    console.log(`\n 🍪 BAILEYS SERVER: /session-chats/${sessionId}: Fetching chats\n`);
    
    try {
        let session = sessions.get(sessionId);
        if (!session?.store) {
            throw new Error("Session or store not found");
        }

        let chats = await session.store.chats.all();
        console.log(`/session-chats: Retrieved ${chats.length} chats for ${sessionId}\n`);

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

baileysApp.get("/session-contacts/:sessionId", async (req, res) => {
    let { sessionId } = req.params;
    console.log(`\n 🍪 BAILEYS SERVER: /session-contacts/${sessionId}: Fetching contacts\n`);
    
    try {
        let session = sessions.get(sessionId);
        if (!session?.store) {
            throw new Error("Session or store not found");
        }

        let contacts = await session.store.contacts.all();
        console.log(`/session-contacts: Retrieved ${Object.keys(contacts).length} contacts for ${sessionId}\n`);

        res.send({
            status: "success",
            sessionId,
            contacts: contacts,
            count: Object.keys(contacts).length
        });
    } catch (error) {
        console.error(`/session-contacts: Error: ${error}\n`);
        res.status(500).send({ error: "Failed to fetch contacts" });
    }
});

// Add endpoints using direct socket methods
baileysApp.get("/session-chats-direct/:sessionId", async (req, res) => {
    let sessionId = req.params.sessionId;
    console.log(`\n 🍪 BAILEYS SERVER: /session-chats-direct/${sessionId}: Fetching chats directly\n`);
    
    if (!sessionId) {
        return res.status(400).json({ 
            error: "SessionId is required"
        });
    }

    try {
        let session = sessions.get(sessionId);
        if (!session?.sock) {
            return res.status(404).json({ 
                error: "Session not found",
                sessionId 
            });
        }

        // Using the correct method to fetch chats
        let chats = await session.sock.groupFetchAllParticipating();
        console.log(`/session-chats-direct: Retrieved ${Object.keys(chats).length} chats for ${sessionId}\n`);

        // Transform the chats object into the desired format
        let formattedChats = Object.entries(chats).map(([id, chat]) => ({
            id: id,
            name: chat.subject || chat.name || id,
            participants: chat.participants?.length || 0,
            isGroup: id.endsWith('@g.us')
        }));

        return res.status(200).json({
            status: "success",
            sessionId,
            chats: formattedChats,
            count: formattedChats.length
        });
    } catch (error) {
        console.error(`/session-chats-direct: Error: ${error}\n`);
        res.status(500).json({ 
            error: "Failed to fetch chats directly",
            details: error.message
        });
    }
});

baileysApp.get("/session-contacts-direct/:sessionId", async (req, res) => {
    let { sessionId } = req.params;
    console.log(`\n 🍪 BAILEYS SERVER: /session-contacts-direct/${sessionId}: Fetching contacts directly\n`);
    
    try {
        let session = sessions.get(sessionId);
        if (!session?.sock) {
            throw new Error("Session not found");
        }

        let contacts = await session.sock.getContacts();
        console.log(`/session-contacts-direct: Retrieved ${Object.keys(contacts).length} contacts for ${sessionId}\n`);

        res.send({
            status: "success",
            sessionId,
            contacts: Object.entries(contacts).map(([id, contact]) => ({
                id,
                name: contact.name || contact.notify || id.split('@')[0],
                number: id.split('@')[0],
                isGroup: id.endsWith('@g.us'),
                isBusiness: contact.isBusiness || false
            })),
            count: Object.keys(contacts).length
        });
    } catch (error) {
        console.error(`/session-contacts-direct: Error: ${error}\n`);
        res.status(500).send({ error: "Failed to fetch contacts directly" });
    }
});

// Add a new endpoint to get QR code via HTTP
baileysApp.get("/qr/:sessionId", (req, res) => {
    let { sessionId } = req.params;
    console.log(`/qr #543: Fetching QR for session ${sessionId}`);
    
    try {
        let session = sessions.get(sessionId);
        if (!session || !session.qrCode) {
            return res.status(404).send({ error: "QR code not found" });
        }

        // Send QR code as image
        let qrImage = session.qrCode.split(',')[1];
        let qrBuffer = Buffer.from(qrImage, 'base64');
        
        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': qrBuffer.length
        });
        res.end(qrBuffer);
        
    } catch (error) {
        console.error(`/qr #544: Error serving QR: ${error}`);
        res.status(500).send({ error: "Failed to serve QR code" });
    }
});

// Add this route to handle QR code requests
baileysApp.get("/session-qr/:sessionId", async (req, res) => {
    let { sessionId } = req.params;
    console.log(`/session-qr #543: Fetching QR for session ${sessionId}`);
    
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
        wss = new WebSocket.Server({ 
            port: 4002,
            host: '0.0.0.0'  // Listen on all network interfaces
        });
        
        console.log(`initializeWebSocket #543: Server initialized on port 4002`);
        
        wss.on('connection', (ws) => {
            console.log(`initializeWebSocket #544: Client connected`);
            
            // Send initial connection confirmation
            ws.send(JSON.stringify({
                type: 'connection',
                status: 'connected'
            }));
            
            ws.on('error', (error) => {
                console.log(`initializeWebSocket #545: Error: ${error}`);
            });

            ws.on('close', () => {
                console.log(`initializeWebSocket #546: Client disconnected`);
            });
        });

        wss.on('error', (error) => {
            console.error(`initializeWebSocket #547: Server error: ${error}`);
        });

    } catch (error) {
        console.error(`initializeWebSocket #548: Failed to initialize WebSocket server: ${error}`);
        throw error; // Rethrow to be caught by startServer
    }
}


let { exec } = require('child_process');

baileysApp.post('/update-server', (req, res) => {
    // Variables at the top
    const scriptPath = './src/updateserverfiles.sh';
    let updateResult = null;
    
    console.log(`[updateServer] Running update script at path: ${scriptPath} #544`);
    
    exec(`bash ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            console.log(`[updateServer] Error executing script: ${error} #545`);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to update server',
                error: error.message 
            });
        }
        
        console.log(`[updateServer] Update script output: ${stdout} #546`);
        
        try {
            // Extract the JSON result from stdout
            const resultMatch = stdout.match(/UPDATE_RESULT:({.*})/);
            if (resultMatch) {
                updateResult = JSON.parse(resultMatch[1]);
            }

            let message = '';
            let type = 'info';

            if (updateResult) {
                if (updateResult.waifu.updated || updateResult.baileys.updated) {
                    message = 'Updates installed:\n';
                    type = 'success';
                    if (updateResult.waifu.updated) {
                        message += '- Waifu: ' + updateResult.waifu.message + '\n';
                    }
                    if (updateResult.baileys.updated) {
                        message += '- Baileys: ' + updateResult.baileys.message;
                    }
                } else {
                    message = 'All repositories are up to date';
                    type = 'info';
                }
            } else {
                message = 'Update completed but couldn\'t parse results';
                type = 'warning';
            }

            res.json({ 
                success: true, 
                message: message,
                type: type,
                details: updateResult
            });
        } catch (parseError) {
            console.log(`[updateServer] Error parsing update result: ${parseError} #547`);
            res.json({ 
                success: true, 
                message: 'Update completed but couldn\'t parse results',
                type: 'warning',
                output: stdout 
            });
        }
    });
});


startServer();

console.log(`Server running at \n ${serverIP}dashboard \n`);
