import mongoose from 'mongoose';
const schema = new mongoose.Schema({ requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, status: { type: String, enum: ['pending','accepted','declined'], default: 'pending' }, note: { type: String, default: '', maxlength: 500 } }, { timestamps: true });
schema.index({ requesterId: 1, recipientId: 1 }, { unique: true });
export default mongoose.model('ContactRequest', schema);
