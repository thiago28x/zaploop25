const express = require('express');
const router = express.Router();
const { sessions } = require('../createBaileysConnection');

router.get("/", async (req, res) => {
    const sessionId = req.query.session || 'default';
    const limit = parseInt(req.query.limit) || 10;
    
    try {
        console.log(`[contacts/get] sessionId: ${sessionId}, limit: ${limit}`);
        
        const session = sessions.get(sessionId);
        if (!session) {
            return res.status(404).send({
                status: "error",
                message: `Session ${sessionId} not found`
            });
        }

        if (!session.store?.contacts) {
            return res.status(503).send({
                status: "error",
                message: "Session store or contacts not initialized"
            });
        }

        const contacts = session.store.contacts;
        console.log(`[contacts/get] raw contacts count: ${Object.keys(contacts).length}`);
            
        const transformedContacts = Object.entries(contacts)
            .filter(([id]) => id.endsWith('@s.whatsapp.net'))
            .slice(0, limit)
            .map(([id, contact]) => ({
                id,
                name: contact?.name || contact?.notify || id.split('@')[0],
                number: id.split('@')[0],
                notify: contact?.notify || '',
                verifiedName: contact?.verifiedName || '',
                pushName: contact?.pushName || '',
                status: contact?.status || '',
                imgUrl: contact?.imgUrl || '',
                isBusiness: Boolean(contact?.isBusiness),
                isGroup: false,
                isUser: true,
                lastSeen: contact?.lastSeen || null
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        console.log(`[contacts/get] transformed contacts: ${transformedContacts.length}`);

        return res.send({
            status: "success", 
            contacts: transformedContacts,
            count: transformedContacts.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`[contacts/get] error: ${error.message}`);
        return res.status(500).send({
            status: "error",
            message: "Failed to fetch contacts",
            details: error.message
        });
    }
});

module.exports = router; 