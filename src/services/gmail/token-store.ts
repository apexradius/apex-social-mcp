import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import type { AccountConfig, TokenData, StoredAccount } from "./types.js";

const STORE_DIR = path.join(os.homedir(), ".multi-gmail-mcp");
const STORE_FILE = path.join(STORE_DIR, "tokens.enc");
const KEY_FILE = path.join(STORE_DIR, ".gmail-mcp-key");
const ALGORITHM = "aes-256-gcm";

interface Store {
  accounts: AccountConfig[];
  tokens: Record<string, TokenData>;
}

/**
 * Returns the 32-byte encryption key, generating it on first run.
 * The key is stored in a dedicated file with 0600 permissions.
 * Falls back to legacy hostname+username derived key if tokens.enc
 * exists but no key file is present (migration path).
 */
function getOrCreateKey(): Buffer {
  ensureStoreDir();

  // Key file exists — use it
  if (fs.existsSync(KEY_FILE)) {
    const raw = fs.readFileSync(KEY_FILE);
    if (raw.length === 32) return raw;
    // Corrupted key file — if no token store exists, regenerate
    if (!fs.existsSync(STORE_FILE)) {
      return generateKeyFile();
    }
    // Corrupted key but tokens exist — cannot recover, throw
    throw new Error(
      `Encryption key file is corrupted (${raw.length} bytes, expected 32). ` +
      `Cannot decrypt tokens. Delete ${KEY_FILE} and ${STORE_FILE} to start fresh.`
    );
  }

  // No key file exists
  if (fs.existsSync(STORE_FILE)) {
    // Legacy migration: tokens.enc exists from old hostname+username key derivation.
    // Try to read with legacy key, then re-encrypt with a new random key.
    return migrateLegacyKey();
  }

  // Fresh install — generate new key
  return generateKeyFile();
}

function generateKeyFile(): Buffer {
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
  return key;
}

function legacyDeriveKey(): Buffer {
  const material = `multi-gmail-mcp:${os.hostname()}:${os.userInfo().username}`;
  return crypto.createHash("sha256").update(material).digest();
}

function migrateLegacyKey(): Buffer {
  // Attempt to decrypt existing store with legacy key
  const legacyKey = legacyDeriveKey();
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8").trim();
    const decrypted = decryptWithKey(raw, legacyKey);
    // Validate it's valid JSON
    JSON.parse(decrypted);
    // Success — generate new key, re-encrypt, and save
    const newKey = generateKeyFile();
    const reEncrypted = encryptWithKey(decrypted, newKey);
    fs.writeFileSync(STORE_FILE, reEncrypted, { mode: 0o600 });
    console.error("[token-store] Migrated encryption to random key file.");
    return newKey;
  } catch {
    // Legacy key doesn't work either — start fresh
    console.error(
      "[token-store] Could not decrypt existing tokens with legacy key. " +
      "Generating new key. Previously stored accounts will need to be re-added."
    );
    return generateKeyFile();
  }
}

function ensureStoreDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptWithKey(ciphertext: string, key: Buffer): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid token store format");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}

function encrypt(plaintext: string): string {
  const key = getOrCreateKey();
  return encryptWithKey(plaintext, key);
}

function decrypt(ciphertext: string): string {
  const key = getOrCreateKey();
  return decryptWithKey(ciphertext, key);
}

function readStore(): Store {
  if (!fs.existsSync(STORE_FILE)) return { accounts: [], tokens: {} };
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    return JSON.parse(decrypt(raw.trim())) as Store;
  } catch {
    return { accounts: [], tokens: {} };
  }
}

function writeStore(store: Store): void {
  ensureStoreDir();
  fs.writeFileSync(STORE_FILE, encrypt(JSON.stringify(store)), { mode: 0o600 });
}

export async function listAccounts(): Promise<AccountConfig[]> {
  return readStore().accounts;
}

export async function saveAccountConfig(config: AccountConfig): Promise<void> {
  const store = readStore();
  const idx = store.accounts.findIndex(a => a.email === config.email);
  if (idx >= 0) { store.accounts[idx] = config; } else { store.accounts.push(config); }
  writeStore(store);
}

export async function saveTokens(email: string, tokens: TokenData): Promise<void> {
  const store = readStore();
  store.tokens[email] = tokens;
  writeStore(store);
}

export async function getTokens(email: string): Promise<TokenData | null> {
  return readStore().tokens[email] ?? null;
}

export async function getStoredAccount(email: string): Promise<StoredAccount | null> {
  const store = readStore();
  const config = store.accounts.find(a => a.email === email);
  if (!config) return null;
  const tokens = store.tokens[email];
  if (!tokens) return null;
  return { config, tokens };
}

export async function removeAccount(email: string): Promise<boolean> {
  const store = readStore();
  const before = store.accounts.length;
  store.accounts = store.accounts.filter(a => a.email !== email);
  if (store.accounts.length === before) return false;
  delete store.tokens[email];
  writeStore(store);
  return true;
}
