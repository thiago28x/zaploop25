const express = require('express');
const router = express.Router();
const { getSession } = require('./createBaileysConnection');

// Middleware for phone number validation
const validatePhoneNumber = (req, res, next) => {
    let phoneNumber = req.body.jid || req.params.jid || req.query.jid;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ validatePhoneNumber #004: Validating phone number: ${phoneNumber}`);

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

// Middleware for message body validation
const validateMessageBody = (req, res, next) => {
    let { sessionId } = req.body;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ validateMessageBody #002: Validating message body for sessionId: ${sessionId}`);

    if (!sessionId) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            details: 'sessionId is required'
        });
    }

    next();
};

// Function to calculate typing duration based on message length
const calculateTypingDuration = (message) => {
    // Base calculation: 
    // 1. Minimum duration: 1 second
    // 2. Add 250ms per character
    // 3. Cap at 15 seconds maximum
    const baseDuration = 1000;  // 1 second minimum
    const charMultiplier = 250; // 250ms per character
    const maxDuration = 15000;  // 15 seconds maximum

    // Initial random delay
    const initialRandomDelay = Math.floor(Math.random() * 1000) + 500;

    // Final small delay before sending
    const finalDelay = Math.floor(Math.random() * 500) + 250;

    // Calculate typing duration
    const typingDuration = Math.min(
        baseDuration + (message.length * charMultiplier), 
        maxDuration
    );

    // Total delay including typing duration and additional random delays
    const totalDelay = initialRandomDelay + typingDuration + finalDelay;

    return {
        typingDuration,
        initialRandomDelay,
        finalDelay,
        totalDelay
    };
};

// Send Text Message (original route: /send-message)
router.post("/send-message", validatePhoneNumber, validateMessageBody, async (req, res) => {
    let { sessionId, jid, message } = req.body;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: /send-message: Request params - sessionId: ${sessionId}, jid: ${jid}, message: ${message}\n`);
  
    if (!message) {
        return res.status(405).send({ error: "Message is required" });
    }
    if (message.length < 3) {
        return res.status(405).send({ error: "Message too short" });
    }

  
    try {
        let client = getSession(sessionId);
        if (!client) {
            return res.status(404).send({ error: "no session found" });
        }

        // Format JID if needed
        if (!jid.includes('@')) {
            jid = `${jid}@s.whatsapp.net`;
        }
    
        // Validate JID format
        if (!jid.match(/^[0-9]+@(s\.whatsapp\.net|g\.us)$/)) {
            throw new Error("Invalid JID format");
        }

        // Calculate typing duration and delays
        const { 
            typingDuration, 
            initialRandomDelay, 
            finalDelay, 
            totalDelay 
        } = calculateTypingDuration(message);

        //trim the message content to 1000 characters
        message = message.substring(0, 400);

        //remove "." from the message
        message = message.replace(".", "");

        //replace "você" with "vc"
        message = message.replace("você", "vc");

        // Random initial delay for more natural behavior
        await new Promise(resolve => setTimeout(resolve, initialRandomDelay));




        //add a random delay between 1 and 3 seconds
        const randomDelay = Math.floor(Math.random() * 2000) + 1000;
        await new Promise(resolve => setTimeout(resolve, randomDelay));

        // Update presence to 'composing'
        await client.sendPresenceUpdate('composing', jid);


        // Simulate typing delay
        await new Promise(resolve => setTimeout(resolve, typingDuration));

        // Stop typing and set to paused
        await client.sendPresenceUpdate('paused', jid);

        // Small additional delay before sending message
        await new Promise(resolve => setTimeout(resolve, finalDelay));

        // Send the message
        await client.sendMessage(jid, { text: message });

        // Reset presence to available
        await client.sendPresenceUpdate('available', jid);

        res.send({ 
            status: "Message sent", 
            typingDuration,
            totalDelay,
            initialRandomDelay,
            finalDelay
        });
    } catch (error) {
        console.error(`/send-message: Error sending message: ${error}\n`);
        res.status(500).send({ 
            error: "Message not sent",
            details: error.message 
        });
    }
});

// Send Image (original route: /send-image)
router.post("/send-image", validatePhoneNumber, validateMessageBody, async (req, res) => {
    let { sessionId, jid, imageUrl, caption, viewOnce } = req.body;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ /send-image #432: Request params - sessionId: ${sessionId}, jid: ${jid}, imageUrl: ${imageUrl}, caption: ${caption}, viewOnce: ${viewOnce}`);
    
    try {
        let client = getSession(sessionId);
        if (!client) {
            throw new Error("Session not found");
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

// Send Video (original route: /send-video)
router.post("/send-video", validatePhoneNumber, validateMessageBody, async (req, res) => {
    let { sessionId, jid, videoUrl, caption, gifPlayback, viewOnce } = req.body;
    
    console.log(` BAILE 🧜‍♀️🧜‍♀️ sendVideo #543: Sending video to ${jid} from session ${sessionId}`);

    // Remove redundant input validation for jid
    if (!videoUrl) {
        return res.status(400).send({ 
            error: "Missing required fields",
            details: "videoUrl is required" 
        });
    }

    try {
        let client = getSession(sessionId);
        if (!client) {
            console.log(` BAILE 🧜‍♀️🧜‍♀️ sendVideo #544: No session found for ${sessionId}`);
            return res.status(404).send({ error: "No session found" });
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

// Send Audio/Voice Note (original route: /send-audio)
router.post("/send-audio", validatePhoneNumber, validateMessageBody, async (req, res) => {
    let { sessionId, jid, audioUrl, seconds = 2 } = req.body;

    // Remove redundant input validation for jid
    if (!audioUrl) {
        return res.status(400).send({ 
            error: "Missing required fields",
            details: "audioUrl is required" 
        });
    }

    try {
        let client = getSession(sessionId);
        if (!client) {
            console.log(` BAILE 🧜‍♀️🧜‍♀️ sendAudio #433: No session found for ${sessionId}`);
            return res.status(404).send({ error: "No session found" });
        }

        // Update presence to 'recording'
        await client.sendPresenceUpdate('recording', jid);

        // Random delay for more natural behavior
        const randomDelay = Math.floor(Math.random() * 3000) + 1000;
        await new Promise(resolve => setTimeout(resolve, randomDelay));

 // Update presence to paused
 await client.sendPresenceUpdate('paused', jid);

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

// React to a message (original route: /react-message)
router.post("/react-message", validatePhoneNumber, async (req, res) => {
    let { sessionId, messageId, emoji, jid } = req.body;
    
   //if emoji is null or empty use a heart emoji
   if (!emoji) {
    emoji = '❤️';
   }

    try {
        let client = getSession(sessionId);
        if (!client) {
            console.log(` BAILE 🧜‍♀️🧜‍♀️ reactMessage #544: No session found for ${sessionId}`);
            return res.status(404).send({ error: "No session found" });
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
        console.error(` BAILE 🧜‍♀️🧜‍♀️ reactMessage #545: Error sending reaction: ${error}`);
        res.status(500).send({ 
            error: "Failed to send reaction",
            details: error.message 
        });
    }
});

// Presence Update Route
router.post("/presence-update", validatePhoneNumber, async (req, res) => {
    let sessionId, presenceType, duration;

    // Destructure and log input parameters
    ({ sessionId, presenceType, duration } = req.body);
    console.log(` BAILE 🧜‍♀️🧜‍♀️ presenceUpdate #687: Updating presence for session ${sessionId} to ${presenceType} for ${duration} ms`);



    // Validate presence type
    const validPresenceTypes = ['composing', 'recording', 'paused'];
    if (!validPresenceTypes.includes(presenceType)) {
        return res.status(400).send({
            error: "Invalid presence type",
            details: `Allowed types are: ${validPresenceTypes.join(', ')}`
        });
    }

    // Validate duration and set a default if invalid
    duration = (typeof duration === 'number' && duration >= 100) 
        ? Math.min(duration, 30000) 
        : 5000; // Default to 5 seconds if invalid

    try {
        let client = getSession(sessionId);
        if (!client) {
            console.log(` BAILE 🧜‍♀️🧜‍♀️ presenceUpdate #688: No session found for ${sessionId}`);
            return res.status(404).send({ error: "No session found" });
        }

        // Send presence update
        await client.sendPresenceUpdate(presenceType, jid);

        // Set a timeout to reset to 'available' after specified duration
        setTimeout(async () => {
            try {
                await client.sendPresenceUpdate('available', jid);
                console.log(` BAILE 🧜‍♀️🧜‍♀️ presenceUpdate #689: Reset presence to available`);
            } catch (resetError) {
                console.error(` BAILE 🧜‍♀️🧜‍♀️ presenceUpdate #690: Error resetting presence: ${resetError}`);
            }
        }, duration);

        res.send({ 
            status: "success",
            message: "Presence updated successfully",
            details: {
                presenceType,
                duration,
                jid
            }
        });

    } catch (error) {
        console.error(` BAILE 🧜‍♀️🧜‍♀️ presenceUpdate #691: Error updating presence: ${error}`);
        res.status(500).send({ 
            error: "Failed to update presence",
            details: error.message 
        });
    }
});

module.exports = router; 