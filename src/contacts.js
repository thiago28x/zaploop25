const express = require('express');
const router = express.Router();
const { sessions } = require('../createBaileysConnection');

// Add a new route to explicitly sync contacts
router.post("/sync", async (req, res) => {
    const sessionId = req.body.session || 'default';
    
    try {
        console.log(`[contacts/sync] Manually syncing contacts for session: ${sessionId}`);
        
        const session = sessions.get(sessionId);
        if (!session) {
            return res.status(404).send({
                status: "error",
                message: `Session ${sessionId} not found`
            });
        }

        if (!session.sock) {
            return res.status(503).send({
                status: "error",
                message: "Session socket not initialized"
            });
        }

        // Trigger a manual contact sync
        await session.sock.contactsUpdate();
        
        return res.send({
            status: "success", 
            message: "Contact sync initiated",
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`[contacts/sync] error: ${error.message}`);
        return res.status(500).send({
            status: "error",
            message: "Failed to sync contacts",
            details: error.message
        });
    }
});

router.get("/", async (req, res) => {
    // ... existing code ...
}); 