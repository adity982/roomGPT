import postgres, { Sql } from "postgres";
import type { Database } from "./studio-store";
import ca from "../db/supabase-ca.json";

let client: Sql | undefined;
export function postgresClient() {
  if (!process.env.STUDIO_DATABASE_URL)
    throw new Error("Managed database is not configured.");
  if (!client)
    client = postgres(process.env.STUDIO_DATABASE_URL, {
      ssl: { rejectUnauthorized: true, ca: ca.certificate },
      max: 2,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 15,
      connection: {
        application_name: "roomgpt-studio",
        statement_timeout: 15000,
      },
    });
  return client;
}

async function readRows(sql: Sql): Promise<Database> {
  const [accounts, sessions, projects, attempts] = await Promise.all([
    sql`select payload from roomgpt_private.accounts`,
    sql`select payload from roomgpt_private.sessions`,
    sql`select payload from roomgpt_private.projects`,
    sql`select payload from roomgpt_private.rate_state where id = 1`,
  ]);
  return {
    accounts: accounts.map((r) => r.payload),
    sessions: sessions.map((r) => r.payload),
    projects: projects.map((r) => r.payload),
    attempts: attempts[0]?.payload || [],
  };
}

export async function readManagedDatabase() {
  // A repeatable-read snapshot keeps identity, session, and project reads consistent.
  return postgresClient().begin(
    "read only isolation level repeatable read",
    (sql) => readRows(sql as unknown as Sql),
  );
}

export async function managedTransaction<T>(
  change: (db: Database) => T | Promise<T>,
): Promise<T> {
  return postgresClient().begin(async (transaction) => {
    const sql = transaction as unknown as Sql;
    // Retain the existing mutation contract while serializing commits across instances.
    await sql`select pg_advisory_xact_lock(71423091)`;
    const db = await readRows(sql);
    const previous = structuredClone(db);
    const result = await change(db);
    for (const removed of previous.projects.filter(
      (p) => !db.projects.some((next) => next.id === p.id),
    ))
      await sql`delete from roomgpt_private.projects where id = ${removed.id}`;
    for (const removed of previous.sessions.filter(
      (p) => !db.sessions.some((next) => next.hash === p.hash),
    ))
      await sql`delete from roomgpt_private.sessions where id = ${removed.hash}`;
    for (const account of db.accounts) {
      if (
        JSON.stringify(account) ===
        JSON.stringify(previous.accounts.find((a) => a.id === account.id))
      )
        continue;
      await sql`insert into roomgpt_private.accounts(id,email,payload) values (${account.id},${account.email},${sql.json(account)}) on conflict(id) do update set email=excluded.email,payload=excluded.payload`;
    }
    for (const session of db.sessions) {
      if (
        JSON.stringify(session) ===
        JSON.stringify(previous.sessions.find((s) => s.hash === session.hash))
      )
        continue;
      await sql`insert into roomgpt_private.sessions(id,user_id,expires_at,payload) values (${session.hash},${session.userId},${session.expiresAt},${sql.json(session)}) on conflict(id) do update set expires_at=excluded.expires_at,payload=excluded.payload`;
    }
    for (const project of db.projects) {
      if (
        JSON.stringify(project) ===
        JSON.stringify(previous.projects.find((p) => p.id === project.id))
      )
        continue;
      await sql`insert into roomgpt_private.projects(id,owner_id,payload) values (${project.id},${project.ownerId},${sql.json(project as any)}) on conflict(id) do update set payload=excluded.payload`;
    }
    if (JSON.stringify(db.attempts) !== JSON.stringify(previous.attempts))
      await sql`update roomgpt_private.rate_state set payload=${sql.json(db.attempts)} where id=1`;
    return result as any;
  }) as Promise<T>;
}

export async function saveManagedAsset(id: string, bytes: Buffer) {
  await postgresClient()`insert into roomgpt_private.media(id,bytes) values (${id},${bytes})`;
}
export async function readManagedAsset(id: string) {
  const rows =
    await postgresClient()`select bytes from roomgpt_private.media where id=${id}`;
  return rows[0] ? Buffer.from(rows[0].bytes) : null;
}
