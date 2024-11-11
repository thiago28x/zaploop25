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

/* this is a Express server to send and receive whatsapp messages using baileys.*/

//git add . && git commit -m "update" && git push


// Restore sessions before starting the server
async function startServer() {
    const currentTime = Date.now();
    console.log(`startServer: Initializing server\n`);
    
    // Prevent multiple simultaneous start attempts
    if (isStarting) {
        console.log(`startServer: Server is already starting\n`);
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
            console.log(`startServer: Baileys service running on port 4001\n`);
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

// Add route for dashboard
baileysApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

baileysApp.post("/create-connection", async (req, res) => {
  let { sessionId } = req.body;
  console.log(`/create-connection: Creating session with ID: ${sessionId}\n`);
  
  try {
    let client = await startBaileysConnection(sessionId);
    res.send({ status: "New connection created", sessionId });
  } catch (error) {
    console.error(`/create-connection: Error creating session: ${error}\n`);
    res.status(500).send({ error: "Failed to create connection" });
  }
});

baileysApp.post("/send-message", async (req, res) => {
  let { sessionId, jid, message } = req.body;
  console.log(`/send-message: Request params - sessionId: ${sessionId}, jid: ${jid}, message: ${message}\n`);
  
  try {
    let client = getSession(sessionId);
    if (!client) {
      throw new Error("Session not found");
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

    console.log(`/send-message: Sending message to formatted JID: ${jid}\n`);

    // Update presence to 'composing'
    await client.sendPresenceUpdate('composing', jid);
    await new Promise(resolve => setTimeout(resolve, 2500)); // Wait for 2.5 seconds

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
    console.log(`/list-sessions: Retrieving all active sessions\n`);
    
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
    console.log(`/session/${sessionId}: Deleting session\n`);
    
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
    console.log(`/session-status/${sessionId}: Fetching status\n`);
    
    try {
        let client = getSession(sessionId);
        let state = connectionStates.get(sessionId);
        
        res.send({
            status: "success",
            exists: !!client,
            connectionState: state || { state: 'unknown' }
        });
    } catch (error) {
        console.error(`/session-status/${sessionId}: Error fetching status: ${error}\n`);
        res.status(500).send({ error: "Failed to fetch session status" });
    }
});

// Get session info (contacts, chats, etc.)
baileysApp.get("/session-info/:sessionId", async (req, res) => {
    let { sessionId } = req.params;
    console.log(`/session-info/${sessionId}: Fetching info\n`);
    
    try {
        let client = getSession(sessionId);
        if (!client) {
            throw new Error("Session not found");
        }

        let store = {};
        if (client.store) {
            try {
                store = {
                    contacts: await client.store.contacts.all(),
                    chats: await client.store.chats.all(),
                    messages: await client.store.messages.all()
                };
                console.log(`Fetched contacts: ${Object.keys(store.contacts).length}\n`);
                console.log(`Fetched chats: ${store.chats.length}\n`);
                console.log(`Fetched messages: ${store.messages.length}\n`);
            } catch (error) {
                console.error(`Error fetching store data: ${error}\n`);
            }
        }

        res.send({
            status: "success",
            info: store,
            contacts: Object.keys(store.contacts || {}).length,
            chats: (store.chats || []).length,
            messages: (store.messages || []).length
        });
    } catch (error) {
        console.error(`/session-info/${sessionId}: Error fetching info: ${error}\n`);
        res.status(500).send({ error: "Failed to fetch session info" });
    }
});



baileysApp.post("/send-image", async (req, res) => {
    let { sessionId, jid, imageUrl, caption } = req.body;
    console.log(`/send-image: Request params - sessionId: ${sessionId}, jid: ${jid}, imageUrl: ${imageUrl}, caption: ${caption}\n`);
    
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

        console.log(`/send-image: Sending image to formatted JID: ${jid}\n`);
        
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
    console.log(`/health: Checking service health\n`);
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

    console.log(`getServerStatus: System resources status:\n` +
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
    
    console.log(`gracefulShutdown: Received shutdown signal\n`);
    
    if (isShuttingDown) {
        console.log(`gracefulShutdown: Shutdown already in progress\n`);
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
            console.log(`gracefulShutdown: Closing Express server\n`);
            await new Promise(resolve => baileysApp.server.close(resolve));
        }
        
        // Close all WhatsApp connections gracefully
        for (let [sessionId, client] of sessions) {
            console.log(`gracefulShutdown: Closing session ${sessionId}\n`);
            await client.end();
        }
        
        // Clear all maps
        sessions.clear();
        connectionStates.clear();
        
        clearTimeout(forceShutdown);
        console.log(`gracefulShutdown: Shutdown completed successfully\n`);
        process.exit(0);
    } catch (error) {
        console.error(`gracefulShutdown: Error during shutdown: ${error}\n`);
        process.exit(1);
    }
}

// Middleware to log requests and validate JSON body
baileysApp.use((req, res, next) => {
    console.log(`Request Logger: ${req.method} ${req.url}\n`);

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
