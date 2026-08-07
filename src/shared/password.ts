import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

export function generateTemporaryPassword(length = 16): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (value) => ALPHABET[value % ALPHABET.length]).join("");
}
