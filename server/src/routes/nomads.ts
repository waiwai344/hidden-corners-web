import { Router } from "express";
import type { SQLInputValue } from "node:sqlite";
import { rows } from "../db.js";

export const nomadsRouter = Router();

nomadsRouter.get("/", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const province = String(req.query.province ?? "").trim();
  const city = String(req.query.city ?? "").trim();
  const where: string[] = [];
  const params: Record<string, SQLInputValue> = {};

  if (q) {
    params.q = `%${q}%`;
    where.push(`(
      CommunityName LIKE :q
      OR Province LIKE :q
      OR City LIKE :q
      OR Description LIKE :q
    )`);
  }

  if (province) {
    params.province = province;
    where.push("Province = :province");
  }

  if (city) {
    params.city = city;
    where.push("City = :city");
  }

  const communities = rows(`
    SELECT CommunityID, CommunityName, Province, City, Description, Capacity, MonthlyPrice
    FROM NomadCommunities
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY CommunityID ASC
  `, params);

  res.json(communities);
});
