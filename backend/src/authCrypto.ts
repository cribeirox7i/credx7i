import crypto from "node:crypto";

const SCRYPT_KEYLEN = 64;

/** "salt:hash" em hex - scrypt nativo do Node, sem dependência externa. */
export function hashPassword(senha: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(senha, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(senha: string, armazenado: string | null): boolean {
  if (!armazenado) return false;
  const [salt, hash] = armazenado.split(":");
  if (!salt || !hash) return false;
  const tentativa = crypto.scryptSync(senha, salt, SCRYPT_KEYLEN);
  const guardado = Buffer.from(hash, "hex");
  if (tentativa.length !== guardado.length) return false;
  return crypto.timingSafeEqual(tentativa, guardado);
}

const SENHA_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Senha provisória legível (sem 0/O, 1/l/I), mostrada uma vez a quem criou o usuário. */
export function generateProvisionalPassword(length = 14): string {
  return Array.from(crypto.randomFillSync(new Uint8Array(length)))
    .map((b) => SENHA_CHARSET[b % SENHA_CHARSET.length])
    .join("");
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
