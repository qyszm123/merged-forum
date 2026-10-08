const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const config = require('./config')
const { errorHandler, notFound } = require('./middleware/error')
const { ok } = require('./utils/http')

const authRoutes = require('./routes/auth')
const forumRoutes = require('./routes/forum')
const projectRoutes = require('./routes/projects')
const ideaRoutes = require('./routes/ideas')
const pointsRoutes = require('./routes/points')
const trainRoutes = require('./routes/train')
const adminRoutes = require('./routes/admin')
const makersRoutes = require('./routes/makers')
const eventsRoutes = require('./routes/events')
const uploadsRoutes = require('./routes/uploads')
const bountyRoutes = require('./routes/bounty')
const recruitRoutes = require('./routes/recruit')
const careerRoutes = require('./routes/careers')
const badgesRoutes = require('./routes/badges')

const app = express()

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }))
app.use(
  cors({
    // 演示开放：任意来源；正式环境请改回 config.corsOrigin
    origin: config.env === 'production' ? config.corsOrigin : true,
    credentials: true
  })
)
app.use(express.json({ limit: '2mb' }))
app.use(morgan(config.env === 'development' ? 'dev' : 'combined'))

app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: config.env === 'development' ? 5000 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 429, message: '请求过于频繁', data: null }
  })
)

app.get('/api/health', (_req, res) => {
  ok(res, { service: 'kcsquare-backend', env: config.env, time: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/forum', forumRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/ideas', ideaRoutes)
app.use('/api/points', pointsRoutes)
app.use('/api/train', trainRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/makers', makersRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/uploads', uploadsRoutes)
app.use('/api/bounty', bountyRoutes)
app.use('/api/recruit', recruitRoutes)
app.use('/api/careers', careerRoutes)
app.use('/api/badges', badgesRoutes)

app.use(notFound)
app.use(errorHandler)

module.exports = app
