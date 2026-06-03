function logout() {
  fetch('/logout', { method: 'POST' })
    .then(() => window.location.href = '/');
}

// Live recipient counter
document.getElementById('recipients')?.addEventListener('input', function() {
  const count = this.value.split(/[\n,]+/).map(r=>r.trim()).filter(r=>r.includes('@')).length;
  const el = document.getElementById('rcCount');
  if (el) el.innerText = count + ' recipient' + (count !== 1 ? 's' : '');
});

document.getElementById('sendBtn')?.addEventListener('click', () => {
  const senderName = document.getElementById('senderName').value;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('pass').value.trim();
  const subject = document.getElementById('subject').value;
  const message = document.getElementById('message').value;
  const recipients = document.getElementById('recipients').value.trim();
  const status = document.getElementById('statusMessage');

  if (!email || !password || !recipients) {
    status.innerText = '❌ Email, password and recipients required';
    alert('❌ Email, password and recipients required');
    return;
  }

  const count = recipients.split(/[\n,]+/).map(r=>r.trim()).filter(r=>r.includes('@')).length;
  if (!confirm(`Send email to ${count} recipient(s)?`)) return;

  const btn = document.getElementById('sendBtn');
  btn.disabled = true;
  btn.innerText = '⏳ Sending...';
  status.innerText = '';

  fetch('/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderName, email, password, subject, message, recipients })
  })
    .then(r => r.json())
    .then(data => {
      status.innerText = data.message;
      status.style.color = data.success ? '#10b981' : '#ef4444';
      if (data.success) {
        alert(data.message);
      } else {
        alert('❌ Failed: ' + data.message);
      }
      btn.disabled = false;
      btn.innerText = '🚀 Send All';
    })
    .catch(err => {
      status.innerText = '❌ Error: ' + err.message;
      status.style.color = '#ef4444';
      alert('❌ Error: ' + err.message);
      btn.disabled = false;
      btn.innerText = '🚀 Send All';
    });
});
