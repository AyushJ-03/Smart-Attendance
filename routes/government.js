const express = require('express');
const School = require('../models/School');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

// Add School - GET
router.get('/schools/add', (req, res) => {
  res.render('government/add-school', { user: req.session.user });
});

// Add School - POST
router.post('/schools/add', async (req, res) => {
  try {
    const { name, code, address, district, state, latitude, longitude } = req.body;
    const school = new School({
      name,
      code,
      address,
      district,
      state,
      coordinates: {
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined
      }
    });
    await school.save();
    res.redirect('/government/dashboard');
  } catch (error) {
    res.render('error', { message: 'Error adding school', error });
  }
});
// const School = require('../models/School');
// const Student = require('../models/Student');
// const Attendance = require('../models/Attendance');
// const { requireAuth, requireRole } = require('../middleware/auth');
// const router = express.Router();

// Apply middleware to all government routes
router.use(requireAuth);
router.use(requireRole('government'));

// Government dashboard with heat map
router.get('/dashboard', async (req, res) => {
  try {
    // Get all schools with their statistics
    const schools = await School.find({});
    
    // Calculate attendance and dropout stats for each school
    const schoolsData = await Promise.all(schools.map(async (school) => {
      const totalStudents = await Student.countDocuments({ schoolId: school._id });
      
      // Today's attendance
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayPresent = await Attendance.countDocuments({
        schoolId: school._id,
        date: { $gte: today },
        status: 'present'
      });
      
      const attendanceRate = totalStudents > 0 ? (todayPresent / totalStudents) * 100 : 0;
      
      // High risk students
      const highRiskStudents = await Student.countDocuments({
        schoolId: school._id,
        dropoutRisk: { $gt: 0.7 }
      });
      
      const dropoutRisk = totalStudents > 0 ? (highRiskStudents / totalStudents) * 100 : 0;
      
      return {
        ...school.toObject(),
        totalStudents,
        attendanceRate: attendanceRate.toFixed(1),
        dropoutRisk: dropoutRisk.toFixed(1),
        highRiskStudents
      };
    }));
    
    // Overall statistics
    const totalSchools = schools.length;
    const totalStudentsAcrossSchools = schoolsData.reduce((sum, school) => sum + school.totalStudents, 0);
    const avgAttendance = schoolsData.length > 0 ? 
      (schoolsData.reduce((sum, school) => sum + parseFloat(school.attendanceRate), 0) / schoolsData.length).toFixed(1) : 0;
    const avgDropoutRisk = schoolsData.length > 0 ? 
      (schoolsData.reduce((sum, school) => sum + parseFloat(school.dropoutRisk), 0) / schoolsData.length).toFixed(1) : 0;
    
    res.render('government/dashboard', {
      user: req.session.user,
      schools: schoolsData,
      overallStats: {
        totalSchools,
        totalStudents: totalStudentsAcrossSchools,
        avgAttendance,
        avgDropoutRisk
      }
    });
  } catch (error) {
    console.error('Government dashboard error:', error);
    res.render('error', { message: 'Error loading dashboard', error });
  }
});

// Detailed school view
router.get('/schools/:id', async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    const students = await Student.find({ schoolId: req.params.id }).sort({ name: 1 });
    
    // Recent attendance trends (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const attendanceTrend = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const present = await Attendance.countDocuments({
        schoolId: req.params.id,
        date: { $gte: date, $lte: dayEnd },
        status: 'present'
      });
      
      attendanceTrend.push({
        date: date.toLocaleDateString(),
        attendance: present,
        percentage: students.length > 0 ? (present / students.length * 100).toFixed(1) : 0
      });
    }
    
    // Risk analysis
    const riskStudents = students.filter(s => s.dropoutRisk > 0.7);
    
    res.render('government/school-detail', {
      user: req.session.user,
      school,
      students,
      riskStudents,
      attendanceTrend
    });
  } catch (error) {
    res.render('error', { message: 'Error loading school details', error });
  }
});

// Analytics page
router.get('/analytics', async (req, res) => {
  try {
    const schools = await School.find({});
    const students = await Student.find({});
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // District-wise analysis
    const districtStats = {};
    let totalStudents = 0;
    let totalAttendanceSum = 0;
    let totalDropoutRiskSum = 0;
    let totalSchools = 0;
    let needsAttention = 0;
    let bestPerforming = { name: '', rate: 0 };

    for (const school of schools) {
      if (!districtStats[school.district]) {
        districtStats[school.district] = {
          schools: 0,
          totalStudents: 0,
          attendanceSum: 0,
          dropoutRiskSum: 0
        };
      }
      const schoolStudents = students.filter(s => s.schoolId.toString() === school._id.toString());
      const schoolTotalStudents = schoolStudents.length;
      const todayPresent = await Attendance.countDocuments({
        schoolId: school._id,
        date: { $gte: today },
        status: 'present'
      });
      const attendanceRate = schoolTotalStudents > 0 ? (todayPresent / schoolTotalStudents) * 100 : 0;
      const highRiskStudents = schoolStudents.filter(s => s.dropoutRisk > 0.7).length;
      const dropoutRisk = schoolTotalStudents > 0 ? (highRiskStudents / schoolTotalStudents) * 100 : 0;

      // For best performing
      if (attendanceRate > bestPerforming.rate) {
        bestPerforming = { name: school.name, rate: attendanceRate.toFixed(1) };
      }
      // For needs attention
      if (attendanceRate < 80) {
        needsAttention++;
      }

      districtStats[school.district].schools++;
      districtStats[school.district].totalStudents += schoolTotalStudents;
      districtStats[school.district].attendanceSum += attendanceRate;
      districtStats[school.district].dropoutRiskSum += dropoutRisk;

      totalStudents += schoolTotalStudents;
      totalAttendanceSum += attendanceRate;
      totalDropoutRiskSum += dropoutRisk;
      totalSchools++;
    }

    // Calculate averages and trends for each district
    Object.keys(districtStats).forEach(district => {
      const stats = districtStats[district];
      stats.avgAttendance = (stats.attendanceSum / stats.schools).toFixed(1);
      stats.avgDropoutRisk = (stats.dropoutRiskSum / stats.schools).toFixed(1);
      // Optionally, add trend and status here if needed
    });

    // District average and trend (compare to previous period)
    const districtAverage = totalSchools > 0 ? (totalAttendanceSum / totalSchools).toFixed(1) : 0;
    // Calculate previous period (last 7 days vs previous 7 days)
    const periodDays = 7;
    const periodStart = new Date();
    periodStart.setDate(today.getDate() - periodDays);
    const prevPeriodStart = new Date();
    prevPeriodStart.setDate(today.getDate() - 2 * periodDays);
    const prevPeriodEnd = new Date();
    prevPeriodEnd.setDate(today.getDate() - periodDays);

    // Current period attendance
    const currAttendance = await Attendance.find({
      date: { $gte: periodStart, $lt: today },
      status: 'present'
    });
    const currTotal = currAttendance.length;
    const currStudentCount = await Student.countDocuments();
    const currRate = currStudentCount > 0 ? (currTotal / (currStudentCount * periodDays)) * 100 : 0;

    // Previous period attendance
    const prevAttendance = await Attendance.find({
      date: { $gte: prevPeriodStart, $lt: prevPeriodEnd },
      status: 'present'
    });
    const prevTotal = prevAttendance.length;
    const prevStudentCount = currStudentCount; // Assume same student count
    const prevRate = prevStudentCount > 0 ? (prevTotal / (prevStudentCount * periodDays)) * 100 : 0;

    const districtTrend = (currRate - prevRate).toFixed(1);

    // District trend chart data (last 30 days)
    const trendLabels = [];
    const trendData = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      const present = await Attendance.countDocuments({
        date: { $gte: date, $lte: dayEnd },
        status: 'present'
      });
      trendLabels.push(date.toLocaleDateString());
      trendData.push(currStudentCount > 0 ? (present / currStudentCount) * 100 : 0);
    }

    // School comparison chart data (average attendance per school)
    const schoolLabels = schools.map(s => s.name);
    const schoolData = await Promise.all(schools.map(async s => {
      const schoolStudents = students.filter(stu => stu.schoolId.toString() === s._id.toString());
      const schoolTotalStudents = schoolStudents.length;
      const present = await Attendance.countDocuments({
        schoolId: s._id,
        date: { $gte: periodStart, $lt: today },
        status: 'present'
      });
      return schoolTotalStudents > 0 ? (present / (schoolTotalStudents * periodDays)) * 100 : 0;
    }));

    res.render('government/analytics', {
      user: req.session.user,
      districtStats,
      districtAverage,
      districtTrend,
      bestPerforming,
      needsAttention,
      totalStudents,
      trendLabels: JSON.stringify(trendLabels),
      trendData: JSON.stringify(trendData),
      schoolLabels: JSON.stringify(schoolLabels),
      schoolData: JSON.stringify(schoolData)
    });
  } catch (error) {
    res.render('error', { message: 'Error loading analytics', error });
  }
});

module.exports = router;