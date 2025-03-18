const { DisconnectReason, makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('whatsapp-sessions/test');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'debug' }),
    defaultQueryTimeoutMs: 60000,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed: Status ${statusCode}`, lastDisconnect?.error, 'Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('opened connection');
      sendTestMessage(sock);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

async function sendTestMessage(sock, retries = 3) {
  const phoneNumber = '+554796402992'; // Working number
  const message = 'eu gosto de batata 😀';
  const jid = `${phoneNumber}@s.whatsapp.net`;

  // Check if the number is on WhatsApp
  try {
    console.log(`Checking if ${phoneNumber} is on WhatsApp...`);
    const [result] = await sock.onWhatsApp(jid);
    if (!result.exists) {
      console.error(`${phoneNumber} is not a registered WhatsApp number.`);
      return;
    }
    console.log(`${phoneNumber} is valid on WhatsApp`);
  } catch (error) {
    console.error('Failed to check number:', error);
    return;
  }

  // Send the message with retries
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempt ${attempt}: Sending message to ${jid}`);
      const response = await sock.sendMessage(jid, { text: message }, { timeoutMs: 30000 });
      console.log(`Message sent successfully to ${phoneNumber}: "${message}"`, response);
      return;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      if (attempt === retries) {
        console.error('All retries failed. Giving up.');
      } else {
        console.log('Waiting 2 seconds before retry...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}

connectToWhatsApp();

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});