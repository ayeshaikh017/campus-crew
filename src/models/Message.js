import mongoose from 'mongoose';
const schema = new mongoose.Schema({ conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true }, senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, text: { type: String, required: true, maxlength: 1000, trim: true }, readAt: Date }, { timestamps: true });
schema.index({ conversationId: 1, createdAt: -1 });
export default mongoose.model('Message', schema);
