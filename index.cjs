const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const PAGE_TOKEN = process.env.PAGE_TOKEN;
const GEMINI_KEY = process.env.GEMINI_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

// اختبار البوت والردود
app.get("/test", async (req, res) => {
  try {
    const reply = await geminiReply("مرحبا");
    res.send(reply);
  } catch (err) {
    console.error("Gemini API error:", err.response?.data || err);
    res.send("حدث خطأ مؤقت عند الاتصال بـ Gemini");
  }
});

// جلب كل النماذج المدعومة من Gemini
app.get("/models", async (req, res) => {
  try {
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`
    );
    res.json(response.data);
  } catch (err) {
    console.error("Error fetching models:", err.response?.data || err);
    res.status(500).send("حدث خطأ عند جلب النماذج");
  }
});

// التحقق من Webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// استقبال رسائل Facebook
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;
      const message = event.message?.text;

      if (message) {
        const reply = await geminiReply(message);

        // إرسال الرد للصفحة
        await axios
          .post(
            `https://graph.facebook.com/v16.0/me/messages?access_token=${PAGE_TOKEN}`,
            {
              recipient: { id: senderId },
              message: { text: reply },
            }
          )
          .catch((err) => {
            console.error("Facebook send error:", err.response?.data || err);
          });
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// دالة الاتصال بـ Gemini API
async function geminiReply(text) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/text-bison-001:generateText?key=${GEMINI_KEY}`,
      {
        prompt: text,
        temperature: 0.7,
        candidateCount: 1,
        maxOutputTokens: 500,
      }
    );

    return response.data?.candidates?.[0]?.content || "تم الاستلام، جاري الرد...";
  } catch (err) {
    console.error("Gemini API error:", err.response?.data || err);
    return "عذرًا، حدث خطأ مؤقت. حاول لاحقًا.";
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
