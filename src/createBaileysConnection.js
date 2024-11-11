let makeWASocket = require("@whiskeysockets/baileys").default;
let { useMultiFileAuthState } = require("@whiskeysockets/baileys");
let path = require('path');
let fs = require('fs');

async function startBaileysConnection() {
    let sessionDir = path.join(process.cwd(), 'whatsapp-sessions');
    
    // Create sessions directory if it doesn't exist
    if (!fs.existsSync(sessionDir)) {
        console.log(`startBaileysConnection: Creating sessions directory at ${sessionDir}\n`);
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Load auth state
    console.log(`startBaileysConnection: Loading auth state\n`);
    let { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // Create WA Socket connection
    let sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        // Add any additional configurations here
    });

    // Handle connection updates
    sock.ev.on('connection.update', (update) => {
        let { connection, lastDisconnect } = update;
        console.log(`startBaileysConnection: Connection status: ${connection}\n`);
        
        if (connection === 'close') {
            let shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            console.log(`startBaileysConnection: Reconnecting: ${shouldReconnect}\n`);
            
            if (shouldReconnect) {
                startBaileysConnection();
            }
        }
    });

    // Handle credentials update
    sock.ev.on('creds.update', saveCreds);

    return sock;
}

module.exports = { startBaileysConnection };
