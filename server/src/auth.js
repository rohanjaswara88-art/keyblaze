/* Password hashing and session tokens, using only node:crypto. */
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;
export const SESSION_DAYS = 30;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/** Returns "salt:hash" in hex. */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, keyHex] = String(stored).split(':');
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

/** The raw token goes to the browser; only its hash is stored, so a database leak exposes no sessions. */
export function newSessionToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** A fixed hash to compare against when the user does not exist, so login timing does not reveal usernames. */
export const DUMMY_HASH = `${'0'.repeat(SALT_BYTES * 2)}:${'0'.repeat(KEY_LENGTH * 2)}`;
