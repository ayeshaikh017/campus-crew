import mongoose from 'mongoose';
const schema = new mongoose.Schema({ eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true }, volunteerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, workRole: { type: String, required: true, maxlength: 100 }, responsibilities: { type: [String], default: [] }, status: { type: String, enum: ['assigned','active','completed','removed'], default: 'assigned' }, assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, assignedAt: { type: Date, default: Date.now } }, { timestamps: true });
schema.index({ eventId: 1, volunteerId: 1 }, { unique: true });
export default mongoose.model('Assignment', schema);
