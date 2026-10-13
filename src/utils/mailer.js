import nodemailer from 'nodemailer';
export async function sendOtp(email, otp, purpose) {
  const subject = purpose === 'register' ? 'Verify your CampusCrew email' : 'Reset your CampusCrew password';
  const text = `Your CampusCrew verification code is ${otp}. It expires in ${process.env.OTP_EXPIRES_MINUTES || 5} minutes. If you did not request this, ignore this email.`;
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP_HOST is required in production');
    console.log(`\n[DEV OTP] purpose=${purpose} email=${email} code=${otp}\n`);
    return;
  }
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: String(process.env.SMTP_SECURE) === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
  await transporter.sendMail({ from: process.env.MAIL_FROM || 'CampusCrew <no-reply@campuscrew.local>', to: email, subject, text });
}
