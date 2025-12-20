const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express().use(bodyParser.json());

// إعدادات التوصيل
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

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

        // طلب مباشر من جوجل بدون استخدام مكتبة @google/generative-ai
        const response = await axios.post(`${GEMINI_API_URL}?key=${process.env.GEMINI_KEY}`, {
            contents: [{ parts: [{ text: text }] }]
        });

        const responseText = response.data.candidates[0].content.parts[0].text;

        // إرسال الرد مقسماً
        await sendLongMessage(sender_psid, responseText);
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Gemini Direct Error:", JSON.stringify(errorData));
        
        if (JSON.stringify(errorData).includes('429')) {
            await sendToMessenger(sender_psid, "عذراً، الحصة المجانية انتهت حالياً. جرب لاحقاً.");
        } else {
            await sendToMessenger(sender_psid, "حدث خطأ في الاتصال بجيميني.");
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
app.listen(PORT, () => console.log(`Direct Bot is live on port ${PORT}`));
