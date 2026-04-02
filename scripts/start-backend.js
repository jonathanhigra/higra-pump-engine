/**
 * Start only the HPE backend (FastAPI/Uvicorn).
 *
 * Usage:
 *   node scripts/start-backend.js
 *   npm run start:backend
 */

const { spawn } = require("child_process");
const path = require("path");

const BACKEND_DIR = path.join(__dirname, "..", "backend");

const child = spawn(
  "python",
  ["-m", "uvicorn", "hpe.api.app:app", "--reload", "--port", "8000"],
  {
    cwd: BACKEND_DIR,
    stdio: "inherit",
    shell: true,
  }
);

process.on("SIGINT", () => {
  child.kill("SIGTERM");
  process.exit(0);
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
  process.exit(0);
});
