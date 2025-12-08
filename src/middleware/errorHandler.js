const AppError = require('../utils/appError');

// Mongoose: Invalid ObjectId
const handleCastErrorDB = err =>
  new AppError(`Invalid ${err.path}: ${err.value}`, 400);

// Mongoose: Duplicate key
const handleDuplicateFieldsDB = err => {
  const field = Object.keys(err.keyValue)[0];
  return new AppError(`Duplicate ${field}: "${err.keyValue[field]}"`, 409);
};

// JWT: Invalid token
const handleJWTError = () => new AppError('Invalid token', 401);

// JWT: Token expired
const handleJWTExpiredError = () => new AppError('Token expired', 401);

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Clone error object
  let error = { ...err };
  error.message = err.message;

  // Handle known errors
  if (err.name === 'CastError') error = handleCastErrorDB(err);
  if (err.code === 11000) error = handleDuplicateFieldsDB(err);
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

  res.status(error.statusCode).json({
    success: false,
    status: error.status,
    message: error.message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      error
    })
  });
};

module.exports = errorHandler;
