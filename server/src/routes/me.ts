import { Router } from "express";
import type { SQLInputValue } from "node:sqlite";
import { rows } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const meRouter = Router();

const favoriteSelect = `
  SELECT
    f.FavoriteID,
    f.ActionType,
    f.ActionDate,
    s.SpaceID,
    s.SpaceName,
    s.City,
    s.Address,
    s.Longitude,
    s.Latitude,
    COALESCE(
      json_group_array(
        CASE
          WHEN c.CategoryID IS NULL THEN NULL
          ELSE json_object('CategoryID', c.CategoryID, 'CategoryName', c.CategoryName)
        END
      ) FILTER (WHERE c.CategoryID IS NOT NULL),
      json('[]')
    ) AS Categories
  FROM Favorites f
  JOIN Spaces s ON s.SpaceID = f.SpaceID
  LEFT JOIN SpaceCategories sc ON sc.SpaceID = s.SpaceID
  LEFT JOIN Categories c ON c.CategoryID = sc.CategoryID
`;

function parseCategories<T extends { Categories: string }>(item: T) {
  return { ...item, Categories: JSON.parse(item.Categories) };
}

meRouter.get("/favorites", requireAuth, (req, res) => {
  const actionType = String(req.query.actionType ?? "").trim();
  const params: Record<string, SQLInputValue> = { userId: req.session.user!.userId };
  const where = ["f.UserID = :userId"];

  if (actionType) {
    params.actionType = actionType;
    where.push("f.ActionType = :actionType");
  }

  const favorites = rows<{ Categories: string }>(`
    ${favoriteSelect}
    WHERE ${where.join(" AND ")}
    GROUP BY f.FavoriteID
    ORDER BY f.ActionDate DESC, f.FavoriteID DESC
  `, params).map(parseCategories);

  res.json(favorites);
});

meRouter.get("/reviews", requireAuth, (req, res) => {
  const reviews = rows(`
    SELECT r.ReviewID, r.Rating, r.Content, r.VisitDate, s.SpaceID, s.SpaceName, s.City
    FROM Reviews r
    JOIN Spaces s ON s.SpaceID = r.SpaceID
    WHERE r.UserID = :userId
    ORDER BY r.VisitDate DESC, r.ReviewID DESC
  `, { userId: req.session.user!.userId });

  res.json(reviews);
});

meRouter.get("/trail", requireAuth, (req, res) => {
  const trail = rows<{ Categories: string }>(`
    ${favoriteSelect}
    WHERE f.UserID = :userId
    GROUP BY f.FavoriteID
    ORDER BY f.ActionDate DESC, f.FavoriteID DESC
  `, { userId: req.session.user!.userId }).map(parseCategories);

  res.json(trail);
});
