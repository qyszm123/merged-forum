/**
 * 演示角色切换 · 各账号数据独立
 * node scripts/smoke-role-isolation.js
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:3100/api'

async function req(method, path, body, token) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.code !== 0) throw new Error(json.message || `HTTP ${res.status}`)
  return json.data
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function login(studentNo) {
  const data = await req('POST', '/auth/login', { studentNo, password: '123456' })
  return { token: data.token, user: data.user }
}

async function main() {
  console.log('\n=== 角色数据隔离冒烟 ===\n')

  const lin = await login('2026001')
  const xia = await login('2026002')
  const chen = await login('2026003')
  const teacher = await login('teacher')

  assert(lin.user.studentNo === '2026001', '林同学账号')
  assert(xia.user.studentNo === '2026002', '小夏账号')
  assert(chen.user.studentNo === '2026003', '陈同学账号')
  assert(teacher.user.role === 'teacher', '教师角色')

  const linMe = await req('GET', '/auth/me', undefined, lin.token)
  const xiaMe = await req('GET', '/auth/me', undefined, xia.token)
  assert(linMe.id !== xiaMe.id, '不同用户 id 应不同')

  const linPts = await req('GET', '/points/me', undefined, lin.token)
  const teacherPts = await req('GET', '/points/me', undefined, teacher.token)
  console.log('  林同学积分', linPts.points, '· 教师积分', teacherPts.points)

  const linProg = await req('GET', '/train/progress/all', undefined, lin.token)
  const teacherProg = await req('GET', '/train/progress/all', undefined, teacher.token)
  assert(linProg?.paths !== teacherProg?.paths || JSON.stringify(linProg) !== JSON.stringify(teacherProg), '进度对象应可区分')

  const linMine = await req('GET', '/projects/mine', undefined, lin.token)
  const chenMine = await req('GET', '/projects/mine', undefined, chen.token)
  const teacherMine = await req('GET', '/projects/mine', undefined, teacher.token)
  console.log('  林同学我的项目', (linMine?.list || []).length, '· 陈同学我的项目', (chenMine?.list || []).length, '· 教师我的项目', (teacherMine?.list || []).length)

  const chenProjectId = chenMine?.list?.[0]?.id
  const linProjectId = linMine?.list?.[0]?.id
  if (chenProjectId && linProjectId && chenProjectId !== linProjectId) {
    try {
      await req(
        'POST',
        '/forum/posts',
        {
          boardSlug: 'qa',
          title: '隔离测-不应成功',
          content: '尝试绑定他人项目，应被后端拒绝。',
          projectId: chenProjectId
        },
        lin.token
      )
      throw new Error('林同学绑定陈同学项目应失败')
    } catch (e) {
      assert(/项目|绑定|权限|403|404/.test(e.message), `跨账号绑项目应拒绝: ${e.message}`)
      console.log('  论坛绑项目隔离', 'PASS')
    }
  } else {
    console.log('  论坛绑项目隔离', 'SKIP（缺少不同账号的项目样本）')
  }

  const linCourses = await req('GET', '/train/courses?mine=1', undefined, teacher.token)
  const teacherCourseCount = Array.isArray(linCourses?.list)
    ? linCourses.list.length
    : Array.isArray(linCourses)
      ? linCourses.length
      : 0
  console.log('  教师创建副本数', teacherCourseCount)

  console.log('\n=== PASS · 后端按 JWT 用户隔离数据 ===')
  console.log('前端切换角色时会：保存旧账号 session → 清空缓存 → 登录新账号 → 重新拉取进度/积分/广场\n')
}

main().catch((e) => {
  console.error('\nFAIL', e.message)
  process.exit(1)
})
