import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
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

async function validateStorageConfig() {
  await loadEnvFile(".env");
  await loadEnvFile(".env.local");
  const { validateAwsS3Config } = await import("../src/server/s3.js");
  validateAwsS3Config();
}

function startNextServer() {
  const nextBin = path.join(ROOT_DIR, "node_modules", "next", "dist", "bin", "next");
  const port = String(process.env.PORT || "3100").trim() || "3100";
  const child = spawn(process.execPath, [nextBin, "start", "-p", port], {
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
  await validateStorageConfig();
  startNextServer();
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
