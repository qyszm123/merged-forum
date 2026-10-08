#!/bin/bash
set -e
echo "=== node ==="
which node
node -v || true
ls /root/.nvm/versions/node 2>/dev/null || true
echo "=== pm2 ==="
pm2 jlist 2>/dev/null | head -c 2000 || true
echo
echo "=== env db ==="
grep -E '^(DB_|MYSQL|PORT)' /www/wwwroot/kcsquare/backend/.env | sed 's/PASSWORD=.*/PASSWORD=***/'
echo "=== sql via docker/mysql ==="
cd /www/wwwroot/kcsquare/backend
# Prefer nvm node 20+
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null 2>&1 || nvm use 20 >/dev/null 2>&1 || true
node -v
node -e '
require("dotenv").config();
const mysql = require("mysql2/promise");
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "kcsquare"
  });
  const [ideas] = await conn.query("SELECT id,title,status,delivered_project_id,owner_id,commission_price FROM ideas ORDER BY id DESC LIMIT 15");
  const [offers] = await conn.query("SELECT id,idea_id,status,points,owner_id,acceptor_id,project_id FROM idea_team_offers ORDER BY id DESC LIMIT 15");
  const [projects] = await conn.query("SELECT id,title,owner_id,status FROM projects ORDER BY id DESC LIMIT 12");
  console.log("IDEAS", JSON.stringify(ideas, null, 2));
  console.log("OFFERS", JSON.stringify(offers, null, 2));
  console.log("PROJECTS", JSON.stringify(projects, null, 2));
  await conn.end();
})().catch((e) => { console.error(e); process.exit(1); });
'
