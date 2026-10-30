import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const persistDirectory = process.env.NEWSROOM_D1_PATH || "/tmp/newsroom-d1";
const configPath = path.join(root, "dist/server/wrangler.json");
const migrationPath = path.join(root, "drizzle/0000_daffy_warbird.sql");
const migrationMarker = path.join(persistDirectory, ".schema-ready");

if (!existsSync(configPath)) {
  console.error("Build output is missing. Run the Render build command before starting the service.");
  process.exit(1);
}

mkdirSync(persistDirectory, { recursive: true });

if (!existsSync(migrationMarker)) {
  const migration = spawnSync(process.execPath, [
    "--import", "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "d1", "execute", "DB", "--local",
    "--config", "dist/server/wrangler.json",
    "--persist-to", persistDirectory,
    "--file", "drizzle/0000_daffy_warbird.sql",
  ], { cwd: root, stdio: "inherit", env: process.env });

  if (migration.error) throw migration.error;
  if (migration.status !== 0) process.exit(migration.status ?? 1);
  writeFileSync(migrationMarker, "ready\n");
}

const port = process.env.PORT || "10000";
const server = spawn(process.execPath, [
  "--import", "./scripts/sites-env.mjs",
  "./node_modules/wrangler/bin/wrangler.js",
  "dev", "--config", "dist/server/wrangler.json",
  "--local", "--persist-to", persistDirectory,
  "--ip", "0.0.0.0", "--port", port, "--inspector-port", "0",
], { cwd: root, stdio: "inherit", env: process.env });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("error", (error) => {
  console.error("Could not start the Newsroom demo service:", error);
  process.exit(1);
});
server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
