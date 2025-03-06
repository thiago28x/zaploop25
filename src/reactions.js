const { getSession } = require('./createBaileysConnection');

async function handleReaction(req, res) {
    // Variables at the top
    let { sessionId, messageId, emoji, jid } = req.body;
    
    console.log(`handleReaction #543: Reacting to message ${messageId} with emoji ${emoji}`);

    // Input validation
    if (!sessionId || !messageId || !emoji || !jid) {
        return res.status(400).send({ 
            error: "Missing required fields",
            details: "sessionId, messageId, emoji, and jid are required" 
        });
    }

    // Validate emoji format (must be a single emoji)
    const emojiRegex = /^\p{Emoji}$/u;
    if (!emojiRegex.test(emoji)) {
        return res.status(400).send({
            error: "Invalid emoji",
            details: "Must provide a single valid emoji character"
        });
    }

    try {
        let client = getSession(sessionId);
        if (!client) {
            console.log(`handleReaction #544: No session found for ${sessionId}`);
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

        // Send reaction
        await client.sendMessage(jid, {
            react: {
                text: emoji,
                key: messageId
            }
        });

        res.send({ 
            status: "success",
            message: "Reaction sent successfully",
            details: {
                messageId,
                emoji,
                jid
            }
        });

    } catch (error) {
        console.error(`handleReaction #545: Error sending reaction: ${error}`);
        res.status(500).send({ 
            error: "Failed to send reaction",
            details: error.message 
        });
    }
}

// Export the handleReaction function
module.exports = {
    handleReaction
}; 