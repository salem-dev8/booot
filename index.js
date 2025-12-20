const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express().use(bodyParser.json());

// إعداد Gemini - نستخدم 2.0-flash لأنه الأحدث والأكثر استقراراً حالياً
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
// ملاحظة: إذا استمر الخطأ 404، قم بتغيير الاسم إلى "gemini-1.5-flash"
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// التحقق من Webhook فيسبوك
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

// استقبال الرسائل
app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        for (let entry of body.entry) {
            let webhook_event = entry.messaging[0];
            let sender_psid = webhook_event.sender.id;

            if (webhook_event.message && webhook_event.message.text) {
                await handleMessage(sender_psid, webhook_event.message.text);
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

async function handleMessage(sender_psid, text) {
    try {
        // تشغيل مؤشر الكتابة
        await sendMessengerAction(sender_psid, 'typing_on');

        // استدعاء Gemini
        const result = await model.generateContent(text);
        const responseText = result.response.text();

        // إرسال الرد (مع تقسيم الرسالة إذا زادت عن 2000 حرف)
        await sendSplitMessage(sender_psid, responseText);
    } catch (error) {
        console.error("Gemini Error:", error.message);
        // محاولة إرسال رسالة تنبيه للمستخدم
        await sendToMessenger(sender_psid, "عذراً، واجهت مشكلة في معالجة طلبك (Error 404/Service Unavailable).");
    } finally {
        await sendMessengerAction(sender_psid, 'typing_off');
    }
}

async function sendSplitMessage(sender_psid, text) {
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
        console.error("FB Send Error:", err.response?.data || err.message);
    }
}

async function sendMessengerAction(sender_psid, action) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${process.env.PAGE_TOKEN}`, {
            recipient: { id: sender_psid },
            sender_action: action
        });
    } catch (err) {}
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Bot is live on port ${PORT}`));
