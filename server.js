const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const teacherRoutes = require('./routes/teacher');
const govRoutes = require('./routes/government');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
  secret: 'attendance-system-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// MongoDB connection
mongoose.connect('mongodb+srv://Aman_saini:Amansaini3103@cluster0.acmwbuy.mongodb.net/attendance?retryWrites=true&w=majority&appName=Cluster1', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Routes
app.use('/auth', authRoutes);
app.use('/teacher', teacherRoutes);
app.use('/government', govRoutes);
app.use('/api', apiRoutes);

// Home route
app.get('/', (req, res) => {
  res.render('index');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});