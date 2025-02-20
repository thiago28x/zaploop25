const fetch = require('node-fetch');

async function handleNewMessage(sessionId, messages, type) {
    // Variables at the top
    const webhookUrl = process.env.WEBHOOK_URL;

    // Skip if message is from self
    if (messages[0]?.key?.fromMe) {
        return;
    }

    for (let message of messages) {
        const msg = message.message;
        if (!msg) {
            continue;
        }

        try {
            // Extract message content based on type
            const messageContent = {
                id: message.key.id,
                from: message.key.remoteJid?.trim()
                    .replace(/@s\.whatsapp\.net/g, '')
                    .replace(/@c\.us/g, '')
                    .replace(/\D/g, ''),
                timestamp: message.messageTimestamp,
                type: Object.keys(msg)[0],
                text: msg.conversation || 
                     msg.extendedTextMessage?.text || 
                     msg.imageMessage?.caption ||
                     msg.videoMessage?.caption ||
                     msg.documentMessage?.caption || 
                     null,
                mediaUrl: msg.imageMessage?.url || 
                        msg.videoMessage?.url || 
                        msg.documentMessage?.url || 
                        null,
                mimetype: msg.imageMessage?.mimetype || 
                         msg.videoMessage?.mimetype || 
                         msg.documentMessage?.mimetype || 
                         null,
                fileName: msg.documentMessage?.fileName || null,
                vCard: msg.contactMessage?.vcard || null,
                location: msg.locationMessage ? {
                    latitude: msg.locationMessage.degreesLatitude,
                    longitude: msg.locationMessage.degreesLongitude,
                    name: msg.locationMessage.name || null
                } : null,
                rawMessage: message
            };

            const webhookPayload = {
                sessionId,
                messageType: type,
                message: messageContent,
                timestamp: new Date().toISOString()
            };
            if (messageContent.from.length < 13) {
                console.log(`handleNewMessage: ${messageContent.from}: ${messageContent.text} \n ${messageContent.type}  ${messageContent.mediaUrl ? '{' + messageContent.mediaUrl + '}' : ''} ${messageContent.mimetype || ''} ${messageContent.fileName || ''} ${messageContent.vCard || ''} ${messageContent.location ? '{' + messageContent.location + '}' : ''}\n`);
            }
     
            // Fire and forget the webhook request
            fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'zaploop',
                },
                body: JSON.stringify(webhookPayload)
            }).catch(error => {
                // Silent catch as this is fire and forget
            });

        } catch (error) {
            console.error(`handleNewMessage: Error processing message ${message?.key?.id}: ${error}\n`);
        }
    }
}

module.exports = handleNewMessage; 