import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    volunteerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    title: { type: String, required: true, maxlength: 160 },
    description: { type: String, default: '', maxlength: 2000 },
    dueDate: Date,
    status: { type: String, enum: ['todo', 'in_progress', 'completed'], default: 'todo' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);
export default mongoose.model('Task', schema);
