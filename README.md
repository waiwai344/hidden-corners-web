# 隐角 Hidden Corners Web

这是“隐角 Hidden Corners”数据库课程项目的网站版实现。

当前真实运行入口见 `当前开发状态.md`。

## 当前阶段

- 后端：Express + TypeScript + Node 内置 SQLite
- 数据：从 `数据库Excel版.xlsx` 导入到 `data/hidden-corners.sqlite`
- 前端：React + Vite + TypeScript，按 `静态UI预览.html` 的视觉实现第一版

## 启动

```bash
npm run db:import
npm run dev:server
npm run dev:client
```

开发模式地址：

- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:3001`

也可以在根目录运行：

```bash
npm run dev
```

第一批可验证接口：

- `GET /api/health`
- `GET /api/categories`
- `GET /api/spaces`
- `GET /api/spaces/:id`
- `GET /api/nomads`
- `POST /api/auth/login`
- `POST /api/favorites`
- `POST /api/reviews`

验证命令：

```bash
npm run typecheck
npm run build
```

测试账号示例：

- 用户名：`雪松与茶`
- 密码：`hc0001`
