const { body } = require('express-validator');

exports.createEmployeeValidator = [
  body('employeeId')
    .notEmpty().withMessage('Employee ID is required'),
  
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email'),
  
  body('firstName')
    .notEmpty().withMessage('First name is required'),
  
  body('lastName')
    .notEmpty().withMessage('Last name is required'),
  
  body('phone')
    .optional()
    .matches(/^\d{10}$/).withMessage('Phone number must be 10 digits')
];