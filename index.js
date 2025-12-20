const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express().use(bodyParser.json());

// إعداد Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// التحقق من الـ Webhook عند الربط بفيسبوك
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

// استقبال الرسائل ومعالجتها
app.post('/webhook', (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhook_event = entry.messaging[0];
            const sender_psid = webhook_event.sender.id;

            if (webhook_event.message && webhook_event.message.text) {
                handleMessage(sender_psid, webhook_event.message.text);
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// وظيفة التواصل مع Gemini وإرسال الرد
async function handleMessage(sender_psid, received_message) {
    try {
        // إرسال النص إلى Gemini
        const result = await model.generateContent(received_message);
        const responseText = result.response.text();

        // إرسال الرد إلى فيسبوك
        await sendToMessenger(sender_psid, responseText);
    } catch (error) {
        console.error("Error with Gemini or Messenger:", error);
        await sendToMessenger(sender_psid, "عذراً، حدث خطأ ما في معالجة طلبك.");
    }
}

// إرسال الرسالة عبر API فيسبوك
async function sendToMessenger(sender_psid, text) {
    const responseBody = {
        recipient: { id: sender_psid },
        message: { text: text }
    };

    try {
        await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`, responseBody);
    } catch (err) {
        console.error("Unable to send message:" + err);
    }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Webhook is listening on port ${PORT}`));
