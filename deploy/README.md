# 部署（沿用 kcsquare 架构思路）

本目录承接 kcsquare 的部署方式：构建前端静态产物，由后端 / 反向代理统一对外。

## 本地生产构建

```bash
# 1) 构建前端
cd ../frontend
npm install
npm run build            # 产物在 frontend/dist/

# 2) 启动后端（已连 MySQL）
cd ../backend
npm install
npm run db:prepare -- --seed
npm run start            # http://localhost:3100
```

前端 `dist/` 为纯静态资源，可用以下任一方式对外：

- **由后端托管**：在 `backend/src/app.js` 末尾加 `app.use(express.static(path.resolve(__dirname,'../../frontend/dist')))` 与 SPA 兜底（`app.get('*', ...)` 返回 index.html）。
- **独立静态服务 / Nginx**：将 `frontend/dist/` 交由 Nginx 或 `npx serve` 托管，并把 `/api` 反向代理到 `:3100`。

## 远程部署（参考 kcsquare）

kcsquare 原 `deploy/` 提供了一组远程脚本（`remote-setup.sh` / `remote-mysql.sh` / `remote-full-test.sh` 等），用于：远程装依赖 → 建库 → 灌种子 → 冒烟。可原样迁移到本仓库后修改主机与路径变量复用。

## 冒烟测试

```bash
cd ../backend
npm run smoke:all        # 全链路冒烟
node scripts/smoke-by-role.js
```
