import crypto from "node:crypto";

const iterations = 120000;
const keyLength = 32;
const digest = "sha256";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(8).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("hex");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [scheme, iterationText, salt, expectedHash] = storedHash.split("$");

  if (scheme !== "pbkdf2_sha256" || !iterationText || !salt || !expectedHash) {
    return false;
  }

  const parsedIterations = Number(iterationText);
  const actualHash = crypto
    .pbkdf2Sync(password, salt, parsedIterations, Buffer.from(expectedHash, "hex").length, digest)
    .toString("hex");

  return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}

