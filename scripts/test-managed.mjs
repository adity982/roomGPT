import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const config = JSON.parse(
  await readFile(".studio-data/production-connection.json", "utf8"),
);
if (!config.url)
  throw new Error("Initialize and verify the production connection first.");
const child = spawn(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test"],
  {
    stdio: "inherit",
    env: { ...process.env, STUDIO_E2E_DATABASE_URL: config.url },
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
