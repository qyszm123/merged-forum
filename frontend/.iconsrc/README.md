# .iconsrc —— 图标与设计系统的构建 / 校验工具

这里的脚本用于生成 `src/components/Icon.jsx` 并守住"图标与类名不脱节"。
它们只依赖本仓库已有的 `node_modules`（postcss 随 Vite 提供），不需要额外安装。

## 文件

| 文件 | 作用 |
|------|------|
| `icons.json` | Feather Icons v4.29.2 的官方数据（`feather-icons` 包的 `dist/icons.json`，MIT）。离线保留，保证图标可复现 |
| `generate.mjs` | 读取 `icons.json`，按 `WANTED` 里的清单生成 `src/components/Icon.jsx` |
| `check-icons.mjs` | 校验 JSX 里所有 `<Icon name="...">`、`icon: '...'` 以及 emoji 映射表引用的图标名都真实存在 |
| `check-coverage.mjs` | 校验 JSX 用到的每个 className 在 `styles.css` 里都有对应规则 |
| `check-css.mjs` | 用 postcss 真正解析 `styles.css`，抓语法错误与悬空声明 |
| `scan.mjs` | 扫描全站残留 emoji 与 className 清单，输出 `report.md` |
| `verify-dev.mjs` | 通过运行中的 Vite dev server 逐个拉取模块，验证能否正常转换（最接近运行时的检查） |
| `smoke-app.mjs` | 全链路冒烟：登录并调用各页面依赖的接口。可传入任意基地址（本地代理 / 隧道 / 公网后端） |
| `verify-site.mjs` | 部署后检查：验证 GitHub Pages 上的首页、资源、SPA 深链回退与后端连通性 |
| `deploy-pages.mjs` | 把 `dist/` 发布到 GitHub Pages |
| `push-main.mjs` | 在 `git push` 不通时，用 GitHub API 把本地 main 推上去 |

## 用法

```bash
cd frontend

npm run icons:build     # 重新生成 Icon.jsx（改了 WANTED 之后跑）
npm run icons:check     # 图标名 + CSS 类名 + CSS 语法 三项校验
npm run icons:scan      # 扫描残留 emoji（生成 .iconsrc/report.md）
npm run verify:dev      # 需先 npm run dev，验证所有模块可被 Vite 转换
npm run verify:api      # 需前后端都在运行，全链路接口冒烟
npm run verify:site     # 部署后检查线上站点
```

## 部署到 GitHub Pages

站点是纯静态托管，**没有后端**，所以构建时必须用 `VITE_API_BASE` 指定一个公网可达的
HTTPS 后端（GitHub Pages 是 HTTPS，HTTP 后端会被浏览器按混合内容拦截）。

```bash
cd frontend

# 1) 构建：子路径 + 独立后端地址
$env:VITE_BASE      = '/merged-forum/'
$env:VITE_API_BASE  = 'https://你的后端地址'
npm run build

# 2) 发布（脚本会自动生成 404.html 深链回退与 .nojekyll）
$env:GH_TOKEN = (gh auth token)
npm run deploy:pages
```

> **为什么不直接 `git push`**：这台机器到 `github.com:443` 的连接不稳定（时通时断），
> 而 `api.github.com` 稳定。`deploy-pages.mjs` 改用 Git Data API 建
> blob → tree → commit → ref，整次发布是一个原子提交，也不需要 `workflow` 权限。
>
> **注意**：`VITE_API_BASE` 是构建时写死的。后端换了地址就要重新构建并重新发布。

## 源码推送（`git push` 不通时）

```bash
node .iconsrc/push-main.mjs --dry-run   # 先看会推哪些文件
$env:GH_TOKEN = (gh auth token)
node .iconsrc/push-main.mjs             # 实际推送
```

API 推上去的 commit 与本地 HEAD 内容相同但 SHA 不同。网络恢复后执行
`git fetch origin && git reset --hard origin/main` 对齐即可（内容一致，不会丢改动）。



## 新增图标

1. 打开 `generate.mjs`，把图标名加到 `WANTED` 对应分组里（名字必须是
   [feathericons.com](https://feathericons.com) 上的名字，脚本会校验，写错会直接报错退出）。
2. 运行 `npm run icons:build`，然后 `npm run icons:check`。
3. 用法：`<Icon name="search" size={16} />`，可选 `strokeWidth`、`className`、`title`。

## 两个容易踩的坑

- **不要用 PowerShell 的 `Get-Content` / `Set-Content` 批量改 `src/` 下的文件。**
  PowerShell 在中文 Windows 上默认按 GBK 读写，会把 UTF-8 的中文变成乱码（本项目实测踩过一次）。
  需要批量替换时用 Node 脚本，`fs.readFileSync(f, 'utf8')` + `writeFileSync(f, s)`。

- **JSX 里 `<Icon />` 后面换行接文字，空格会被 JSX 编译器删掉。**
  写成同一行（`<Icon name="x" /> 文字`），或把父容器设成 `display: flex; gap: …`。
