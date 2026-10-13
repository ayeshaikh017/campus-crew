import mongoose from 'mongoose';
const schema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, type: { type: String, required: true }, title: { type: String, required: true, maxlength: 140 }, message: { type: String, required: true, maxlength: 500 }, referenceId: { type: mongoose.Schema.Types.ObjectId }, isRead: { type: Boolean, default: false } }, { timestamps: true });
schema.index({ userId: 1, isRead: 1, createdAt: -1 });
export default mongoose.model('Notification', schema);
