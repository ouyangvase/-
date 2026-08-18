import { hash, verify } from "@node-rs/argon2";

const argon2idOptions = { algorithm: 2 as const, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function validPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{6}$/.test(pin) && !/^([0-9])\1{5}$/.test(pin) && pin !== "123456";
}

export function hashPin(pin: string): Promise<string> {
  return hash(pin, argon2idOptions);
}

export function verifyPin(encodedHash: string, pin: string): Promise<boolean> {
  return verify(encodedHash, pin);
}
