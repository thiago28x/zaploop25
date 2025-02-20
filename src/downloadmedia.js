const fs = require('fs');
const path = require('path');

/**
 * Stores media from WhatsApp messages to the local filesystem
 * @param {string} sessionId - The WhatsApp session ID
 * @param {object} message - The message object containing media
 * @param {object} sock - The WhatsApp socket connection
 * @returns {Promise<string|null>} - Path to stored media or null if failed
 */
async function storeMedia(sessionId, message, sock) {
    // Variables at top
    const mediaType = getMediaType(message);
    const fromNumber = message.key.remoteJid;
    let mediaPath = null;
    let mediaData = null;


    if (!mediaType) {
        return null;
    }
    

    try {
    console.log(`storeMedia: Processing ${mediaType} from: ${fromNumber} - \n session: ${sessionId}`);

        // Create folder structure
        const baseDir = path.join(process.cwd(), 'whatsapp-sessions', sessionId, fromNumber, mediaType);
        await ensureDirectoryExists(baseDir);

        // Get media data
        mediaData = await downloadMedia(message, sock);
        if (!mediaData) {
            console.log(`storeMedia: Failed to download media`);
            return null;
        }

        // Generate filename
        const filename = generateFilename(message, mediaType);
        mediaPath = path.join(baseDir, filename);

        // Save the file
        console.log(`storeMedia: Saving media to ${mediaPath}`);
        await fs.promises.writeFile(mediaPath, mediaData);

        return mediaPath;

    } catch (error) {
        console.error(`storeMedia: Error storing media: ${error}`);
        return null;
    }
}

/**
 * Creates directory if it doesn't exist
 * @param {string} dir - Directory path to create
 */
async function ensureDirectoryExists(dir) {
    try {
        await fs.promises.mkdir(dir, { recursive: true });
        console.log(`ensureDirectoryExists: Created directory ${dir}`);
    } catch (error) {
        console.error(`ensureDirectoryExists: Error creating directory: ${error}`);
        throw error;
    }
}

/**
 * Determines media type from message
 * @param {object} message - Message object
 * @returns {string|null} - Media type or null
 */
function getMediaType(message) {
    const messageTypes = {
        imageMessage: 'images',
        videoMessage: 'videos',
        audioMessage: 'audio',
        documentMessage: 'documents',
        stickerMessage: 'stickers'
    };

    const type = Object.keys(messageTypes).find(type => message.message?.[type]);
    return type ? messageTypes[type] : null;
}

/**
 * Downloads media from message
 * @param {object} message - Message containing media
 * @param {object} sock - WhatsApp socket connection
 * @returns {Promise<Buffer|null>} - Downloaded media data
 */
async function downloadMedia(message, sock) {
    console.log(`downloadMedia: Starting download`);

    try {
        const mediaType = getMediaType(message);
        const mediaMessage = message.message[Object.keys(message.message)[0]];

        if (!mediaMessage) {
            console.log(`downloadMedia: No media message found`);
            return null;
        }

        const buffer = await sock.downloadMediaMessage(message);
        return buffer;

    } catch (error) {
        console.error(`downloadMedia: Error downloading media: ${error}`);
        return null;
    }
}

/**
 * Generates filename for media
 * @param {object} message - Message object
 * @param {string} mediaType - Type of media
 * @returns {string} - Generated filename
 */
function generateFilename(message, mediaType) {
    const timestamp = new Date().getTime();
    const mediaMessage = message.message[Object.keys(message.message)[0]];
    
    // Use original filename if available, otherwise generate one
    const originalName = mediaMessage.fileName || '';
    const extension = originalName ? path.extname(originalName) : getDefaultExtension(mediaType);
    
    return originalName ? 
        `${timestamp}_${originalName}` : 
        `${timestamp}${extension}`;
}

/**
 * Gets default extension for media type
 * @param {string} mediaType - Type of media
 * @returns {string} - File extension
 */
function getDefaultExtension(mediaType) {
    const extensions = {
        images: '.jpg',
        videos: '.mp4',
        audio: '.mp3',
        documents: '.bin',
        stickers: '.webp'
    };
    return extensions[mediaType] || '.bin';
}

module.exports = {
    storeMedia
}; 