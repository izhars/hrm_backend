const Holiday = require('../models/Holiday');
const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Add one or multiple holidays
exports.addHoliday = async (req, res) => {
  try {
    let holidays = req.body;

    // Ensure holidays is an array
    if (!Array.isArray(holidays)) holidays = [holidays];

    const createdHolidays = [];
    const errors = [];

    const session = await Holiday.startSession();
    session.startTransaction();

    try {
      for (const h of holidays) {
        const { name, date, description, type = 'Festival' } = h;

        // Validate required fields
        if (!name || !date) {
          errors.push(`Holiday "${name || 'unknown'}": Name and date are required`);
          continue;
        }

        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
          errors.push(`Holiday "${name}": Invalid date format`);
          continue;
        }

        // Check if holiday already exists on this date
        const existing = await Holiday.findOne({ 
          date: parsedDate 
        }).session(session);

        if (existing) {
          errors.push(`Holiday "${name}" already exists on ${parsedDate.toDateString()}`);
          continue;
        }

        const holiday = await Holiday.create([{
          name,
          date: parsedDate,
          description,
          type
        }], { session });

        createdHolidays.push(holiday[0]);
      }

      await session.commitTransaction();

      if (errors.length > 0) {
        return res.status(207).json({
          message: 'Some holidays were created with errors',
          created: createdHolidays,
          errors
        });
      }

      res.status(201).json({
        message: 'Holidays created successfully',
        data: createdHolidays
      });

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Add holiday error:', error);
    res.status(500).json({ message: 'Failed to create holidays', error: error.message });
  }
};

// Get all holidays with filtering and pagination
exports.getHolidays = async (req, res) => {
  try {
    const { year, month, type, isActive, search } = req.query;

    const filter = {};

    // ✅ isActive filter
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true' || isActive === '1';
    }

    // ✅ Year filter
    if (year) {
      const startYear = new Date(parseInt(year), 0, 1);
      const endYear = new Date(parseInt(year) + 1, 0, 1);
      filter.date = { $gte: startYear, $lt: endYear };
    }

    // ✅ Month filter (requires year)
    if (month && year) {
      const startMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endMonth = new Date(parseInt(year), parseInt(month), 1); // first day of next month
      filter.date = {
        ...filter.date,
        $gte: startMonth,
        $lt: endMonth
      };
    }

    // ✅ Type filter
    if (type) {
      filter.type = type;
    }

    // ✅ Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('Holiday filter:', filter);

    // ✅ Fetch all holidays without pagination
    const holidays = await Holiday.find(filter)
      .sort({ date: 1 })
      .select('-__v');

    res.json({
      success: true,
      count: holidays.length,
      data: holidays,
      filters: {
        year,
        month,
        type,
        search,
        isActive
      }
    });
  } catch (error) {
    console.error('Get holidays error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch holidays',
      error: error.message
    });
  }
};


// Get holidays for a specific year
exports.getHolidaysByYear = async (req, res) => {
  try {
    const { year } = req.params;
    const { type, month } = req.query;

    if (!year || isNaN(parseInt(year))) {
      return res.status(400).json({ message: 'Valid year is required' });
    }

    const startDate = new Date(parseInt(year), 0, 1);
    const endDate = new Date(parseInt(year) + 1, 0, 1);

    let filter = { 
      date: { $gte: startDate, $lt: endDate },
      isActive: true
    };

    if (type) filter.type = type;
    if (month) {
      filter.date = {
        ...filter.date,
        $gte: new Date(parseInt(year), parseInt(month) - 1, 1),
        $lte: new Date(parseInt(year), parseInt(month), 0, 23, 59, 59)
      };
    }

    const holidays = await Holiday
      .find(filter)
      .sort({ date: 1 })
      .select('-__v');

    res.json({
      year: parseInt(year),
      count: holidays.length,
      data: holidays
    });
  } catch (error) {
    console.error('Get holidays by year error:', error);
    res.status(500).json({ message: 'Failed to fetch holidays', error: error.message });
  }
};

// Get upcoming holidays (next 30 days)
exports.getUpcomingHolidays = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const holidays = await Holiday.find({
      date: { $gte: today, $lte: thirtyDaysFromNow },
      isActive: true
    })
    .sort({ date: 1 })
    .select('-__v');

    res.json({
      period: {
        from: today.toISOString().split('T')[0],
        to: thirtyDaysFromNow.toISOString().split('T')[0]
      },
      count: holidays.length,
      data: holidays
    });
  } catch (error) {
    console.error('Get upcoming holidays error:', error);
    res.status(500).json({ message: 'Failed to fetch upcoming holidays', error: error.message });
  }
};

// Get holidays by type
exports.getHolidaysByType = async (req, res) => {
  try {
    const { type } = req.params;
    const validTypes = ['National', 'Festival', 'Regional', 'Religious'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        message: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const holidays = await Holiday.find({
      type,
      isActive: true
    })
    .sort({ date: 1 })
    .select('-__v');

    res.json({
      type,
      count: holidays.length,
      data: holidays
    });
  } catch (error) {
    console.error('Get holidays by type error:', error);
    res.status(500).json({ message: 'Failed to fetch holidays', error: error.message });
  }
};

// Get single holiday by ID
exports.getHolidayById = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    
    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }

    res.json(holiday);
  } catch (error) {
    console.error('Get holiday by ID error:', error);
    res.status(500).json({ message: 'Failed to fetch holiday', error: error.message });
  }
};

// Update holiday
exports.updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate date if provided
    if (updateData.date) {
      const parsedDate = new Date(updateData.date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: 'Invalid date format' });
      }
      updateData.date = parsedDate;

      // Check for date conflict
      const existing = await Holiday.findOne({
        date: updateData.date,
        _id: { $ne: id }
      });

      if (existing) {
        return res.status(400).json({
          message: `Holiday already exists on ${updateData.date.toDateString()}`
        });
      }
    }

    const holiday = await Holiday.findByIdAndUpdate(
      id,
      { 
        ...updateData,
        updatedAt: new Date()
      },
      { 
        new: true, 
        runValidators: true 
      }
    );

    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }

    res.json({
      message: 'Holiday updated successfully',
      data: holiday
    });
  } catch (error) {
    console.error('Update holiday error:', error);
    res.status(500).json({ message: 'Failed to update holiday', error: error.message });
  }
};

// Delete holiday (soft delete)
exports.deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;

    const holiday = await Holiday.findByIdAndUpdate(
      id,
      {
        isActive: false,
        deletedAt: new Date()
      },
      { new: true }
    );

    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }

    res.json({
      message: 'Holiday soft-deleted successfully',
      data: holiday
    });
  } catch (error) {
    console.error('Delete holiday error:', error);
    res.status(500).json({ message: 'Failed to delete holiday', error: error.message });
  }
};

// Permanent delete holiday
exports.permanentDeleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;

    const holiday = await Holiday.findByIdAndDelete(id);

    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }

    res.json({
      message: 'Holiday permanently deleted successfully',
      data: { id: holiday._id }
    });
  } catch (error) {
    console.error('Permanent delete holiday error:', error);
    res.status(500).json({ message: 'Failed to permanently delete holiday', error: error.message });
  }
};

// Bulk import holidays from CSV/JSON file
exports.bulkImportHolidays = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const results = [];

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          // Map CSV columns to holiday fields
          const holidayData = {
            name: data.name?.trim(),
            date: new Date(data.date),
            description: data.description?.trim(),
            type: data.type || 'Festival'
          };

          // Validate required fields
          if (holidayData.name && !isNaN(holidayData.date.getTime())) {
            results.push(holidayData);
          }
        })
        .on('end', async () => {
          try {
            if (results.length === 0) {
              fs.unlinkSync(filePath);
              return res.status(400).json({ message: 'No valid holidays found in file' });
            }

            // Bulk create with error handling
            const createdHolidays = [];
            const errors = [];

            for (const holidayData of results) {
              try {
                const existing = await Holiday.findOne({ date: holidayData.date });
                if (existing) {
                  errors.push(`Holiday exists on ${holidayData.date.toDateString()}`);
                  continue;
                }

                const holiday = await Holiday.create(holidayData);
                createdHolidays.push(holiday);
              } catch (err) {
                errors.push(`Error creating "${holidayData.name}": ${err.message}`);
              }
            }

            // Clean up temp file
            fs.unlinkSync(filePath);

            res.status(201).json({
              message: 'Bulk import completed',
              imported: createdHolidays.length,
              errors: errors.length,
              data: createdHolidays
            });

          } catch (error) {
            fs.unlinkSync(filePath);
            reject(error);
          }
        })
        .on('error', (error) => {
          fs.unlinkSync(filePath);
          reject(error);
        });
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ message: 'Failed to import holidays', error: error.message });
  }
};

// Export holidays as CSV
exports.exportHolidays = async (req, res) => {
  try {
    const { format = 'csv', year } = req.query;
    
    let filter = { isActive: true };
    if (year) {
      const startDate = new Date(parseInt(year), 0, 1);
      const endDate = new Date(parseInt(year) + 1, 0, 1);
      filter.date = { $gte: startDate, $lt: endDate };
    }

    const holidays = await Holiday.find(filter).sort({ date: 1 });

    if (format === 'csv') {
      const csvWriter = createCsvWriter({
        path: 'holidays_export.csv',
        header: [
          { id: 'name', title: 'Name' },
          { id: 'date', title: 'Date' },
          { id: 'description', title: 'Description' },
          { id: 'type', title: 'Type' },
          { id: 'createdAt', title: 'Created At' },
          { id: 'updatedAt', title: 'Updated At' }
        ]
      });

      const records = holidays.map(holiday => ({
        name: holiday.name,
        date: holiday.date.toISOString().split('T')[0],
        description: holiday.description || '',
        type: holiday.type,
        createdAt: holiday.createdAt.toISOString().split('T')[0],
        updatedAt: holiday.updatedAt.toISOString().split('T')[0]
      }));

      await csvWriter.writeRecords(records);

      res.download('holidays_export.csv', `holidays_${year || 'all'}.csv`, (err) => {
        if (err) {
          fs.unlinkSync('holidays_export.csv');
        }
      });
    } else {
      // JSON export
      res.json({
        exportedAt: new Date().toISOString(),
        count: holidays.length,
        data: holidays
      });
    }
  } catch (error) {
    console.error('Export holidays error:', error);
    res.status(500).json({ message: 'Failed to export holidays', error: error.message });
  }
};

// Get holiday statistics
exports.getHolidayStats = async (req, res) => {
  try {
    const { year } = req.query;

    let matchStage = { isActive: true };
    if (year) {
      const startDate = new Date(parseInt(year), 0, 1);
      const endDate = new Date(parseInt(year) + 1, 0, 1);
      matchStage.date = { $gte: startDate, $lt: endDate };
    }

    const stats = await Holiday.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          holidays: { $push: { name: '$name', date: '$date' } }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$count' },
          byType: { 
            $push: { 
              type: '$_id', 
              count: '$count',
              sample: { $arrayElemAt: ['$holidays', 0] }
            } 
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalHolidays: '$total',
          byType: 1,
          year: year || 'All'
        }
      }
    ]);

    // Get date distribution
    const dateStats = await Holiday.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { 
            $dateToString: { 
              format: '%m', 
              date: '$date' 
            } 
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          _id: 0,
          month: { $toInt: '$_id' },
          count: 1
        }
      }
    ]);

    res.json({
      stats: stats[0] || { totalHolidays: 0, byType: [] },
      dateDistribution: dateStats,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get holiday stats error:', error);
    res.status(500).json({ message: 'Failed to fetch statistics', error: error.message });
  }
};