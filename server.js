// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;

// 🔑 Login credentials - .env file mein set karo
// .env file banao aur likho: LOGIN_USER=tumhara_username  LOGIN_PASS=tumhara_password
const HARD_USERNAME = process.env.LOGIN_USER || "1";
const HARD_PASSWORD = process.env.LOGIN_PASS || "1";

// Brute force se bachao - failed login track karo
const loginAttempts = {};

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'bulk-mailer-secret-xyz',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 3 * 60 * 60 * 1000 // 3 hours
  }
}));

// 🔒 Auth middleware
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  return res.redirect('/');
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const ip = req.ip;
  const now = Date.now();

  // 5 attempts ke baad 10 min lock
  if (loginAttempts[ip] && loginAttempts[ip].count >= 5) {
    const diff = now - loginAttempts[ip].time;
    if (diff < 10 * 60 * 1000) {
      const wait = Math.ceil((10 * 60 * 1000 - diff) / 60000);
      return res.json({ success: false, message: `⏳ Too many attempts. Wait ${wait} min.` });
    } else {
      delete loginAttempts[ip];
    }
  }

  const { username, password } = req.body;
  if (username === HARD_USERNAME && password === HARD_PASSWORD) {
    delete loginAttempts[ip];
    req.session.user = username;
    return res.json({ success: true });
  }

  loginAttempts[ip] = {
    count: ((loginAttempts[ip] || {}).count || 0) + 1,
    time: now
  };
  return res.json({ success: false, message: "❌ Invalid credentials" });
});

app.get('/launcher', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

// Helper function for delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function for batch sending
async function sendBatch(transporter, mails, batchSize = 5) {
  const results = [];
  for (let i = 0; i < mails.length; i += batchSize) {
    const batch = mails.slice(i, i + batchSize);
    const promises = batch.map(mail => transporter.sendMail(mail));
    const settled = await Promise.allSettled(promises);
    results.push(...settled);
    await delay(250);
  }
  return results;
}

// ✅ Bulk Mail Sender
app.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ success: false, message: "Email, password and recipients required" });
    }

    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(r => r && r.includes('@')); // sirf valid emails

    if (recipientList.length === 0) {
      return res.json({ success: false, message: "No valid recipients found" });
    }

    // ✅ Single transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: email, pass: password },
      pool: true,           // connection pool - faster sending
      maxConnections: 5,    // 5 parallel connections
      maxMessages: 100      // har connection se max 100 mails
    });

    // Prepare mails
    const safeName = (senderName || 'Anonymous').replace(/"/g, '');
    const mails = recipientList.map(r => ({
      from: `"${safeName}" <${email}>`,
      to: r,
      subject: subject || "No Subject",
      text: message || ""
    }));

    // Send mails in batches
    const results = await sendBatch(transporter, mails, 5);
    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    transporter.close();

    return res.json({
      success: true,
      message: `✅ Sent: ${sent}${failed > 0 ? ` | ❌ Failed: ${failed}` : ''}`
    });

  } catch (err) {
    console.error("Send error:", err);
    const msg = err.message.includes('auth') || err.message.includes('credentials')
      ? "❌ Gmail auth failed. Use App Password, not your Gmail password."
      : "❌ " + err.message;
    return res.json({ success: false, message: msg });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
