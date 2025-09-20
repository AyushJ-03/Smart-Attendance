const express = require("express");
const router = express.Router();
const { spawn } = require("child_process");
const path = require("path");

// Import existing Student model
const Student = require("../models/Student");

// Function to run Python ML script
function runMLPredictions(callback) {
  const scriptPath = path.join(__dirname, "..", "ml", "predict_dropouts.py");

  const py = spawn("python", [scriptPath]);


  let stderr = "";
  py.stderr.on("data", (data) => (stderr += data.toString()));
  py.stdout.on("data", (data) => console.log("ML:", data.toString()));

  py.on("close", (code) => {
    if (code !== 0) {
      return callback(new Error(stderr || `ML script exited with code ${code}`));
    }
    callback(null);
  });
}

// Route to trigger ML and return updated students
router.get("/:schoolId", async (req, res) => {
  const { schoolId } = req.params;
  console.log(`Running ML for school ${schoolId}...`);

  runMLPredictions(async (err) => {
    if (err) {
      console.error("ML error:", err);
      return res
        .status(500)
        .json({ error: "ML script failed", details: err.message });
    }

    try {
      // Fetch students with updated prediction fields
      const students = await Student.find(
        { schoolId },
        {
          name: 1,
          class: 1,
          schoolId: 1,
          attendancePercentage: 1,   // ✅ renamed
          max_consec_absences: 1,
          num_long_streaks: 1,
          dropoutRisk: 1,            // ✅ renamed
          dropout_pred: 1,
        }
      );

      res.json(students);
    } catch (dbErr) {
      console.error("DB fetch error:", dbErr);
      res.status(500).json({ error: "Failed to fetch predictions" });
    }
  });
});

module.exports = router;
