const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express().use(bodyParser.json());

// إعداد Gemini API باستخدام النموذج الأحدث
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // تم التحديث هنا

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

app.post('/webhook', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            if (entry.messaging) {
                const webhook_event = entry.messaging[0];
                const sender_psid = webhook_event.sender.id;
                if (webhook_event.message && webhook_event.message.text) {
                    handleMessage(sender_psid, webhook_event.message.text);
                }
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

async function handleMessage(sender_psid, received_message) {
    try {
        sendTypingAction(sender_psid, 'typing_on');

        // طلب الرد من Gemini
        const result = await model.generateContent(received_message);
        const responseText = result.response.text();

        if (responseText.length > 2000) {
            const chunks = responseText.match(/[\s\S]{1,2000}/g);
            for (const chunk of chunks) {
                await sendToMessenger(sender_psid, chunk);
            }
        } else {
            await sendToMessenger(sender_psid, responseText);
        }
    } catch (error) {
        console.error("Gemini Error:", error.message);
        await sendToMessenger(sender_psid, "عذراً، حدث خطأ في النظام. حاول مرة أخرى لاحقاً.");
    } finally {
        sendTypingAction(sender_psid, 'typing_off');
    }
}

async function sendToMessenger(sender_psid, text) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`, {
            recipient: { id: sender_psid },
            message: { text: text }
        });
    } catch (err) {
        console.error("Messenger Error:", err.response ? err.response.data : err.message);
    }
}

async function sendTypingAction(sender_psid, action) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`, {
            recipient: { id: sender_psid },
            sender_action: action
        });
    } catch (err) {}
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
