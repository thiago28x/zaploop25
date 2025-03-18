const { sessions, cleanupSession } = require('./createBaileysConnection');
const path = require('path');
let wss;

// Export WebSocket server setter
function setWebSocketServer(server) {
    wss = server;
}

async function gracefulShutdown() {
    console.log('\nGraceful shutdown initiated...');
    
    try {
        // Only close WebSocket server if it exists
        if (wss) {
            console.log('Closing WebSocket server...');
            wss.close(() => {
                console.log('WebSocket server closed successfully');
            });
        }

        // Gracefully close sockets but preserve session data
        for (const [sessionId, session] of sessions.entries()) {
            if (session?.sock) {
                try {
                    // Remove event listeners
                    if (session.sock.ev) {
                        session.sock.ev.removeAllListeners();
                    }
                    // Close socket connection without deleting data
                    if (typeof session.sock.close === 'function') {
                        await session.sock.close();
                    }
                    console.log(`Gracefully closed socket for session: ${sessionId}`);
                } catch (error) {
                    console.warn(`Could not gracefully close socket for session ${sessionId}:`, error);
                }
            }
        }
        
        console.log('All connections closed gracefully. Session data preserved.');
        process.exit(0);
    } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
}

// Export the functions
module.exports = { gracefulShutdown, setWebSocketServer }; 