const express = require('express');
const School = require('../models/School');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

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
    
    // District-wise analysis
    const districtStats = {};
    
    for (const school of schools) {
      if (!districtStats[school.district]) {
        districtStats[school.district] = {
          schools: 0,
          totalStudents: 0,
          attendanceSum: 0,
          dropoutRiskSum: 0
        };
      }
      
      const totalStudents = await Student.countDocuments({ schoolId: school._id });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayPresent = await Attendance.countDocuments({
        schoolId: school._id,
        date: { $gte: today },
        status: 'present'
      });
      
      const attendanceRate = totalStudents > 0 ? (todayPresent / totalStudents) * 100 : 0;
      
      const highRiskStudents = await Student.countDocuments({
        schoolId: school._id,
        dropoutRisk: { $gt: 0.7 }
      });
      
      const dropoutRisk = totalStudents > 0 ? (highRiskStudents / totalStudents) * 100 : 0;
      
      districtStats[school.district].schools++;
      districtStats[school.district].totalStudents += totalStudents;
      districtStats[school.district].attendanceSum += attendanceRate;
      districtStats[school.district].dropoutRiskSum += dropoutRisk;
    }
    
    // Calculate averages
    Object.keys(districtStats).forEach(district => {
      const stats = districtStats[district];
      stats.avgAttendance = (stats.attendanceSum / stats.schools).toFixed(1);
      stats.avgDropoutRisk = (stats.dropoutRiskSum / stats.schools).toFixed(1);
    });
    
    res.render('government/analytics', {
      user: req.session.user,
      districtStats
    });
  } catch (error) {
    res.render('error', { message: 'Error loading analytics', error });
  }
});

module.exports = router;