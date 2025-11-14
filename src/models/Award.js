const mongoose = require('mongoose');

const AwardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Award name is required'],
    trim: true,
    maxlength: [100, 'Award name cannot exceed 100 characters']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  awardedTo: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Award must be given to a user']
  },
  awardedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Award must be given by a user']
  },
  dateAwarded: {
    type: Date,
    default: Date.now
  },
  badgeUrl: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Populate user details
AwardSchema.pre(/^find/, function(next) {
  this.populate([
    { path: 'awardedTo', select: 'firstName lastName email photo' },
    { path: 'awardedBy', select: 'firstName lastName email' }
  ]);
  next();
});

module.exports = mongoose.model('Award', AwardSchema);