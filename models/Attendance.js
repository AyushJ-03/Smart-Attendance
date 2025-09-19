const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' },
  timeIn: { type: Date },
  timeOut: { type: Date },
  method: { type: String, enum: ['rfid', 'facial', 'manual'], default: 'rfid' },
  remarks: { type: String },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

attendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);