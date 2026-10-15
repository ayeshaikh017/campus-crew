import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: ['active', 'withdrawn'], default: 'active' },
    note: { type: String, default: '', maxlength: 300 },
    enrolledAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
export default mongoose.model('Volunteer', schema);
