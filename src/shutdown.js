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

        process.exit(0);
    } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
}

// Export the functions
module.exports = { gracefulShutdown, setWebSocketServer }; 