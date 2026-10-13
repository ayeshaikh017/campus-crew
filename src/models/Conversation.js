import mongoose from 'mongoose';
const schema = new mongoose.Schema({ participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }], pairKey: { type: String, required: true, unique: true }, eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, lastMessageAt: Date }, { timestamps: true });
export default mongoose.model('Conversation', schema);
