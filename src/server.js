let express = require("express");
let { startBaileysConnection } = require("./createBaileysConnection");

let baileysApp = express();
let baileysClient;

baileysApp.use(express.json());

baileysApp.post("/create-connection", async (req, res) => {
  try {
    baileysClient = await startBaileysConnection();
    res.send({ status: "New connection created" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Failed to create connection" });
  }
});

baileysApp.post("/send-message", async (req, res) => {
  let { jid, message } = req.body;
  try {
    await baileysClient.sendMessage(jid, { text: message });
    res.send({ status: "Message sent" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Message not sent" });
  }
});

baileysApp.listen(4001, () => console.log("Baileys service running on port 4001"));
