import fs from "node:fs";
import path from "node:path";
import type { SQLInputValue } from "node:sqlite";
import * as XLSX from "xlsx";
import { db } from "./db.js";
import { normalizeDate } from "./dates.js";
import { projectRoot } from "./paths.js";

type SheetRow = Record<string, unknown>;

const excelPath = process.env.EXCEL_PATH
  ? path.resolve(process.cwd(), process.env.EXCEL_PATH)
  : path.resolve(projectRoot, "../数据库Excel版.xlsx");
const schemaPath = path.resolve(projectRoot, "data/schema.sql");

function readSheet(workbook: XLSX.WorkBook, sheetName: string): SheetRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Excel 中缺少工作表：${sheetName}`);
  }

  return XLSX.utils.sheet_to_json<SheetRow>(sheet, {
    defval: "",
    raw: true
  });
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`无法转换为数字：${String(value)}`);
  }
  return parsed;
}

function insertRows(tableName: string, columns: string[], rows: SheetRow[], mapValue: (column: string, row: SheetRow) => SQLInputValue) {
  const placeholders = columns.map((column) => `:${column}`).join(", ");
  const statement = db.prepare(`
    INSERT INTO ${tableName} (${columns.join(", ")})
    VALUES (${placeholders})
  `);

  for (const sourceRow of rows) {
    const params = Object.fromEntries(columns.map((column) => [column, mapValue(column, sourceRow)])) as Record<string, SQLInputValue>;
    statement.run(params);
  }
}

const workbook = XLSX.readFile(excelPath, { cellDates: true });
db.exec(fs.readFileSync(schemaPath, "utf8"));

db.exec("BEGIN TRANSACTION;");
try {
  insertRows("Spaces", ["SpaceID", "SpaceName", "City", "Description", "Address", "Longitude", "Latitude"], readSheet(workbook, "Spaces"), (column, row) => {
    if (column === "SpaceID") return number(row[column]);
    if (column === "Longitude" || column === "Latitude") return number(row[column]);
    return text(row[column]);
  });

  insertRows("Categories", ["CategoryID", "CategoryName", "CategoryDesc"], readSheet(workbook, "Categories"), (column, row) => {
    if (column === "CategoryID") return number(row[column]);
    return text(row[column]);
  });

  insertRows("SpaceCategories", ["SCID", "SpaceID", "CategoryID"], readSheet(workbook, "SpaceCategories"), (_column, row) => number(row[_column]));

  insertRows("NomadCommunities", ["CommunityID", "CommunityName", "Province", "City", "Description", "Capacity", "MonthlyPrice"], readSheet(workbook, "NomadCommunities"), (column, row) => {
    if (["CommunityID", "Capacity", "MonthlyPrice"].includes(column)) return number(row[column]);
    return text(row[column]);
  });

  insertRows("Users", ["UserID", "Username", "PasswordHash", "Gender", "BirthDate", "HomeCity", "UserType", "RegisterDate"], readSheet(workbook, "Users"), (column, row) => {
    if (column === "UserID") return number(row[column]);
    if (column === "BirthDate" || column === "RegisterDate") return normalizeDate(row[column]);
    return text(row[column]);
  });

  insertRows("Reviews", ["ReviewID", "UserID", "SpaceID", "Rating", "Content", "VisitDate"], readSheet(workbook, "Reviews"), (column, row) => {
    if (["ReviewID", "UserID", "SpaceID", "Rating"].includes(column)) return number(row[column]);
    if (column === "VisitDate") return normalizeDate(row[column]);
    return text(row[column]);
  });

  insertRows("Favorites", ["FavoriteID", "UserID", "SpaceID", "ActionType", "ActionDate"], readSheet(workbook, "Favorites"), (column, row) => {
    if (["FavoriteID", "UserID", "SpaceID"].includes(column)) return number(row[column]);
    if (column === "ActionDate") return normalizeDate(row[column]);
    return text(row[column]);
  });

  insertRows("Activities", ["ActivityID", "SpaceID", "ActivityName", "ActivityDate", "PushLink"], readSheet(workbook, "Activities"), (column, row) => {
    if (["ActivityID", "SpaceID"].includes(column)) return number(row[column]);
    if (column === "ActivityDate") return normalizeDate(row[column]);
    return text(row[column]);
  });

  db.exec("COMMIT;");
} catch (error) {
  db.exec("ROLLBACK;");
  throw error;
}

const counts = db
  .prepare(`
    SELECT 'Spaces' AS name, COUNT(*) AS count FROM Spaces
    UNION ALL SELECT 'Categories', COUNT(*) FROM Categories
    UNION ALL SELECT 'SpaceCategories', COUNT(*) FROM SpaceCategories
    UNION ALL SELECT 'NomadCommunities', COUNT(*) FROM NomadCommunities
    UNION ALL SELECT 'Users', COUNT(*) FROM Users
    UNION ALL SELECT 'Reviews', COUNT(*) FROM Reviews
    UNION ALL SELECT 'Favorites', COUNT(*) FROM Favorites
    UNION ALL SELECT 'Activities', COUNT(*) FROM Activities
  `)
  .all();

console.table(counts);
