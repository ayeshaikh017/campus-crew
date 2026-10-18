import nodemailer from 'nodemailer';

// ---------------------------------------------------------------------------
// Why this file changed
// Hosts like Render block outbound SMTP ports (25 / 465 / 587) on free plans,
// so Gmail SMTP silently times out and the OTP never arrives. Email APIs work
// over normal HTTPS (port 443), which is never blocked.
//
// Provider order (first one configured wins):
//   1. BREVO_API_KEY   -> Brevo HTTP API   (recommended, free 300 mails/day)
//   2. RESEND_API_KEY  -> Resend HTTP API  (needs a verified domain)
//   3. SMTP_HOST       -> classic SMTP     (works locally / on hosts with SMTP open)
//   4. nothing         -> OTP printed in the terminal (development only)
// ---------------------------------------------------------------------------

const TIMEOUT_MS = Number(process.env.MAIL_TIMEOUT_MS || 12000);

// "CampusCrew <me@gmail.com>"  ->  { name: 'CampusCrew', email: 'me@gmail.com' }
function parseFrom(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim() || 'CampusCrew', email: m[2].trim() };
  return { name: 'CampusCrew', email: raw };
}

function buildContent(otp, purpose) {
  const minutes = process.env.OTP_EXPIRES_MINUTES || 5;
  const isRegister = purpose === 'register';
  const subject = isRegister ? 'Verify your CampusCrew email' : 'Reset your CampusCrew password';
  const heading = isRegister ? 'Verify your email' : 'Reset your password';
  const text = `Your CampusCrew verification code is ${otp}. It expires in ${minutes} minutes. If you did not request this, ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:14px;padding:32px;">
      <tr><td style="font-size:20px;font-weight:700;color:#111827;">campuscrew</td></tr>
      <tr><td style="padding-top:18px;font-size:18px;font-weight:600;color:#111827;">${heading}</td></tr>
      <tr><td style="padding-top:8px;font-size:14px;color:#4b5563;line-height:1.5;">Use this code to continue. It expires in ${minutes} minutes.</td></tr>
      <tr><td align="center" style="padding:22px 0;"><div style="display:inline-block;letter-spacing:8px;font-size:32px;font-weight:700;color:#111827;background:#f3f4f6;border-radius:10px;padding:14px 22px;">${otp}</div></td></tr>
      <tr><td style="font-size:12px;color:#9ca3af;line-height:1.5;">If you did not request this, you can safely ignore this email. Never share this code with anyone.</td></tr>
    </table>
  </td></tr></table></body></html>`;
  return { subject, text, html };
}

async function postJson(url, headers, body, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 400);
      throw new Error(`${label} API ${res.status}: ${detail}`);
    }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${label} API timed out after ${TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaBrevo(to, { subject, text, html }) {
  const from = parseFrom(process.env.MAIL_FROM);
  await postJson(
    'https://api.brevo.com/v3/smtp/email',
    { 'api-key': process.env.BREVO_API_KEY },
    { sender: from, to: [{ email: to }], subject, htmlContent: html, textContent: text },
    'Brevo'
  );
}

async function sendViaResend(to, { subject, text, html }) {
  const from = parseFrom(process.env.MAIL_FROM);
  await postJson(
    'https://api.resend.com/emails',
    { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    { from: `${from.name} <${from.email}>`, to: [to], subject, html, text },
    'Resend'
  );
}

async function sendViaSmtp(to, { subject, text, html }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    // Without timeouts a blocked port makes the request hang for minutes.
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'CampusCrew <no-reply@campuscrew.local>',
    to,
    subject,
    text,
    html,
  });
}

export async function sendOtp(email, otp, purpose) {
  const content = buildContent(otp, purpose);

  let provider = null;
  if (process.env.BREVO_API_KEY) provider = ['Brevo', sendViaBrevo];
  else if (process.env.RESEND_API_KEY) provider = ['Resend', sendViaResend];
  else if (process.env.SMTP_HOST) provider = ['SMTP', sendViaSmtp];

  if (!provider) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('No email provider configured. Set BREVO_API_KEY (or RESEND_API_KEY / SMTP_HOST) on the server.');
    }
    console.log(`\n[DEV OTP] purpose=${purpose} email=${email} code=${otp}\n`);
    return;
  }

  const [name, send] = provider;
  try {
    await send(email, content);
    console.log(`[MAIL] ${purpose} OTP sent via ${name} to ${email}`);
  } catch (err) {
    // This line is what you will look for in the Render logs.
    console.error(`[MAIL ERROR] ${name} failed for ${email}: ${err.message}`);
    throw err;
  }
}
