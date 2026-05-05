import { Router } from "express";
import { row, run } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const reviewsRouter = Router();

reviewsRouter.post("/", requireAuth, (req, res) => {
  const userId = req.session.user!.userId;
  const spaceId = Number(req.body.spaceId);
  const rating = Number(req.body.rating);
  const content = String(req.body.content ?? "").trim();
  const visitDate = String(req.body.visitDate ?? "").trim();

  if (!spaceId || !rating || rating < 1 || rating > 5 || !content || !visitDate) {
    res.status(400).json({ message: "请完整填写评价信息" });
    return;
  }

  const space = row<{ SpaceID: number }>("SELECT SpaceID FROM Spaces WHERE SpaceID = :spaceId", { spaceId });
  if (!space) {
    res.status(404).json({ message: "没有找到对应空间" });
    return;
  }

  const result = run(`
    INSERT INTO Reviews (UserID, SpaceID, Rating, Content, VisitDate)
    VALUES (:userId, :spaceId, :rating, :content, :visitDate)
  `, { userId, spaceId, rating, content, visitDate });

  const review = row(`
    SELECT r.ReviewID, r.UserID, r.SpaceID, r.Rating, r.Content, r.VisitDate, u.Username
    FROM Reviews r
    JOIN Users u ON u.UserID = r.UserID
    WHERE r.ReviewID = :reviewId
  `, { reviewId: Number(result.lastInsertRowid) });

  res.status(201).json(review);
});

