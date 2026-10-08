/**
 * 教师副本收费准入
 * 官方主线免费；教师课可启用收费，并可选择本校免费或本校同样付费。
 */
const { query } = require('../db/pool')
const { getSetting } = require('../utils/settings')
const courseCatalog = require('./courseCatalog')
const { HttpError } = require('../utils/http')

/** 演示：1 元 ≈ 10✦（真实支付后续再接） */
const POINTS_PER_YUAN = 10

function normSchool(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '')
}

async function homeSchoolName() {
  const home = await getSetting('home_school', { name: '示范中学' })
  return normSchool(home?.name) || '示范中学'
}

function pricingOf(row) {
  return {
    pricingEnabled: !!Number(row.pricing_enabled || 0),
    freeForSchool: row.free_for_school == null ? true : !!Number(row.free_for_school),
    externalFeeYuan: Math.max(0, Number(row.external_fee_yuan || 0)),
    ownerSchool: String(row.owner_school || '').trim()
  }
}

async function findEnrollment(pathId, userId) {
  try {
    const rows = await query(
      `SELECT * FROM course_enrollments WHERE path_id = :pathId AND user_id = :uid LIMIT 1`,
      { pathId, uid: userId }
    )
    return rows[0] || null
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return null
    throw err
  }
}

/**
 * @returns access info for a path
 */
async function getCourseAccess(user, pathId) {
  const official = courseCatalog.PATHS.find((p) => p.id === pathId)
  if (official || !String(pathId || '').startsWith('c_')) {
    // 官方主线（非 c_ 前缀也视为免费主线）
    const isCourse = String(pathId || '').startsWith('c_')
    if (!isCourse) {
      return {
        pathId,
        free: true,
        needPay: false,
        reason: 'official',
        message: '官方主线免费',
        feeYuan: 0,
        pointsCost: 0,
        pricingEnabled: false,
        freeForSchool: true,
        sameSchool: true,
        enrolled: false,
        ownerSchool: '',
        homeSchool: await homeSchoolName()
      }
    }
  }

  const row = await courseCatalog.findCourseRow(pathId, { includeDraft: true })
  if (!row) {
    return {
      pathId,
      free: true,
      needPay: false,
      reason: 'unknown',
      message: '未找到教师课程，按免费处理',
      feeYuan: 0,
      pointsCost: 0,
      pricingEnabled: false,
      freeForSchool: true,
      sameSchool: true,
      enrolled: false
    }
  }

  const pricing = pricingOf(row)
  const home = await homeSchoolName()
  const courseSchool = normSchool(pricing.ownerSchool) || home
  const userSchool = normSchool(user.school_name) || home
  const sameSchool = userSchool === courseSchool
  const isOwner = Number(row.owner_user_id) === Number(user.id)
  const isStaff = user.role === 'admin' || user.role === 'teacher'

  if (isOwner || isStaff) {
    return {
      pathId,
      free: true,
      needPay: false,
      reason: isOwner ? 'owner' : 'staff',
      message: isOwner ? '你是课程创建者，可免费进入' : '教师/管理员可免费进入',
      feeYuan: pricing.externalFeeYuan,
      pointsCost: pricing.externalFeeYuan * POINTS_PER_YUAN,
      ...pricing,
      ownerSchool: courseSchool,
      homeSchool: home,
      sameSchool,
      enrolled: true
    }
  }

  if (!pricing.pricingEnabled) {
    return {
      pathId,
      free: true,
      needPay: false,
      reason: 'pricing_off',
      message: '本课未启用收费',
      feeYuan: 0,
      pointsCost: 0,
      ...pricing,
      ownerSchool: courseSchool,
      homeSchool: home,
      sameSchool,
      enrolled: false
    }
  }

  const enroll = await findEnrollment(pathId, user.id)
  if (enroll && (enroll.status === 'paid' || enroll.status === 'free')) {
    return {
      pathId,
      free: true,
      needPay: false,
      reason: 'enrolled',
      message: enroll.status === 'paid' ? '已付费开通' : '已免费开通',
      feeYuan: pricing.externalFeeYuan,
      pointsCost: 0,
      ...pricing,
      ownerSchool: courseSchool,
      homeSchool: home,
      sameSchool,
      enrolled: true,
      enrollmentStatus: enroll.status
    }
  }

  if (pricing.freeForSchool && sameSchool) {
    return {
      pathId,
      free: true,
      needPay: false,
      reason: 'school_free',
      message: `本校（${courseSchool}）学生免费`,
      feeYuan: 0,
      pointsCost: 0,
      ...pricing,
      ownerSchool: courseSchool,
      homeSchool: home,
      sameSchool: true,
      enrolled: false
    }
  }

  const fee = Math.max(0, pricing.externalFeeYuan)
  const who = sameSchool ? '本校学生' : '校外学生'
  return {
    pathId,
    free: fee <= 0,
    needPay: fee > 0,
    reason: fee > 0 ? (sameSchool ? 'school_pay' : 'external_pay') : 'external_zero',
    message:
      fee > 0
        ? `${who}需支付 ${fee} 元/学期（约 ${fee * POINTS_PER_YUAN}✦）`
        : '学期价格为 0，可直接进入',
    feeYuan: fee,
    pointsCost: fee * POINTS_PER_YUAN,
    ...pricing,
    ownerSchool: courseSchool,
    homeSchool: home,
    sameSchool,
    enrolled: false
  }
}

async function assertCourseAccess(user, pathId) {
  const access = await getCourseAccess(user, pathId)
  if (access.free || !access.needPay) return access
  throw new HttpError(402, access.message || '请先完成课程付费开通', access)
}

module.exports = {
  POINTS_PER_YUAN,
  pricingOf,
  homeSchoolName,
  getCourseAccess,
  assertCourseAccess,
  findEnrollment
}
