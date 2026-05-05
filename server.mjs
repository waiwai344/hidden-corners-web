import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dbPath = path.join(__dirname, "data", "hidden-corners.sqlite");
const port = Number(process.env.PORT || 3001);
const sessions = new Map();

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");

function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
      })
  );
}

function currentUser(req) {
  const sid = parseCookies(req).sid;
  return sid ? sessions.get(sid) || null : null;
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    json(res, 401, { message: "请先登录后再继续" });
    return null;
  }
  return user;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("请求内容格式错误");
    error.statusCode = 400;
    throw error;
  }
}

function publicUser(user) {
  if (!user) return null;
  const { PasswordHash, ...rest } = user;
  return rest;
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(8).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, iterationText, salt, expectedHash] = String(storedHash).split("$");
  if (scheme !== "pbkdf2_sha256" || !iterationText || !salt || !expectedHash) return false;
  const actual = crypto
    .pbkdf2Sync(password, salt, Number(iterationText), Buffer.from(expectedHash, "hex").length, "sha256")
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedHash, "hex"));
}

function categoriesForSpace(spaceId) {
  return all(
    `SELECT c.CategoryID, c.CategoryName, c.CategoryDesc
     FROM SpaceCategories sc
     JOIN Categories c ON c.CategoryID = sc.CategoryID
     WHERE sc.SpaceID = ?
     ORDER BY c.CategoryID`,
    [spaceId]
  );
}

function decorateSpaces(spaces) {
  return spaces.map((space) => ({ ...space, Categories: categoriesForSpace(space.SpaceID) }));
}

function getSpaces(url) {
  const q = String(url.searchParams.get("q") || "").trim();
  const city = String(url.searchParams.get("city") || "").trim();
  const categoryId = Number(url.searchParams.get("categoryId") || 0);
  const where = [];
  const params = [];

  if (q) {
    const like = `%${q}%`;
    where.push(`(
      s.SpaceName LIKE ?
      OR s.City LIKE ?
      OR s.Description LIKE ?
      OR EXISTS (
        SELECT 1 FROM SpaceCategories scq
        JOIN Categories cq ON cq.CategoryID = scq.CategoryID
        WHERE scq.SpaceID = s.SpaceID AND cq.CategoryName LIKE ?
      )
    )`);
    params.push(like, like, like, like);
  }

  if (city) {
    where.push("s.City = ?");
    params.push(city);
  }

  if (categoryId) {
    where.push("EXISTS (SELECT 1 FROM SpaceCategories scc WHERE scc.SpaceID = s.SpaceID AND scc.CategoryID = ?)");
    params.push(categoryId);
  }

  return decorateSpaces(
    all(
      `SELECT s.SpaceID, s.SpaceName, s.City, s.Description, s.Address, s.Longitude, s.Latitude
       FROM Spaces s
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY s.SpaceID ASC`,
      params
    )
  );
}

function getSpaceDetail(req, spaceId) {
  const space = get("SELECT * FROM Spaces WHERE SpaceID = ?", [spaceId]);
  if (!space) return null;
  const score = get("SELECT ROUND(AVG(Rating), 1) AS AverageRating, COUNT(*) AS ReviewCount FROM Reviews WHERE SpaceID = ?", [spaceId]);
  const reviews = all(
    `SELECT r.ReviewID, r.Rating, r.Content, r.VisitDate, u.Username
     FROM Reviews r JOIN Users u ON u.UserID = r.UserID
     WHERE r.SpaceID = ?
     ORDER BY r.VisitDate DESC, r.ReviewID DESC`,
    [spaceId]
  );
  const activities = all("SELECT ActivityID, ActivityName, ActivityDate, PushLink FROM Activities WHERE SpaceID = ? ORDER BY ActivityDate DESC, ActivityID DESC", [spaceId]);
  const user = currentUser(req);
  const favorite = user ? get("SELECT ActionType, ActionDate FROM Favorites WHERE UserID = ? AND SpaceID = ?", [user.UserID, spaceId]) : null;
  return {
    ...space,
    Categories: categoriesForSpace(spaceId),
    AverageRating: score?.AverageRating ?? null,
    ReviewCount: score?.ReviewCount ?? 0,
    CurrentUserFavorite: favorite,
    Reviews: reviews,
    Activities: activities
  };
}

function getNomads(url) {
  const q = String(url.searchParams.get("q") || "").trim();
  const province = String(url.searchParams.get("province") || "").trim();
  const city = String(url.searchParams.get("city") || "").trim();
  const where = [];
  const params = [];

  if (q) {
    const like = `%${q}%`;
    where.push("(CommunityName LIKE ? OR Province LIKE ? OR City LIKE ? OR Description LIKE ?)");
    params.push(like, like, like, like);
  }
  if (province) {
    where.push("Province = ?");
    params.push(province);
  }
  if (city) {
    where.push("City = ?");
    params.push(city);
  }

  return all(
    `SELECT CommunityID, CommunityName, Province, City, Description, Capacity, MonthlyPrice
     FROM NomadCommunities
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY CommunityID ASC`,
    params
  );
}

function userFavorites(userId, actionType = "") {
  const params = [userId];
  const where = ["f.UserID = ?"];
  if (actionType) {
    where.push("f.ActionType = ?");
    params.push(actionType);
  }
  return all(
    `SELECT f.FavoriteID, f.ActionType, f.ActionDate, s.SpaceID, s.SpaceName, s.City, s.Address, s.Longitude, s.Latitude
     FROM Favorites f
     JOIN Spaces s ON s.SpaceID = f.SpaceID
     WHERE ${where.join(" AND ")}
     ORDER BY f.ActionDate DESC, f.FavoriteID DESC`,
    params
  ).map((item) => ({ ...item, Categories: categoriesForSpace(item.SpaceID) }));
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true, name: "hidden-corners-api" });
  if (req.method === "GET" && url.pathname === "/api/categories") return json(res, 200, all("SELECT * FROM Categories ORDER BY CategoryID ASC"));
  if (req.method === "GET" && url.pathname === "/api/spaces") return json(res, 200, getSpaces(url));
  if (req.method === "GET" && /^\/api\/spaces\/\d+$/.test(url.pathname)) {
    const detail = getSpaceDetail(req, Number(url.pathname.split("/").pop()));
    return detail ? json(res, 200, detail) : json(res, 404, { message: "没有找到对应空间" });
  }
  if (req.method === "GET" && url.pathname === "/api/nomads") return json(res, 200, getNomads(url));
  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const sessionUser = currentUser(req);
    if (!sessionUser) return json(res, 200, null);
    const user = get("SELECT * FROM Users WHERE UserID = ?", [sessionUser.UserID]);
    return json(res, 200, publicUser(user));
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) return json(res, 400, { message: "请输入用户名和密码" });
    const user = get("SELECT * FROM Users WHERE Username = ?", [username]);
    if (!user || !verifyPassword(password, user.PasswordHash)) return json(res, 401, { message: "用户名或密码错误" });
    const sid = crypto.randomBytes(20).toString("hex");
    sessions.set(sid, publicUser(user));
    res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly; Path=/; SameSite=Lax`);
    return json(res, 200, publicUser(user));
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");
    const gender = String(body.gender || "").trim();
    const birthDate = String(body.birthDate || "").trim();
    const homeCity = String(body.homeCity || "").trim();
    const userType = String(body.userType || "").trim();
    if (!username || !password || !confirmPassword || !gender || !birthDate || !homeCity || !userType) return json(res, 400, { message: "请完整填写注册信息" });
    if (password !== confirmPassword) return json(res, 400, { message: "两次输入的密码不一致" });
    if (password.length < 8) return json(res, 400, { message: "密码至少需要8位" });
    if (!["男", "女", "非二元"].includes(gender) || !["探索者", "创作者", "游民"].includes(userType)) return json(res, 400, { message: "请完整填写注册信息" });
    if (get("SELECT UserID FROM Users WHERE Username = ?", [username])) return json(res, 409, { message: "用户名已被使用" });
    const result = run(
      "INSERT INTO Users (Username, PasswordHash, Gender, BirthDate, HomeCity, UserType, RegisterDate) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [username, hashPassword(password), gender, birthDate, homeCity, userType, todayText()]
    );
    const user = publicUser(get("SELECT * FROM Users WHERE UserID = ?", [Number(result.lastInsertRowid)]));
    const sid = crypto.randomBytes(20).toString("hex");
    sessions.set(sid, user);
    res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly; Path=/; SameSite=Lax`);
    return json(res, 201, user);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const sid = parseCookies(req).sid;
    if (sid) sessions.delete(sid);
    res.setHeader("Set-Cookie", "sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/favorites") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const spaceId = Number(body.spaceId);
    const actionType = String(body.actionType || "");
    if (!spaceId || !["想去", "已打卡"].includes(actionType)) return json(res, 400, { message: "操作失败，请稍后重试" });
    run(
      `INSERT INTO Favorites (UserID, SpaceID, ActionType, ActionDate)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(UserID, SpaceID) DO UPDATE SET ActionType = excluded.ActionType, ActionDate = excluded.ActionDate`,
      [user.UserID, spaceId, actionType, todayText()]
    );
    return json(res, 200, get("SELECT FavoriteID, UserID, SpaceID, ActionType, ActionDate FROM Favorites WHERE UserID = ? AND SpaceID = ?", [user.UserID, spaceId]));
  }

  if (req.method === "POST" && url.pathname === "/api/reviews") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const spaceId = Number(body.spaceId);
    const rating = Number(body.rating);
    const content = String(body.content || "").trim();
    const visitDate = String(body.visitDate || "").trim();
    if (!spaceId || rating < 1 || rating > 5 || !content || !visitDate) return json(res, 400, { message: "请完整填写评价信息" });
    const result = run("INSERT INTO Reviews (UserID, SpaceID, Rating, Content, VisitDate) VALUES (?, ?, ?, ?, ?)", [user.UserID, spaceId, rating, content, visitDate]);
    return json(res, 201, get("SELECT * FROM Reviews WHERE ReviewID = ?", [Number(result.lastInsertRowid)]));
  }

  if (req.method === "GET" && url.pathname === "/api/me/favorites") {
    const user = requireUser(req, res);
    if (!user) return;
    return json(res, 200, userFavorites(user.UserID, String(url.searchParams.get("actionType") || "")));
  }

  if (req.method === "GET" && url.pathname === "/api/me/trail") {
    const user = requireUser(req, res);
    if (!user) return;
    return json(res, 200, userFavorites(user.UserID));
  }

  if (req.method === "GET" && url.pathname === "/api/me/reviews") {
    const user = requireUser(req, res);
    if (!user) return;
    return json(
      res,
      200,
      all(
        `SELECT r.ReviewID, r.Rating, r.Content, r.VisitDate, s.SpaceID, s.SpaceName, s.City
         FROM Reviews r JOIN Spaces s ON s.SpaceID = r.SpaceID
         WHERE r.UserID = ?
         ORDER BY r.VisitDate DESC, r.ReviewID DESC`,
        [user.UserID]
      )
    );
  }

  return json(res, 404, { message: "接口不存在" });
}

function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) return json(res, 403, { message: "Forbidden" });
  const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(publicDir, "index.html");
  const ext = path.extname(finalPath).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png"
  }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(finalPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(res, decodeURIComponent(url.pathname));
  } catch (error) {
    console.error(error);
    json(res, error.statusCode || 500, { message: error.statusCode ? error.message : "操作失败，请稍后重试" });
  }
});

server.listen(port, () => {
  console.log(`Hidden Corners running at http://localhost:${port}`);
});
