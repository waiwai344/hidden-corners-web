import { Router } from "express";
import { todayText } from "../dates.js";
import { row, run } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const favoritesRouter = Router();

favoritesRouter.post("/", requireAuth, (req, res) => {
  const userId = req.session.user!.userId;
  const spaceId = Number(req.body.spaceId);
  const actionType = String(req.body.actionType ?? "").trim();

  if (!spaceId || !["想去", "已打卡"].includes(actionType)) {
    res.status(400).json({ message: "操作失败，请稍后重试" });
    return;
  }

  const space = row<{ SpaceID: number }>("SELECT SpaceID FROM Spaces WHERE SpaceID = :spaceId", { spaceId });
  if (!space) {
    res.status(404).json({ message: "没有找到对应空间" });
    return;
  }

  run(`
    INSERT INTO Favorites (UserID, SpaceID, ActionType, ActionDate)
    VALUES (:userId, :spaceId, :actionType, :actionDate)
    ON CONFLICT(UserID, SpaceID) DO UPDATE SET
      ActionType = excluded.ActionType,
      ActionDate = excluded.ActionDate
  `, {
    userId,
    spaceId,
    actionType,
    actionDate: todayText()
  });

  const favorite = row(`
    SELECT FavoriteID, UserID, SpaceID, ActionType, ActionDate
    FROM Favorites
    WHERE UserID = :userId AND SpaceID = :spaceId
  `, { userId, spaceId });

  res.json(favorite);
});

