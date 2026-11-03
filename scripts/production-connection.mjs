import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import ca from "../db/supabase-ca.json" with { type: "json" };

const directory = path.resolve(".studio-data");
const configPath = path.join(directory, "production-connection.json");
await mkdir(directory, { recursive: true });
if (process.argv[2] === "init") {
  try {
    await readFile(configPath);
    console.log("Production credential already initialized.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(
      configPath,
      JSON.stringify({
        password: randomBytes(40).toString("hex"),
        projectRef: "pjqigoylbegmuwtqdzvc",
      }),
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      "Production credential initialized in private local configuration.",
    );
  }
} else if (process.argv[2] === "probe") {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  let connected = false;
  for (const host of [
    "aws-1-ap-south-1.pooler.supabase.com",
    "aws-0-ap-south-1.pooler.supabase.com",
  ]) {
    const url = `postgresql://roomgpt_runtime.${config.projectRef}:${config.password}@${host}:6543/postgres`;
    const sql = postgres(url, {
      ssl: { rejectUnauthorized: true, ca: ca.certificate },
      prepare: false,
      max: 1,
      connect_timeout: 10,
    });
    try {
      const rows =
        await sql`select current_user as role, count(*)::int as accounts from roomgpt_private.accounts`;
      await writeFile(configPath, JSON.stringify({ ...config, url, host }), {
        mode: 0o600,
      });
      await writeFile(".env.production.local", `STUDIO_DATABASE_URL=${url}\n`, {
        mode: 0o600,
        flag: "wx",
      });
      console.log(
        JSON.stringify({
          connected: true,
          host,
          role: rows[0].role,
          accounts: rows[0].accounts,
        }),
      );
      connected = true;
      break;
    } catch (error) {
      console.log(
        JSON.stringify({
          host,
          connected: false,
          code: error.code,
          message: error.message.replaceAll(config.password, "[redacted]"),
        }),
      );
    } finally {
      await sql.end({ timeout: 1 });
    }
  }
  if (!connected) process.exitCode = 1;
} else {
  throw new Error("Choose init or probe.");
}
