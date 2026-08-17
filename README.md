# SmartSlate — Parent & Teacher Portal (Cloud Edition)

A modern, mobile-responsive, real-time parent monitoring and teacher classroom management platform for the SmartSlate ecosystem.

---

## 🌟 Key Features

### 👨‍👩‍👧 Parent Portal
- **Child Switcher**: Real-time multi-child switcher across academic tiers (Elementary, Middle, High School, B.Tech).
- **Pairing via Student Code**: Instant link with student via `student_parent_connections`.
- **Real-Time Web Search Activity**: Subscribes via Firestore `onSnapshot` to stream search logs without page refresh.
- **Canvas Digital Notes Viewer**: Replays student's stylus handwriting strokes faithfully on an HTML5 canvas.
- **Exam Marks & Feedback**: Live grades, percentages, teacher commentary, and `Awaiting Evaluation` indicators.
- **Attendance & Assignments**: Tracks term attendance rates, present/absent days, and pending homework.

### 👩‍🏫 Teacher Portal
- **Student Roster & Class Management**: Real-time student directory with dynamic grade & section filtering.
- **Exam Suite**: Create MCQ & Stylus Written examinations with live submission monitoring.
- **Evaluation & Grading**: Review stylus handwriting answers and assign scores with structured feedback.
- **Assignments & Announcements**: Broadcast class notices and collect digital submissions.

---

## 📱 Mobile & Responsive UI Design System
- **Touch-Friendly Navigation**: 48px min touch targets, responsive touch manipulation.
- **Mobile Bottom Navigation Bar**: Quick-access drawer for Dashboard, Exams, Notes, Searches, and Settings.
- **Responsive Breakpoints**:
  - Mobile (`<= 640px`): Single-column cards, responsive table cards, zero horizontal overflow.
  - Tablet (`641px - 1024px`): 2-column cards, scrollable tab navigation.
  - Desktop (`>= 1025px`): 4-column KPI grid, full dashboard roster.

---

## 🚀 Deployment (Vercel)

### Environment Variables
Configure the following in your Vercel Project Settings:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

---

## 💻 Local Development

```bash
cd parent-teacher
npm install
npm run dev
```

Server will run on `http://localhost:3001`.
