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
const srcDir = path.join(BACKEND_DIR, "src");
const currentPythonPath = process.env.PYTHONPATH || "";
const pythonPath = currentPythonPath ? `${srcDir};${currentPythonPath}` : srcDir;

const child = spawn(
  "python",
  ["-m", "uvicorn", "hpe.api.app:app", "--reload", "--port", "8000"],
  {
    cwd: BACKEND_DIR,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, PYTHONPATH: pythonPath },
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
