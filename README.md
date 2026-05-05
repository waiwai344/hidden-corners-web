# 隐角 Hidden Corners Web

“隐角 Hidden Corners”是一个面向青年文化替代性第三空间的图鉴系统，收录独立书店、艺术空间、音乐现场、数字游民社区等城市空间，并通过地图、图鉴、游牧、评价与个人探索档案，呈现这些空间在城市中的分布与连接。

## 线上访问

- 网站：https://hidden-corners.top
- 备用域名：https://www.hidden-corners.top
- API 健康检查：https://hidden-corners.top/api/health

## 功能概览

- 地图页：基于中国地图展示空间坐标点，支持缩放、悬停预览、点击进入详情
- 图鉴页：浏览 100+ 个替代性第三空间，支持分类筛选
- 游牧页：展示数字游民相关空间与社区信息
- 详情页：展示空间名称、城市、分类、介绍、评价等完整档案
- 用户系统：支持登录、退出登录、想去、已打卡、添加评价
- 我的页面：展示个人探索记录，以及想去/已打卡空间在地图上的分布
- 网站介绍模块：介绍项目理念、设计背景与功能探索方式

## 技术栈

前端：

- React
- Vite
- TypeScript
- ECharts
- React Router

后端：

- Node.js
- Express
- TypeScript
- SQLite（Node 内置 `node:sqlite`）
- express-session
- bcryptjs

部署：

- 阿里云 ECS Ubuntu 22.04
- Nginx 反向代理
- PM2 进程管理
- SQLite 文件持久化

## 本地开发

要求：

```bash
node >= 24
npm >= 11
```

安装依赖：

```bash
npm run install:all
```

启动开发环境：

```bash
npm run dev
```

开发地址：

```text
前端：http://localhost:5173
后端：http://localhost:3001
```

也可以分别启动：

```bash
npm run dev:server
npm run dev:client
```

## 数据库

项目使用 SQLite 数据库：

```text
data/hidden-corners.sqlite
```

如果需要从 Excel 重新导入数据：

```bash
npm run db:import
```

## 常用命令

类型检查：

```bash
npm run typecheck
```

生产构建：

```bash
npm run build
```

生产启动：

```bash
npm start
```

服务器部署构建命令：

```bash
npm run render:build
```

## API 示例

```text
GET  /api/health
GET  /api/categories
GET  /api/spaces
GET  /api/spaces/:id
GET  /api/nomads
POST /api/auth/login
POST /api/favorites
POST /api/reviews
```

## 测试账号

```text
用户名：雪松与茶
密码：hc0001
```

## 生产环境说明

生产环境由 Express 同时提供 API 和前端静态资源：

- `/api/*` 由后端接口处理
- 其他路径返回 React 构建后的页面

线上数据库使用持久化路径：

```text
/var/data/hidden-corners.sqlite
```

这样用户评价、想去、已打卡等交互数据可以在服务重启后保留。

## 项目状态

当前版本已经完成主要前后端功能，并部署到阿里云 ECS。后续计划包括：

- 继续完善空间数据与图像内容
- 优化移动端体验
- 增加更细致的用户探索档案
