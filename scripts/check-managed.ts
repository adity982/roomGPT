import { readManagedDatabase, postgresClient } from "../utils/studio-postgres";

async function main() {
  try {
    const db = await readManagedDatabase();
    console.log(
      JSON.stringify({
        accounts: db.accounts.length,
        projects: db.projects.length,
        sessions: db.sessions.length,
      }),
    );
  } finally {
    await postgresClient().end({ timeout: 2 });
  }
}
main().catch((error) => {
  console.error({ code: error.code, message: error.message });
  process.exitCode = 1;
});
