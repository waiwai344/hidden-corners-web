import { Router } from "express";
import { hashPassword, verifyPassword } from "../crypto.js";
import { todayText } from "../dates.js";
import { row, run } from "../db.js";

type UserRecord = {
  UserID: number;
  Username: string;
  PasswordHash: string;
  Gender: string;
  BirthDate: string;
  HomeCity: string;
  UserType: string;
  RegisterDate: string;
};

export const authRouter = Router();

function publicUser(user: UserRecord) {
  return {
    UserID: user.UserID,
    Username: user.Username,
    Gender: user.Gender,
    BirthDate: user.BirthDate,
    HomeCity: user.HomeCity,
    UserType: user.UserType,
    RegisterDate: user.RegisterDate
  };
}

authRouter.get("/me", (req, res) => {
  if (!req.session.user) {
    res.json(null);
    return;
  }

  const user = row<UserRecord>(`
    SELECT UserID, Username, PasswordHash, Gender, BirthDate, HomeCity, UserType, RegisterDate
    FROM Users
    WHERE UserID = :userId
  `, { userId: req.session.user.userId });

  res.json(user ? publicUser(user) : null);
});

authRouter.post("/login", (req, res) => {
  const username = String(req.body.username ?? "").trim();
  const password = String(req.body.password ?? "");

  if (!username || !password) {
    res.status(400).json({ message: "请输入用户名和密码" });
    return;
  }

  const user = row<UserRecord>(`
    SELECT UserID, Username, PasswordHash, Gender, BirthDate, HomeCity, UserType, RegisterDate
    FROM Users
    WHERE Username = :username
  `, { username });

  if (!user || !verifyPassword(password, user.PasswordHash)) {
    res.status(401).json({ message: "用户名或密码错误" });
    return;
  }

  req.session.user = { userId: user.UserID, username: user.Username };
  res.json(publicUser(user));
});

authRouter.post("/register", (req, res) => {
  const username = String(req.body.username ?? "").trim();
  const password = String(req.body.password ?? "");
  const confirmPassword = String(req.body.confirmPassword ?? "");
  const gender = String(req.body.gender ?? "").trim();
  const birthDate = String(req.body.birthDate ?? "").trim();
  const homeCity = String(req.body.homeCity ?? "").trim();
  const userType = String(req.body.userType ?? "").trim();

  if (!username || !password || !confirmPassword || !gender || !birthDate || !homeCity || !userType) {
    res.status(400).json({ message: "请完整填写注册信息" });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ message: "两次输入的密码不一致" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ message: "密码至少需要8位" });
    return;
  }

  const exists = row<{ UserID: number }>("SELECT UserID FROM Users WHERE Username = :username", { username });
  if (exists) {
    res.status(409).json({ message: "用户名已被使用" });
    return;
  }

  const result = run(`
    INSERT INTO Users (Username, PasswordHash, Gender, BirthDate, HomeCity, UserType, RegisterDate)
    VALUES (:username, :passwordHash, :gender, :birthDate, :homeCity, :userType, :registerDate)
  `, {
    username,
    passwordHash: hashPassword(password),
    gender,
    birthDate,
    homeCity,
    userType,
    registerDate: todayText()
  });

  const user = row<UserRecord>(`
    SELECT UserID, Username, PasswordHash, Gender, BirthDate, HomeCity, UserType, RegisterDate
    FROM Users
    WHERE UserID = :userId
  `, { userId: Number(result.lastInsertRowid) });

  if (!user) {
    res.status(500).json({ message: "操作失败，请稍后重试" });
    return;
  }

  req.session.user = { userId: user.UserID, username: user.Username };
  res.status(201).json(publicUser(user));
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

