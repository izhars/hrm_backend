// controllers/taskController.js
const Task = require('../models/Task');
const User = require('../models/User');
const { notifyTaskAssigned, notifyTaskUpdated, notifyTaskCompleted, notifyTaskComment } = require('../utils/taskNotifications');

// Helper: Check if user can manage tasks for this assignee
const canManageEmployeeTasks = async (requester, assigneeId) => {
  const assignee = await User.findById(assigneeId);
  if (!assignee) throw new Error('Assignee not found');

  const requesterRole = requester.role;

  if (requesterRole === 'superadmin' || requesterRole === 'hr') return true;
  if (requesterRole === 'manager' && assignee.managerId?.toString() === requester._id.toString()) return true;
  if (requester._id.toString() === assigneeId) return true;

  return false;
};

// ===========================================
// GET All Tasks
// ===========================================
exports.getTasks = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category, assignee } = req.query;

    const query = {};

    // Role-based filtering
    if (!['superadmin', 'hr'].includes(req.user.role)) {
      const managedEmployees = req.user.role === 'manager'
        ? await User.find({ managerId: req.user._id }).select('_id')
        : [];

      const allowed = [...managedEmployees.map(u => u._id), req.user._id];
      query.assignee = { $in: allowed };
    }

    if (status) query.status = status;
    if (category) query.category = category;
    if (assignee) query.assignee = assignee;

    const tasks = await Task.find(query)
      .populate('assignee', 'firstName lastName email')
      .populate('assigner', 'firstName lastName')
      .sort({ dueDate: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Task.countDocuments(query);

    res.json({
      success: true,
      data: tasks,
      pagination: { page: +page, limit: +limit, total }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===========================================
// GET Single Task
// ===========================================
exports.getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignee', 'firstName lastName email fullName daysToAnniversary id')
      .populate('assigner', 'firstName lastName email fullName daysToAnniversary id')
      .populate({
        path: 'comments.author',
        select: 'firstName lastName email fullName',
      })
      .lean();

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found',
      });
    }

    // Sort comments by time (latest first)
    if (task.comments?.length) {
      task.comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const assigneeId = task.assignee?._id
      ? task.assignee._id.toString()
      : task.assignee.toString();

    const allowed = await canManageEmployeeTasks(req.user, assigneeId);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized',
      });
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (err) {
    console.error('❌ getTask error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===========================================
// Create Task
// ===========================================
exports.createTask = async (req, res) => {
  try {
    const { title, description, assigneeId, category, dueDate } = req.body;

    const allowed = await canManageEmployeeTasks(req.user, assigneeId);
    if (!allowed) return res.status(403).json({ success: false, message: 'Not authorized' });

    const task = await Task.create({
      title,
      description,
      assignee: assigneeId,
      assigner: req.user._id,
      category,
      dueDate
    });

    await task.populate({
      path: 'assignee',
      select: 'firstName lastName email employeeId profilePicture designation department'
    });
    await task.populate({
      path: 'assigner',
      select: 'firstName lastName email employeeId profilePicture designation'
    });

    await notifyTaskAssigned(task.assignee._id, task);

    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ===========================================
// Update Task
// ===========================================
exports.updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const allowed = await canManageEmployeeTasks(req.user, task.assignee);
    if (!allowed) return res.status(403).json({ success: false, message: 'Not authorized' });

    Object.assign(task, req.body);

    await task.save();
    await task.populate('assignee assigner');

    await notifyTaskUpdated(task.assignee._id, task);

    res.json({ success: true, data: task });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ===========================================
// Complete Task
// ===========================================
exports.completeTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const assigneeId = task.assignee?._id
      ? task.assignee._id.toString()
      : task.assignee.toString();

    const allowed = await canManageEmployeeTasks(req.user, assigneeId);
    if (!allowed) return res.status(403).json({ success: false, message: 'Not authorized' });

    task.status = 'completed';
    task.completedAt = new Date();

    await task.save();
    await task.populate('assignee assigner');

    await notifyTaskCompleted(task.assignee._id, task);

    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===========================================
// Add Comment
// ===========================================
exports.addComment = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const assigneeId = task.assignee?._id
      ? task.assignee._id.toString()
      : task.assignee.toString();

    const allowed = await canManageEmployeeTasks(req.user, assigneeId);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    task.comments.push({
      text: req.body.text,
      author: req.user._id
    });

    await task.save();

    await task.populate('comments.author', 'firstName lastName email');

    await notifyTaskComment(task, req.user._id);

    res.json({ success: true, data: task });
  } catch (err) {
    console.error('🔥 Add comment failed:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// ===========================================
// Delete Task
// ===========================================
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const isAdmin = ['superadmin', 'hr'].includes(req.user.role);
    const isAssigner = task.assigner.toString() === req.user._id.toString();

    if (!isAdmin && !isAssigner) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this task' });
    }

    await Task.findByIdAndDelete(task._id);

    res.json({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (err) {
    console.error('❌ deleteTask error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};