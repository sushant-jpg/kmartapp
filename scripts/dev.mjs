import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import console from "node:console";
import { setTimeout } from "node:timers";
import { URL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const npm = process.env.npm_execpath;
const required = ["MONGO_URI", "REDIS_URL", "JWT_SECRET", "ALLOWED_ORIGINS"];
const missing = required.filter((key) => !process.env[key]);
if (!npm || missing.length) {
  console.error(
    !npm
      ? "Start this runner with npm run dev."
      : `Missing configuration: ${missing.join(", ")}. Copy .env.example to .env and configure it first.`,
  );
  process.exit(1);
}

// Databases are external prerequisites; this runner never resets or seeds data.
// Each workspace still owns its command and can be started independently.
const services = [
  ["API", "@kmart/api", "dev", []],
  ["Worker", "@kmart/api", "dev:worker", []],
  ["Admin", "@kmart/admin", "dev", []],
  ["Mobile web", "@kmart/mobile", "dev", ["--web", "--port", "8081"]],
];
const children = [];
let stopping = false;

function signalTree(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error.code !== "ESRCH")
      console.error("Unable to stop a service:", error.message);
  }
}
function stop(code) {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping development services…");
  for (const child of children) signalTree(child, "SIGTERM");
  // Kill remaining grandchildren too: npm and file watchers may exit before them.
  setTimeout(() => {
    for (const child of children) signalTree(child, "SIGKILL");
    process.exit(code);
  }, 3000);
}
process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
for (const [name, workspace, script, args] of services) {
  console.log(`Starting ${name}…`);
  const child = spawn(
    process.execPath,
    [npm, "run", script, "--workspace", workspace, "--", ...args],
    {
      cwd: root,
      env: process.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  children.push(child);
  child.once("error", (error) => {
    console.error(`${name} failed to start: ${error.message}`);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `${name} exited (${signal ?? code}); stopping the other services.`,
      );
      stop(code || 1);
    }
  });
}
console.log("Admin: http://localhost:5173 | Mobile web: http://localhost:8081");
console.log(
  "MongoDB replica set and Redis must be running. Press Ctrl+C to stop all app services.",
);
