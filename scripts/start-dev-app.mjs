import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const START_TIMEOUT_MS = Number(process.env.DEV_WAIT_TIMEOUT_MS || 90_000);
const POLL_INTERVAL_MS = Number(process.env.DEV_WAIT_POLL_INTERVAL_MS || 1_000);
const inheritedEnvKeys = new Set(Object.keys(process.env));

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex < 0) return null;

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

async function loadEnvFile(filename) {
  const fullPath = path.join(ROOT_DIR, filename);
  try {
    const content = await fs.readFile(fullPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      if (inheritedEnvKeys.has(parsed.key)) continue;
      process.env[parsed.key] = parsed.value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTimeoutMessage(label, target) {
  return `Timed out waiting for ${label} at ${target}.`;
}

async function waitForTcp(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port: Number(port) });
        socket.once("connect", () => {
          socket.end();
          resolve();
        });
        socket.once("error", reject);
      });
      return;
    } catch {
      await wait(POLL_INTERVAL_MS);
    }
  }

  throw new Error(createTimeoutMessage("Postgres", `${host}:${port}`));
}

async function waitForHttp(urlString, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const url = new URL(urlString);
  const client = url.protocol === "https:" ? https : http;

  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const req = client.get(
          url,
          {
            timeout: 3_000,
          },
          (res) => {
            res.resume();
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
              return;
            }
            reject(new Error(`Unexpected status ${res.statusCode}`));
          }
        );
        req.once("error", reject);
        req.once("timeout", () => req.destroy(new Error("Request timed out")));
      });
      return;
    } catch {
      await wait(POLL_INTERVAL_MS);
    }
  }

  throw new Error(createTimeoutMessage("ML service", urlString));
}

function getDbTarget() {
  const connectionString = process.env.DATABASE_URL || "postgresql://securhealth:securhealth@localhost:5433/securhealth";
  const parsed = new URL(connectionString);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
  };
}

function getMlHealthUrl() {
  const base = process.env.ML_SERVICE_URL || "http://localhost:8001";
  return new URL("/health", base).toString();
}

async function waitForDevServices() {
  if (String(process.env.SKIP_DEV_WAIT || "").trim().toLowerCase() === "true") {
    return;
  }

  await loadEnvFile(".env");
  await loadEnvFile(".env.local");

  const dbTarget = getDbTarget();
  const mlHealthUrl = getMlHealthUrl();

  process.stdout.write(`Waiting for Postgres at ${dbTarget.host}:${dbTarget.port}...\n`);
  await waitForTcp(dbTarget.host, dbTarget.port, START_TIMEOUT_MS);
  process.stdout.write("Postgres is reachable.\n");

  process.stdout.write(`Waiting for ML service at ${mlHealthUrl}...\n`);
  await waitForHttp(mlHealthUrl, START_TIMEOUT_MS);
  process.stdout.write("ML service is reachable.\n");
}

function startNextDev() {
  const nextBin = path.join(ROOT_DIR, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "dev", "-p", "3001"], {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: process.env,
  });

  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

async function main() {
  await waitForDevServices();

  if (process.argv.includes("--check")) {
    process.stdout.write("Dev services check passed.\n");
    return;
  }

  startNextDev();
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
