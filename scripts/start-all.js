/**
 * Unified startup orchestrator for HPE backend and frontend.
 *
 * Spawns both the Python (FastAPI/Uvicorn) backend and the
 * Node (Vite) frontend dev servers concurrently, forwarding
 * their output to the terminal with colored prefixes.
 *
 * Usage:
 *   node scripts/start-all.js
 *   npm run start:all
 */

const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT, "backend");
const FRONTEND_DIR = path.join(ROOT, "frontend");

// ANSI colors for log prefixes
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

const children = [];

function spawnProcess(name, command, args, cwd, color) {
  console.log(`${color}[${name}]${RESET} Starting: ${command} ${args.join(" ")}`);

  const child = spawn(command, args, {
    cwd,
    stdio: ["inherit", "pipe", "pipe"],
    shell: true,
  });

  child.stdout.on("data", (data) => {
    const lines = data.toString().trimEnd().split("\n");
    lines.forEach((line) => {
      console.log(`${color}[${name}]${RESET} ${line}`);
    });
  });

  child.stderr.on("data", (data) => {
    const lines = data.toString().trimEnd().split("\n");
    lines.forEach((line) => {
      console.log(`${color}[${name}]${RESET} ${line}`);
    });
  });

  child.on("close", (code) => {
    console.log(`${color}[${name}]${RESET} Process exited with code ${code}`);
  });

  children.push(child);
  return child;
}

// Graceful shutdown
function cleanup() {
  console.log("\nShutting down...");
  children.forEach((child) => {
    try {
      child.kill("SIGTERM");
    } catch (_) {
      // Process may already be dead
    }
  });
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// --- Start Backend ---
spawnProcess(
  "backend",
  "python",
  ["-m", "uvicorn", "hpe.api.app:app", "--reload", "--port", "8000"],
  BACKEND_DIR,
  CYAN
);

// --- Start Frontend ---
spawnProcess("frontend", "npm", ["run", "dev"], FRONTEND_DIR, GREEN);

console.log(`
${CYAN}[backend]${RESET}  http://localhost:8000
${GREEN}[frontend]${RESET} http://localhost:5173
`);
