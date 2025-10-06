const form = document.getElementById("mailForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const sendBtn = document.getElementById("sendBtn");
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";

    const data = {
      senderName: document.getElementById("senderName").value,
      senderEmail: document.getElementById("senderEmail").value,
      appPassword: document.getElementById("appPassword").value,
      subject: document.getElementById("subject").value,
      message: document.getElementById("message").value,
      recipients: document.getElementById("recipients").value
    };

    try {
      const res = await fetch("/send-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await res.json();

      alert(result.message); // ✅ सिर्फ़ message दिखेगा
    } catch (err) {
      alert("❌ Mail Not Sent");
    }

    sendBtn.disabled = false;
    sendBtn.textContent = "Send All";
  });
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    window.location.href = "/logout";
  });
}
