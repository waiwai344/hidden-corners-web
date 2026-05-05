# Hidden Corners Deployment

This project deploys as one Node web service:

- Express serves `/api/*`
- Express also serves the built React app from `client/dist`
- SQLite is seeded from `data/hidden-corners.sqlite`

## Recommended Host: Render

Use a Render Web Service.

### Build Command

```bash
npm run render:build
```

### Start Command

```bash
npm start
```

### Environment Variables

Required:

```text
NODE_VERSION=24.14.1
SESSION_SECRET=<generate-a-long-random-secret>
```

Optional but recommended if you want new reviews, favorites, and user actions to persist after redeploys:

```text
DATABASE_PATH=/var/data/hidden-corners.sqlite
```

When using `DATABASE_PATH=/var/data/hidden-corners.sqlite`, add a Render disk:

```text
Mount Path: /var/data
Size: 1 GB
```

On first boot, if the disk database does not exist, the server copies the seed database from `data/hidden-corners.sqlite`.

## Free Deployment Note

If you skip the persistent disk, the site can still run, but SQLite writes may be lost when the service restarts or redeploys.

## Smoke Tests

After deploy, open:

```text
https://<your-render-service>.onrender.com/api/health
```

It should return:

```json
{"ok":true,"name":"hidden-corners-api"}
```

Then test the public app:

```text
https://<your-render-service>.onrender.com
```

Demo login:

```text
用户名：雪松与茶
密码：hc0001
```
