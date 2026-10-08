const jwt = require('jsonwebtoken')
const config = require('../config')
const { HttpError } = require('../utils/http')
const { query } = require('../db/pool')

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.display_name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  )
}

async function authRequired(req, _res, next) {
  try {
    const header = req.headers.authorization || ''
    const tokenFromHeader = header.startsWith('Bearer ') ? header.slice(7) : null
    const token = tokenFromHeader || req.query.token || null
    if (!token) throw new HttpError(401, '未登录')
    const payload = jwt.verify(token, config.jwt.secret)
    const rows = await query(
      'SELECT id, student_no, display_name, avatar_char, role, rank_label, points, grade, class_name, school_name FROM users WHERE id = :id LIMIT 1',
      { id: payload.sub }
    )
    if (!rows.length) throw new HttpError(401, '用户不存在')
    req.user = rows[0]
    next()
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      next(new HttpError(401, '登录已失效'))
      return
    }
    next(err)
  }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || ''
  const tokenFromHeader = header.startsWith('Bearer ') ? header.slice(7) : null
  const token = tokenFromHeader || req.query.token || null
  if (!token) return next()
  jwt.verify(token, config.jwt.secret, async (err, payload) => {
    if (err) return next()
    try {
      const rows = await query(
        'SELECT id, student_no, display_name, avatar_char, role, rank_label, points, grade, class_name, school_name FROM users WHERE id = :id LIMIT 1',
        { id: payload.sub }
      )
      if (rows.length) req.user = rows[0]
    } catch {
      /* ignore */
    }
    next()
  })
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, '未登录'))
    if (!roles.includes(req.user.role)) return next(new HttpError(403, '无权限'))
    next()
  }
}

module.exports = { signToken, authRequired, optionalAuth, requireRole }
