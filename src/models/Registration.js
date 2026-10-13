import mongoose from 'mongoose';
const schema = new mongoose.Schema({ eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true }, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, type: { type: String, enum: ['participant','volunteer_applicant'], required: true }, status: { type: String, enum: ['pending','approved','rejected','cancelled'], default: 'pending' }, note: { type: String, default: '', maxlength: 1000 }, reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } }, { timestamps: true });
schema.index({ eventId: 1, userId: 1, type: 1 }, { unique: true });
export default mongoose.model('Registration', schema);
