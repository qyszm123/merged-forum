# 科创广场 · 后端

Express + MySQL + Redis（可选）

## 启动

```bash
cd backend
cp .env.example .env   # Windows: copy .env.example .env
npm install
npm run db:init        # 需本机 MySQL 可连，账号见 .env
npm run dev            # http://localhost:3100
```

## 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/login` | 登录 `{ studentNo, password }` |
| POST | `/api/auth/register` | 注册 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/forum/boards` | 板块 |
| GET | `/api/forum/posts` | 帖子列表 `?board=&q=&page=` |
| GET | `/api/forum/posts/:id` | 帖子详情+评论 |
| POST | `/api/forum/posts` | 发帖 |
| POST | `/api/forum/posts/:id/comments` | 评论 |
| POST | `/api/forum/posts/:id/like` | 点赞切换 |
| GET | `/api/projects` | 项目列表 |

测试账号：`2026001` / `123456`

统一响应：`{ code: 0, message, data }`
