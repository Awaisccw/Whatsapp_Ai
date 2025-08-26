const { Client, NoAuth } = require("whatsapp-web.js"); // CHANGE 1: We are not using LocalAuth anymore
const axios = require("axios");
const qrcode = require("qrcode-terminal");

// CHANGE 2: We use NoAuth for cloud environments where we can't save files easily.
// This means you will scan a QR code from the logs each time the app restarts.
const client = new Client({
  authStrategy: new NoAuth(),
  puppeteer: {
		args: ['--no-sandbox'],
	}
});

client.on("qr", (qr) => {
  // This will print the QR code in your Railway logs
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("message_create", async (msg) => {
  console.log("MESSAGE RECEIVED", msg.from, msg.to, msg.body);

  // Ignore messages sent by you
  if (msg.id.fromMe) {
    console.log("Ignore: Message sent by me");
    return;
  }

  // Your whitelisted numbers
  let white_list_responders = ["919423177880@c.us", "917057758867@c.us","923424153171@c.us","923316156896@c.us"];

  if (msg.from.includes("@g.us")) {
    console.log("Group message");
    let mentionedIds = msg.mentionedIds;
    console.log("Mentioned Ids", mentionedIds);

    let is_white_listed = false;
    if (mentionedIds) {
      mentionedIds.forEach((id) => {
        // Simple check if any mentioned user is in the whitelist
        if (white_list_responders.includes(id)) {
          is_white_listed = true;
        }
      });
    }
    if (is_white_listed) {
        respond_to_message(msg);
    }

  } else {
    console.log("Personal message");
    // Check if the message is from a whitelisted user
    if (white_list_responders.includes(msg.from)) {
      console.log("White listed user");
      respond_to_message(msg);
    } else {
      console.log("Not a white listed user");
    }
  }
});

client.initialize();

// This function now uses an environment variable for the webhook URL
const respond_to_message = async (msg) => {
  // The webhook URL is now loaded from the environment variables
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
      console.error("ERROR: N8N_WEBHOOK_URL environment variable not set!");
      return;
  }

  if (msg.body) {
    let data = {
      msg: msg.body,
      from: msg.from,
      from_name: msg._data.notifyName,
    };
    console.log("Sending data to n8n:", data);
    try {
      // CHANGE 3: Use the webhookUrl variable instead of a hardcoded localhost URL
      let response = await axios.post(webhookUrl, data);
      
      console.log("Received response from n8n:", response.data);

      // n8n's "Respond to Webhook" node often nests the data.
      // We check for common output structures.
      const output = response.data.output || (response.data[0] && response.data[0].json ? response.data[0].json.output : null);

      if (output) {
        msg.reply(output);
      } else {
        console.log("No 'output' field found in n8n response.");
      }
    } catch (error) {
        console.error("Error calling n8n webhook:", error.message);
    }
  } else {
    console.log("No message body to process.");
  }
};
