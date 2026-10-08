/**
 * 试点库一键准备：init + 全部 migrate + 可选种子
 * npm run db:prepare
 * npm run db:prepare -- --seed
 */
const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const seed = process.argv.includes('--seed')
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const npmSteps = [
  'db:init',
  'db:migrate-forum',
  'db:migrate-ideas',
  'db:migrate-train',
  'db:migrate-courses',
  'db:migrate-uploads',
  'db:migrate-join',
  'db:migrate-idea-join',
  'db:migrate-work-teacher-grade',
  'db:migrate-idea-team-offers',
  'db:migrate-recruit-invites',
  'db:migrate-course-pricing',
  'db:migrate-course-identity',
  'db:migrate-course-create-modes'
]

const nodeSteps = seed
  ? [
      ['db:seed-plaza', [npmCmd, ['run', 'db:seed-plaza']]],
      ['db:seed-forum', [npmCmd, ['run', 'db:seed-forum']]],
      ['seed-pbl-banks', [process.execPath, ['scripts/seed-pbl-banks.js', '--force']]]
    ]
  : []

function run(label, cmd, args) {
  console.log(`\n=== ${label} ===`)
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (r.status !== 0) {
    console.error(`[db:prepare] 失败: ${label}`)
    process.exit(r.status || 1)
  }
}

console.log('[db:prepare] 科创广场试点数据库准备' + (seed ? '（含种子）' : ''))
for (const label of npmSteps) {
  run(label, npmCmd, ['run', label])
}
for (const [label, [cmd, args]] of nodeSteps) {
  run(label, cmd, args)
}
console.log('\n[db:prepare] 完成')
