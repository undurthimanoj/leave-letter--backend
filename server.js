import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Set port - use environment variable or fallback with alternative
const PORT = process.env.PORT || 5000;

// Connect to MongoDB (removed deprecated options)
mongoose.connect("mongodb+srv://manojlovely679:dypJK1gca7wt4AQe@cluster0.j8r8s.mongodb.net/")
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

// Schema for leave applications
const LeaveSchema = new mongoose.Schema({
  name: String,
  email: String,
  course: String,
  subject: String,
  reason: String,
  date: { type: Date, default: Date.now },
  status: { type: String, default: "Pending" },
});

const LeaveApplication = mongoose.model("LeaveApplication", LeaveSchema);

// Create a transporter with direct credentials (simpler approach)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Function to send notification emails
const sendNotificationEmail = async (application, status) => {
  try {
    const subjectPrefix = status === "Approved" ? "APPROVED" : "NOT APPROVED";
    const emailBody = status === "Approved" 
      ? `<p>Dear ${application.name},</p>
         <p>We are pleased to inform you that your leave application for "${application.subject}" has been approved.</p>
         <p>Details of your application:</p>
         <ul>
           <li>Course: ${application.course}</li>
           <li>Subject: ${application.subject}</li>
           <li>Reason: ${application.reason}</li>
           <li>Date Submitted: ${new Date(application.date).toLocaleDateString()}</li>
         </ul>
         <p>Thank you for using our application system.</p>
         <p>Regards,<br>Hostel Warden</p>`
      : `<p>Dear ${application.name},</p>
         <p>We regret to inform you that your leave application for "${application.subject}" has not been approved.</p>
         <p>Details of your application:</p>
         <ul>
           <li>Course: ${application.course}</li>
           <li>Subject: ${application.subject}</li>
           <li>Reason: ${application.reason}</li>
           <li>Date Submitted: ${new Date(application.date).toLocaleDateString()}</li>
         </ul>
         <p>If you have any questions regarding this decision, please contact theHostel Warden.</p>
         <p>Regards,<br>Hostel Warden</p>`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: application.email,
      subject: `Leave Application ${subjectPrefix}: ${application.subject}`,
      html: emailBody
    };
    
    // Send email and await the result
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.response);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};

// API Routes
app.get("/api/leave-applications", async (req, res) => {
  try {
    // Removed the select() method to ensure ALL fields including reason are returned
    const applications = await LeaveApplication.find();
    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: "Error fetching applications", error });
  }
});

app.post("/submit-application", async (req, res) => {
  try {
    const { name, email, course, subject, reason } = req.body;

    const newApplication = new LeaveApplication({
      name,
      email,
      course,
      subject,
      reason,
    });

    await newApplication.save();
    res.status(201).json({ message: "Application submitted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error submitting application", error });
  }
});

app.patch("/api/leave-applications/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const application = await LeaveApplication.findById(req.params.id);
    
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }
    
    // Store old status to check if it changed
    const oldStatus = application.status;
    application.status = status;
    await application.save();
    
    // Only send email if status changed to Approved or Not Approved
    if ((status === "Approved" || status === "Not Approved") && oldStatus !== status) {
      try {
        const emailSent = await sendNotificationEmail(application, status);
        console.log(`Email notification ${emailSent ? 'sent' : 'failed'} for ${application.email}`);
        
        res.json({ 
          message: "Status updated successfully", 
          updatedApplication: application,
          emailStatus: emailSent ? "Email notification sent" : "Failed to send email notification"
        });
      } catch (emailError) {
        console.error("Email error:", emailError);
        res.json({ 
          message: "Status updated but email notification failed", 
          updatedApplication: application,
          emailError: emailError.message
        });
      }
    } else {
      res.json({ 
        message: "Status updated successfully", 
        updatedApplication: application,
        emailStatus: "No email notification needed"
      });
    }
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ message: "Error updating status", error });
  }
});

// Test route to verify email functionality
app.get("/test-email", async (req, res) => {
  try {
    const testApplication = {
      name: "Test User",
      email: process.env.TEST_EMAIL || process.env.EMAIL_USER, // Use a test email or the sender email
      course: "Test Course",
      subject: "Test Subject",
      reason: "Test Reason",
      date: new Date()
    };
    
    const emailSent = await sendNotificationEmail(testApplication, "Approved");
    res.json({ 
      success: emailSent, 
      message: emailSent ? "Test email sent successfully" : "Failed to send test email" 
    });
  } catch (error) {
    console.error("Error in test email route:", error);
    res.status(500).json({ message: "Error testing email", error: error.message });
  }
});

// Start the server with error handling for port in use
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is busy, trying alternative port ${PORT + 1}...`);
    app.listen(PORT + 1, () => {
      console.log(`Server running on alternative port ${PORT + 1}`);
    });
  } else {
    console.error('Server error:', err);
  }
});