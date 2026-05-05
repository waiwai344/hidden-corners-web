export function todayText(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 86400000).toISOString().slice(0, 10);
  }

  return String(value ?? "").slice(0, 10);
}

