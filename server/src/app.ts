import express from "express";
import session from "express-session";
import fs from "node:fs";
import path from "node:path";
import "./types.js";
import { projectRoot } from "./paths.js";
import { authRouter } from "./routes/auth.js";
import { categoriesRouter } from "./routes/categories.js";
import { favoritesRouter } from "./routes/favorites.js";
import { meRouter } from "./routes/me.js";
import { nomadsRouter } from "./routes/nomads.js";
import { reviewsRouter } from "./routes/reviews.js";
import { spacesRouter } from "./routes/spaces.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET ?? "hidden-corners-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax"
  }
}));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "hidden-corners-api" });
});

app.use("/api/auth", authRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/spaces", spacesRouter);
app.use("/api/nomads", nomadsRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/me", meRouter);

const clientDist = path.join(projectRoot, "client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Hidden Corners API running at http://localhost:${port}`);
});
