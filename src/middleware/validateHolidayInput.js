const validateHolidayInput = (req, res, next) => {
  const { name, date, type } = req.body;
  
  if (!name || !date) {
    return res.status(400).json({ 
      message: 'Name and date are required' 
    });
  }
  
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({ 
      message: 'Invalid date format' 
    });
  }
  
  req.body.date = parsedDate;
  
  // Validate type enum
  const validTypes = ['National', 'Festival', 'Regional', 'Religious'];
  if (type && !validTypes.includes(type)) {
    return res.status(400).json({ 
      message: `Type must be one of: ${validTypes.join(', ')}` 
    });
  }
  
  next();
};

module.exports = validateHolidayInput;