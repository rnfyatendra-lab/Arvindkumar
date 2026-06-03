// server.js
require('dotenv').config();
const express      = require('express');
const session      = require('express-session');
const bodyParser   = require('body-parser');
const nodemailer   = require('nodemailer');
const rateLimit    = require('express-rate-limit');
const helmet       = require('helmet');
const xss          = require('xss');
const path         = require('path');

const app  = express();
const PORT = process.env.PORT || 8080;

// ─── Credentials from .env ────────────────────────────────────────────────────
// .env file mein ye likho:
//   LOGIN_USER=apna_username
//   LOGIN_PASS=apna_strong_password
//   SESSION_SECRET=koi_bhi_lamba_random_string
const ADMIN_USER = process.env.LOGIN_USER     || 'admin';
const ADMIN_PASS = process.env.LOGIN_PASS     || 'Admin@1234';
const SES_SECRET = process.env.SESSION_SECRET || 'ch@nge-this-secret-now!';

// ─── Email validator ──────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isEmail  = e => EMAIL_RE.test(String(e).toLowerCase());

// ─── Helmet (HTTP security headers) ──────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc : ["'self'"],
      scriptSrc  : ["'self'", "'unsafe-inline'"],
      styleSrc   : ["'self'", "'unsafe-inline'"],
      imgSrc     : ["'self'", "data:"]
    }
  }
}));

// ─── Rate limiters ────────────────────────────────────────────────────────────
// Login: max 10 tries per 15 min per IP
const loginLimiter = rateLimit({
  windowMs : 15 * 60 * 1000,
  max      : 10,
  message  : { success: false, message: '⏳ Too many login attempts. Try after 15 min.' },
  standardHeaders: true,
  legacyHeaders  : false
});

// Send: max 5 send requests per minute per session (prevent spam)
const sendLimiter = rateLimit({
  windowMs : 60 * 1000,
  max      : 5,
  message  : { success: false, message: '⏳ Too many send requests. Wait 1 minute.' },
  keyGenerator: (req) => req.session?.user || req.ip,
  standardHeaders: true,
  legacyHeaders  : false
});

// ─── Body parser & static ─────────────────────────────────────────────────────
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }));
app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Session ──────────────────────────────────────────────────────────────────
app.use(session({
  secret           : SES_SECRET,
  resave           : false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    maxAge  : 4 * 60 * 60 * 1000  // 4 hours
  }
}));

// ─── Auth guard ───────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/');
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', loginLimiter, (req, res) => {
  const user = xss(String(req.body.username || '').trim()).slice(0, 100);
  const pass = String(req.body.password || '').trim().slice(0, 200);

  if (!user || !pass)
    return res.json({ success: false, message: '❌ Username and password required' });

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    req.session.regenerate(() => {        // prevent session fixation
      req.session.user = user;
      res.json({ success: true });
    });
  } else {
    res.json({ success: false, message: '❌ Invalid credentials' });
  }
});

app.get('/launcher', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

async function sendBatch(transporter, mails, batchSize = 5) {
  const results = [];
  for (let i = 0; i < mails.length; i += batchSize) {
    const batch   = mails.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(m => transporter.sendMail(m)));
    results.push(...settled);
    if (i + batchSize < mails.length) await delay(300); // Gmail rate-limit pause
  }
  return results;
}

// ─── Send route ───────────────────────────────────────────────────────────────
app.post('/send', requireAuth, sendLimiter, async (req, res) => {
  try {
    const senderName = xss(String(req.body.senderName || 'Anonymous').trim()).slice(0, 100);
    const email      = String(req.body.email    || '').trim().toLowerCase();
    const password   = String(req.body.password || '').trim();
    const subject    = xss(String(req.body.subject || 'No Subject').trim()).slice(0, 998);
    const message    = xss(String(req.body.message || '').trim()).slice(0, 50000);
    const recipients = String(req.body.recipients || '');

    // Validate sender email
    if (!isEmail(email))
      return res.json({ success: false, message: '❌ Invalid sender Gmail address' });

    if (!password)
      return res.json({ success: false, message: '❌ App Password required' });

    // Parse & validate recipients
    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim().toLowerCase())
      .filter(r => isEmail(r));

    if (recipientList.length === 0)
      return res.json({ success: false, message: '❌ No valid recipient emails found' });

    if (recipientList.length > 500)
      return res.json({ success: false, message: '❌ Max 500 recipients allowed at once' });

    // Create transporter (pooled for speed)
    const transporter = nodemailer.createTransport({
      host  : 'smtp.gmail.com',
      port  : 465,
      secure: true,
      auth  : { user: email, pass: password },
      pool  : true,
      maxConnections: 5,
      maxMessages   : 100,
      socketTimeout : 10000
    });

    // Verify SMTP auth before sending
    await transporter.verify();

    // Build mail list
    const safeName = senderName.replace(/[<>"]/g, '');
    const mails = recipientList.map(to => ({
      from   : `"${safeName}" <${email}>`,
      to,
      subject,
      text   : message
    }));

    // Send in batches
    const results = await sendBatch(transporter, mails, 5);
    transporter.close();

    const sent   = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return res.json({
      success: true,
      message: `✅ Sent: ${sent}${failed > 0 ? ` | ❌ Failed: ${failed}` : ''}`
    });

  } catch (err) {
    console.error('Send error:', err.code || err.message);

    let msg = '❌ Something went wrong. Try again.';
    if (/auth|credentials|password|login/i.test(err.message))
      msg = '❌ Gmail auth failed. Use App Password (not your Gmail password).';
    else if (/ECONNREFUSED|ETIMEDOUT|getaddrinfo/i.test(err.message))
      msg = '❌ Cannot connect to Gmail SMTP. Check internet connection.';

    return res.json({ success: false, message: msg });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🚀 Fast Mailer running on http://localhost:${PORT}`));
