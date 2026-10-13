import mongoose from 'mongoose';
const schema = new mongoose.Schema({ email: { type: String, required: true, lowercase: true }, purpose: { type: String, enum: ['register','reset_password'], required: true }, otpHash: { type: String, required: true }, expiresAt: { type: Date, required: true }, attempts: { type: Number, default: 0 }, consumedAt: Date, grantHash: String, grantExpiresAt: Date, grantUsedAt: Date, lastSentAt: { type: Date, default: Date.now } }, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 }); schema.index({ email: 1, purpose: 1 });
export default mongoose.model('VerificationOtp', schema);
