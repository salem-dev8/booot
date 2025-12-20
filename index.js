const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express().use(bodyParser.json());

// إعداد Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// 1. التحقق من الـ Webhook (يستخدم لمرة واحدة عند ربط فيسبوك)
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

// 2. استقبال رسائل المستخدمين
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

// 3. معالجة النص بواسطة Gemini
async function handleMessage(sender_psid, received_message) {
    try {
        // إظهار مؤشر "يتم الكتابة الآن" في مسنجر
        sendTypingAction(sender_psid, 'typing_on');

        const result = await model.generateContent(received_message);
        const response = await result.response;
        const responseText = response.text();

        // تقسيم النص إذا كان طويلاً جداً (فيسبوك يسمح بـ 2000 حرف كحد أقصى)
        if (responseText.length > 2000) {
            const chunks = responseText.match(/[\s\S]{1,2000}/g);
            for (const chunk of chunks) {
                await sendToMessenger(sender_psid, chunk);
            }
        } else {
            await sendToMessenger(sender_psid, responseText);
        }
    } catch (error) {
        console.error("Error with Gemini API:", error);
        await sendToMessenger(sender_psid, "عذراً، واجهت مشكلة في معالجة طلبك حالياً.");
    } finally {
        sendTypingAction(sender_psid, 'typing_off');
    }
}

// 4. إرسال الرسالة النهائية للمستخدم
async function sendToMessenger(sender_psid, text) {
    const responseBody = {
        recipient: { id: sender_psid },
        message: { text: text }
    };

    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`,
            responseBody
        );
    } catch (err) {
        console.error("Messenger API Error:", err.response ? err.response.data : err.message);
    }
}

// 5. وظيفة إضافية لإظهار "جاري الكتابة"
async function sendTypingAction(sender_psid, action) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`,
            {
                recipient: { id: sender_psid },
                sender_action: action
            }
        );
    } catch (err) {
        // خطأ غير حرج يمكن تجاهله في السجلات
    }
}

// تشغيل الخادم
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
