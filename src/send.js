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

// Send Text Message function
async function sendTextMessage(req, res) {
    let { sessionId, jid, message } = req.body;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: sendTextMessage: Request params - sessionId: ${sessionId}, jid: ${jid}, message: ${message}\n`);
  
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

        // Random initial delay for more natural behavior
        await new Promise(resolve => setTimeout(resolve, initialRandomDelay));

        // Simulate typing
        await client.sendPresenceUpdate('composing', jid);
        
        // Wait for the calculated typing duration
        await new Promise(resolve => setTimeout(resolve, typingDuration));
        
        // Stop typing indicator
        await client.sendPresenceUpdate('paused', jid);
        
        // Small final delay before sending
        await new Promise(resolve => setTimeout(resolve, finalDelay));

        // Send the message
        const sentMsg = await client.sendMessage(jid, { text: message });
        
        console.log(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: /send-message: Message sent successfully\n`);
        return res.status(200).send({ 
            status: "success", 
            message: "Message sent successfully",
            messageInfo: sentMsg
        });
    } catch (error) {
        console.error(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: /send-message: Error sending message: ${error}\n`);
        return res.status(500).send({ 
            status: "error", 
            message: "Failed to send message",
            error: error.message
        });
    }
}

// Send Image function
async function sendImage(req, res) {
    let { sessionId, jid, caption, imageUrl, base64Image } = req.body;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: sendImage: Request params - sessionId: ${sessionId}, jid: ${jid}\n`);

    try {
        let client = getSession(sessionId);
        if (!client) {
            return res.status(404).send({ error: "no session found" });
        }

        // Format JID if needed
        if (!jid.includes('@')) {
            jid = `${jid}@s.whatsapp.net`;
        }

        let imageData;
        if (imageUrl) {
            imageData = { url: imageUrl };
        } else if (base64Image) {
            imageData = Buffer.from(base64Image, 'base64');
        } else {
            return res.status(400).send({ error: "Image URL or base64 image is required" });
        }

        const sentMsg = await client.sendMessage(jid, {
            image: imageData,
            caption: caption || ''
        });

        console.log(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: sendImage: Image sent successfully\n`);
        return res.status(200).send({ 
            status: "success", 
            message: "Image sent successfully",
            messageInfo: sentMsg
        });
    } catch (error) {
        console.error(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: sendImage: Error sending image: ${error}\n`);
        return res.status(500).send({ 
            status: "error", 
            message: "Failed to send image",
            error: error.message
        });
    }
}

// Send Video function
async function sendVideo(req, res) {
    let { sessionId, jid, caption, videoUrl, base64Video } = req.body;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: sendVideo: Request params - sessionId: ${sessionId}, jid: ${jid}\n`);

    try {
        let client = getSession(sessionId);
        if (!client) {
            return res.status(404).send({ error: "no session found" });
        }

        // Format JID if needed
        if (!jid.includes('@')) {
            jid = `${jid}@s.whatsapp.net`;
        }

        let videoData;
        if (videoUrl) {
            videoData = { url: videoUrl };
        } else if (base64Video) {
            videoData = Buffer.from(base64Video, 'base64');
        } else {
            return res.status(400).send({ error: "Video URL or base64 video is required" });
        }

        const sentMsg = await client.sendMessage(jid, {
            video: videoData,
            caption: caption || ''
        });

        console.log(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: sendVideo: Video sent successfully\n`);
        return res.status(200).send({ 
            status: "success", 
            message: "Video sent successfully",
            messageInfo: sentMsg
        });
    } catch (error) {
        console.error(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: sendVideo: Error sending video: ${error}\n`);
        return res.status(500).send({ 
            status: "error", 
            message: "Failed to send video",
            error: error.message
        });
    }
}

// Send Audio function
async function sendAudio(req, res) {
    let { sessionId, jid, audioUrl, base64Audio, ptt } = req.body;
    console.log(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: sendAudio: Request params - sessionId: ${sessionId}, jid: ${jid}\n`);

    try {
        let client = getSession(sessionId);
        if (!client) {
            return res.status(404).send({ error: "no session found" });
        }

        // Format JID if needed
        if (!jid.includes('@')) {
            jid = `${jid}@s.whatsapp.net`;
        }

        let audioData;
        if (audioUrl) {
            audioData = { url: audioUrl };
        } else if (base64Audio) {
            audioData = Buffer.from(base64Audio, 'base64');
        } else {
            return res.status(400).send({ error: "Audio URL or base64 audio is required" });
        }

        // Determine if this should be sent as a voice note
        const isPtt = ptt === true || ptt === 'true';

        const sentMsg = await client.sendMessage(jid, {
            audio: audioData,
            ptt: isPtt,
            mimetype: 'audio/mp4'
        });

        console.log(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: sendAudio: Audio sent successfully\n`);
        return res.status(200).send({ 
            status: "success", 
            message: "Audio sent successfully",
            messageInfo: sentMsg
        });
    } catch (error) {
        console.error(` BAILE 🧜‍♀️🧜‍♀️ \n💫BAILEYS SERVER: sendAudio: Error sending audio: ${error}\n`);
        return res.status(500).send({ 
            status: "error", 
            message: "Failed to send audio",
            error: error.message
        });
    }
}

// Send Reaction function
async function sendReaction(req, res) {
    let { sessionId, messageId, emoji, jid } = req.body;
    
    //if emoji is null or empty use a heart emoji
    if (!emoji) {
        emoji = '❤️';
    }

    try {
        let client = getSession(sessionId);
        if (!client) {
            console.log(` BAILE 🧜‍♀️🧜‍♀️ sendReaction: No session found for ${sessionId}`);
            return res.status(404).send({ error: "No session found" });
        }

        // Format JID if needed
        if (!jid.includes('@')) {
            jid = `${jid}@s.whatsapp.net`;
        }

        // Send reaction
        await client.sendMessage(jid, {
            react: {
                text: emoji,
                key: messageId
            }
        });

        return res.status(200).send({ 
            status: "success",
            message: "Reaction sent successfully",
            details: {
                messageId,
                emoji,
                jid
            }
        });

    } catch (error) {
        console.error(` BAILE 🧜‍♀️🧜‍♀️ sendReaction: Error sending reaction: ${error}`);
        return res.status(500).send({ 
            status: "error",
            message: "Failed to send reaction",
            error: error.message 
        });
    }
}

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

// Send Text Message (original route: /send-message)
router.post("/send-message", validatePhoneNumber, validateMessageBody, async (req, res) => {
    return await sendTextMessage(req, res);
});

// Send Image (original route: /send-image)
router.post("/send-image", validatePhoneNumber, validateMessageBody, async (req, res) => {
    return await sendImage(req, res);
});

// Send Video (original route: /send-video)
router.post("/send-video", validatePhoneNumber, validateMessageBody, async (req, res) => {
    return await sendVideo(req, res);
});

// Send Audio/Voice Note (original route: /send-audio)
router.post("/send-audio", validatePhoneNumber, validateMessageBody, async (req, res) => {
    return await sendAudio(req, res);
});

// React to a message (original route: /react-message)
router.post("/react-message", validatePhoneNumber, async (req, res) => {
    return await sendReaction(req, res);
});

// Unified send route that handles all message types
router.post("/", async (req, res) => {
    const { session, phone, type } = req.body;
    
    if (!session || !phone || !type) {
        return res.status(400).json({
            error: 'Missing required fields',
            details: 'session, phone, and type are required'
        });
    }
    
    // Map the request to the appropriate format for existing handlers
    req.body.sessionId = session;
    req.body.jid = phone;
    
    // Route based on message type
    switch (type.toLowerCase()) {
        case 'text':
            // Validate message for text type
            if (!req.body.message) {
                return res.status(400).json({
                    error: 'Missing required field',
                    details: 'message is required for text type'
                });
            }
            // Forward to text message handler
            return await sendTextMessage(req, res);
            
        case 'image':
            // Validate image fields
            if (!req.body.imageUrl && !req.body.base64Image) {
                return res.status(400).json({
                    error: 'Missing required field',
                    details: 'imageUrl or base64Image is required for image type'
                });
            }
            // Forward to image handler
            return await sendImage(req, res);
            
        case 'video':
            // Validate video fields
            if (!req.body.videoUrl && !req.body.base64Video) {
                return res.status(400).json({
                    error: 'Missing required field',
                    details: 'videoUrl or base64Video is required for video type'
                });
            }
            // Forward to video handler
            return await sendVideo(req, res);
            
        case 'audio':
            // Validate audio fields
            if (!req.body.audioUrl && !req.body.base64Audio) {
                return res.status(400).json({
                    error: 'Missing required field',
                    details: 'audioUrl or base64Audio is required for audio type'
                });
            }
            // Forward to audio handler
            return await sendAudio(req, res);
            
        case 'reaction':
            // Validate reaction fields
            if (!req.body.messageId || !req.body.emoji) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    details: 'messageId and emoji are required for reaction type'
                });
            }
            // Use the reaction handler
            return await sendReaction(req, res);
            
        default:
            return res.status(400).json({
                error: 'Invalid message type',
                details: 'Type must be one of: text, image, video, audio, reaction'
            });
    }
});

module.exports = router; 