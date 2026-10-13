import mongoose from 'mongoose';
const schema = new mongoose.Schema({ title: { type: String, required: true, trim: true, maxlength: 140 }, description: { type: String, default: '', maxlength: 5000 }, category: { type: String, default: 'General' }, venue: { type: String, default: '' }, startDate: { type: Date, required: true }, endDate: { type: Date, required: true }, registrationDeadline: Date, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, coordinatorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], status: { type: String, enum: ['draft','pending_approval','published','ongoing','completed','cancelled'], default: 'draft' } }, { timestamps: true });
schema.index({ status: 1, startDate: 1 });
export default mongoose.model('Event', schema);
