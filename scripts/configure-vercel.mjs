import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const linked = JSON.parse(await readFile(".vercel/project.json", "utf8"));
if (
  linked.projectId !== "prj_cCHza1yJcTc4GbJbajHxuuFD5o7M" ||
  linked.orgId !== "team_Q0joiM81sgmWwX2OeFES7y0n"
)
  throw new Error("Unexpected Vercel target.");
const connection = JSON.parse(
  await readFile(".studio-data/production-connection.json", "utf8"),
);
if (!connection.url)
  throw new Error("Production database connection is missing.");
const child = spawn(
  "cmd.exe",
  [
    "/d",
    "/s",
    "/c",
    "npx --yes vercel@65.10.0 env add STUDIO_DATABASE_URL --environment production --type secret --project roomgpt-studio --scope adity982s-projects --yes",
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
child.stdin.end(connection.url);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
