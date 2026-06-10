require('dotenv').config();
const nodemailer = require('nodemailer');

// ---- TWILIO SMS ----
function createTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid.startsWith('AC') === false || sid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') return null;
  try { return require('twilio')(sid, token); } catch { return null; }
}

async function sendSMS(to, message) {
  const client = createTwilioClient();
  if (!client) {
    console.log(`[SMS simulé] → ${to}: ${message}`);
    return { simulated: true };
  }
  const from = process.env.TWILIO_PHONE_NUMBER;
  const phone = to.replace(/[\s\-\(\)]/g, '');
  const e164 = phone.startsWith('+') ? phone : `+1${phone}`;
  const result = await client.messages.create({ body: message, from, to: e164 });
  console.log(`[SMS envoyé] → ${to} (SID: ${result.sid})`);
  return { sid: result.sid };
}

// ---- NODEMAILER EMAIL ----
function createMailTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: { user, pass },
  });
}

async function sendEmail(to, subject, htmlBody) {
  const transporter = createMailTransporter();
  if (!transporter) {
    console.log(`[Email simulé] → ${to}: ${subject}`);
    return { simulated: true };
  }
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'Fenix Barbier <noreply@fenixbarbier.ca>',
    to,
    subject,
    html: htmlBody,
  });
  console.log(`[Email envoyé] → ${to} (ID: ${info.messageId})`);
  return { messageId: info.messageId };
}

// ---- TEMPLATES ----
function confirmationEmailHTML(data) {
  const shop = process.env.SHOP_NAME || 'Fenix Barbier';
  const address = process.env.SHOP_ADDRESS || '155 Rue Des Chênes O, Quebec Qc G1L 1K6';
  const phone = process.env.SHOP_PHONE || '418-555-0100';
  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="background:#1a1a2e;padding:32px 32px 24px;text-align:center">
      <h1 style="color:#e2b04a;margin:0;font-size:24px;letter-spacing:1px">✂ ${shop}</h1>
      <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:14px">Confirmation de rendez-vous</p>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;color:#1e293b;margin:0 0 24px">Bonjour <strong>${data.clientName}</strong>,</p>
      <p style="color:#64748b;margin:0 0 24px">Votre rendez-vous est confirmé ! Voici les détails :</p>
      <div style="background:#f8fafc;border-radius:8px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="color:#64748b;padding:6px 0;width:40%">Service</td><td style="color:#1e293b;font-weight:600">${data.service}</td></tr>
          <tr><td style="color:#64748b;padding:6px 0">Barbier</td><td style="color:#1e293b;font-weight:600">${data.barber}</td></tr>
          <tr><td style="color:#64748b;padding:6px 0">Date</td><td style="color:#1e293b;font-weight:600">${data.date}</td></tr>
          <tr><td style="color:#64748b;padding:6px 0">Heure</td><td style="color:#1e293b;font-weight:600">${data.time}</td></tr>
          <tr><td style="color:#64748b;padding:6px 0">Prix</td><td style="color:#e2b04a;font-weight:700">${data.price} $</td></tr>
        </table>
      </div>
      <div style="background:#fff3cd;border-left:4px solid #e2b04a;padding:14px 16px;border-radius:4px;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#856404">⏰ Vous recevrez un rappel SMS 24h avant votre rendez-vous.</p>
      </div>
      <p style="font-size:13px;color:#64748b;margin:0">Pour annuler ou modifier votre rendez-vous, appelez-nous au <strong>${phone}</strong></p>
    </div>
    <div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:12px;color:#94a3b8">📍 ${address}</p>
      <p style="margin:6px 0 0;font-size:12px;color:#94a3b8">📞 ${phone}</p>
    </div>
  </div>
</body>
</html>`;
}

function reminderSMSText(data) {
  const shop = process.env.SHOP_NAME || 'Fenix Barbier';
  const phone = process.env.SHOP_PHONE || '418-555-0100';
  return `[${shop}] Rappel: votre RDV "${data.service}" est demain ${data.date} à ${data.time} avec ${data.barber}. Pour annuler: ${phone}`;
}

function reminderEmailHTML(data) {
  return confirmationEmailHTML({ ...data, isReminder: true });
}

module.exports = { sendSMS, sendEmail, confirmationEmailHTML, reminderSMSText, reminderEmailHTML };
