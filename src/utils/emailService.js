const nodemailer = require("nodemailer");
const fs = require("fs").promises;
const path = require("path");
const Handlebars = require("handlebars");

// =============================================
// TRANSPORTER WITH HEALTH CHECK
// =============================================
let transporter;
const initializeTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });
  }
  return transporter;
};

// Health check
exports.verifyEmailConfig = async () => {
  try {
    const transport = initializeTransporter();
    await transport.verify();
    console.log("✅ Email transporter verified");
    return true;
  } catch (error) {
    console.error("❌ Email transporter verification failed:", error.message);
    throw new Error("Email service unavailable");
  }
};

// =============================================
// HANDLEBARS HELPERS
// =============================================
Handlebars.registerHelper("formatDate", function (date) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});

Handlebars.registerHelper("formatCurrency", function (amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
});

Handlebars.registerHelper("uppercase", function (str) {
  return str ? str.toUpperCase() : "";
});

Handlebars.registerHelper("eq", function (a, b) {
  return a === b;
});

// =============================================
// CORE EMAIL FUNCTION
// =============================================
exports.sendEmail = async ({ to, subject, html, text, attachments = [] }) => {
  try {
    const transport = initializeTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || `HRMS System <${process.env.EMAIL_USER}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      text: text || "",
      html: html || "",
      attachments,
    };

    const info = await transport.sendMail(mailOptions);

    console.log(`📩 Email sent to ${to}: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
      rejectedEmails: info.rejected,
      acceptedEmails: info.accepted,
    };
  } catch (error) {
    console.error("❌ Email send error:", {
      to,
      subject: subject?.substring(0, 50),
      error: error.message,
    });

    if (error.code === "EAUTH") {
      throw new Error("Email authentication failed");
    }
    if (error.code === "ECONNECTION") {
      throw new Error("Email server connection failed");
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// =============================================
// TEMPLATE SYSTEM WITH PARTIALS
// =============================================
const templateCache = new Map();
const partialsRegistered = false;

const registerPartials = async () => {
  if (partialsRegistered) return;

  const partialsDir = path.join(__dirname, "../emails/partials");
  try {
    const files = await fs.readdir(partialsDir);
    for (const file of files) {
      if (file.endsWith(".html")) {
        const partialName = path.basename(file, ".html");
        const partialPath = path.join(partialsDir, file);
        const partialContent = await fs.readFile(partialPath, "utf-8");
        Handlebars.registerPartial(partialName, partialContent);
      }
    }
  } catch (error) {
    console.warn("⚠️ Partials directory not found, skipping...");
  }
};

exports.loadTemplate = async (fileName, data = {}) => {
  try {
    await registerPartials();

    const cacheKey = fileName;

    if (templateCache.has(cacheKey)) {
      const compiled = templateCache.get(cacheKey);
      return compiled(data);
    }

    // Updated path to src/email
    const emailDir = path.join(__dirname, "../email"); // __dirname is src/utils, so go up two levels to src
    
    // Check if email directory exists
    try {
      await fs.access(emailDir);
    } catch (dirError) {
      console.error("❌ Email directory not found:", emailDir);
      throw new Error(`Email templates directory not found: ${emailDir}`);
    }

    const filePath = path.join(emailDir, fileName);
    
    // Check if template file exists
    try {
      await fs.access(filePath);
    } catch (fileError) {
      console.error("❌ Template file not found:", filePath);
      throw new Error(`Template file "${fileName}" not found in ${emailDir}`);
    }

    const templateSource = await fs.readFile(filePath, "utf-8");
    const template = Handlebars.compile(templateSource);
    templateCache.set(cacheKey, template);

    return template(data);
  } catch (error) {
    console.error("❌ Template load error:", { 
      fileName, 
      error: error.message,
      stack: error.stack 
    });
    throw new Error(`Failed to load template "${fileName}": ${error.message}`);
  }
};

// =============================================
// BULK EMAIL WITH BATCHING
// =============================================
exports.sendBulkEmail = async (emails, subject, html, options = {}) => {
  const { batchSize = 10, delay = 1000, maxRetries = 3 } = options;

  const batches = [];
  for (let i = 0; i < emails.length; i += batchSize) {
    batches.push(emails.slice(i, i + batchSize));
  }

  let successCount = 0;
  let failedEmails = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    try {
      const batchResults = await Promise.allSettled(
        batch.map((email) =>
          this.sendEmail({ to: email, subject, html }).catch((err) => ({
            email,
            error: err.message,
          }))
        )
      );

      batchResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          failedEmails.push({
            email: batch[index],
            error: result.reason,
          });
        }
      });

      if (i < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.error(`❌ Batch ${i + 1} failed:`, error.message);
      failedEmails.push(
        ...batch.map((email) => ({ email, error: error.message }))
      );
    }
  }

  const result = {
    total: emails.length,
    success: successCount,
    failed: failedEmails.length,
    failedEmails,
    percentage: ((successCount / emails.length) * 100).toFixed(1),
  };

  console.log(
    `📊 Bulk email complete: ${result.percentage}% success (${successCount}/${emails.length})`
  );

  return result;
};

// =============================================
// PRE-BUILT EMAIL FUNCTIONS
// =============================================
exports.sendWelcomeEmail = async (user, tempPassword) => {
  const html = await this.loadTemplate("welcome.html", {
    firstName: user.firstName,
    lastName: user.lastName,
    employeeId: user.employeeId,
    email: user.email,
    tempPassword,
    loginUrl: process.env.APP_URL || "http://localhost:5000",
    year: new Date().getFullYear(),
  });

  return this.sendEmail({
    to: user.email,
    subject: "Welcome to HRMS 🎉 - Your Account is Ready!",
    html,
  });
};

exports.sendPasswordResetEmail = async (user, resetToken) => {
  const resetURL = `${process.env.APP_URL || "http://localhost:5000"}/reset-password?token=${resetToken}`;
  
  const html = await this.loadTemplate("password-reset.html", {
    firstName: user.firstName,
    resetURL,
    expireTime: "15 minutes",
    year: new Date().getFullYear(),
  });

  return this.sendEmail({
    to: user.email,
    subject: "🔒 HRMS Password Reset Request",
    html,
  });
};

exports.sendAnnouncementEmail = async (recipients, announcement) => {
  const html = await this.loadTemplate("announcement.html", {
    title: announcement.title,
    message: announcement.message,
    priority: announcement.priority || "normal",
    author: announcement.author,
    date: announcement.date || new Date(),
    year: new Date().getFullYear(),
  });

  return this.sendBulkEmail(recipients, announcement.title, html);
};

exports.sendLeaveApprovalEmail = async (leave, manager) => {
  const html = await this.loadTemplate("leave-approval.html", {
    managerName: manager.firstName,
    employeeName: leave.employee.firstName + " " + leave.employee.lastName,
    leaveType: leave.type,
    startDate: leave.startDate,
    endDate: leave.endDate,
    reason: leave.reason,
    approvalUrl: `${process.env.APP_URL}/leaves/approve/${leave._id}`,
    rejectUrl: `${process.env.APP_URL}/leaves/reject/${leave._id}`,
    year: new Date().getFullYear(),
  });

  return this.sendEmail({
    to: manager.email,
    subject: `Leave Request from ${leave.employee.firstName} ${leave.employee.lastName}`,
    html,
  });
};

exports.sendTestEmail = async (to) => {
  const html = await this.loadTemplate("test.html", {
    testDate: new Date(),
    year: new Date().getFullYear(),
  });

  return this.sendEmail({
    to,
    subject: "🧪 HRMS Email System Test",
    html,
  });
};

// =============================================
// ATTACHMENT HELPER
// =============================================
exports.createAttachment = (filePath, options = {}) => ({
  filename: options.filename || path.basename(filePath),
  path: filePath,
  contentType: options.contentType || "application/pdf",
  cid: options.cid,
});

// =============================================
// UTILITY FUNCTIONS
// =============================================
exports.clearTemplateCache = () => {
  templateCache.clear();
  console.log("🗑️ Template cache cleared");
};

exports.getEmailStats = async () => {
  try {
    const transport = initializeTransporter();
    const isVerified = await transport.verify();
    return {
      isConnected: isVerified,
      cachedTemplates: templateCache.size,
      emailHost: process.env.EMAIL_HOST,
      emailUser: process.env.EMAIL_USER,
    };
  } catch (error) {
    return {
      isConnected: false,
      error: error.message,
    };
  }
};