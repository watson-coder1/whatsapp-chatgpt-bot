const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal'); // For printing QR Code in terminal
const axios = require('axios');
require('dotenv').config();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        browser: ["MacOS", "Safari", "14.0"], // Mimic an actual device
        syncFullHistory: false, // Prevent unnecessary data sync
        connectTimeoutMs: 60000, // Increase timeout to 60s
        emitOwnEvents: true, // Ensure all events are properly triggered
        markOnlineOnConnect: true, // Ensure WhatsApp recognizes the session
        defaultQueryTimeoutMs: 60000 // Increase default query timeout
    });

    // Display the QR Code in the terminal
    sock.ev.on('connection.update', ({ qr, connection }) => {
        if (qr) {
            console.log("📌 Scan this QR Code in WhatsApp:");
            qrcode.generate(qr, { small: true });
        }
        if (connection === "open") {
            console.log("✅ Successfully connected to WhatsApp!");
        }
        if (connection === "close") {
            console.log("❌ Connection closed. Restarting...");
            startBot(); // Reconnect on disconnect
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        console.log(`📩 Received message: ${JSON.stringify(msg, null, 2)}`); // Debugging log

        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        
        // Restrict bot from replying to WhatsApp groups
        if (sender.endsWith("@g.us")) {
            console.log("🚫 Ignoring message from a group chat.");
            return;
        }

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    
        console.log(`📨 Sender: ${sender}`);
        console.log(`📜 Message: ${text}`);

        if (text) {
            const response = await getTogetherAIResponse(text);
            console.log(`🤖 Bot Response: ${response}`);

            await sock.sendMessage(sender, { text: response })
                .then(() => console.log(`✅ Message sent successfully to ${sender}`))
                .catch(err => console.error(`❌ Error sending message: ${err}`));
        }
    });

    console.log("✅ WhatsApp ChatGPT Bot is running...");
}

async function getTogetherAIResponse(text) {
    try {
        console.log(`📤 Sending request to Together AI: ${text}`);

        const response = await axios.post('https://api.together.xyz/v1/chat/completions', {
            model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
            messages: [{ role: "system", content: "You are a helpful business assistant." }, { role: "user", content: text }]
        }, {
            headers: { "Authorization": `Bearer ${process.env.TOGETHER_API_KEY}`, "Content-Type": "application/json" }
        });

        console.log(`✅ Together AI Response: ${JSON.stringify(response.data, null, 2)}`);
        return response.data.choices[0].message.content;
    
    } catch (error) {
        console.error("❌ Together AI API Error:", error.response ? error.response.data : error.message);
        return "Sorry, I couldn't process your request. Please try again later.";
    }
}

// Start the bot
startBot();
