const express = require('express');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// --- DO NOT protect /rfid-scan ---
router.post('/rfid-scan', async (req, res) => {
  try {
    const { rfidTagId } = req.body;
    
    const student = await Student.findOne({ rfidTagId });
    console.log(student)
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if already marked for today
    const existingAttendance = await Attendance.findOne({
      studentId: student._id,
      date: { $gte: today }
    });
    
    if (existingAttendance) {
      return res.json({ 
        message: 'Already marked for today',
        student: student.name,
        status: existingAttendance.status
      });
    }
    
    // Mark attendance
    const attendance = new Attendance({
      studentId: student._id,
      schoolId: student.schoolId,
      date: new Date(),
      status: 'present',
      timeIn: new Date(),
      method: 'rfid'
    });
    
    await attendance.save();
    
    res.json({
      message: 'Attendance marked successfully',
      student: student.name,
      status: 'present'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

// --- Protect all routes below this line ---
router.use(requireAuth);

// Get attendance data for charts
router.get('/attendance-data', async (req, res) => {
  try {
    const { schoolId, days = 7 } = req.query;
    
    const attendanceData = [];
    for (let i = parseInt(days) - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const present = await Attendance.countDocuments({
        schoolId,
        date: { $gte: date, $lte: dayEnd },
        status: 'present'
      });
      
      const absent = await Attendance.countDocuments({
        schoolId,
        date: { $gte: date, $lte: dayEnd },
        status: 'absent'
      });
      
      attendanceData.push({
        date: date.toLocaleDateString(),
        present,
        absent
      });
    }
    
    res.json(attendanceData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch attendance data' });
  }
});

// Face recognition endpoint
router.post('/face-recognition', async (req, res) => {
  try {
    console.log('POST /face-recognition body:', req.body);
    const { studentId, status } = req.body;
    if (!studentId || !status) {
      console.log('Missing studentId or status');
      return res.status(400).json({ error: 'Missing studentId or status' });
    }
    const student = await Student.findById(studentId);
    if (!student) {
      console.log('Student not found:', studentId);
      return res.status(404).json({ error: 'Student not found' });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Check if already marked for today
    let attendance = await Attendance.findOne({
      studentId: student._id,
      date: { $gte: today }
    });
    if (attendance) {
      attendance.status = status;
      attendance.method = 'facial';
      attendance.timeIn = new Date();
      await attendance.save();
      console.log('Updated existing attendance:', attendance);
    } else {
      attendance = new Attendance({
        studentId: student._id,
        schoolId: student.schoolId,
        date: new Date(),
        status,
        timeIn: new Date(),
        method: 'facial'
      });
      await attendance.save();
      console.log('Created new attendance:', attendance);
    }
    res.json({
      message: 'Attendance marked via facial recognition',
      student: student.name
    });
  } catch (error) {
    console.log('Error in /face-recognition:', error);
    res.status(500).json({ error: 'Face recognition failed' });
  }
});

module.exports = router;