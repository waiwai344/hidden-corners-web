import { Router } from "express";
import type { SQLInputValue } from "node:sqlite";
import { row, rows } from "../db.js";

export const spacesRouter = Router();

const spaceListSelect = `
  SELECT
    s.SpaceID,
    s.SpaceName,
    s.City,
    s.Address,
    s.Description,
    s.Longitude,
    s.Latitude,
    COALESCE(
      json_group_array(
        CASE
          WHEN c.CategoryID IS NULL THEN NULL
          ELSE json_object(
            'CategoryID', c.CategoryID,
            'CategoryName', c.CategoryName,
            'CategoryDesc', c.CategoryDesc
          )
        END
      ) FILTER (WHERE c.CategoryID IS NOT NULL),
      json('[]')
    ) AS Categories
  FROM Spaces s
  LEFT JOIN SpaceCategories sc ON sc.SpaceID = s.SpaceID
  LEFT JOIN Categories c ON c.CategoryID = sc.CategoryID
`;

function parseCategories<T extends { Categories: string }>(space: T) {
  return {
    ...space,
    Categories: JSON.parse(space.Categories)
  };
}

spacesRouter.get("/", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const city = String(req.query.city ?? "").trim();
  const categoryId = Number(req.query.categoryId || 0);
  const where: string[] = [];
  const params: Record<string, SQLInputValue> = {};

  if (q) {
    params.q = `%${q}%`;
    where.push(`(
      s.SpaceName LIKE :q
      OR s.City LIKE :q
      OR s.Description LIKE :q
      OR EXISTS (
        SELECT 1
        FROM SpaceCategories scq
        JOIN Categories cq ON cq.CategoryID = scq.CategoryID
        WHERE scq.SpaceID = s.SpaceID AND cq.CategoryName LIKE :q
      )
    )`);
  }

  if (city) {
    params.city = city;
    where.push("s.City = :city");
  }

  if (categoryId > 0) {
    params.categoryId = categoryId;
    where.push(`EXISTS (
      SELECT 1 FROM SpaceCategories scc
      WHERE scc.SpaceID = s.SpaceID AND scc.CategoryID = :categoryId
    )`);
  }

  const spaces = rows<{ Categories: string }>(`
    ${spaceListSelect}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY s.SpaceID
    ORDER BY s.SpaceID ASC
  `, params).map(parseCategories);

  res.json(spaces);
});

spacesRouter.get("/:id", (req, res) => {
  const spaceId = Number(req.params.id);
  const space = row<{ Categories: string }>(`
    ${spaceListSelect}
    WHERE s.SpaceID = :spaceId
    GROUP BY s.SpaceID
  `, { spaceId });

  if (!space) {
    res.status(404).json({ message: "没有找到对应空间" });
    return;
  }

  const average = row<{ AverageRating: number | null; ReviewCount: number }>(`
    SELECT ROUND(AVG(Rating), 1) AS AverageRating, COUNT(*) AS ReviewCount
    FROM Reviews
    WHERE SpaceID = :spaceId
  `, { spaceId });

  const reviews = rows(`
    SELECT r.ReviewID, r.Rating, r.Content, r.VisitDate, u.Username
    FROM Reviews r
    JOIN Users u ON u.UserID = r.UserID
    WHERE r.SpaceID = :spaceId
    ORDER BY r.VisitDate DESC, r.ReviewID DESC
  `, { spaceId });

  const activities = rows(`
    SELECT ActivityID, ActivityName, ActivityDate, PushLink
    FROM Activities
    WHERE SpaceID = :spaceId
    ORDER BY ActivityDate DESC, ActivityID DESC
  `, { spaceId });

  const currentUserId = req.session.user?.userId;
  const favorite = currentUserId
    ? row(`
        SELECT ActionType, ActionDate
        FROM Favorites
        WHERE UserID = :userId AND SpaceID = :spaceId
      `, { userId: currentUserId, spaceId })
    : null;

  res.json({
    ...parseCategories(space),
    AverageRating: average?.AverageRating ?? null,
    ReviewCount: average?.ReviewCount ?? 0,
    CurrentUserFavorite: favorite,
    Reviews: reviews,
    Activities: activities
  });
});
