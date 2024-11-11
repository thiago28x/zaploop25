let express = require("express");
let { startBaileysConnection, getSession, restoreSessions, sessions, connectionStates } = require("./createBaileysConnection");
let path = require('path');
let fs = require('fs');

let baileysApp = express();

// Restore sessions before starting the server
async function startServer() {
    console.log(`startServer: Initializing server\n`);
    
    try {
        await restoreSessions();
        
        baileysApp.listen(4001, () => {
            console.log(`startServer: Baileys service running on port 4001\n`);
        });
    } catch (error) {
        console.error(`startServer: Error starting server: ${error}\n`);
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
  console.log(`/send-message: Sending message using session ${sessionId}\n`);
  
  try {
    let client = getSession(sessionId);
    if (!client) {
      throw new Error("Session not found");
    }
    await client.sendMessage(jid, { text: message });
    res.send({ status: "Message sent" });
  } catch (error) {
    console.error(`/send-message: Error sending message: ${error}\n`);
    res.status(500).send({ error: "Message not sent" });
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
            store = {
                contacts: await client.store.contacts.all(),
                chats: await client.store.chats.all(),
                messages: await client.store.messages.all()
            };
        }

        res.send({
            status: "success",
            info: store
        });
    } catch (error) {
        console.error(`/session-info/${sessionId}: Error fetching info: ${error}\n`);
        res.status(500).send({ error: "Failed to fetch session info" });
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

// Add at the bottom of the file
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
    console.log('Received shutdown signal\n');
    
    try {
        // Close all WhatsApp connections gracefully
        for (let [sessionId, client] of sessions) {
            console.log(`gracefulShutdown: Closing session ${sessionId}\n`);
            await client.end();
        }
        
        // Clear all maps
        sessions.clear();
        connectionStates.clear();
        
        process.exit(0);
    } catch (error) {
        console.error(`gracefulShutdown: Error during shutdown: ${error}\n`);
        process.exit(1);
    }
}

startServer();
