import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const app = express().use(bodyParser.json());

// إعداد العميل الجديد (يقرأ المفتاح تلقائياً من GEMINI_API_KEY في الـ ENV)
const client = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// مخزن مؤقت لربط معرف مستخدم فيسبوك بمعرف التفاعل (Interaction ID)
const userSessions = new Map();
app.get('/ogvu7owkq9al19c1b6r2uuf2de3e08.html', (req, res) => {
    res.send("ضع هنا النص الذي يطلبه منك فيسبوك للتحقق");
});
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
                    await handleInteraction(sender_psid, event.message.text);
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

async function handleInteraction(sender_psid, text) {
    try {
        await sendAction(sender_psid, 'typing_on');

        // جلب معرف التفاعل السابق لهذا المستخدم (لإدارة الحالة)
        const previousId = userSessions.get(sender_psid);

        // إنشاء تفاعل جديد باستخدام Interactions API
        const interaction = await client.interactions.create({
            model: 'gemini-3-flash-preview',
            input: text,
            previous_interaction_id: previousId || undefined,
            // سيتم حفظ التفاعل تلقائياً لمدة يوم واحد في المستوى المجاني
            store: true 
        });

        // حفظ المعرف الجديد للمرة القادمة
        userSessions.set(sender_psid, interaction.id);

        // الحصول على آخر مخرج نصي من النموذج
        const responseText = interaction.outputs[interaction.outputs.length - 1].text;

        await sendLongMessage(sender_psid, responseText);

    } catch (error) {
        console.error("Interactions API Error:", error);
        await sendToMessenger(sender_psid, "عذراً، حدث خطأ في معالجة التفاعل.");
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
app.listen(PORT, () => console.log(`Gemini 3 Interactions Bot is live on port ${PORT}`));
