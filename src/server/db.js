import { pg } from "./backend-require.js";

const { Pool } = pg;

const DB_QUERY_RETRY_LIMIT = Math.max(1, Number(process.env.DB_QUERY_RETRY_LIMIT || 4));
const DB_QUERY_RETRY_DELAY_MS = Math.max(100, Number(process.env.DB_QUERY_RETRY_DELAY_MS || 350));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 3000),
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDbError(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  const retryableCodes = [
    "57P03", // database system is starting up
    "57P01", // admin shutdown
    "08001", // sqlclient unable to establish sqlconnection
    "08006", // connection failure
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
  ];
  if (retryableCodes.includes(code)) {
    return true;
  }

  const message = `${error?.message || ""} ${error?.cause?.message || ""}`.toLowerCase();
  return [
    "connection terminated due to connection timeout",
    "connection terminated unexpectedly",
    "connect econnrefused",
    "database system is starting up",
  ].some((needle) => message.includes(needle));
}

export async function query(text, params) {
  let lastError;

  for (let attempt = 1; attempt <= DB_QUERY_RETRY_LIMIT; attempt += 1) {
    try {
      return await pool.query(text, params);
    } catch (error) {
      lastError = error;
      if (!isRetryableDbError(error) || attempt === DB_QUERY_RETRY_LIMIT) {
        throw error;
      }
      await wait(attempt * DB_QUERY_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}
