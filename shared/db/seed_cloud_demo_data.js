/* Firestore Cloud Demo Data Seed Script for SmartSlate Connect */

const demoSeedData = {
  users: [
    {
      uid: "teacher_demo_uid",
      name: "Ravi Kumar",
      email: "teacher@smartslate.edu",
      role: "teacher",
      phone: "+91 98765 43210",
      createdAt: new Date().toISOString()
    },
    {
      uid: "parent_demo_uid",
      name: "Suresh Kumar",
      email: "parent@smartslate.edu",
      role: "parent",
      phone: "+91 98765 12345",
      createdAt: new Date().toISOString()
    }
  ],
  classes: [
    {
      id: "c101",
      name: "10th Class — Section A",
      section: "A",
      subject: "Physical Science & Mathematics",
      teacherId: "teacher_demo_uid",
      studentIds: ["s1", "s2"],
      academicYear: "2026-2027"
    }
  ],
  students: [
    { id: "s1", userId: "u_s1", name: "Akhil", studentCode: "STU-101", classId: "c101", className: "10th Class — Section A" },
    { id: "s2", userId: "u_s2", name: "Sai Teja", studentCode: "STU-102", classId: "c101", className: "10th Class — Section A" }
  ],
  assignments: [
    {
      id: "a1",
      classId: "c101",
      className: "10th Class — Section A",
      teacherId: "teacher_demo_uid",
      title: "Physical Science: Plant Ecosystems",
      description: "Write a summary on how plants convert sunlight into food.",
      subject: "Physical Science",
      priority: "High",
      dueAtFormatted: "Aug 15, 2026 - 11:59 PM",
      status: "published",
      submissionCount: 2,
      totalStudents: 2
    },
    {
      id: "a2",
      classId: "c101",
      className: "10th Class — Section A",
      teacherId: "teacher_demo_uid",
      title: "Mathematics: Fractions & Ratios",
      description: "Solve exercises 1 to 10 on page 42.",
      subject: "Mathematics",
      priority: "Normal",
      dueAtFormatted: "Aug 18, 2026 - 11:59 PM",
      status: "published",
      submissionCount: 1,
      totalStudents: 2
    }
  ],
  parents: [
    {
      userId: "parent_demo_uid",
      name: "Suresh Kumar",
      email: "parent@smartslate.edu",
      studentIds: ["s1", "s2"]
    }
  ]
};

console.log("SmartSlate Cloud Demo Data Schema compiled successfully.");
module.exports = demoSeedData;
