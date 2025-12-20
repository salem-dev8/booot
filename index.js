const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express().use(bodyParser.json());

// إعداد Gemini API 
// ملاحظة: قمنا بإضافة التكوين لضمان الوصول للمسار الصحيح
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
});

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            if (entry.messaging && entry.messaging[0].message) {
                const sender_psid = entry.messaging[0].sender.id;
                const text = entry.messaging[0].message.text;
                if (text) handleMessage(sender_psid, text);
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    }
});

async function handleMessage(sender_psid, received_text) {
    try {
        // إظهار أن البوت يكتب
        await sendAction(sender_psid, 'typing_on');

        // محاولة جلب الرد من Gemini
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: received_text }] }]
        });
        
        const responseText = result.response.text();

        // إرسال النص مقسماً إذا لزم الأمر
        await sendLongMessage(sender_psid, responseText);

    } catch (error) {
        console.error("Gemini Critical Error:", error);
        // إذا فشل Flash، جرب نموذج Pro كخيار احتياطي (اختياري)
        await sendToMessenger(sender_psid, "عذراً، واجهت مشكلة تقنية في الاتصال بجيميني.");
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
        console.error("Messenger Send Error:", err.response?.data || err.message);
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
app.listen(PORT, () => console.log(`Server connected on port ${PORT}`));
