import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

export function generateTemporaryPassword(length = 16): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (value) => ALPHABET[value % ALPHABET.length]).join("");
}

/** Memorable temp password derived from employee code, e.g. TEF001@Temp1 */
export function generateMemorableTemporaryPassword(employeeCode: string): string {
  const code = employeeCode.trim().toUpperCase().replace(/\s+/g, "") || "EMP";
  let password = `${code}@Temp1`;
  if (password.length < 10) password = `${password}${"1".repeat(10 - password.length)}`;
  return password;
}

