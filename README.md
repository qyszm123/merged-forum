# 奇遇广场（Qiyu Square）

> **两论坛融合产物**：视觉风格沿用 **qyszm（奇遇社交论坛）**，工程架构采用 **kcsquare（科创广场）**。

## 融合说明

| 维度 | 来源 | 说明 |
|------|------|------|
| 视觉风格 / 主题 | **qyszm** | 8 套 CSS 变量主题（默认靛紫 `#667eea→#764ba2` 渐变）、三栏布局（左导航 / 中信息流 / 右栏）、卡片与按钮观感 |
| 前端工程 | **kcsquare 架构** | Vite + React（`frontend/`，`npm run dev` → :5173，`/api` 代理到后端） |
| 后端工程 | **kcsquare 架构** | Express + MySQL，分层清晰：`src/routes`、`src/services`、`src/db`、`src/middleware`、`src/config.js`，统一响应 `{ code, message, data }` |
| 功能模块 | **两论坛合一** | 社交论坛（发帖/板块/评论/点赞/私信）+ 科创广场（项目/点子/积分/修炼/人才/活动/后台），后端已包含全部路由 |

## 目录结构

```
merged-forum/
  frontend/        Vite + React 前端（qyszm 风格 UI）
  backend/         Express + MySQL 后端（kcsquare 架构，含 auth/forum/projects/ideas/train/points/makers/events/admin）
  deploy/          部署说明与脚本
  start-dev.bat    本地一键启动（Windows）
```

## 快速开始

### 1. 后端（需 MySQL）

```bash
cd backend
cp .env.example .env      # 按需修改 DB_*/JWT_SECRET
npm install
npm run db:prepare        # 建表 + 迁移
npm run db:prepare -- --seed   # 灌入广场/论坛/题库种子
npm run dev               # http://localhost:3100
```

测试账号（密码均 `123456`）：`2026001` / `2026002` / `2026003` / `teacher` / `admin`

### 2. 前端

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

或直接双击根目录 `start-dev.bat`。

## 已实现的融合骨架（本版）

- ✅ 登录 / 注册（kcsquare 账号体系，qyszm 风格界面）
- ✅ 板块列表 / 帖子信息流（最新·热门·待解答）/ 帖子详情（评论·点赞）
- ✅ 发布帖子（选板块 + 标题 + 内容 + 标签）
- ✅ 8 套主题切换、个人主页
- ✅ 右栏「融合模块」入口：项目 / 点子 / 积分 / 修炼 / 人才 / 活动（直连 kcsquare 后端模块）

## 后续可补（已在架构中预留）

- 私信 / 通知 / 好友（qyszm 特色，后端可接入 socket.io）
- 各融合模块的前端详情页与发布流程
- 公开用户主页接口、访客主页

## 技术栈

- 前端：Vite 5 · React 18 · React Router 6 · Axios
- 后端：Node.js · Express 4 · MySQL2 · JWT · Zod · Helmet · 限流
- 数据库：MySQL（UTF-8MB4）
