import "dotenv/config";
import express from "express";
import session from "express-session";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax"
    }
  })
);

const LOGIN_USERNAME = process.env.LOGIN_USERNAME || "admin";
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || "admin";

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  return res.status(401).json({ success: false, message: "Unauthorized" });
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === LOGIN_USERNAME &&
    password === LOGIN_PASSWORD
  ) {
    req.session.user = username;
    return res.json({ success: true });
  }

  return res.json({
    success: false,
    message: "Invalid credentials"
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.post("/send", requireAuth, async (req, res) => {
  try {
    const {
      senderName,
      email,
      password,
      recipient,
      subject,
      message
    } = req.body;

    if (
      !email ||
      !password ||
      !recipient ||
      !subject ||
      !message
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: email,
        pass: password
      }
    });

    await transporter.verify();

    await transporter.sendMail({
      from: `"${senderName || email}" <${email}>`,
      to: recipient,
      subject,
      text: message,
      replyTo: email
    });

    return res.json({
      success: true,
      message: "Email sent successfully"
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Failed to send email"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
