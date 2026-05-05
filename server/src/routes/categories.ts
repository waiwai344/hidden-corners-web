import { Router } from "express";
import { rows } from "../db.js";

export const categoriesRouter = Router();

categoriesRouter.get("/", (_req, res) => {
  const categories = rows(`
    SELECT CategoryID, CategoryName, CategoryDesc
    FROM Categories
    ORDER BY CategoryID ASC
  `);

  res.json(categories);
});

