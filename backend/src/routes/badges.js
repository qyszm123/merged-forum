const { query } = require('../db/pool')
const { authRequired, optionalAuth } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')
const { checkAndAwardBadges } = require('../services/badges')

const router = require('express').Router()

function mapBadge(b) {
  return {
    id: b.id,
    name: b.name,
    description: b.description || '',
    icon: b.icon || '🏅',
    conditionType: b.condition_type,
    conditionValue: b.condition_value,
    isActive: !!b.is_active,
    createdAt: b.created_at
  }
}

/** GET /api/badges/all 所有可获得的勋章定义（公开，登录时附带获得状态） */
router.get(
  '/all',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (req.user) await checkAndAwardBadges(req.user.id).catch(() => {})

    const badges = await query(
      `SELECT id, name, description, icon, condition_type, condition_value, is_active, created_at
       FROM badges WHERE is_active = 1 ORDER BY id`
    )
    let mine = new Map()
    if (req.user) {
      const rows = await query(
        `SELECT badge_id, is_displayed, awarded_at FROM user_badges WHERE user_id = :uid`,
        { uid: req.user.id }
      )
      for (const r of rows) mine.set(r.badge_id, { isDisplayed: !!r.is_displayed, awardedAt: r.awarded_at })
    }
    ok(
      res,
      badges.map((b) => {
        const owned = mine.get(b.id)
        return {
          ...mapBadge(b),
          owned: !!owned,
          isDisplayed: owned ? owned.isDisplayed : false,
          awardedAt: owned ? owned.awardedAt : null
        }
      })
    )
  })
)

/** GET /api/badges/my 当前用户已获得勋章（含佩戴状态） */
router.get(
  '/my',
  authRequired,
  asyncHandler(async (req, res) => {
    await checkAndAwardBadges(req.user.id).catch(() => {})
    const rows = await query(
      `SELECT ub.badge_id, ub.awarded_at, ub.is_displayed,
              b.name, b.description, b.icon, b.condition_type, b.condition_value
       FROM user_badges ub
       JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = :uid
       ORDER BY ub.awarded_at DESC, ub.badge_id ASC`,
      { uid: req.user.id }
    )
    ok(res, {
      list: rows.map((r) => ({
        id: r.badge_id,
        name: r.name,
        description: r.description || '',
        icon: r.icon || '🏅',
        conditionType: r.condition_type,
        conditionValue: r.condition_value,
        isDisplayed: !!r.is_displayed,
        awardedAt: r.awarded_at
      }))
    })
  })
)

/** PUT /api/badges/:badgeId/toggle-display 切换佩戴状态（最多 3 枚） */
router.put(
  '/:badgeId/toggle-display',
  authRequired,
  asyncHandler(async (req, res) => {
    const badgeId = Number(req.params.badgeId)
    const rows = await query(
      `SELECT id, is_displayed FROM user_badges WHERE user_id = :uid AND badge_id = :bid`,
      { uid: req.user.id, bid: badgeId }
    )
    if (!rows.length) throw new HttpError(404, '尚未获得该勋章')

    const current = Number(rows[0].is_displayed || 0)
    const next = current === 0
    if (next) {
      const cnt = await query(
        `SELECT COUNT(*) AS c FROM user_badges WHERE user_id = :uid AND is_displayed = 1`,
        { uid: req.user.id }
      )
      if (Number(cnt[0]?.c || 0) >= 3) throw new HttpError(400, '最多同时佩戴 3 枚勋章')
    }
    await query(`UPDATE user_badges SET is_displayed = :v WHERE id = :id`, {
      v: next ? 1 : 0,
      id: rows[0].id
    })
    ok(res, { badgeId, isDisplayed: next }, next ? '已佩戴' : '已取消佩戴')
  })
)

module.exports = router
