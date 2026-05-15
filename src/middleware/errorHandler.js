export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err)

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.details,
    })
  }

  if (err.name === 'MongoError' || err.code === 11000) {
    return res.status(409).json({
      error: 'Duplicate field value entered',
    })
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(403).json({
      error: 'Invalid token',
    })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(403).json({
      error: 'Token expired',
    })
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  })
}

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
  })
}
