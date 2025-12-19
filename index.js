import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PAGE_TOKEN = process.env.PAGE_TOKEN;
const GEMINI_KEY = process.env.GEMINI_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// تحقق Webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// استقبال الرسائل
app.post("/webhook", async (req, res) => {
  const msg = req.body.entry?.[0]?.messaging?.[0];
  const text = msg?.message?.text;
  const sender = msg?.sender?.id;

  if (text) {
    const reply = await geminiReply(text);
    await sendMessage(sender, reply);
  }

  res.send("ok");
});

async function geminiReply(text) {
  const r = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
    {
      contents: [{ parts: [{ text }] }]
    }
  );
  return r.data.candidates[0].content.parts[0].text;
}

async function sendMessage(id, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`,
    {
      recipient: { id },
      message: { text }
    }
  );
}

app.listen(process.env.PORT || 3000, () =>
  console.log("Bot running")
);
