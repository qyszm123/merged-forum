class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

function ok(res, data = null, message = 'ok') {
  return res.json({ code: 0, message, data })
}

function fail(res, status, message, details) {
  return res.status(status).json({ code: status, message, details: details || null })
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

module.exports = { HttpError, ok, fail, asyncHandler }
