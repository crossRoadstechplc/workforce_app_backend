import { randomBytes } from "node:crypto";
import { z } from "zod";

const EASY_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

export const EASY_PASSWORD_MIN_LENGTH = 6;
export const EASY_PASSWORD_MESSAGE = "Password must be at least 6 characters";

export const easyPasswordSchema = z.string().min(EASY_PASSWORD_MIN_LENGTH, EASY_PASSWORD_MESSAGE).max(128);

export function generateTemporaryPassword(length = 8): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (value) => EASY_ALPHABET[value % EASY_ALPHABET.length]).join("");
}

/** Temporary employee password. Kept for call-site compatibility. */
export function generateMemorableTemporaryPassword(_employeeCode?: string): string {
  return generateTemporaryPassword();
}
