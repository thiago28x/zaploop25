const fs = require('fs');
const path = require('path');
const { startBaileysConnection, sessions, cleanupSession } = require('./createBaileysConnection');

const sessionsDir = path.join(process.cwd(), 'whatsapp-sessions');

async function restoreSessions() {
    const results = {
        success: [],
        failed: []
    };

    try {
        console.log(`BAILE 🧜‍♀️🧜‍♀️\n🍪 Starting to restore previous sessions`);
        
        // Close all existing sessions first
        const activeSessions = Array.from(sessions.keys());
        for (const sessionId of activeSessions) {
            const session = sessions.get(sessionId);
            if (session?.sock) {
                await cleanupSession(sessionId, session.sock, path.join(sessionsDir, sessionId));
            }
        }

        // Clear existing sessions
        sessions.clear();
        
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
            return results;
        }

        const sessionDirs = fs.readdirSync(sessionsDir);
        console.log(`Found ${sessionDirs.length} previous sessions`);

        for (const sessionId of sessionDirs) {
            try {
                console.log(`Restoring session ${sessionId}`);
                await startBaileysConnection(sessionId);
                results.success.push(sessionId);
            } catch (error) {
                console.error(`Error restoring session ${sessionId}:`, error);
                results.failed.push({ sessionId, error: error.message });
            }
        }

        return results;
    } catch (error) {
        console.error('Error in restoreSessions:', error);
        throw error;
    }
}

module.exports = { restoreSessions, sessionsDir }; 