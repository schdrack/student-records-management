const express = require('express');
const mysql = require('mysql');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'student_secret',
  resave: false,
  saveUninitialized: true
}));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'StudentManagement'
});

db.connect(err => {
  if (err) throw err;
  console.log('Connected to MySQL');
});

// Register
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.query('INSERT INTO Users (UserName, Password) VALUES (?,?)', [username, password], (err) => {
    if (err) return res.status(500).send('Error');
    res.send('User registered');
  });
});

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM Users WHERE UserName = ? AND Password = ?', [username, password], (err, results) => {
    if (results.length > 0) {
      req.session.user = results[0];
      res.send({ loggedIn: true, user: results[0] });
    } else {
      res.send({ loggedIn: false });
    }
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.send('Logged out');
});

// Auth Middleware
const isAuth = (req, res, next) => {
  if (req.session.user) next();
  else res.status(401).send('Unauthorized');
};

// CRUD for Students (Example)
app.post('/students', isAuth, (req, res) => {
  const data = req.body;
  db.query('INSERT INTO Students SET ?', data, (err) => {
    if (err) res.status(500).send(err);
    else res.send('Student added');
  });
});

app.get('/students', isAuth, (req, res) => {
  db.query('SELECT * FROM Students', (err, results) => {
    if (err) res.status(500).send(err);
    else res.send(results);
  });
});

// Add new course
app.post('/courses', isAuth, (req, res) => {
  const { CourseName, CourseDescription, Duration } = req.body;
  const sql = 'INSERT INTO Courses (CourseName, CourseDescription, Duration) VALUES (?, ?, ?)';
  db.query(sql, [CourseName, CourseDescription, Duration], (err) => {
    if (err) return res.status(500).send(err);
    res.send('Course added');
  });
});

// Add a new grade
app.post('/grades', isAuth, (req, res) => {
  const { StudentId, CourseId, ExamDate, Grade } = req.body;
  const sql = 'INSERT INTO Grades (StudentId, CourseId, ExamDate, Grade) VALUES (?, ?, ?, ?)';
  db.query(sql, [StudentId, CourseId, ExamDate, Grade], (err) => {
    if (err) return res.status(500).send(err);
    res.send('Grade added');
  });
});



app.post('/attendance', isAuth, (req, res) => {
  const { StudentId, CourseId, AttendanceDate, AttendanceStatus } = req.body;

  if (!StudentId || !CourseId || !AttendanceDate || !AttendanceStatus) {
    return res.status(400).send('Missing required fields');
  }

  db.query(
    'INSERT INTO Attendance (StudentId, CourseId, AttendanceDate, AttendanceStatus) VALUES (?, ?, ?, ?)',
    [StudentId, CourseId, AttendanceDate, AttendanceStatus],
    (err) => {
      if (err) return res.status(500).send(err);
      res.send('Attendance added');
    }
  );
});
app.get('/report/attendance', isAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const sql = `
    SELECT 
      a.AttendanceDate,
      s.FirstName,
      s.LastName,
      c.CourseName,
      a.AttendanceStatus
    FROM Attendance a
    JOIN Students s ON a.StudentId = s.StudentId
    JOIN Courses c ON a.CourseId = c.CourseId
    WHERE a.AttendanceDate = ?
  `;

  db.query(sql, [today], (err, results) => {
    if (err) return res.status(500).send(err);
    res.send(results);
  });
});


const PDFDocument = require('pdfkit');
const fs = require('fs');

app.get('/report/attendance/pdf', isAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const sql = `
    SELECT s.FirstName, s.LastName, c.CourseName, a.AttendanceStatus
    FROM Attendance a
    JOIN Students s ON a.StudentId = s.StudentId
    JOIN Courses c ON a.CourseId = c.CourseId
    WHERE a.AttendanceDate = ?
  `;

  db.query(sql, [today], (err, results) => {
    if (err) return res.status(500).send(err);

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_${today}.pdf`);
    doc.pipe(res);

    doc.fontSize(18).text(`Attendance Report - ${today}`, { align: 'center' });
    doc.moveDown();

    results.forEach((row, i) => {
      doc
        .fontSize(12)
        .text(`${i + 1}. ${row.FirstName} ${row.LastName} - ${row.CourseName} - ${row.AttendanceStatus}`);
    });

    doc.end();
  });
});


const ExcelJS = require('exceljs');

app.get('/report/attendance/excel', isAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const sql = `
    SELECT s.FirstName, s.LastName, c.CourseName, a.AttendanceStatus
    FROM Attendance a
    JOIN Students s ON a.StudentId = s.StudentId
    JOIN Courses c ON a.CourseId = c.CourseId
    WHERE a.AttendanceDate = ?
  `;

  db.query(sql, [today], async (err, results) => {
    if (err) return res.status(500).send(err);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Attendance Report');

    sheet.columns = [
      { header: 'First Name', key: 'FirstName' },
      { header: 'Last Name', key: 'LastName' },
      { header: 'Course Name', key: 'CourseName' },
      { header: 'Attendance Status', key: 'AttendanceStatus' },
    ];

    results.forEach(row => {
      sheet.addRow(row);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_${today}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  });
});

app.put('/students/:id', (req, res) => {
  const id = req.params.id;
  const {
    FirstName,
    LastName,
    Gender,
    DateOfBirth,
    ContactNumber,
    Email,
    Address,
    EnrollmentDate,
  } = req.body;

  const sql = `
    UPDATE students SET
      FirstName = ?, LastName = ?, Gender = ?, DateOfBirth = ?, 
      ContactNumber = ?, Email = ?, Address = ?, EnrollmentDate = ?
    WHERE StudentId = ?
  `;

  db.query(sql, [FirstName, LastName, Gender, DateOfBirth, ContactNumber, Email, Address, EnrollmentDate, id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Update failed', details: err });
    res.json({ message: 'Student updated successfully' });
  });
});

// Get all courses
app.get('/courses', (req, res) => {
  db.query('SELECT * FROM courses', (err, data) => {
    if (err) return res.status(500).send(err);
    res.json(data);
  });
});

// Create course
app.post('/courses', (req, res) => {
  const { CourseName } = req.body;
  db.query('INSERT INTO courses (CourseName) VALUES (?)', [CourseName], (err) => {
    if (err) return res.status(500).send(err);
    res.sendStatus(200);
  });
});

// Update course
app.put('/courses/:id', (req, res) => {
  const { CourseName } = req.body;
  db.query('UPDATE courses SET CourseName = ? WHERE CourseID = ?', [CourseName, req.params.id], (err) => {
    if (err) return res.status(500).send(err);
    res.sendStatus(200);
  });
});

// Delete course
app.delete('/courses/:id', (req, res) => {
  db.query('DELETE FROM courses WHERE CourseID = ?', [req.params.id], (err) => {
    if (err) return res.status(500).send(err);
    res.sendStatus(200);
  });
});



// Get all grades
app.get('/grades', (req, res) => {
  db.query('SELECT * FROM grades', (err, data) => {
    if (err) return res.status(500).send(err);
    res.json(data);
  });
});

// Add grade
app.post('/grades', (req, res) => {
  const { StudentID, CourseID, Grade } = req.body;
  db.query(
    'INSERT INTO grades (StudentID, CourseID, Grade) VALUES (?, ?, ?)',
    [StudentID, CourseID, Grade],
    (err) => {
      if (err) return res.status(500).send(err);
      res.sendStatus(200);
    }
  );
});


// Get all attendance records
app.get('/attendances', (req, res) => {
  db.query('SELECT * FROM attendance', (err, data) => {
    if (err) return res.status(500).send(err);
    res.json(data);
  });
});

// Mark attendance
app.post('/attendances', (req, res) => {
  const { StudentID, AttendanceDate, Status } = req.body;
  db.query(
    'INSERT INTO attendance (StudentID, AttendanceDate, Status) VALUES (?, ?, ?)',
    [StudentID, AttendanceDate, Status],
    (err) => {
      if (err) return res.status(500).send(err);
      res.sendStatus(200);
    }
  );
});




app.listen(5000, () => console.log('Server running on port 5000'));
