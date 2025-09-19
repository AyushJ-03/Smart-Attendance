const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  rollNumber: { type: String, required: true },
  rfidTagId: { type: String, required: true, unique: true },
  class: { type: String, required: true },
  section: { type: String, required: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  parentContact: { type: String },
  parentEmail: { type: String },
  faceEncoding: { type: String }, // (legacy) Stored face encoding for recognition
  faceDescriptor: { type: [Number] }, // New: face-api.js descriptor array
  dropoutRisk: { type: Number, default: 0 }, // ML prediction score
  riskFactors: [String],
  totalDays: { type: Number, default: 0 },
  presentDays: { type: Number, default: 0 },
  attendancePercentage: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Student', studentSchema);