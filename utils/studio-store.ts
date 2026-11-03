import { promises as fs } from "fs";
import path from "path";
import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";
import { StudioProject } from "./studio-model";

const scrypt = promisify(scryptCallback);
export const dataDir = path.resolve(
  process.env.STUDIO_DATA_DIR || path.join(process.cwd(), ".studio-data"),
);
const dbPath = path.join(dataDir, "studio.json");
const lockPath = path.join(dataDir, "write.lock");
interface Account {
  id: string;
  email: string;
  name: string;
  salt: string;
  passwordHash: string;
}
interface Session {
  hash: string;
  userId: string;
  expiresAt: number;
}
export interface Database {
  accounts: Account[];
  sessions: Session[];
  projects: StudioProject[];
  attempts: { key: string; at: number }[];
}
const empty = (): Database => ({
  accounts: [],
  sessions: [],
  projects: [],
  attempts: [],
});

export class StudioError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function readDatabase(): Promise<Database> {
  if (process.env.STUDIO_DATABASE_URL)
    return (await import("./studio-postgres")).readManagedDatabase();
  if (process.env.VERCEL)
    throw new StudioError("Production database is not configured.", 503);
  try {
    return JSON.parse(await fs.readFile(dbPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw error;
  }
}

// A filesystem lock serializes read/modify/write across Next's server workers.
export async function transaction<T>(
  change: (db: Database) => T | Promise<T>,
): Promise<T> {
  if (process.env.STUDIO_DATABASE_URL)
    return (await import("./studio-postgres")).managedTransaction(change);
  if (process.env.VERCEL)
    throw new StudioError("Production database is not configured.", 503);
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 10000;
  while (true) {
    try {
      await fs.mkdir(lockPath);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() > deadline)
        throw new StudioError("Storage is busy. Try again shortly.", 503);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  const temporary = path.join(dataDir, `${randomUUID()}.tmp`);
  try {
    const db = await readDatabase();
    const result = await change(db);
    await fs.writeFile(temporary, JSON.stringify(db), { mode: 0o600 });
    await fs.rename(temporary, dbPath);
    return result;
  } finally {
    await fs.rm(temporary, { force: true });
    await fs.rmdir(lockPath);
  }
}

export const token = () => randomBytes(32).toString("hex");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function passwordDigest(password: string, salt: string) {
  return ((await scrypt(password, salt, 64)) as Buffer).toString("hex");
}
export async function validPassword(password: string, account?: Account) {
  const value = await passwordDigest(
    password,
    account?.salt || "invalid-account-salt",
  );
  return (
    !!account &&
    timingSafeEqual(
      Buffer.from(value, "hex"),
      Buffer.from(account.passwordHash, "hex"),
    )
  );
}
export function accountForSession(db: Database, raw: string | undefined) {
  const session =
    raw &&
    db.sessions.find(
      (item) => item.hash === hash(raw) && item.expiresAt > Date.now(),
    );
  return session
    ? db.accounts.find((item) => item.id === session.userId)
    : undefined;
}
export function publicProject(project: StudioProject) {
  const { ownerId, shares, jobs, ...rest } = project;
  return {
    ...rest,
    jobs: jobs.map(({ callbackHash, ...job }) => job),
    shares: shares.map(({ tokenHash, ...share }) => share),
  };
}
export function ownProject(db: Database, userId: string, id: string) {
  const project = db.projects.find(
    (item) => item.id === id && item.ownerId === userId,
  );
  if (!project) throw new StudioError("Project not found.", 404);
  return project;
}
export function touch(project: StudioProject) {
  project.revision++;
  project.updatedAt = new Date().toISOString();
}
export function rateLimit(
  db: Database,
  key: string,
  maximum: number,
  windowMs: number,
) {
  const now = Date.now();
  db.attempts = db.attempts.filter((item) => now - item.at < 86400000);
  if (
    db.attempts.filter((item) => item.key === key && now - item.at < windowMs)
      .length >= maximum
  ) {
    throw new StudioError("Too many attempts. Please try again later.", 429);
  }
  db.attempts.push({ key, at: now });
}

export async function saveAsset(bytes: Buffer, extension: string) {
  const id = `${randomUUID()}.${extension}`;
  if (process.env.STUDIO_DATABASE_URL) {
    await (await import("./studio-postgres")).saveManagedAsset(id, bytes);
    return id;
  }
  if (process.env.VERCEL)
    throw new StudioError("Production database is not configured.", 503);
  await fs.mkdir(path.join(dataDir, "media"), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(dataDir, "media", id), bytes, { mode: 0o600 });
  return id;
}
export async function readAsset(id: string) {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(id))
    throw new StudioError("Image not found.", 404);
  if (process.env.STUDIO_DATABASE_URL) {
    const bytes = await (
      await import("./studio-postgres")
    ).readManagedAsset(id);
    if (!bytes) throw new StudioError("Image not found.", 404);
    return bytes;
  }
  if (process.env.VERCEL)
    throw new StudioError("Production database is not configured.", 503);
  try {
    return await fs.readFile(path.join(dataDir, "media", id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new StudioError("Image not found.", 404);
    throw error;
  }
}
export function imageExtension(bytes: Buffer) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    return "webp";
  throw new StudioError("Choose a JPEG, PNG, or WebP image.");
}
