const moment = require("moment-timezone");
const ComboOff = require("../models/ComboOff");
const User = require("../models/User");
const Holiday = require("../models/Holiday"); // if you track holidays

/**
 * Step 1 — Employee applies for Combo Off
 */
exports.applyComboOff = async (req, res) => {
  try {
    const employeeId = req.user.id;
    const { workDate, reason } = req.body;

    console.log("🟢 Combo Off Apply Attempt");
    console.log("Employee ID:", employeeId);
    console.log("Request Body:", { workDate, reason });

    if (!workDate || !reason) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        message: "Work date and reason are required",
      });
    }

    // ── 1️⃣ Parse date ────────────────────────────────────────────────
    const date = moment.tz(workDate, "Asia/Kolkata").startOf("day").toDate();
    const day = date.getDay();
    console.log("📅 Parsed Work Date (IST):", date, "Day Index:", day);

    // ── 2️⃣ Get user's weekend type ───────────────────────────────────
    const user = await User.findById(employeeId).select("weekendType");
    if (!user) {
      console.log("❌ User not found");
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const weekendType = user.weekendType || "sunday";
    console.log("🧑‍💼 Weekend Type:", weekendType);

    // ── 3️⃣ Determine if it's weekend ────────────────────────────────
    const isWeekend =
      (weekendType === "sunday" && day === 0) ||
      (weekendType === "saturday_sunday" && (day === 0 || day === 6));

    console.log("📆 Is Weekend:", isWeekend);

    // ── 4️⃣ Check if it's a holiday ───────────────────────────────────
    const startOfDay = moment.tz(date, "Asia/Kolkata").startOf("day").toDate();
    const endOfDay = moment.tz(date, "Asia/Kolkata").endOf("day").toDate();

    const holiday = await Holiday.findOne({
      date: { $gte: startOfDay, $lte: endOfDay },
      isActive: true,
    });

    console.log("🏖️ Holiday Found:", holiday ? holiday.name : "None");

    // ── 5️⃣ Reject if not weekend or holiday ─────────────────────────
    if (!isWeekend && !holiday) {
      console.log("❌ Invalid Day: Trying to apply on a working day");
      return res.status(400).json({
        success: false,
        message: "You can only apply for Combo Off on weekends or holidays.",
      });
    }

    // ── 6️⃣ Check if already applied ──────────────────────────────────
    const existing = await ComboOff.findOne({ employee: employeeId, workDate: date });
    console.log("🔁 Existing ComboOff Found:", !!existing);

    if (existing) {
      console.log("❌ Duplicate Combo Off application detected");
      return res.status(400).json({
        success: false,
        message: "You have already applied for this date.",
      });
    }

    // ── 7️⃣ Create new combo off request ─────────────────────────────
    const comboOff = await ComboOff.create({
      employee: employeeId,
      workDate: date,
      reason,
      status: "pending",
    });

    console.log("✅ Combo Off Created:", comboOff);

    res.status(201).json({
      success: true,
      message: "Combo Off application submitted successfully.",
      comboOff,
    });
  } catch (error) {
    console.error("🔥 Error applying for Combo Off:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/**
 * Step 2 — HR approves or rejects Combo Off
 */
exports.reviewComboOff = async (req, res) => {
  try {
    const { comboOffId } = req.params;
    const { action } = req.body; // 'approve' or 'reject'
    const hrId = req.user.id;

    const comboOff = await ComboOff.findById(comboOffId);
    if (!comboOff) {
      return res.status(404).json({ success: false, message: 'Combo Off not found' });
    }

    if (comboOff.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This request has already been processed' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    // Handle approval
    if (action === 'approve') {
      comboOff.status = 'approved';
      comboOff.approvedBy = hrId;

      // ✅ Credit 1 Combo Off day to employee
      await User.findByIdAndUpdate(
        comboOff.employee,
        { $inc: { 'leaveBalance.combo': 1 } } // increment combo off count
      );

      // ✅ Mark as credited
      comboOff.isCredited = true;
    }

    // Handle rejection
    if (action === 'reject') {
      comboOff.status = 'rejected';
      comboOff.approvedBy = hrId;
    }

    await comboOff.save();

    res.status(200).json({
      success: true,
      message: `Combo Off ${comboOff.status} successfully`,
      comboOff,
    });
  } catch (error) {
    console.error('Error reviewing Combo Off:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};



/**
 * Step 3 — Get all combo offs (HR/Admin)
 */
exports.getAllComboOffs = async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};

    const comboOffs = await ComboOff.find(query)
      .populate('employee', 'firstName lastName email employeeId')
      .populate('approvedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: comboOffs.length,
      comboOffs,
    });
  } catch (error) {
    console.error('Error fetching combo offs:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Step 4 — Get my combo offs (Employee)
 */
exports.getMyComboOffs = async (req, res) => {
  try {
    const comboOffs = await ComboOff.find({ employee: req.user.id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      comboOffs,
    });
  } catch (error) {
    console.error('Error fetching user combo offs:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Step 5 — Get single combo off by ID
 */
exports.getComboOffById = async (req, res) => {
  try {
    const comboOff = await ComboOff.findById(req.params.id)
      .populate('employee', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email');

    if (!comboOff) {
      return res.status(404).json({ success: false, message: 'Combo Off not found' });
    }

    res.status(200).json({ success: true, comboOff });
  } catch (error) {
    console.error('Error fetching combo off by ID:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Step 6 — Delete combo off (Employee)
 */
exports.deleteComboOff = async (req, res) => {
  try {
    const comboOff = await ComboOff.findById(req.params.id);

    if (!comboOff) {
      return res.status(404).json({ success: false, message: 'Combo Off not found' });
    }

    if (comboOff.employee.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this request' });
    }

    if (comboOff.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Cannot delete processed requests' });
    }

    await comboOff.deleteOne();

    res.status(200).json({ success: true, message: 'Combo Off request deleted successfully' });
  } catch (error) {
    console.error('Error deleting combo off:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Step 7 — Monthly Combo Off Summary (for HR/Admin)
 */
exports.getMonthlyComboOffSummary = async (req, res) => {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ success: false, message: 'Month and year are required' });
    }

    const startDate = moment.tz(`${year}-${month}-01`, 'Asia/Kolkata').startOf('month');
    const endDate = startDate.clone().endOf('month');

    const summary = await ComboOff.aggregate([
      {
        $match: {
          status: 'approved',
          workDate: { $gte: startDate.toDate(), $lte: endDate.toDate() },
        },
      },
      {
        $group: {
          _id: '$employee',
          totalApproved: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'employee',
        },
      },
      { $unwind: '$employee' },
      {
        $project: {
          _id: 0,
          employeeId: '$employee._id',
          name: { $concat: ['$employee.firstName', ' ', '$employee.lastName'] },
          email: '$employee.email',
          totalApproved: 1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      month,
      year,
      totalEmployees: summary.length,
      summary,
    });
  } catch (error) {
    console.error('Error fetching monthly summary:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
