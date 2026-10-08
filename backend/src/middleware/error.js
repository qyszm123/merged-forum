const { HttpError } = require('../utils/http')

function errorHandler(err, _req, res, _next) {
  if (err.name === 'ZodError') {
    return res.status(400).json({
      code: 400,
      message: '参数校验失败',
      details: err.errors
    })
  }
  const status = err.status || 500
  const message = err.message || '服务器错误'
  if (status >= 500) console.error(err)
  res.status(status).json({
    code: status,
    message,
    details: err.details || null
  })
}

function notFound(_req, _res, next) {
  next(new HttpError(404, '接口不存在'))
}

module.exports = { errorHandler, notFound }
