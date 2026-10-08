# 奇遇广场（Qiyu Square）

校园科创社区：社交论坛 + 项目协作 + 积分激励 + 成长认证。

## 目录结构

```
merged-forum/
  frontend/        Vite + React 前端
  backend/         Express + MySQL 后端
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

## 已实现功能

- ✅ 登录 / 注册
- ✅ 板块列表 / 帖子信息流（最新·热门·待解答）/ 帖子详情（评论·点赞）
- ✅ 发布帖子（选板块 + 标题 + 内容 + 标签）
- ✅ 8 套主题切换、个人主页
- ✅ 右栏模块入口：项目 / 点子 / 积分 / 修炼 / 人才 / 活动

## 后续可补

- 私信 / 通知 / 好友
- 各模块的前端详情页与发布流程
- 公开用户主页接口、访客主页

## 技术栈

- 前端：Vite 5 · React 18 · React Router 6 · Axios
- 后端：Node.js · Express 4 · MySQL2 · JWT · Zod · Helmet · 限流
- 数据库：MySQL（UTF-8MB4）
