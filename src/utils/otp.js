import crypto from 'node:crypto';
export const makeOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
export const hashText = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const safeCompare = (a, b) => {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};
