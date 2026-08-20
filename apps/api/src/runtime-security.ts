import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_BYTES = 32;

export function validPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{6}$/.test(pin) && !/^([0-9])\1{5}$/.test(pin) && pin !== "123456";
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPin(encoded: string, pin: string): Promise<boolean> {
  const [algorithm, nText, rText, pText, saltText, digestText] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltText || !digestText) return false;
  const n = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(digestText, "base64url");
  const actual = scryptSync(pin, salt, expected.length, { N: n, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
