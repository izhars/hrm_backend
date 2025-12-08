const User = require('../models/User');
const Department = require('../models/Department');
const moment = require('moment');
const asyncHandler = require('async-handler');

// Helper function to add query timeout
const timeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), ms))
  ]);

// This matches month and day, regardless of year
const getCelebrations = async (dateField, additionalFilters = {}, date = moment(), limit = 10, skip = 0) => {
  console.time(`getCelebrations-${dateField}`);
  try {
    const month = date.month() + 1; // MongoDB months are 1-indexed
    const day = date.date();

    const result = await timeout(
      User.aggregate([
        {
          $match: {
            [dateField]: { $exists: true, $ne: null },
            isActive: true,
            ...additionalFilters
          }
        },
        {
          $addFields: {
            celebrationMonth: { $month: `$${dateField}` },
            celebrationDay: { $dayOfMonth: `$${dateField}` }
          }
        },
        {
          $match: {
            celebrationMonth: month,
            celebrationDay: day
          }
        },
        {
          $project: {
            employeeId: 1,
            firstName: 1,
            lastName: 1,
            email: 1,
            department: 1,
            designation: 1,
            fullName: 1,
            dateOfBirth: 1,
            marriageAnniversary: 1,
            dateOfJoining: 1
          }
        },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'departments',
            localField: 'department',
            foreignField: '_id',
            as: 'department',
            pipeline: [{ $project: { name: 1 } }]
          }
        },
        { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } }
      ]),
      5000
    );

    console.timeEnd(`getCelebrations-${dateField}`);
    return result;
  } catch (err) {
    console.error(`getCelebrations-${dateField} failed:`, err);
    console.timeEnd(`getCelebrations-${dateField}`);
    return [];
  }
};

// Helper function for upcoming celebrations (EXCLUDING today)
const getUpcomingCelebrations = async (dateField, days, additionalFilters = {}, limit = 10, skip = 0) => {
  console.time(`getUpcomingCelebrations-${dateField}`);
  const today = moment();
  const endDate = moment().add(days, 'days');

  const result = await timeout(
    User.aggregate([
      {
        $match: {
          [dateField]: { $exists: true, $ne: null },
          isActive: true,
          ...additionalFilters
        }
      },
      {
        $addFields: {
          celebrationMonth: { $month: `$${dateField}` },
          celebrationDay: { $dayOfMonth: `$${dateField}` },
          dayOfYear: {
            $dayOfYear: {
              $dateFromParts: {
                year: today.year(),
                month: { $month: `$${dateField}` },
                day: { $dayOfMonth: `$${dateField}` }
              }
            }
          }
        }
      },
      {
        $match: {
          dayOfYear: {
            $gt: today.dayOfYear(), // Exclude today
            $lte: endDate.dayOfYear()
          }
        }
      },
      {
        $project: {
          employeeId: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          department: 1,
          designation: 1,
          fullName: 1,
          dateField: `$${dateField}`,
          dayOfYear: 1
        }
      },
      { $sort: { dayOfYear: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'departments',
          localField: 'department',
          foreignField: '_id',
          as: 'department',
          pipeline: [{ $project: { name: 1 } }]
        }
      },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } }
    ]),
    5000
  );

  console.timeEnd(`getUpcomingCelebrations-${dateField}`);
  return result;
};

// Helper function to count celebrations by matching month and day
const countCelebrations = async (dateField, additionalFilters = {}, date = moment()) => {
  const month = date.month() + 1;
  const day = date.date();

  return await User.aggregate([
    {
      $match: {
        [dateField]: { $exists: true, $ne: null },
        isActive: true,
        ...additionalFilters
      }
    },
    {
      $addFields: {
        celebrationMonth: { $month: `$${dateField}` },
        celebrationDay: { $dayOfMonth: `$${dateField}` }
      }
    },
    {
      $match: {
        celebrationMonth: month,
        celebrationDay: day
      }
    },
    {
      $count: 'total'
    }
  ]).then(result => result[0]?.total || 0);
};

// GET /api/celebrations/all
// Fetch only today's celebrations
// Access: HR, superadmin
exports.getAllTodayCelebrations = async (req, res, next) => {
  console.log('Starting getAllTodayCelebrations', req.query);

  const date = req.query.date ? moment(req.query.date, 'YYYY-MM-DD') : moment();
  if (req.query.date && !date.isValid()) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD'
    });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const department = req.query.department ? { department: req.query.department } : {};

  if (req.query.department) {
    const departmentExists = await Department.findById(req.query.department).lean();
    if (!departmentExists) {
      return res.status(400).json({
        success: false,
        error: 'Invalid department ID'
      });
    }
  }

  const filters = { role: 'employee', ...department };
  const marriageFilters = { role: 'employee', maritalStatus: 'married', ...department };

  const [
    birthdays,
    marriageAnniversaries,
    workAnniversaries,
    totalBirthdays,
    totalMarriageAnniversaries,
    totalWorkAnniversaries
  ] = await Promise.all([
    getCelebrations('dateOfBirth', filters, date, limit, skip),
    getCelebrations('marriageAnniversary', marriageFilters, date, limit, skip),
    getCelebrations('dateOfJoining', filters, date, limit, skip),
    countCelebrations('dateOfBirth', filters, date),
    countCelebrations('marriageAnniversary', marriageFilters, date),
    countCelebrations('dateOfJoining', filters, date)
  ]);

  res.status(200).json({
    success: true,
    data: {
      today: {
        birthdays: {
          count: birthdays.length,
          total: totalBirthdays,
          page,
          pages: Math.ceil(totalBirthdays / limit),
          data: birthdays
        },
        marriageAnniversaries: {
          count: marriageAnniversaries.length,
          total: totalMarriageAnniversaries,
          page,
          pages: Math.ceil(totalMarriageAnniversaries / limit),
          data: marriageAnniversaries
        },
        workAnniversaries: {
          count: workAnniversaries.length,
          total: totalWorkAnniversaries,
          page,
          pages: Math.ceil(totalWorkAnniversaries / limit),
          data: workAnniversaries.map(user => ({
            ...user,
            yearsOfService: date.diff(moment(user.dateOfJoining), 'years')
          }))
        }
      }
    }
  });

  console.log('Completed getAllTodayCelebrations');
};

// GET /api/celebrations/upcoming
// Fetch only upcoming celebrations (EXCLUDING today)
// Access: HR, superadmin
exports.getAllUpComingCelebrations = async (req, res, next) => {
  console.log('Starting getAllUpComingCelebrations', req.query);

  const date = req.query.date ? moment(req.query.date, 'YYYY-MM-DD') : moment();
  if (req.query.date && !date.isValid()) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD'
    });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const department = req.query.department ? { department: req.query.department } : {};
  const upcomingDays = parseInt(req.query.upcomingDays) || 7;

  if (upcomingDays < 1 || upcomingDays > 30) {
    return res.status(400).json({
      success: false,
      error: 'Upcoming days must be between 1 and 30'
    });
  }

  if (req.query.department) {
    const departmentExists = await Department.findById(req.query.department).lean();
    if (!departmentExists) {
      return res.status(400).json({
        success: false,
        error: 'Invalid department ID'
      });
    }
  }

  const filters = { role: 'employee', ...department };
  const marriageFilters = { role: 'employee', maritalStatus: 'married', ...department };

  const [upcomingBirthdays, upcomingMarriageAnniversaries, upcomingWorkAnniversaries] = await Promise.all([
    getUpcomingCelebrations('dateOfBirth', upcomingDays, filters, limit, skip),
    getUpcomingCelebrations('marriageAnniversary', upcomingDays, marriageFilters, limit, skip),
    getUpcomingCelebrations('dateOfJoining', upcomingDays, filters, limit, skip)
  ]);

  res.status(200).json({
    success: true,
    data: {
      upcoming: {
        birthdays: upcomingBirthdays.map(user => ({
          ...user,
          celebrationDate: moment()
            .year(date.year())
            .month(moment(user.dateField).month())
            .date(moment(user.dateField).date())
            .format('YYYY-MM-DD'),
          daysUntil: moment()
            .year(date.year())
            .month(moment(user.dateField).month())
            .date(moment(user.dateField).date())
            .diff(date, 'days')
        })),
        marriageAnniversaries: upcomingMarriageAnniversaries.map(user => ({
          ...user,
          celebrationDate: moment()
            .year(date.year())
            .month(moment(user.dateField).month())
            .date(moment(user.dateField).date())
            .format('YYYY-MM-DD'),
          daysUntil: moment()
            .year(date.year())
            .month(moment(user.dateField).month())
            .date(moment(user.dateField).date())
            .diff(date, 'days')
        })),
        workAnniversaries: upcomingWorkAnniversaries.map(user => ({
          ...user,
          celebrationDate: moment()
            .year(date.year())
            .month(moment(user.dateField).month())
            .date(moment(user.dateField).date())
            .format('YYYY-MM-DD'),
          daysUntil: moment()
            .year(date.year())
            .month(moment(user.dateField).month())
            .date(moment(user.dateField).date())
            .diff(date, 'days'),
          yearsOfService: date.diff(moment(user.dateField), 'years')
        }))
      },
      page,
      limit
    }
  });

  console.log('Completed getAllUpComingCelebrations');
};

// GET /api/celebrations/birthdays
// Fetch employees with birthdays today, optionally with upcoming birthdays
// Access: HR, superadmin
exports.getTodaysBirthdays = async (req, res, next) => {
  console.log('Starting getTodaysBirthdays', req.query);

  const date = req.query.date ? moment(req.query.date, 'YYYY-MM-DD') : moment();
  if (req.query.date && !date.isValid()) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD'
    });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const department = req.query.department ? { department: req.query.department } : {};
  const includeUpcoming = req.query.includeUpcoming === 'true';
  const upcomingDays = parseInt(req.query.upcomingDays) || 7;

  if (includeUpcoming && (upcomingDays < 1 || upcomingDays > 30)) {
    return res.status(400).json({
      success: false,
      error: 'Upcoming days must be between 1 and 30'
    });
  }

  if (req.query.department) {
    const departmentExists = await Department.findById(req.query.department).lean();
    if (!departmentExists) {
      return res.status(400).json({
        success: false,
        error: 'Invalid department ID'
      });
    }
  }

  const filters = { role: 'employee', ...department };
  const startDate = new Date(date.year(), date.month(), date.date());
  const endDate = new Date(date.year(), date.month(), date.date() + 1);

  const [birthdays, total, upcoming] = await Promise.all([
    getCelebrations('dateOfBirth', filters, date, limit, skip),
    User.countDocuments({
      dateOfBirth: { $exists: true, $ne: null, $gte: startDate, $lt: endDate },
      role: 'employee',
      isActive: true,
      ...department
    }),
    includeUpcoming ? getUpcomingCelebrations('dateOfBirth', upcomingDays, filters, limit, skip) : Promise.resolve([])
  ]);

  res.status(200).json({
    success: true,
    count: birthdays.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: {
      today: birthdays,
      upcoming: includeUpcoming
        ? upcoming.map(user => ({
            ...user,
            celebrationDate: moment()
              .set({
                month: moment(user.dateField).month(),
                date: moment(user.dateField).date()
              })
              .format('YYYY-MM-DD'),
            daysUntil: Math.ceil(
              moment(user.dateField)
                .set('year', date.year())
                .diff(date, 'days')
            )
          }))
        : []
    }
  });
  console.log('Completed getTodaysBirthdays');
};

// GET /api/celebrations/marriage-anniversaries
// Fetch employees with marriage anniversaries today, optionally with upcoming anniversaries
// Access: HR, superadmin
exports.getTodaysMarriageAnniversaries = async (req, res, next) => {
  console.log('Starting getTodaysMarriageAnniversaries', req.query);

  const date = req.query.date ? moment(req.query.date, 'YYYY-MM-DD') : moment();
  if (req.query.date && !date.isValid()) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD'
    });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const department = req.query.department ? { department: req.query.department } : {};
  const includeUpcoming = req.query.includeUpcoming === 'true';
  const upcomingDays = parseInt(req.query.upcomingDays) || 7;

  if (includeUpcoming && (upcomingDays < 1 || upcomingDays > 30)) {
    return res.status(400).json({
      success: false,
      error: 'Upcoming days must be between 1 and 30'
    });
  }

  if (req.query.department) {
    const departmentExists = await Department.findById(req.query.department).lean();
    if (!departmentExists) {
      return res.status(400).json({
        success: false,
        error: 'Invalid department ID'
      });
    }
  }

  const filters = { role: 'employee', maritalStatus: 'married', ...department };
  const startDate = new Date(date.year(), date.month(), date.date());
  const endDate = new Date(date.year(), date.month(), date.date() + 1);

  const [anniversaries, total, upcoming] = await Promise.all([
    getCelebrations('marriageAnniversary', filters, date, limit, skip),
    User.countDocuments({
      marriageAnniversary: { $exists: true, $ne: null, $gte: startDate, $lt: endDate },
      role: 'employee',
      maritalStatus: 'married',
      isActive: true,
      ...department
    }),
    includeUpcoming ? getUpcomingCelebrations('marriageAnniversary', upcomingDays, filters, limit, skip) : Promise.resolve([])
  ]);

  res.status(200).json({
    success: true,
    count: anniversaries.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: {
      today: anniversaries,
      upcoming: includeUpcoming
        ? upcoming.map(user => ({
            ...user,
            celebrationDate: moment()
              .set({
                month: moment(user.dateField).month(),
                date: moment(user.dateField).date()
              })
              .format('YYYY-MM-DD'),
            daysUntil: Math.ceil(
              moment(user.dateField)
                .set('year', date.year())
                .diff(date, 'days')
            )
          }))
        : []
    }
  });
  console.log('Completed getTodaysMarriageAnniversaries');
};

// GET /api/celebrations/work-anniversaries
// Fetch employees with work anniversaries today, optionally with upcoming anniversaries
// Access: HR, superadmin
exports.getTodaysWorkAnniversaries = async (req, res, next) => {
  console.log('Starting getTodaysWorkAnniversaries', req.query);

  const date = req.query.date ? moment(req.query.date, 'YYYY-MM-DD') : moment();
  if (req.query.date && !date.isValid()) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD'
    });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const department = req.query.department ? { department: req.query.department } : {};
  const includeUpcoming = req.query.includeUpcoming === 'true';
  const upcomingDays = parseInt(req.query.upcomingDays) || 7;

  if (includeUpcoming && (upcomingDays < 1 || upcomingDays > 30)) {
    return res.status(400).json({
      success: false,
      error: 'Upcoming days must be between 1 and 30'
    });
  }

  if (req.query.department) {
    const departmentExists = await Department.findById(req.query.department).lean();
    if (!departmentExists) {
      return res.status(400).json({
        success: false,
        error: 'Invalid department ID'
      });
    }
  }

  const filters = { role: 'employee', ...department };
  const startDate = new Date(date.year(), date.month(), date.date());
  const endDate = new Date(date.year(), date.month(), date.date() + 1);

  const [workAnniversaries, total, upcoming] = await Promise.all([
    getCelebrations('dateOfJoining', filters, date, limit, skip),
    User.countDocuments({
      dateOfJoining: { $exists: true, $ne: null, $gte: startDate, $lt: endDate },
      role: 'employee',
      isActive: true,
      ...department
    }),
    includeUpcoming ? getUpcomingCelebrations('dateOfJoining', upcomingDays, filters, limit, skip) : Promise.resolve([])
  ]);

  const anniversariesWithYears = workAnniversaries.map(user => ({
    ...user,
    yearsOfService: date.diff(moment(user.dateOfJoining), 'years')
  }));

  res.status(200).json({
    success: true,
    count: anniversariesWithYears.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: {
      today: anniversariesWithYears,
      upcoming: includeUpcoming
        ? upcoming.map(user => ({
            ...user,
            celebrationDate: moment()
              .set({
                month: moment(user.dateField).month(),
                date: moment(user.dateField).date()
              })
              .format('YYYY-MM-DD'),
            daysUntil: Math.ceil(
              moment(user.dateField)
                .set('year', date.year())
                .diff(date, 'days')
            ),
            yearsOfService: date.diff(moment(user.dateField), 'years')
          }))
        : []
    }
  });
  console.log('Completed getTodaysWorkAnniversaries');
};

// GET /api/celebrations/stats
// Fetch celebration statistics (e.g., by month)
// Access: HR, superadmin
exports.getCelebrationStats = async (req, res, next) => {
  console.log('Starting getCelebrationStats', req.query);

  const year = parseInt(req.query.year) || moment().year();
  const department = req.query.department ? { department: req.query.department } : {};

  if (req.query.department) {
    const departmentExists = await Department.findById(req.query.department).lean();
    if (!departmentExists) {
      return res.status(400).json({
        success: false,
        error: 'Invalid department ID'
      });
    }
  }

  const stats = await timeout(
    User.aggregate([
      {
        $match: {
          isActive: true,
          role: 'employee',
          ...department
        }
      },
      {
        $facet: {
          birthdays: [
            { $match: { dateOfBirth: { $exists: true, $ne: null } } },
            {
              $group: {
                _id: { $month: '$dateOfBirth' },
                count: { $sum: 1 }
              }
            },
            {
              $project: {
                month: '$_id',
                count: 1,
                _id: 0
              }
            },
            { $sort: { month: 1 } }
          ],
          marriageAnniversaries: [
            { $match: { marriageAnniversary: { $exists: true, $ne: null }, maritalStatus: 'married' } },
            {
              $group: {
                _id: { $month: '$marriageAnniversary' },
                count: { $sum: 1 }
              }
            },
            {
              $project: {
                month: '$_id',
                count: 1,
                _id: 0
              }
            },
            { $sort: { month: 1 } }
          ],
          workAnniversaries: [
            { $match: { dateOfJoining: { $exists: true, $ne: null } } },
            {
              $group: {
                _id: { $month: '$dateOfJoining' },
                count: { $sum: 1 }
              }
            },
            {
              $project: {
                month: '$_id',
                count: 1,
                _id: 0
              }
            },
            { $sort: { month: 1 } }
          ]
        }
      }
    ]),
    5000
  );

  res.status(200).json({
    success: true,
    data: {
      year,
      birthdays: stats[0].birthdays,
      marriageAnniversaries: stats[0].marriageAnniversaries,
      workAnniversaries: stats[0].workAnniversaries
    }
  });
  console.log('Completed getCelebrationStats');
};

// POST /api/celebrations/send-notification
// Send celebration notifications (mock implementation)
// Access: HR, superadmin
exports.sendCelebrationNotification = async (req, res, next) => {
  console.log('Starting sendCelebrationNotification', req.body);
  if (!['hr', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to send notifications'
    });
  }

  const date = req.body.date ? moment(req.body.date, 'YYYY-MM-DD') : moment();
  if (req.body.date && !date.isValid()) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD'
    });
  }

  const department = req.body.department ? { department: req.body.department } : {};

  if (req.body.department) {
    const departmentExists = await Department.findById(req.body.department).lean();
    if (!departmentExists) {
      return res.status(400).json({
        success: false,
        error: 'Invalid department ID'
      });
    }
  }

  const [birthdays, marriageAnniversaries, workAnniversaries] = await Promise.all([
    getCelebrations('dateOfBirth', { role: 'employee', ...department }, date, 100, 0),
    getCelebrations('marriageAnniversary', { role: 'employee', maritalStatus: 'married', ...department }, date, 100, 0),
    getCelebrations('dateOfJoining', { role: 'employee', ...department }, date, 100, 0)
  ]);

  const notifications = [];
  birthdays.forEach(user => {
    notifications.push(`Sending birthday email to ${user.fullName} (${user.email})`);
  });
  marriageAnniversaries.forEach(user => {
    notifications.push(`Sending marriage anniversary email to ${user.fullName} (${user.email})`);
  });
  workAnniversaries.forEach(user => {
    const years = date.diff(moment(user.dateOfJoining), 'years');
    notifications.push(`Sending ${years}-year work anniversary email to ${user.fullName} (${user.email})`);
  });

  console.log('Notifications:', notifications);

  res.status(200).json({
    success: true,
    message: 'Notifications queued successfully',
    data: notifications
  });
  console.log('Completed sendCelebrationNotification');
};

// GET /api/celebrations/employee/:employeeId
// Fetch employee details for celebration-related data
// Access: HR, superadmin, or self
exports.getEmployeeDetails = async (req, res, next) => {
  console.log('Starting getEmployeeDetails', req.params);
  const { employeeId } = req.params;

  const employee = await User.findOne({ employeeId, isActive: true })
    .select(
      'employeeId firstName lastName email department dateOfBirth marriageAnniversary dateOfJoining maritalStatus spouseDetails fullName designation'
    )
    .populate({ path: 'department', select: 'name' })
    .lean();

  if (!employee) {
    return res.status(404).json({
      success: false,
      error: `Employee with ID ${employeeId} not found`
    });
  }

  if (employee.dateOfJoining) {
    employee.yearsOfService = moment().diff(moment(employee.dateOfJoining), 'years');
  }

  res.status(200).json({
    success: true,
    data: employee
  });
  console.log('Completed getEmployeeDetails');
};
