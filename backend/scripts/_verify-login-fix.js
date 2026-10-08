const fs = require('fs')
const live = fs.readFileSync('d:/speechnote/kcsquare/frontend/public/kcs-live.js', 'utf8')
const html = fs.readFileSync('d:/speechnote/kcsquare/index.html', 'utf8')
const proto = fs.readFileSync('d:/speechnote/kcsquare/prototype.js', 'utf8')
console.log('has dungeon go', live.includes("identity-select' : 'dungeon'"))
console.log('pilot2', html.includes('pilot2'))
const adminBlock = proto.slice(proto.indexOf('ADMIN_VIEWS'), proto.indexOf('COURSE_STAFF_VIEWS'))
console.log('school-forced still in ADMIN_VIEWS', adminBlock.includes('school-forced'))
;(async () => {
  const login = await (
    await fetch('http://127.0.0.1:3100/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentNo: '2026001', password: '123456' })
    })
  ).json()
  const me = await (
    await fetch('http://127.0.0.1:3100/api/auth/me', {
      headers: { Authorization: 'Bearer ' + login.data.token }
    })
  ).json()
  console.log('schoolForce.enabled', me.data.schoolForce.enabled)
})()
