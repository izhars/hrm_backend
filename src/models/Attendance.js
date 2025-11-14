const mongoose = require('mongoose');
const moment = require('moment-timezone'); // Add this import

const attendanceSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: { type: Date, required: true },

  checkIn: {
    time: { type: Date, default: null },
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    },
    deviceInfo: String
  },

  checkOut: {
    time: { type: Date, default: null },
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    },
    deviceInfo: String
  },

  isShortAttendance: { type: Boolean, default: false },
  shortByMinutes:    { type: Number, default: 0 },

  workHours: { type: Number, default: 0 },
  status: {
    type: String,
    enum: [
      'present',
      'absent',
      'half-day',
      'on-leave',
      'public-holiday',
      'combo-off',
      'non-working-day'
    ],
    default: 'absent'
  },

  isLate: { type: Boolean, default: false },
  lateBy: { type: Number, default: 0 },
  remarks: String,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

// Compound index for employee + date queries
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

// Virtual for formatted times
attendanceSchema.virtual('checkInTimeFormatted').get(function () {
  return this.checkIn?.time ? moment(this.checkIn.time).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null;
});

attendanceSchema.virtual('checkOutTimeFormatted').get(function () {
  return this.checkOut?.time ? moment(this.checkOut.time).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null;
});

// Ensure virtuals are included in toJSON
attendanceSchema.set('toJSON', { virtuals: true });
attendanceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Attendance', attendanceSchema);