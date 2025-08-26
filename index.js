// --- Required Libraries ---
// 'whatsapp-web.js' is the main library for interacting with WhatsApp.
// We use 'NoAuth' because we are in a cloud environment where we can't save session files.
const { Client, NoAuth } = require("whatsapp-web.js"); 
// 'axios' is used to make HTTP requests to our n8n webhook.
const axios = require("axios");

// --- Client Initialization ---
// This is where we create our WhatsApp client.
const client = new Client({
  // Use NoAuth strategy for cloud/docker environments
  authStrategy: new NoAuth(),
  
  // Puppeteer options are crucial for running in a restricted cloud environment like Railway.
  puppeteer: {
    headless: true, // Run the browser in the background
    // These arguments help the browser run smoothly in a container.
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // This may not work on Windows, but is fine for Linux-based servers
      '--disable-gpu'
    ],
  }
});

// --- Client Event Handlers ---

// Event 1: QR Code Generation
// This event fires when a QR code is ready. Instead of trying to draw it in the logs (which gets distorted),
// we will log the raw data string. You can then use this string in an online generator to create a perfect image.
client.on("qr", (qr) => {
  console.log("--------------------------------------------------");
  console.log("QR CODE RECEIVED! Scan this to connect.");
  console.log("If the QR below is distorted, copy the string below it and paste it into an online QR generator.");
  console.log("--------------------------------------------------");
  
  // We require 'qrcode-terminal' just to try and display it, but the main goal is the string below.
  const qrcode = require("qrcode-terminal");
  qrcode.generate(qr, { small: true });

  console.log("--------------------------------------------------");
  console.log("COPY THIS RAW QR STRING IF SCANNING FAILS:", qr);
  console.log("--------------------------------------------------");
});

// Event 2: Client is Ready
// This event fires when the client has successfully authenticated with WhatsApp.
client.on("ready", () => {
  console.log("✅ WhatsApp Client is ready!");
});

// Event 3: Message Received
// This event fires every time a new message is created/received.
client.on("message_create", async (msg) => {
  // Log basic message info
  console.log(`💬 MESSAGE RECEIVED from ${msg.from}: "${msg.body}"`);

  // Ignore messages sent by the bot itself to prevent loops.
  if (msg.id.fromMe) {
    return;
  }

  // Define your list of whitelisted numbers. The bot will only respond to these users.
  const white_list_responders = ["919423177880@c.us", "917057758867@c.us"];

  // Check if the message is from a whitelisted personal chat or group.
  const isUserWhitelisted = white_list_responders.includes(msg.from);
  
  if (isUserWhitelisted) {
      console.log(`👍 User ${msg.from} is whitelisted. Responding...`);
      respond_to_message(msg);
  } else {
      console.log(`🚫 User ${msg.from} is not in the whitelist. Ignoring.`);
  }
});

// --- Start the Client ---
// This command starts the connection process.
console.log("Initializing WhatsApp client...");
client.initialize();


// --- Helper Function to Respond via n8n ---
const respond_to_message = async (msg) => {
  
  // Get the webhook URL from the environment variables you set in Railway.
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  // Safety check: if the URL is not set, log an error and do nothing.
  if (!webhookUrl) {
      console.error("FATAL ERROR: The N8N_WEBHOOK_URL environment variable is not set!");
      return;
  }

  // Proceed only if the message has content.
  if (msg.body) {
    // Structure the data to be sent to your n8n workflow.
    const data_to_send = {
      msg: msg.body,
      from: msg.from,
      from_name: msg._data.notifyName, // The user's WhatsApp name
    };

    console.log(`- - -> Sending data to n8n webhook:`, data_to_send);

    // Use a try...catch block to handle potential network errors.
    try {
      // Make the POST request to your n8n webhook using axios.
      const response = await axios.post(webhookUrl, data_to_send);
      
      console.log(`< - - - Received response from n8n.`);

      // n8n's "Respond to Webhook" node might return data in different structures.
      // This code checks for the 'output' field in the most common places.
      const output = response.data.output || (response.data[0] && response.data[0].json ? response.data[0].json.output : null);

      if (output) {
        // If a valid output is found, reply with it.
        console.log(`Replying with: "${output}"`);
        msg.reply(output);
      } else {
        console.log("⚠️ No 'output' field found in the n8n response. Nothing to send.");
      }
    } catch (error) {
        console.error("❌ Error calling n8n webhook:", error.message);
    }
  }
};
