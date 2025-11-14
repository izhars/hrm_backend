const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Send email
exports.sendEmail = async (options) => {
  try {
    const mailOptions = {
      from: `HRMS System <${process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

// Send welcome email
exports.sendWelcomeEmail = async (user, tempPassword) => {
  const html = `
    <h2>Welcome to HRMS</h2>
    <p>Hi ${user.firstName},</p>
    <p>Your account has been created successfully.</p>
    <p><strong>Employee ID:</strong> ${user.employeeId}</p>
    <p><strong>Email:</strong> ${user.email}</p>
    <p><strong>Temporary Password:</strong> ${tempPassword}</p>
    <p>Please login and change your password immediately.</p>
    <p>Best regards,<br>HR Team</p>
  `;
  
  await this.sendEmail({
    to: user.email,
    subject: 'Welcome to HRMS - Account Created',
    html
  });
};

// Send leave approval notification
exports.sendLeaveApprovalEmail = async (employee, leave) => {
  const html = `
    <h2>Leave Request Approved</h2>
    <p>Hi ${employee.firstName},</p>
    <p>Your leave request has been approved.</p>
    <p><strong>Leave Type:</strong> ${leave.leaveType}</p>
    <p><strong>From:</strong> ${leave.startDate.toDateString()}</p>
    <p><strong>To:</strong> ${leave.endDate.toDateString()}</p>
    <p><strong>Total Days:</strong> ${leave.totalDays}</p>
    <p>Best regards,<br>HR Team</p>
  `;
  
  await this.sendEmail({
    to: employee.email,
    subject: 'Leave Request Approved',
    html
  });
};

// Send leave rejection notification
exports.sendLeaveRejectionEmail = async (employee, leave) => {
  const html = `
    <h2>Leave Request Rejected</h2>
    <p>Hi ${employee.firstName},</p>
    <p>Your leave request has been rejected.</p>
    <p><strong>Leave Type:</strong> ${leave.leaveType}</p>
    <p><strong>From:</strong> ${leave.startDate.toDateString()}</p>
    <p><strong>To:</strong> ${leave.endDate.toDateString()}</p>
    <p><strong>Reason:</strong> ${leave.rejectionReason}</p>
    <p>Best regards,<br>HR Team</p>
  `;
  
  await this.sendEmail({
    to: employee.email,
    subject: 'Leave Request Rejected',
    html
  });
};
