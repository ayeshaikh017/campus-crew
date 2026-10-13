import mongoose from 'mongoose';
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  collegeId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  collegeEmail: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['volunteer','coordinator','admin'], default: 'volunteer' },
  department: { type: String, default: '', maxlength: 100 },
  academicYear: { type: String, default: '', maxlength: 30 },
  skills: { type: [String], default: [] }, bio: { type: String, default: '', maxlength: 600 }, avatarUrl: { type: String, default: '' },
  isEmailVerified: { type: Boolean, default: false }, accountStatus: { type: String, enum: ['pending','active','suspended'], default: 'pending' }, tokenVersion: { type: Number, default: 0 }
}, { timestamps: true, toJSON: { transform(_doc, ret) { delete ret.passwordHash; delete ret.__v; return ret; } } });
userSchema.index({ collegeEmail: 1 }, { unique: true }); userSchema.index({ collegeId: 1 }, { unique: true });
export default mongoose.model('User', userSchema);
