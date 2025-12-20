const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express().use(bodyParser.json());

// إعداد Gemini API باستخدام نموذج 1.5 Flash السريع
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// تحقق الـ Webhook الخاص بفيسبوك
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
        console.log('WEBHOOK_VERIFIED');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// استقبال الرسائل
app.post('/webhook', (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            if (entry.messaging) {
                const event = entry.messaging[0];
                const sender_psid = event.sender.id;

                if (event.message && event.message.text) {
                    handleMessage(sender_psid, event.message.text);
                }
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// معالجة النص والرد
async function handleMessage(sender_psid, received_text) {
    try {
        // إظهار حالة "جاري الكتابة"
        await sendAction(sender_psid, 'typing_on');

        // طلب الإجابة من Gemini
        const result = await model.generateContent(received_text);
        const responseText = result.response.text();

        // إرسال الرد (مع التقسيم إذا كان النص طويلاً)
        await sendLongMessage(sender_psid, responseText);

    } catch (error) {
        console.error("Gemini Error:", error.message);
        await sendToMessenger(sender_psid, "عذراً، حدث خطأ أثناء معالجة طلبك.");
    } finally {
        await sendAction(sender_psid, 'typing_off');
    }
}

// وظيفة تقسيم الرسائل الطويلة (أكثر من 2000 حرف)
async function sendLongMessage(sender_psid, text) {
    const MAX_LENGTH = 2000;
    if (text.length <= MAX_LENGTH) {
        await sendToMessenger(sender_psid, text);
    } else {
        const chunks = text.match(new RegExp(`.{1,${MAX_LENGTH}}`, 'gs')) || [];
        for (const chunk of chunks) {
            await sendToMessenger(sender_psid, chunk);
        }
    }
}

// إرسال الرسالة إلى API فيسبوك
async function sendToMessenger(sender_psid, text) {
    try {
        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.PAGE_TOKEN}`, {
            recipient: { id: sender_psid },
            message: { text: text }
        });
    } catch (err) {
        console.error("Messenger Send Error:", err.response ? err.response.data : err.message);
    }
}

// وظائف التفاعل (typing_on/off)
async function sendAction(sender_psid, action) {
    try {
        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.PAGE_TOKEN}`, {
            recipient: { id: sender_psid },
            sender_action: action
        });
    } catch (err) {}
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
