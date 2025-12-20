const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express().use(bodyParser.json());

// استخدام gemini-1.5-flash لتجنب قيود الحصة (Quota) في 2.0
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        for (let entry of body.entry) {
            if (entry.messaging) {
                let event = entry.messaging[0];
                let sender_psid = event.sender.id;
                if (event.message && event.message.text) {
                    await handleMessage(sender_psid, event.message.text);
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

async function handleMessage(sender_psid, text) {
    try {
        await sendAction(sender_psid, 'typing_on');

        const result = await model.generateContent(text);
        const responseText = result.response.text();

        await sendLongMessage(sender_psid, responseText);
    } catch (error) {
        console.error("Gemini Error:", error.message);
        // رسالة تنبيه للمستخدم عند حدوث ضغط على السيرفر
        if (error.message.includes('429')) {
            await sendToMessenger(sender_psid, "أنا متعب قليلاً من كثرة الأسئلة، يرجى إعادة المحاولة بعد دقيقة 😅");
        } else {
            await sendToMessenger(sender_psid, "حدث خطأ بسيط، حاول مرة أخرى.");
        }
    } finally {
        await sendAction(sender_psid, 'typing_off');
    }
}

async function sendLongMessage(sender_psid, text) {
    const chunks = text.match(/[\s\S]{1,2000}/g) || [];
    for (const chunk of chunks) {
        await sendToMessenger(sender_psid, chunk);
    }
}

async function sendToMessenger(sender_psid, text) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${process.env.PAGE_TOKEN}`, {
            recipient: { id: sender_psid },
            message: { text: text }
        });
    } catch (err) {
        console.error("FB Error:", err.response?.data || err.message);
    }
}

async function sendAction(sender_psid, action) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${process.env.PAGE_TOKEN}`, {
            recipient: { id: sender_psid },
            sender_action: action
        });
    } catch (err) {}
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Stable Bot is live on port ${PORT}`));
