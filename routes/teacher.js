// GET student details for editing (AJAX)
// router.get('/students/:id/edit', async (req, res) => {
//   try {
//     const student = await Student.findById(req.params.id);
//     if (!student) return res.status(404).json({ error: 'Student not found' });
//     res.json(student);
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to fetch student' });
//   }
// });

// ...existing code...


const express = require('express');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

// API: Get all students with face descriptors for facial recognition
router.get('/api/students/face-descriptors', async (req, res) => {
  try {
    const schoolId = req.session.user.schoolId._id;
    const students = await Student.find({ schoolId, faceDescriptor: { $exists: true, $ne: null } }, 'name _id faceDescriptor');
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch face descriptors' });
  }
});

// Apply middleware to all teacher routes
router.use(requireAuth);
router.use(requireRole('teacher'));

// Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const schoolId = req.session.user.schoolId._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const totalStudents = await Student.countDocuments({ schoolId });
    const todayAttendance = await Attendance.find({ 
      schoolId, 
      date: { $gte: today } 
    }).populate('studentId');
    
    const presentCount = todayAttendance.filter(a => a.status === 'present').length;
    const absentCount = totalStudents - presentCount;
    const attendancePercentage = totalStudents > 0 ? (presentCount / totalStudents * 100).toFixed(1) : 0;
    
    // High-risk students (dropout prediction > 0.7)
    const riskStudents = await Student.find({ 
      schoolId, 
      dropoutRisk: { $gt: 0.7 } 
    }).limit(5);
    
    res.render('teacher/dashboard', {
      user: req.session.user,
      stats: {
        totalStudents,
        presentCount,
        absentCount,
        attendancePercentage
      },
      todayAttendance,
      riskStudents
    });
  } catch (error) {
    res.render('error', { message: 'Error loading dashboard', error });
  }
});

// Students management
router.get('/students', async (req, res) => {
  try {
    const { search, class: className } = req.query;
    const schoolId = req.session.user.schoolId._id;
    
    let query = { schoolId };
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { rollNumber: new RegExp(search, 'i') },
        { rfidTagId: new RegExp(search, 'i') }
      ];
    }
    if (className) {
      query.class = className;
    }
    
    const students = await Student.find(query).sort({ rollNumber: 1 });
    const classes = await Student.distinct('class', { schoolId });
    
    res.render('teacher/students', { 
      user: req.session.user,
      students, 
      classes, 
      search: search || '', 
      selectedClass: className || '' 
    });
  } catch (error) {
    res.render('error', { message: 'Error loading students', error });
  }
});

// Add student
router.get('/students/add', (req, res) => {
  res.render('teacher/add-student', { user: req.session.user, error: null });
});

router.post('/students/add', async (req, res) => {
  try {
    console.log('POST /students/add body:', req.body);
    const { name, rollNumber, rfidTagId, class: className, section, parentContact, parentEmail, faceDescriptor } = req.body;
    const schoolId = req.session.user.schoolId._id;
    let parsedDescriptor = undefined;
    let faceError = null;
    try {
      console.log('Received faceDescriptor (raw):', faceDescriptor, 'Type:', typeof faceDescriptor);
      if (faceDescriptor) {
        parsedDescriptor = JSON.parse(faceDescriptor);
      }
      console.log('Parsed faceDescriptor:', parsedDescriptor, 'Type:', typeof parsedDescriptor, 'Length:', Array.isArray(parsedDescriptor) ? parsedDescriptor.length : 'N/A');
    } catch (e) {
      console.log('Error parsing faceDescriptor:', e);
      parsedDescriptor = undefined;
    }
    // Validate faceDescriptor: must be a non-empty array of numbers
    if (!Array.isArray(parsedDescriptor) || parsedDescriptor.length !== 128 || !parsedDescriptor.every(n => typeof n === 'number')) {
      faceError = 'Face capture required. Please capture a clear face before submitting.';
    }
    if (faceError) {
      console.log('Face descriptor validation failed:', parsedDescriptor);
      return res.render('teacher/add-student', {
        user: req.session.user,
        error: faceError
      });
    }
    const student = new Student({
      name, rollNumber, rfidTagId, class: className, section,
      parentContact, parentEmail, schoolId,
      faceDescriptor: parsedDescriptor
    });
    await student.save();
    res.redirect('/teacher/students');
  } catch (error) {
    console.log('Error in /students/add:', error);
    res.render('teacher/add-student', {
      user: req.session.user,
      error: 'Failed to add student'
    });
  }
});

// Attendance records
router.get('/attendance', async (req, res) => {
  try {
    const { date, student, dateFrom, dateTo } = req.query;
    const schoolId = req.session.user.schoolId._id;
    
    let query = { schoolId };
    if (date) {
      const searchDate = new Date(date);
      query.date = {
        $gte: new Date(searchDate.setHours(0, 0, 0, 0)),
        $lt: new Date(searchDate.setHours(23, 59, 59, 999))
      };
    } else if (dateFrom && dateTo) {
      query.date = {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo)
      };
    } else {
      // Default to today
      const today = new Date();
      query.date = {
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lt: new Date(today.setHours(23, 59, 59, 999))
      };
    }
    
    const attendanceQuery = Attendance.find(query)
      .populate('studentId')
      .sort({ date: -1, timeIn: -1 });
    
    if (student) {
      attendanceQuery.where('studentId').equals(student);
    }
    
    const attendance = await attendanceQuery;
    const students = await Student.find({ schoolId }).sort({ name: 1 });
    
    res.render('teacher/attendance', { 
      user: req.session.user,
      attendance, 
      students, 
      filters: { date, student, dateFrom, dateTo } 
    });
  } catch (error) {
    res.render('error', { message: 'Error loading attendance', error });
  }
});

// Manual attendance marking
router.get('/mark-attendance', async (req, res) => {
  try {
    const schoolId = req.session.user.schoolId._id;
    const students = await Student.find({ schoolId }).sort({ rollNumber: 1 });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayAttendance = await Attendance.find({
      schoolId,
      date: { $gte: today }
    });
    
    const attendanceMap = {};
    todayAttendance.forEach(att => {
      attendanceMap[att.studentId.toString()] = att.status;
    });
    
    res.render('teacher/mark-attendance', { 
      user: req.session.user,
      students, 
      attendanceMap 
    });
  } catch (error) {
    res.render('error', { message: 'Error loading attendance form', error });
  }
});

router.post('/mark-attendance', async (req, res) => {
  try {
    const { attendance } = req.body;
    const schoolId = req.session.user.schoolId._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (const [studentId, status] of Object.entries(attendance)) {
      // Always update the single record for this student, school, and day
      await Attendance.findOneAndUpdate(
        { studentId, schoolId, date: { $gte: today, $lt: new Date(today.getTime() + 24*60*60*1000) } },
        { 
          status, 
          method: 'manual',
          markedBy: req.session.user.id,
          timeIn: status === 'present' ? new Date() : null
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      // Remove any duplicate records for this student, school, and day
      const records = await Attendance.find({ studentId, schoolId, date: { $gte: today, $lt: new Date(today.getTime() + 24*60*60*1000) } });
      if (records.length > 1) {
        // Keep the most recent, remove the rest
        records.sort((a, b) => b.updatedAt - a.updatedAt);
        for (let i = 1; i < records.length; i++) {
          await Attendance.deleteOne({ _id: records[i]._id });
        }
      }
    }
    
    res.redirect('/teacher/attendance');
  } catch (error) {
    res.render('error', { message: 'Error marking attendance', error });
  }
});

// Student profile
router.get('/students/:id', async (req, res) => {
// Edit student - GET
router.get('/students/:id/edit', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.render('error', { message: 'Student not found' });
    }
    res.render('teacher/edit-student', { user: req.session.user, student, error: null });
  } catch (error) {
    res.render('error', { message: 'Error loading edit form', error });
  }
});

// Edit student - POST
router.post('/students/:id/edit', async (req, res) => {
  try {
    const { name, rollNumber, rfidTagId, class: className, section, parentContact, parentEmail, faceDescriptor } = req.body;
    let parsedDescriptor = undefined;
    let faceError = null;
    try {
      if (faceDescriptor) {
        parsedDescriptor = JSON.parse(faceDescriptor);
      }
    } catch (e) {
      parsedDescriptor = undefined;
    }
    if (!Array.isArray(parsedDescriptor) || parsedDescriptor.length !== 128 || !parsedDescriptor.every(n => typeof n === 'number')) {
      faceError = 'Face capture required. Please provide a valid 128-length face descriptor array.';
    }
    if (faceError) {
      const student = await Student.findById(req.params.id);
      return res.render('teacher/edit-student', { user: req.session.user, student, error: faceError });
    }
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      {
        name,
        rollNumber,
        rfidTagId,
        class: className,
        section,
        parentContact,
        parentEmail,
        faceDescriptor: parsedDescriptor
      },
      { new: true }
    );
    res.redirect('/teacher/students');
  } catch (error) {
    const student = await Student.findById(req.params.id);
    res.render('teacher/edit-student', { user: req.session.user, student, error: 'Failed to update student' });
  }
});
  try {
    const student = await Student.findById(req.params.id);
    const attendanceHistory = await Attendance.find({ studentId: req.params.id })
      .sort({ date: -1 })
      .limit(30);
    
    // Calculate monthly stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const monthlyAttendance = await Attendance.countDocuments({
      studentId: req.params.id,
      status: 'present',
      date: { $gte: thirtyDaysAgo }
    });
    
    const totalDaysInMonth = await Attendance.countDocuments({
      studentId: req.params.id,
      date: { $gte: thirtyDaysAgo }
    });
    
    const monthlyPercentage = totalDaysInMonth > 0 ? 
      (monthlyAttendance / totalDaysInMonth * 100).toFixed(1) : 0;
    
    res.render('teacher/student-profile', { 
      user: req.session.user,
      student, 
      attendanceHistory, 
      monthlyStats: {
        attendance: monthlyAttendance,
        total: totalDaysInMonth,
        percentage: monthlyPercentage
      }
    });
  } catch (error) {
    res.render('error', { message: 'Error loading student profile', error });
  }
});

// Reports
router.get('/reports', async (req, res) => {
  try {
    const schoolId = req.session.user.schoolId._id;
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Total students in school
    const totalStudents = await Student.countDocuments({ schoolId });
    // Attendance records for today
    const todayAttendance = await Attendance.find({
      schoolId,
      date: { $gte: today, $lt: tomorrow }
    });
    const present = todayAttendance.filter(a => a.status === 'present').length;
    const absent = totalStudents - present;
    const rate = totalStudents > 0 ? ((present / totalStudents) * 100).toFixed(1) : 0;

    // --- Monthly Report Data ---
    // Get first and last day of current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // All attendance records for this month
    const monthAttendance = await Attendance.find({
      schoolId,
      date: { $gte: firstDay, $lte: lastDay }
    });

    // Get all unique dates (school days) in the month
    const schoolDaysSet = new Set(monthAttendance.map(a => a.date.toISOString().slice(0, 10)));
    const schoolDays = schoolDaysSet.size;

    // Group by date
    const attendanceByDay = {};
    monthAttendance.forEach(a => {
      const day = a.date.toISOString().slice(0, 10);
      if (!attendanceByDay[day]) attendanceByDay[day] = [];
      attendanceByDay[day].push(a);
    });

    // Calculate daily attendance rates
    let totalRate = 0;
    let perfect = 0;
    let low = 0;
    Object.values(attendanceByDay).forEach(records => {
      const presentCount = records.filter(a => a.status === 'present').length;
      const rate = totalStudents > 0 ? (presentCount / totalStudents) * 100 : 0;
      totalRate += rate;
      if (rate === 100) perfect++;
      if (rate < 75) low++;
    });
    const avg = schoolDays > 0 ? (totalRate / schoolDays).toFixed(1) : 0;

    // --- Class Comparison Data ---
    // Get all classes in this school
    const classList = await Student.distinct('class', { schoolId });
    const classStats = {};
    // For each class, calculate attendance rate for current month
    for (const className of classList) {
      // Students in this class
      const studentsInClass = await Student.find({ schoolId, class: className });
      const studentIds = studentsInClass.map(s => s._id.toString());
      // Attendance records for this class in current month
      const classAttendance = monthAttendance.filter(a => studentIds.includes(a.studentId.toString()));
      // Group by date
      const attendanceByDay = {};
      classAttendance.forEach(a => {
        const day = a.date.toISOString().slice(0, 10);
        if (!attendanceByDay[day]) attendanceByDay[day] = [];
        attendanceByDay[day].push(a);
      });
      // Calculate daily rates
      let totalRate = 0;
      let days = 0;
      Object.values(attendanceByDay).forEach(records => {
        const presentCount = records.filter(a => a.status === 'present').length;
        const rate = studentsInClass.length > 0 ? (presentCount / studentsInClass.length) * 100 : 0;
        totalRate += rate;
        days++;
      });
      const avgRate = days > 0 ? (totalRate / days) : 0;
      classStats[className] = {
        avgRate,
        days
      };
    }

    // Find best, needs attention, most improved, avg difference
    let best = null, needsAttention = null, mostImproved = null;
    let bestRate = -1, lowRate = 101;
    let avgSum = 0, avgCount = 0;
    for (const [className, stats] of Object.entries(classStats)) {
      if (stats.avgRate > bestRate) {
        bestRate = stats.avgRate;
        best = className;
      }
      if (stats.avgRate < lowRate) {
        lowRate = stats.avgRate;
        needsAttention = className;
      }
      avgSum += stats.avgRate;
      avgCount++;
    }
    // For most improved, compare first 10 days vs last 10 days of month
    let improvement = -Infinity;
    for (const className of classList) {
      const studentsInClass = await Student.find({ schoolId, class: className });
      const studentIds = studentsInClass.map(s => s._id.toString());
      const classAttendance = monthAttendance.filter(a => studentIds.includes(a.studentId.toString()));
      // Group by date
      const attendanceByDay = {};
      classAttendance.forEach(a => {
        const day = a.date.toISOString().slice(0, 10);
        if (!attendanceByDay[day]) attendanceByDay[day] = [];
        attendanceByDay[day].push(a);
      });
      const daysSorted = Object.keys(attendanceByDay).sort();
      const first10 = daysSorted.slice(0, 10);
      const last10 = daysSorted.slice(-10);
      let firstAvg = 0, lastAvg = 0;
      if (first10.length > 0) {
        let sum = 0;
        for (const d of first10) {
          const presentCount = attendanceByDay[d].filter(a => a.status === 'present').length;
          sum += studentsInClass.length > 0 ? (presentCount / studentsInClass.length) * 100 : 0;
        }
        firstAvg = sum / first10.length;
      }
      if (last10.length > 0) {
        let sum = 0;
        for (const d of last10) {
          const presentCount = attendanceByDay[d].filter(a => a.status === 'present').length;
          sum += studentsInClass.length > 0 ? (presentCount / studentsInClass.length) * 100 : 0;
        }
        lastAvg = sum / last10.length;
      }
      const diff = lastAvg - firstAvg;
      if (diff > improvement) {
        improvement = diff;
        mostImproved = className;
      }
    }
    const avgDifference = avgCount > 1 ? (bestRate - lowRate).toFixed(1) : 0;

    // --- Attendance Trends (Last 30 Days) ---
    const trendsStart = new Date();
    trendsStart.setDate(trendsStart.getDate() - 29);
    trendsStart.setHours(0, 0, 0, 0);
    const trendsEnd = new Date();
    trendsEnd.setHours(23, 59, 59, 999);
    const trendsAttendance = await Attendance.find({
      schoolId,
      date: { $gte: trendsStart, $lte: trendsEnd }
    });
    // Group by day
    const trendsByDay = {};
    trendsAttendance.forEach(a => {
      const day = a.date.toISOString().slice(0, 10);
      if (!trendsByDay[day]) trendsByDay[day] = [];
      trendsByDay[day].push(a);
    });
    const trends = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(trendsStart);
      d.setDate(trendsStart.getDate() + i);
      const dayStr = d.toISOString().slice(0, 10);
      const records = trendsByDay[dayStr] || [];
      const presentCount = records.filter(a => a.status === 'present').length;
      const rate = totalStudents > 0 ? (presentCount / totalStudents) * 100 : 0;
      trends.push({ date: dayStr, rate: +rate.toFixed(1) });
    }

    // --- Class Performance Comparison (Last 30 Days) ---
    const classPerformance = [];
    for (const className of classList) {
      const studentsInClass = await Student.find({ schoolId, class: className });
      const studentIds = studentsInClass.map(s => s._id.toString());
      // Attendance for this class in last 30 days
      const classTrendsAttendance = trendsAttendance.filter(a => studentIds.includes(a.studentId.toString()));
      // Group by day
      const classByDay = {};
      classTrendsAttendance.forEach(a => {
        const day = a.date.toISOString().slice(0, 10);
        if (!classByDay[day]) classByDay[day] = [];
        classByDay[day].push(a);
      });
      let totalRate = 0;
      let days = 0;
      Object.values(classByDay).forEach(records => {
        const presentCount = records.filter(a => a.status === 'present').length;
        const rate = studentsInClass.length > 0 ? (presentCount / studentsInClass.length) * 100 : 0;
        totalRate += rate;
        days++;
      });
      const avgRate = days > 0 ? (totalRate / days) : 0;
      classPerformance.push({ class: className, avgRate: +avgRate.toFixed(1) });
    }

    // --- Detailed Analytics ---
    // Total students (already calculated)
    // Average attendance (last 30 days)
    let avgAttendance = 0;
    let totalAttendanceRecords = 0;
    let totalPresent = 0;
    trends.forEach(day => {
      totalAttendanceRecords++;
      totalPresent += day.rate;
    });
    avgAttendance = totalAttendanceRecords > 0 ? (totalPresent / totalAttendanceRecords).toFixed(1) : 0;

    // At-risk students (<75% attendance in last 30 days)
    // Perfect attendance (100% in last 30 days)
    // Top performers (>95% attendance in last 30 days)
    // We'll use Attendance and Student models
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    const students = await Student.find({ schoolId });
    let atRiskList = [];
    let topPerformers = [];
    let perfectAttendance = 0;
    for (const student of students) {
      const attendanceRecords = await Attendance.find({
        schoolId,
        studentId: student._id,
        date: { $gte: thirtyDaysAgo }
      });
      const totalDays = attendanceRecords.length;
      const presentDays = attendanceRecords.filter(a => a.status === 'present').length;
      const percentage = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
      if (percentage < 75) {
        atRiskList.push({ name: student.name, class: student.class, percentage: percentage.toFixed(1) });
      }
      if (percentage === 100 && totalDays > 0) {
        perfectAttendance++;
      }
      if (percentage > 95) {
        topPerformers.push({ name: student.name, class: student.class, percentage: percentage.toFixed(1) });
      }
    }

    const analytics = {
      totalStudents,
      avgAttendance,
      riskStudents: atRiskList.length,
      perfectAttendance
    };

    const reportData = {
      daily: {
        total: totalStudents,
        present,
        absent,
        rate
      },
      monthly: {
        days: schoolDays,
        avg,
        perfect,
        low
      },
      classes: {
        best,
        needsAttention,
        mostImproved,
        avgDifference
      },
      trends,
      classPerformance,
      analytics,
      topPerformers,
      atRiskList
    };
    res.render('teacher/reports', { user: req.session.user, reportData });
  } catch (error) {
    res.render('error', { message: 'Error loading reports', error });
  }
});

// Face recognition page
router.get('/facial-recognition', (req, res) => {
  res.render('teacher/facial-recognition', { user: req.session.user });
});

module.exports = router;
// Edit attendance record
router.put('/attendance/:id', async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({ success: false, error: 'Attendance record not found' });
    }
    attendance.status = status;
    attendance.remarks = remarks;
    await attendance.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update attendance' });
  }
});