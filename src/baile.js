const express = require('express');
const { startBaileysConnection, getSession, restoreSessions, sessions, connectionStates } = require('./createBaileysConnection');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const os = require('os');
let isStarting = false;
let lastStartAttempt = 0;
const MIN_RESTART_INTERVAL = 30000; // 30 seconds
const baileysApp = express();
const serverIP = "http://209.145.62.86:4001/"

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

baileysApp.use(express.json());

// Add static files middleware
baileysApp.use(express.static(path.join(__dirname, 'public')));

baileysApp.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//start a new session
baileysApp.post("/start", async (req, res) => {
  let { sessionId } = req.body;
  console.log(`\n 🍪 BAILEYS SERVER:  \n/create-connection: Creating session with ID: ${sessionId}\n`);
  
  try {
    let client = await startBaileysConnection(sessionId);
    
    // Get QR code from the connection
    let qrCode = null;
    if (client.ev) {
        await new Promise((resolve) => {
            let timeout = setTimeout(() => resolve(), 10000); // 10 second timeout
            
            client.ev.on('connection.update', ({ qr }) => {
                if (qr) {
                    qrCode = qr;
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });
    }
    
    res.send({ 
        status: "New connection created", 
        sessionId,
        qrCode: qrCode // Send QR code in response if available
    });
  } catch (error) {
    console.error(`/create-connection: Error creating session: ${error}\n`);
    res.status(500).send({ error: "Failed to create connection" });
  }
});

//route get session connection
baileysApp.get("/session/:sessionId", async (req, res) => {
    let { sessionId } = req.params;
    let client = getSession(sessionId);
    res.send({ status: "success", session: client });
});

baileysApp.post("/send-message", async (req, res) => {
  let { sessionId, jid, message } = req.body;
  console.log(`\n💫BAILEYS SERVER: /send-message: Request params - sessionId: ${sessionId}, jid: ${jid}, message: ${message}\n`);
  
  try {
    let client = getSession(sessionId);
    if (!client) {
      console.log(`\n 🍪 BAILEYS SERVER:  \n/send-message: No session found for sessionId: \n${sessionId}\n`);
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

baileysApp.delete("/session/:sessionId", (req, res) => {
    let { sessionId } = req.params;
    console.log(`\n 🍪 BAILEYS SERVER:  \n/session/${sessionId}: Deleting session\n`);
    
    try {
        let client = getSession(sessionId);
        if (!client) {
            throw new Error("Session not found");
        }
        
        // Close the connection
        client.end();
        // Remove from sessions map
        sessions.delete(sessionId);
        
        // Optionally delete the session directory
        let sessionDir = path.join(process.cwd(), 'whatsapp-sessions', sessionId);
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true });
        }
        
        res.send({ status: "success", message: "Session deleted" });
    } catch (error) {
        console.error(`/session/${sessionId}: Error deleting session: ${error}\n`);
        res.status(500).send({ error: "Failed to delete session" });
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
        let storeData = {
            contacts: {},
            chats: [],
            messages: []
        };

        if (!store) {
            console.error(`/session-info: No store found for session ${sessionId}\n`);
            return res.status(500).send({ 
                error: "Store not initialized",
                sessionId 
            });
        }

        try {
            // Fetch contacts with error handling
            try {
                storeData.contacts = await store.contacts.all();
                console.log(`/session-info: Retrieved ${Object.keys(storeData.contacts || {}).length} contacts\n`);
            } catch (error) {
                console.error(`/session-info: Error fetching contacts: ${error}\n`);
                storeData.contacts = { error: "Failed to fetch contacts" };
            }

            // Fetch chats with error handling
            try {
                storeData.chats = await store.chats.all();
                console.log(`/session-info: Retrieved ${storeData.chats.length} chats\n`);
            } catch (error) {
                console.error(`/session-info: Error fetching chats: ${error}\n`);
                storeData.chats = { error: "Failed to fetch chats" };
            }

            // Fetch messages with error handling
            try {
                storeData.messages = await store.messages.all();
                console.log(`/session-info: Retrieved ${storeData.messages.length} messages\n`);
            } catch (error) {
                console.error(`/session-info: Error fetching messages: ${error}\n`);
                storeData.messages = { error: "Failed to fetch messages" };
            }

            console.log(`\n 🍪 BAILEYS SERVER:  \n/session-info: Store data retrieved:
                Contacts: ${Object.keys(storeData.contacts || {}).length}
                Chats: ${(storeData.chats || []).length}
                Messages: ${(storeData.messages || []).length}\n`);
        } catch (error) {
            console.error(`/session-info: Error fetching store data: ${error}\n`);
            storeData = { error: error.message };
        }

        res.send({
            status: "success",
            info: storeData,
            contacts: Object.keys(storeData.contacts || {}).length,
            chats: (storeData.chats || []).length,
            messages: (storeData.messages || []).length
        });
    } catch (error) {
        console.error(`/session-info/${sessionId}: Error fetching info: ${error}\n`);
        res.status(500).send({ error: "Failed to fetch session info" });
    }
});



baileysApp.post("/send-image", async (req, res) => {
    let { sessionId, jid, imageUrl, caption } = req.body;
    console.log(`\n 🍪 BAILEYS SERVER:  \n\n BAILEYS SERVER: /send-image: Request params - sessionId: ${sessionId}, jid: ${jid}, imageUrl: ${imageUrl}, caption: ${caption}\n`);
    
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

        console.log(`\n 🍪 BAILEYS SERVER:  \n\n BAILEYS SERVER:/send-image: Sending image to formatted JID: ${jid}\n`);
        
        await client.sendMessage(jid, {
            image: { url: imageUrl || 'https://www.svgrepo.com/show/508699/landscape-placeholder.svg' },
            caption: caption || 'hello!'
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
    const diskInfo = fs.statSync('/'); // Ensure diskInfo is defined here
    const totalDisk = diskInfo.blocks * diskInfo.bsize;
    const freeDisk = diskInfo.bfree * diskInfo.bsize;
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
            total: formatBytes(totalDisk),
            used: formatBytes(usedDisk),
            free: formatBytes(freeDisk)
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
    
    console.log(`\n 🍪 BAILEYS SERVER:  \n\n 🍪 BAILEYS SERVER:  \n gracefulShutdown: Received shutdown signal\n`);
    
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

// Middleware to log requests and validate JSON body
baileysApp.use((req, res, next) => {
    console.log(`\n 🍪 BAILEYS SERVER:  \nRequest Logger: ${req.method} ${req.url}\n`);

    // Check if the request has a JSON body
    if (!req.is('application/json')) {
        return res.status(400).send({ error: 'Request must be in JSON format' });
    }

    // Check for 'jid' and 'sessionId' in the body
    let { jid, sessionId } = req.body;
    if (!jid || !sessionId) {
        return res.status(400).send({ error: 'Missing phone number or sessionId in request body' });
    }

    // Sanitize 'jid' by removing all non-numeric characters
    req.body.jid = jid.replace(/\D/g, '');

    // Optionally, validate the length of the phone number
    if (req.body.jid.length < 10 || req.body.jid.length > 15) {
        return res.status(400).send({ error: 'Invalid phone number length' });
    }

    // Remove leading zeros if necessary
    req.body.jid = req.body.jid.replace(/^0+/, '');

    //trim
    req.body.jid = req.body.jid.trim();

    next();
});

startServer();

console.log(`Server running at \n ${serverIP}dashboard \n`);
