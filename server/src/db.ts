import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { dataDir } from "./paths.js";

const defaultDatabasePath = path.join(dataDir, "hidden-corners.sqlite");
const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : defaultDatabasePath;

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

if (process.env.DATABASE_PATH && !fs.existsSync(databasePath) && fs.existsSync(defaultDatabasePath)) {
  fs.copyFileSync(defaultDatabasePath, databasePath);
}

export const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON;");

export function rows<T>(sql: string, params: Record<string, SQLInputValue> = {}): T[] {
  return db.prepare(sql).all(params) as T[];
}

export function row<T>(sql: string, params: Record<string, SQLInputValue> = {}): T | undefined {
  return db.prepare(sql).get(params) as T | undefined;
}

export function run(sql: string, params: Record<string, SQLInputValue> = {}) {
  return db.prepare(sql).run(params);
}
