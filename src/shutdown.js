const { sessions, cleanupSession } = require('./createBaileysConnection');
const path = require('path');

async function gracefulShutdown() {
    console.log('\nGraceful shutdown initiated...');
    
    try {
        // Get all active sessions
        const activeSessionIds = Array.from(sessions.keys());
        console.log(`Found ${activeSessionIds.length} active sessions to clean up`);
        
        // Clean up each session
        for (const sessionId of activeSessionIds) {
            const session = sessions.get(sessionId);
            if (session) {
                const sessionDir = path.join(process.cwd(), 'whatsapp-sessions', sessionId);
                await cleanupSession(sessionId, session.sock, sessionDir);
                console.log(`Cleaned up session: ${sessionId}`);
            }
        }
        
        console.log('All sessions cleaned up successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
}

// Export the function
module.exports = gracefulShutdown; 