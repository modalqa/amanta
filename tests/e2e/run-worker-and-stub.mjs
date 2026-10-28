// Starts the background worker and the local AI stub for E2E runs (test infrastructure only).
import { spawn } from "node:child_process";

const stub = spawn("npx", ["tsx", "tests/e2e/ai-stub-server.ts"], { stdio: "inherit", env: process.env });
const worker = spawn("npx", ["tsx", "--conditions=react-server", "src/worker/index.ts"], { stdio: "inherit", env: process.env });
const stop = () => { stub.kill("SIGTERM"); worker.kill("SIGTERM"); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
worker.on("exit", (code) => { if (code) { console.error("worker exited", code); stub.kill(); process.exit(code); } });
