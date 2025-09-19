const express = require("express");
const User = require("../models/User");
const Teacher = require("../models/Teacher");
const School = require("../models/School");
const Government = require("../models/Government");
const router = express.Router();

router.get("/login", (req, res) => {
  res.render("auth/login", { error: null });
});

router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (role === "teacher") {
      const teacher = await Teacher.findOne({ email }).populate("schoolId");
      if (!teacher || !(await teacher.comparePassword(password))) {
        return res.render("auth/login", { error: "Invalid " });
      }
      req.session.user = {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        role: "teacher",
        schoolId: teacher.schoolId,
      };
      return res.redirect("/teacher/dashboard");
    }
    if (role === "government") {
      const government = await Government.findOne({ email });
      if (!government || !(await government.comparePassword(password))) {
        return res.render("auth/login", { error: "Invalid Credentials" });
      }
      req.session.user = {
        id: government._id,
        name: government.name,
        email: government.email,
        role: "government",
      };
      return res.redirect("/government/dashboard");
    }
    
      const user = await User.findOne({ email }).populate("schoolId");
    console.log(email);
    console.log(password);
    if (!user || !(await user.comparePassword(password))) {
      return res.render("auth/login", { error: "Invalid Credentials " });
    }
    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };
    if (user.role === "government") {
      return res.redirect("/government/dashboard");
    }
    // Add more roles as needed
    res.redirect("/");
    }
    
  catch (error) {
    res.render("auth/login", { error: "Login failed" });
  }
});

router.get("/register", (req, res) => {
  res.render("auth/register", { error: null });
});

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, schoolCode } = req.body;

    let schoolId = null;
    if (role === "teacher") {
      const school = await School.findOne({ code: schoolCode });
      console.log(school)
      if (!school) {
        return res.render("auth/register", { error: "Invalid school code" });
      }
      schoolId = school._id;
      const teacher = new Teacher({ name, email, password, schoolId });
      await teacher.save();
      return res.redirect("/auth/login");
    }
    if (role === "government") {
      const government = new Government({ name, email, password });
      await government.save();
      return res.redirect("/auth/login");
    }
    // fallback for other roles
    const user = new User({ name, email, password, role, schoolId });
    await user.save();
    res.redirect("/auth/login");
  } catch (error) {
    res.render("auth/register", { error: "Registration failed" });
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

module.exports = router;
