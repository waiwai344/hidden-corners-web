import type { NextFunction, Request, Response } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    res.status(401).json({ message: "请先登录后再继续" });
    return;
  }

  next();
}

