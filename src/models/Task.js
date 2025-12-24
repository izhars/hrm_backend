const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
  assigner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  category: { 
    type: String,
    enum: ['onboarding', 'offboarding', 'training', 'performance', 'compliance', 'general'],
    default: 'general'
  },

  status: { type: String, enum: ['open', 'completed'], default: 'open' },

  dueDate: { type: Date },
  completedAt: { type: Date },

  comments: [
    {
      text: String,
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
