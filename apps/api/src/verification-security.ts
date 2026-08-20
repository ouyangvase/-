import { createCipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  return createHash("sha256")
    .update(process.env.KYC_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "project12-demo-kyc-key")
    .digest();
}

export function encryptVerificationValue(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function maskTngAccount(value: string): string {
  return `••••${value.slice(-4)}`;
}
