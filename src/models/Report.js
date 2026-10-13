import mongoose from 'mongoose';
const schema = new mongoose.Schema({ reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }, reason: { type: String, required: true, maxlength: 1000 }, status: { type: String, enum: ['open','reviewed','dismissed'], default: 'open' } }, { timestamps: true });
export default mongoose.model('Report', schema);
