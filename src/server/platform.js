import fs from "node:fs/promises";
import path from "node:path";
import { query } from "./db.js";
import { signToken, verifyToken, hashPassword, verifyPassword } from "./auth.js";
import { evaluatePolicy } from "./abac.js";
import { assessSecurity, sendFeedback } from "./ml.js";
import { uploadToS3, downloadFromS3, deleteFromS3, validateAwsS3Config } from "./s3.js";
import { uuidv4 } from "./backend-require.js";
import {
  MFA_METHOD_EMAIL_OTP,
  MFA_PURPOSE_ENABLE,
  MFA_PURPOSE_LOGIN,
  countRemainingBackupCodes,
  createMfaChallenge,
  consumeBackupCode,
  consumeLoginChallenges,
  hasActiveLoginChallenge,
  replaceBackupCodes,
  resendMfaChallenge,
  resetUserMfaState,
  verifyMfaChallenge,
} from "./mfa.js";

const AUTH_RISK_BLOCK_THRESHOLD = Number(process.env.AUTH_RISK_BLOCK_THRESHOLD || 0.98);
const AUTH_RISK_MIN_FAILED_COUNT = Number(process.env.AUTH_RISK_MIN_FAILED_COUNT || 4);
const ROLE_OPTIONS = [
  "admin",
  "clinician",
  "radiology",
  "staff",
  "er",
  "pharmacist",
  "reporting-doctor",
];
const CLEARANCE_OPTIONS = [1, 2, 3, 4, 5];
const DEFAULT_DEPARTMENTS = [
  "general",
  "radiology",
  "er",
  "pharmacy",
  "reporting",
  "lab",
  "security",
];
const SECURITY_LEVEL_OPTIONS = ["Restricted", "Confidential", "Highly Sensitive"];
const SEED_DEFAULT_USERS = String(process.env.SEED_DEFAULT_USERS || "false").trim().toLowerCase() === "true";
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || "admin@securehealth.local";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "Admin123!";
const DEFAULT_CLINICIAN_EMAIL = process.env.DEFAULT_CLINICIAN_EMAIL || "clinician@securehealth.local";
const DEFAULT_CLINICIAN_PASSWORD = process.env.DEFAULT_CLINICIAN_PASSWORD || "Clinician123!";
const DEFAULT_TRAINING_METRICS_PATH = path.resolve(
  process.cwd(),
  "ai_model_training",
  "artifacts",
  "training_metrics.json"
);
const MFA_STATUS_ENABLED = "enabled";
const MFA_STATUS_DISABLED = "disabled";
const ALLOWED_UPLOAD_TYPES = [
  {
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  },
  {
    extensions: [".docx"],
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  {
    extensions: [".png"],
    mimeTypes: ["image/png"],
  },
  {
    extensions: [".jpg", ".jpeg"],
    mimeTypes: ["image/jpeg", "image/jpg"],
  },
];

let bootstrapPromise;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectErrorCodes(error) {
  const codes = new Set();
  const queue = [error];

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    const code = String(current?.code || "").trim().toUpperCase();
    if (code) {
      codes.add(code);
    }

    if (current?.cause) {
      queue.push(current.cause);
    }

    if (Array.isArray(current?.errors)) {
      queue.push(...current.errors);
    }
  }

  return codes;
}

function collectErrorMessages(error) {
  const messages = new Set();
  const queue = [error];

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    const message = String(current?.message || "").trim().toLowerCase();
    if (message) {
      messages.add(message);
    }

    if (current?.cause) {
      queue.push(current.cause);
    }

    if (Array.isArray(current?.errors)) {
      queue.push(...current.errors);
    }
  }

  return messages;
}

function isRetryableBootstrapError(error) {
  const retryableCodes = [
    "57P03", // database system is starting up / in recovery mode
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
  ];

  if ([...collectErrorCodes(error)].some((code) => retryableCodes.includes(code))) {
    return true;
  }

  return [...collectErrorMessages(error)].some((message) =>
    [
      "connection terminated due to connection timeout",
      "connection terminated unexpectedly",
      "connect econnrefused",
      "database system is starting up",
    ].some((needle) => message.includes(needle))
  );
}

function json(data, init = {}) {
  return Response.json(data, init);
}

function serviceWarmingUpResponse() {
  return json(
    { error: "Service warming up. Please retry in a few seconds." },
    {
      status: 503,
      headers: {
        "Retry-After": "3",
      },
    }
  );
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase();
}

function getFileExtension(filename) {
  const normalized = String(filename || "").trim().toLowerCase();
  const lastDot = normalized.lastIndexOf(".");
  return lastDot >= 0 ? normalized.slice(lastDot) : "";
}

function isAllowedUploadFile(file) {
  const extension = getFileExtension(file?.name);
  const mimeType = normalizeToken(file?.type);
  return ALLOWED_UPLOAD_TYPES.some(
    (allowed) =>
      allowed.extensions.includes(extension) ||
      (mimeType && allowed.mimeTypes.includes(mimeType))
  );
}

function getRequestIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

function getUserAgent(request) {
  return request.headers.get("user-agent") || "unknown";
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function ensureSchema() {
  validateAwsS3Config();

  await query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      clearance INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      mfa_method TEXT DEFAULT 'email_otp',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS files (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
      filename TEXT NOT NULL,
      s3_key TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      security_level TEXT NOT NULL,
      policy JSONB NOT NULL,
      is_destroyed BOOLEAN NOT NULL DEFAULT FALSE,
      destroyed_at TIMESTAMP,
      destroyed_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS access_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      file_id UUID REFERENCES files(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS anomaly_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      file_id UUID REFERENCES files(id) ON DELETE SET NULL,
      score NUMERIC NOT NULL,
      features JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS malware_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      file_id UUID REFERENCES files(id) ON DELETE SET NULL,
      filename TEXT,
      mime_type TEXT,
      context TEXT,
      score NUMERIC NOT NULL,
      reasons JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shares (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      file_id UUID REFERENCES files(id) ON DELETE CASCADE,
      owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
      recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
      permission TEXT NOT NULL DEFAULT 'read',
      share_mode TEXT NOT NULL DEFAULT 'one_time',
      access_count INTEGER NOT NULL DEFAULT 0,
      max_access_count INTEGER NOT NULL DEFAULT 1,
      last_accessed_at TIMESTAMP,
      consumed_at TIMESTAMP,
      consumed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS departments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mfa_challenges (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      delivery_email TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mfa_backup_codes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      consumed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_method TEXT DEFAULT 'email_otp';
    ALTER TABLE files ADD COLUMN IF NOT EXISTS is_destroyed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE files ADD COLUMN IF NOT EXISTS destroyed_at TIMESTAMP;
    ALTER TABLE files ADD COLUMN IF NOT EXISTS destroyed_reason TEXT;
    ALTER TABLE shares ADD COLUMN IF NOT EXISTS share_mode TEXT NOT NULL DEFAULT 'one_time';
    ALTER TABLE shares ADD COLUMN IF NOT EXISTS access_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE shares ADD COLUMN IF NOT EXISTS max_access_count INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE shares ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP;
    ALTER TABLE shares ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMP;
    ALTER TABLE shares ADD COLUMN IF NOT EXISTS consumed_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE malware_events ADD COLUMN IF NOT EXISTS filename TEXT;
    ALTER TABLE malware_events ADD COLUMN IF NOT EXISTS mime_type TEXT;
    ALTER TABLE malware_events ADD COLUMN IF NOT EXISTS context TEXT;
  `);
  await ensureDepartments(DEFAULT_DEPARTMENTS);
  await ensureDefaultUsers();

  await query(`
    INSERT INTO departments (name, is_active)
    SELECT DISTINCT LOWER(TRIM(department)), TRUE
    FROM users
    WHERE department IS NOT NULL AND LENGTH(TRIM(department)) > 0
    ON CONFLICT (name) DO NOTHING
  `);
}

export async function ensurePlatformReady() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      let lastError;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          await ensureSchema();
          return;
        } catch (error) {
          lastError = error;
          if (!isRetryableBootstrapError(error) || attempt === 5) {
            throw error;
          }
          await wait(attempt * 1000);
        }
      }
      throw lastError;
    })().catch((error) => {
      bootstrapPromise = undefined;
      throw error;
    });
  }
  await bootstrapPromise;
}

async function authorizeRequest(request, role) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { response: json({ error: "Missing token" }, { status: 401 }) };
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const claims = verifyToken(token);
    const result = await query(
      "SELECT id, email, full_name, role, department, clearance, is_active FROM users WHERE id = $1",
      [claims.sub]
    );
    const user = result.rows[0];
    if (!user || !user.is_active) {
      return { response: json({ error: "Inactive account" }, { status: 401 }) };
    }
    if (role && user.role !== role) {
      return { response: json({ error: "Insufficient permissions" }, { status: 403 }) };
    }
    return {
      user: {
        sub: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        department: user.department,
        clearance: user.clearance,
      },
    };
  } catch {
    return { response: json({ error: "Invalid token" }, { status: 401 }) };
  }
}

async function logAccess({ userId, fileId, action, decision, reason, request }) {
  await query(
    `INSERT INTO access_logs (user_id, file_id, action, decision, reason, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, fileId, action, decision, reason, getRequestIp(request), getUserAgent(request)]
  );
}

async function logMalware({ userId, fileId, filename, mimeType, context, score, reasons }) {
  const normalizedReasons = JSON.stringify(Array.isArray(reasons) ? reasons : []);
  await query(
    `INSERT INTO malware_events (user_id, file_id, filename, mime_type, context, score, reasons)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, fileId, filename || null, mimeType || null, context || null, score, normalizedReasons]
  );
}

function buildBehaviorFeatures({ request, user, action, failedCount = 0 }) {
  const now = new Date();
  return {
    action,
    hour: now.getHours(),
    day_of_week: now.getDay(),
    ip: getRequestIp(request),
    user_agent: getUserAgent(request),
    failed_count_24h: failedCount,
    clearance: user?.clearance || 0,
    role: user?.role || "unknown",
  };
}

function buildContentFeatures({ file, securityLevel }) {
  return {
    filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    security_level: securityLevel,
  };
}

function toAuthUser(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    department: user.department,
    clearance: user.clearance,
  };
}

async function getUserById(userId) {
  const result = await query(
    `SELECT id, email, full_name, role, department, clearance, is_active, mfa_enabled, mfa_method
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getUserByIdWithSecrets(userId) {
  const result = await query(
    `SELECT id, email, password_hash, full_name, role, department, clearance, is_active, mfa_enabled, mfa_method
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getUserByEmail(email) {
  const result = await query(
    `SELECT id, email, full_name, role, department, clearance, is_active, mfa_enabled, mfa_method
     FROM users
     WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

async function getUserByEmailWithSecrets(email) {
  const result = await query(
    `SELECT id, email, password_hash, full_name, role, department, clearance, is_active, mfa_enabled, mfa_method
     FROM users
     WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

async function verifyCurrentPasswordForUser(userId, currentPassword) {
  const password = String(currentPassword || "").trim();
  if (!password) {
    return { error: "Current password is required", status: 400 };
  }

  const user = await getUserByIdWithSecrets(userId);
  if (!user || !user.is_active) {
    return { error: "User not found", status: 404 };
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return { error: "Current password is incorrect", status: 401 };
  }

  return { user };
}

async function resetUserPassword(userId, password) {
  const nextPassword = String(password || "").trim();
  if (!nextPassword) {
    return { error: "Password is required" };
  }

  const passwordHash = await hashPassword(nextPassword);
  const result = await query(
    `UPDATE users
     SET password_hash = $1
     WHERE id = $2
     RETURNING id, email, full_name, role, department, clearance, is_active, mfa_enabled, mfa_method, created_at`,
    [passwordHash, userId]
  );

  if (!result.rows[0]) {
    return { error: "User not found", status: 404 };
  }

  return { user: result.rows[0] };
}

async function listDepartments() {
  const sql = "SELECT id, name, is_active, created_at FROM departments WHERE is_active = TRUE ORDER BY name";
  const result = await query(sql);
  if (result.rows.length) return result.rows;
  await ensureDepartments(DEFAULT_DEPARTMENTS);
  const seeded = await query(sql);
  return seeded.rows;
}

async function ensureDepartment(name) {
  const normalized = normalizeToken(name);
  if (!normalized) return;
  await query(
    `INSERT INTO departments (name, is_active)
     VALUES ($1, TRUE)
     ON CONFLICT (name) DO NOTHING`,
    [normalized]
  );
}

async function ensureDepartments(names) {
  const unique = [...new Set((names || []).map(normalizeToken).filter(Boolean))];
  for (const department of unique) {
    await ensureDepartment(department);
  }
}

async function ensureDefaultUsers() {
  if (!SEED_DEFAULT_USERS) return;

  const defaultUsers = [
    {
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      fullName: "Demo Administrator",
      role: "admin",
      department: "security",
      clearance: 5,
    },
    {
      email: DEFAULT_CLINICIAN_EMAIL,
      password: DEFAULT_CLINICIAN_PASSWORD,
      fullName: "Demo Clinician",
      role: "clinician",
      department: "general",
      clearance: 3,
    },
  ];

  await ensureDepartments(defaultUsers.map((user) => user.department));

  for (const user of defaultUsers) {
    const passwordHash = await hashPassword(user.password);
    await query(
      `INSERT INTO users (email, password_hash, full_name, role, department, clearance, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (email) DO NOTHING`,
      [user.email, passwordHash, user.fullName, user.role, user.department, user.clearance]
    );
  }
}

function parsePolicy(input, fallbackRole, fallbackDept, fallbackClearance) {
  const fallbackRoleNormalized = normalizeToken(fallbackRole);
  const fallbackDeptNormalized = normalizeToken(fallbackDept);
  const roles = String(input.roles || "")
    .split(",")
    .map(normalizeToken)
    .filter(Boolean);
  const departments = String(input.departments || "")
    .split(",")
    .map(normalizeToken)
    .filter(Boolean);

  const roleSet = new Set(roles.length ? roles : [fallbackRoleNormalized]);
  roleSet.add(fallbackRoleNormalized);

  const departmentSet = new Set(departments.length ? departments : [fallbackDeptNormalized]);
  departmentSet.add(fallbackDeptNormalized);

  const requestedClearance = Number(input.minClearance || fallbackClearance);
  const minClearance = Number.isFinite(requestedClearance)
    ? Math.min(requestedClearance, Number(fallbackClearance))
    : Number(fallbackClearance);

  return {
    roles: [...roleSet],
    departments: [...departmentSet],
    minClearance,
  };
}

async function getActiveShare(fileId, recipientId) {
  const result = await query(
    `SELECT *
     FROM shares
     WHERE file_id = $1
       AND recipient_id = $2
       AND consumed_at IS NULL
       AND access_count < max_access_count
     ORDER BY created_at DESC
     LIMIT 1`,
    [fileId, recipientId]
  );
  return result.rows[0] || null;
}

async function consumeOneTimeShare({ shareId, fileId, userId, reason }) {
  await query(
    `UPDATE shares
     SET access_count = access_count + 1,
         last_accessed_at = NOW(),
         consumed_at = NOW(),
         consumed_by = $2
     WHERE id = $1`,
    [shareId, userId]
  );

  await markFileDestroyed({ fileId, reason });
}

async function revokeActiveShares({ fileId }) {
  await query(
    `UPDATE shares
     SET last_accessed_at = NOW(),
         consumed_at = NOW()
     WHERE file_id = $1
       AND consumed_at IS NULL
       AND access_count < max_access_count`,
    [fileId]
  );
}

async function markFileDestroyed({ fileId, reason }) {
  await query(
    `UPDATE files
     SET is_destroyed = TRUE,
         destroyed_at = NOW(),
         destroyed_reason = $2
     WHERE id = $1`,
    [fileId, reason]
  );
}

async function listAccessibleFilesForUser(user) {
  const sharedResult = await query(
    `SELECT files.id AS file_id,
            files.filename,
            files.security_level,
            files.created_at,
            users.email AS owner_email,
            shares.id AS share_id,
            shares.share_mode,
            shares.max_access_count,
            shares.created_at AS shared_at
     FROM shares
     JOIN files ON files.id = shares.file_id
     LEFT JOIN users ON users.id = files.owner_id
     WHERE shares.recipient_id = $1
       AND shares.consumed_at IS NULL
       AND files.is_destroyed = FALSE
     ORDER BY shares.created_at DESC`,
    [user.sub]
  );

  const accessibleById = new Map();

  for (const row of sharedResult.rows) {
    accessibleById.set(row.file_id, {
      file_id: row.file_id,
      filename: row.filename,
      security_level: row.security_level,
      created_at: row.created_at,
      owner_email: row.owner_email,
      access_type: "one_time_share",
      share_id: row.share_id,
      shared_at: row.shared_at,
      share_mode: row.share_mode,
      max_access_count: row.max_access_count,
    });
  }

  const policyResult = await query(
    `SELECT files.id AS file_id,
            files.filename,
            files.security_level,
            files.created_at,
            files.policy,
            users.email AS owner_email
     FROM files
     LEFT JOIN users ON users.id = files.owner_id
     WHERE files.owner_id <> $1
       AND files.is_destroyed = FALSE
     ORDER BY files.created_at DESC`,
    [user.sub]
  );

  for (const row of policyResult.rows) {
    if (accessibleById.has(row.file_id)) {
      continue;
    }
    const policyCheck = evaluatePolicy(user, row.policy);
    if (!policyCheck.allowed) {
      continue;
    }
    accessibleById.set(row.file_id, {
      file_id: row.file_id,
      filename: row.filename,
      security_level: row.security_level,
      created_at: row.created_at,
      owner_email: row.owner_email,
      access_type: "policy",
    });
  }

  return [...accessibleById.values()].sort(
    (a, b) => new Date(b.shared_at || b.created_at).getTime() - new Date(a.shared_at || a.created_at).getTime()
  );
}

function fillSeries(rows, days = 7) {
  const today = new Date();
  const map = new Map(rows.map((row) => [row.day, Number(row.count)]));
  const data = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const current = new Date(today);
    current.setDate(today.getDate() - i);
    const key = current.toISOString().slice(0, 10);
    data.push({ day: key, count: map.get(key) || 0 });
  }

  return data;
}

function normalizeMetricValue(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeConfusionMatrix(value) {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((row) => Array.isArray(row) && row.length === 2)
  ) {
    return value.map((row) => row.map((entry) => normalizeMetricValue(entry)));
  }

  return [
    [0, 0],
    [0, 0],
  ];
}

function normalizeDetectionResults(rawMetrics) {
  const results = rawMetrics?.results && typeof rawMetrics.results === "object" ? rawMetrics.results : {};
  const deployedModel = String(rawMetrics?.best_model || "").trim();

  const models = Object.entries(results)
    .map(([name, metrics]) => ({
      name,
      accuracy: normalizeMetricValue(metrics?.accuracy),
      precision: normalizeMetricValue(metrics?.precision),
      recall: normalizeMetricValue(metrics?.recall),
      f1: normalizeMetricValue(metrics?.f1),
      rocAuc: normalizeMetricValue(metrics?.roc_auc),
      confusionMatrix: normalizeConfusionMatrix(metrics?.confusion_matrix),
    }))
    .sort((a, b) => Number(b.name === deployedModel) - Number(a.name === deployedModel));

  const currentModel = models.find((model) => model.name === deployedModel) || models[0] || null;

  return {
    dataset: {
      rows: normalizeMetricValue(rawMetrics?.dataset_rows),
      trainRows: normalizeMetricValue(rawMetrics?.train_rows),
      testRows: normalizeMetricValue(rawMetrics?.test_rows),
      targetColumn: String(rawMetrics?.target_column || ""),
      droppedColumns: Array.isArray(rawMetrics?.dropped_columns) ? rawMetrics.dropped_columns : [],
      savedModelPath: String(rawMetrics?.saved_model_path || ""),
    },
    deployedModel,
    currentModel,
    models,
  };
}

async function loadDetectionResults() {
  const metricsPath = path.resolve(process.env.TRAINING_METRICS_PATH || DEFAULT_TRAINING_METRICS_PATH);

  try {
    const raw = JSON.parse(await fs.readFile(metricsPath, "utf8"));
    return normalizeDetectionResults(raw);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        error: `Training metrics file not found at ${metricsPath}.`,
        status: 500,
      };
    }

    if (error instanceof SyntaxError) {
      return {
        error: `Training metrics file at ${metricsPath} is not valid JSON.`,
        status: 500,
      };
    }

    return {
      error: "Failed to load training metrics.",
      status: 500,
    };
  }
}

function toDownloadBody(value) {
  if (!value) return new Uint8Array();
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  return new Uint8Array(value);
}

function createLoginSuccessResponse(user) {
  const authUser = toAuthUser(user);
  return {
    token: signToken(authUser),
    user: authUser,
  };
}

async function handleLogin(request) {
  try {
    const body = await parseJson(request);
    const { email, password } = body;
    if (!email || !password) {
      return json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await getUserByEmailWithSecrets(email);

    const failedCountResult = await query(
      `SELECT COUNT(*)
       FROM access_logs
       WHERE action = 'login' AND decision = 'denied'
         AND created_at > NOW() - INTERVAL '24 hour'
         AND (user_id = $1 OR $1 IS NULL)`,
      [user?.id || null]
    );
    const failedCount = Number(failedCountResult.rows[0].count);

    let authAssessment = {
      auth_risk: false,
      auth_risk_score: 0,
    };

    try {
      authAssessment = await assessSecurity({
        context: "auth_login",
        behavior: buildBehaviorFeatures({ request, user, action: "login", failedCount }),
        content: null,
        auth: { email, known_user: Boolean(user), failed_count_24h: failedCount },
      });
    } catch {
      authAssessment = {
        auth_risk: false,
        auth_risk_score: 0,
      };
    }

    if (!user || !user.is_active) {
      await logAccess({
        userId: user?.id || null,
        fileId: null,
        action: "login",
        decision: "denied",
        reason: user?.is_active === false ? "Inactive account" : "Invalid credentials",
        request,
      });
      return json({ error: "Invalid credentials" }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      await logAccess({
        userId: user.id,
        fileId: null,
        action: "login",
        decision: "denied",
        reason: "Invalid credentials",
        request,
      });
      return json({ error: "Invalid credentials" }, { status: 401 });
    }

    const shouldBlockForAuthRisk =
      Boolean(authAssessment.auth_risk) &&
      (failedCount >= AUTH_RISK_MIN_FAILED_COUNT ||
        Number(authAssessment.auth_risk_score || 0) >= AUTH_RISK_BLOCK_THRESHOLD);

    if (shouldBlockForAuthRisk) {
      await logAccess({
        userId: user.id,
        fileId: null,
        action: "login",
        decision: "denied",
        reason: "Auth risk detected by ML",
        request,
      });
      return json({ error: "Suspicious authentication activity detected" }, { status: 403 });
    }

    if (user.mfa_enabled) {
      try {
        const challenge = await createMfaChallenge({
          userId: user.id,
          deliveryEmail: user.email,
          purpose: MFA_PURPOSE_LOGIN,
        });

        await logAccess({
          userId: user.id,
          fileId: null,
          action: "login",
          decision: "pending",
          reason: "MFA verification required",
          request,
        });

        return json({
          mfaRequired: true,
          challengeId: challenge.challengeId,
          maskedEmail: challenge.maskedEmail,
          method: challenge.method,
        });
      } catch (error) {
        await logAccess({
          userId: user.id,
          fileId: null,
          action: "login",
          decision: "denied",
          reason: "MFA delivery unavailable",
          request,
        });
        return json(
          { error: error?.message || "Unable to deliver the verification code right now." },
          { status: error?.status || 503 }
        );
      }
    }

    await logAccess({
      userId: user.id,
      fileId: null,
      action: "login",
      decision: "allowed",
      reason: "Authenticated",
      request,
    });

    return json(createLoginSuccessResponse(user));
  } catch (error) {
    if (isRetryableBootstrapError(error)) {
      return serviceWarmingUpResponse();
    }
    return json({ error: "Login failed" }, { status: 500 });
  }
}

async function handleLoginMfaVerify(request) {
  try {
    const body = await parseJson(request);
    const challengeId = String(body?.challengeId || "").trim();
    const code = String(body?.code || "").trim();

    if (!challengeId || !code) {
      return json({ error: "challengeId and code are required" }, { status: 400 });
    }

    const verification = await verifyMfaChallenge({
      challengeId,
      code,
      purpose: MFA_PURPOSE_LOGIN,
    });
    const user = await getUserById(verification.userId);
    if (!user || !user.is_active) {
      return json({ error: "Inactive account" }, { status: 401 });
    }
    if (!user.mfa_enabled) {
      return json({ error: "MFA is no longer enabled for this account." }, { status: 409 });
    }

    await logAccess({
      userId: user.id,
      fileId: null,
      action: "login",
      decision: "allowed",
      reason: "Authenticated with MFA",
      request,
    });

    return json(createLoginSuccessResponse(user));
  } catch (error) {
    if (error?.status) {
      return json({ error: error.message }, { status: error.status });
    }
    return json({ error: "MFA verification failed" }, { status: 500 });
  }
}

async function handleLoginMfaBackup(request) {
  try {
    const body = await parseJson(request);
    const email = String(body?.email || "").trim();
    const backupCode = String(body?.backupCode || "").trim();

    if (!email || !backupCode) {
      return json({ error: "email and backupCode are required" }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    if (!user || !user.is_active) {
      return json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (!user.mfa_enabled) {
      return json({ error: "MFA is not enabled for this account." }, { status: 400 });
    }

    const loginStarted = await hasActiveLoginChallenge(user.id);
    if (!loginStarted) {
      return json({ error: "Start the password step first before using a backup code." }, { status: 400 });
    }

    const consumed = await consumeBackupCode({
      userId: user.id,
      backupCode,
    });

    if (!consumed) {
      await logAccess({
        userId: user.id,
        fileId: null,
        action: "login",
        decision: "denied",
        reason: "Invalid MFA backup code",
        request,
      });
      return json({ error: "Invalid backup code" }, { status: 401 });
    }

    await consumeLoginChallenges(user.id);
    await logAccess({
      userId: user.id,
      fileId: null,
      action: "login",
      decision: "allowed",
      reason: "Authenticated with MFA backup code",
      request,
    });

    return json(createLoginSuccessResponse(user));
  } catch {
    return json({ error: "Backup code verification failed" }, { status: 500 });
  }
}

async function handleLoginMfaResend(request) {
  try {
    const body = await parseJson(request);
    const challengeId = String(body?.challengeId || "").trim();
    if (!challengeId) {
      return json({ error: "challengeId is required" }, { status: 400 });
    }

    const challenge = await resendMfaChallenge({
      challengeId,
      purpose: MFA_PURPOSE_LOGIN,
    });

    return json({
      message: "A new verification code has been sent.",
      challengeId: challenge.challengeId,
      maskedEmail: challenge.maskedEmail,
      method: challenge.method,
    });
  } catch (error) {
    if (error?.status) {
      return json({ error: error.message }, { status: error.status });
    }
    return json({ error: "Unable to resend the verification code" }, { status: 500 });
  }
}

async function handleAccountSecurity(currentUser) {
  try {
    const account = await getUserById(currentUser.sub);
    if (!account) {
      return json({ error: "User not found" }, { status: 404 });
    }

    const backupCodesRemaining = account.mfa_enabled ? await countRemainingBackupCodes(account.id) : 0;
    return json({
      mfaEnabled: Boolean(account.mfa_enabled),
      mfaStatus: account.mfa_enabled ? MFA_STATUS_ENABLED : MFA_STATUS_DISABLED,
      method: account.mfa_enabled ? account.mfa_method || MFA_METHOD_EMAIL_OTP : null,
      backupCodesRemaining,
    });
  } catch {
    return json({ error: "Failed to load security settings" }, { status: 500 });
  }
}

async function handleStartMfaEnable(request, currentUser) {
  try {
    const account = await getUserById(currentUser.sub);
    if (!account) {
      return json({ error: "User not found" }, { status: 404 });
    }
    if (account.mfa_enabled) {
      return json({ error: "MFA is already enabled for this account." }, { status: 409 });
    }

    const challenge = await createMfaChallenge({
      userId: account.id,
      deliveryEmail: account.email,
      purpose: MFA_PURPOSE_ENABLE,
    });

    return json({
      message: "A setup code has been sent to your email.",
      challengeId: challenge.challengeId,
      maskedEmail: challenge.maskedEmail,
      method: challenge.method,
    });
  } catch (error) {
    if (error?.status) {
      return json({ error: error.message }, { status: error.status });
    }
    return json({ error: "Unable to start MFA setup" }, { status: 500 });
  }
}

async function handleVerifyMfaEnable(request, currentUser) {
  try {
    const body = await parseJson(request);
    const challengeId = String(body?.challengeId || "").trim();
    const code = String(body?.code || "").trim();

    if (!challengeId || !code) {
      return json({ error: "challengeId and code are required" }, { status: 400 });
    }

    const verification = await verifyMfaChallenge({
      challengeId,
      code,
      purpose: MFA_PURPOSE_ENABLE,
    });

    if (verification.userId !== currentUser.sub) {
      return json({ error: "Verification code does not belong to this account." }, { status: 403 });
    }

    const account = await getUserById(currentUser.sub);
    if (!account) {
      return json({ error: "User not found" }, { status: 404 });
    }
    if (account.mfa_enabled) {
      return json({ error: "MFA is already enabled for this account." }, { status: 409 });
    }

    await query(
      `UPDATE users
       SET mfa_enabled = TRUE,
           mfa_method = $2
       WHERE id = $1`,
      [currentUser.sub, MFA_METHOD_EMAIL_OTP]
    );
    const backupCodes = await replaceBackupCodes(currentUser.sub);

    await logAccess({
      userId: currentUser.sub,
      fileId: null,
      action: "mfa_enable",
      decision: "allowed",
      reason: "Email OTP MFA enabled",
      request,
    });

    return json({
      message: "Multi-factor authentication enabled.",
      mfaEnabled: true,
      method: MFA_METHOD_EMAIL_OTP,
      backupCodes,
    });
  } catch (error) {
    if (error?.status) {
      return json({ error: error.message }, { status: error.status });
    }
    return json({ error: "Unable to enable MFA" }, { status: 500 });
  }
}

async function handleDisableMfa(request, currentUser) {
  try {
    const body = await parseJson(request);
    const passwordCheck = await verifyCurrentPasswordForUser(currentUser.sub, body?.currentPassword);
    if (passwordCheck.error) {
      return json({ error: passwordCheck.error }, { status: passwordCheck.status || 400 });
    }

    await resetUserMfaState(currentUser.sub);
    await logAccess({
      userId: currentUser.sub,
      fileId: null,
      action: "mfa_disable",
      decision: "allowed",
      reason: "MFA disabled by user",
      request,
    });

    return json({
      message: "Multi-factor authentication disabled.",
      mfaEnabled: false,
      method: null,
    });
  } catch {
    return json({ error: "Unable to disable MFA" }, { status: 500 });
  }
}

async function handleRegenerateBackupCodes(request, currentUser) {
  try {
    const body = await parseJson(request);
    const passwordCheck = await verifyCurrentPasswordForUser(currentUser.sub, body?.currentPassword);
    if (passwordCheck.error) {
      return json({ error: passwordCheck.error }, { status: passwordCheck.status || 400 });
    }
    if (!passwordCheck.user.mfa_enabled) {
      return json({ error: "Enable MFA before generating backup codes." }, { status: 409 });
    }

    const backupCodes = await replaceBackupCodes(currentUser.sub);
    await logAccess({
      userId: currentUser.sub,
      fileId: null,
      action: "mfa_backup_regenerate",
      decision: "allowed",
      reason: "Backup codes regenerated",
      request,
    });

    return json({
      message: "Backup codes regenerated.",
      backupCodes,
    });
  } catch {
    return json({ error: "Unable to regenerate backup codes" }, { status: 500 });
  }
}

async function handleAdminResetMfa(request, currentUser, userId) {
  try {
    const account = await getUserById(userId);
    if (!account) {
      return json({ error: "User not found" }, { status: 404 });
    }

    await resetUserMfaState(userId);
    await logAccess({
      userId: currentUser.sub,
      fileId: null,
      action: "mfa_reset",
      decision: "allowed",
      reason: `Reset MFA for ${account.email}`,
      request,
    });

    return json({
      message: `MFA reset for ${account.email}.`,
      user: {
        ...toAuthUser(account),
        is_active: account.is_active,
        mfa_enabled: false,
        mfa_method: MFA_METHOD_EMAIL_OTP,
      },
    });
  } catch {
    return json({ error: "Failed to reset MFA" }, { status: 500 });
  }
}

async function handleUpload(request, currentUser) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return json({ error: "Missing file" }, { status: 400 });
    }
    if (!isAllowedUploadFile(file)) {
      return json(
        { error: "Only PDF, DOCX, PNG, and JPEG files are supported for scanning." },
        { status: 400 }
      );
    }

    const policy = parsePolicy(
      {
        roles: formData.get("roles"),
        departments: formData.get("departments"),
        minClearance: formData.get("minClearance"),
      },
      currentUser.role,
      currentUser.department,
      currentUser.clearance
    );
    await ensureDepartments(policy.departments);

    const securityLevel = String(formData.get("securityLevel") || "Restricted");
    const buffer = Buffer.from(await file.arrayBuffer());
    let mlAssessment;
    try {
      mlAssessment = await assessSecurity({
        context: "file_upload",
        behavior: buildBehaviorFeatures({ request, user: currentUser, action: "upload" }),
        content: buildContentFeatures({ file, securityLevel }),
        sample_base64: buffer.toString("base64"),
      });
    } catch (error) {
      console.error("Upload blocked because the ML service is unavailable", error);
      await logAccess({
        userId: currentUser.sub,
        fileId: null,
        action: "upload",
        decision: "denied",
        reason: "Security scanner unavailable",
        request,
      });
      return json(
        {
          error: "Security scanner unavailable. Upload blocked until scanning is restored.",
          blockedBy: "scanner_unavailable",
          reasons: ["ml_service_unavailable"],
        },
        { status: 503 }
      );
    }

    if (mlAssessment.malware) {
      const reasons = Array.isArray(mlAssessment.reasons)
        ? mlAssessment.reasons.filter(Boolean)
        : ["Malware signature detected"];
      await logMalware({
        userId: currentUser.sub,
        fileId: null,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        context: "file_upload",
        score: mlAssessment.malware_score,
        reasons,
      });
      await logAccess({
        userId: currentUser.sub,
        fileId: null,
        action: "upload",
        decision: "denied",
        reason: "Malware detected by ML",
        request,
      });
      return json(
        {
          error: "Malware detected. Upload blocked by the security scanner.",
          blockedBy: "malware",
          score: mlAssessment.malware_score,
          reasons,
        },
        { status: 403 }
      );
    }

    if (mlAssessment.anomaly) {
      await query(
        "INSERT INTO anomaly_events (user_id, file_id, score, features) VALUES ($1, $2, $3, $4)",
        [currentUser.sub, null, mlAssessment.anomaly_score, mlAssessment.features || {}]
      );
      await logAccess({
        userId: currentUser.sub,
        fileId: null,
        action: "upload",
        decision: "denied",
        reason: "ML anomaly detected",
        request,
      });
      return json({ error: "Anomalous activity detected" }, { status: 403 });
    }

    const key = `ehr/${currentUser.sub}/${uuidv4()}-${file.name}`;
    await uploadToS3({ key, buffer, contentType: file.type || "application/octet-stream" });

    const insertResult = await query(
      `INSERT INTO files (owner_id, filename, s3_key, mime_type, size_bytes, security_level, policy)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        currentUser.sub,
        file.name,
        key,
        file.type || "application/octet-stream",
        file.size,
        securityLevel,
        policy,
      ]
    );

    const saved = insertResult.rows[0];

    await logAccess({
      userId: currentUser.sub,
      fileId: saved.id,
      action: "upload",
      decision: "allowed",
      reason: "Upload completed",
      request,
    });

    try {
      await sendFeedback({
        outcome: "normal",
        user_id: currentUser.sub,
        file_id: saved.id,
        features: mlAssessment.features || {},
      });
    } catch {
      // Feedback logging is best effort and must not block successful uploads.
    }

    return json({ file: saved });
  } catch (error) {
    console.error("Upload failed", error);
    if (error?.code === "42P01") {
      return json({ error: "Departments table missing. Run migration and restart backend." }, { status: 500 });
    }
    return json({ error: "Upload failed" }, { status: 500 });
  }
}

async function handleDownload(request, currentUser, fileId) {
  try {
    const fileResult = await query("SELECT * FROM files WHERE id = $1", [fileId]);
    const file = fileResult.rows[0];
    if (!file) return json({ error: "File not found" }, { status: 404 });
    if (file.is_destroyed) {
      return json({ error: "File already destroyed after one-time access" }, { status: 410 });
    }

    const policyCheck = evaluatePolicy(currentUser, file.policy);
    const isOwner = file.owner_id === currentUser.sub;
    const isAdmin = currentUser.role === "admin";
    const activeShare = await getActiveShare(file.id, currentUser.sub);

    if (!policyCheck.allowed && !isAdmin) {
      if (!activeShare && !isOwner) {
        await logAccess({
          userId: currentUser.sub,
          fileId: file.id,
          action: "download",
          decision: "denied",
          reason: policyCheck.reason,
          request,
        });
        return json({ error: "ABAC policy denied" }, { status: 403 });
      }
    }

    let mlAssessment;
    try {
      mlAssessment = await assessSecurity({
        context: "file_download",
        behavior: buildBehaviorFeatures({ request, user: currentUser, action: "download" }),
        content: {
          filename: file.filename,
          mime_type: file.mime_type,
          size_bytes: file.size_bytes,
          security_level: file.security_level,
        },
      });
    } catch (error) {
      console.error("Download proceeding without ML assessment", error);
      mlAssessment = {
        anomaly: false,
        anomaly_score: 0,
        malware: false,
        malware_score: 0,
        reasons: ["ml_service_unavailable"],
        features: {
          ml_service_status: "unavailable",
        },
      };
    }

    if (mlAssessment.anomaly) {
      await query(
        "INSERT INTO anomaly_events (user_id, file_id, score, features) VALUES ($1, $2, $3, $4)",
        [currentUser.sub, file.id, mlAssessment.anomaly_score, mlAssessment.features || {}]
      );
      await logAccess({
        userId: currentUser.sub,
        fileId: file.id,
        action: "download",
        decision: "denied",
        reason: "ML anomaly detected",
        request,
      });
      return json({ error: "Anomalous activity detected" }, { status: 403 });
    }

    const object = await downloadFromS3(file.s3_key);
    const shouldConsumeShare = Boolean(activeShare && !isOwner && !isAdmin);

    await logAccess({
      userId: currentUser.sub,
      fileId: file.id,
      action: "download",
      decision: "allowed",
      reason: shouldConsumeShare ? "One-time secure access granted" : "Secure download granted",
      request,
    });

    try {
      await sendFeedback({
        outcome: shouldConsumeShare ? "one_time_download" : "normal_download",
        user_id: currentUser.sub,
        file_id: file.id,
        features: mlAssessment.features || {},
      });
    } catch {
      // Best effort only.
    }

    if (shouldConsumeShare) {
      await consumeOneTimeShare({
        shareId: activeShare.id,
        fileId: file.id,
        userId: currentUser.sub,
        reason: `Consumed by ${currentUser.email || currentUser.sub} via one-time secure share`,
      });
      await deleteFromS3(file.s3_key);
    }

    const contentType = object.ContentType || file.mime_type || "application/octet-stream";
    const contentLength = Number(object.ContentLength || file.size_bytes || 0);
    const safeFilename = encodeURIComponent(file.filename);
    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"; filename*=UTF-8''${safeFilename}`,
    });

    if (contentLength > 0) {
      headers.set("Content-Length", String(contentLength));
    }

    return new Response(toDownloadBody(object.Body), {
      status: 200,
      headers,
    });
  } catch {
    return json({ error: "Download failed" }, { status: 500 });
  }
}

async function handleDeleteFile(request, currentUser, fileId) {
  try {
    const fileResult = await query("SELECT * FROM files WHERE id = $1", [fileId]);
    const file = fileResult.rows[0];
    if (!file) {
      return json({ error: "File not found" }, { status: 404 });
    }

    const isOwner = file.owner_id === currentUser.sub;
    const isAdmin = currentUser.role === "admin";

    if (!isOwner && !isAdmin) {
      await logAccess({
        userId: currentUser.sub,
        fileId: file.id,
        action: "delete",
        decision: "denied",
        reason: "Only owner or admin can delete",
        request,
      });
      return json({ error: "Only owner or admin can delete this file" }, { status: 403 });
    }

    if (file.is_destroyed) {
      await logAccess({
        userId: currentUser.sub,
        fileId: file.id,
        action: "delete",
        decision: "denied",
        reason: "File already destroyed",
        request,
      });
      return json({ error: "File has already been deleted" }, { status: 410 });
    }

    const actorLabel = isAdmin ? "admin" : "owner";
    const actorIdentifier = currentUser.email || currentUser.sub;
    const destroyReason = `Deleted by ${actorLabel} (${actorIdentifier})`;

    await revokeActiveShares({ fileId: file.id });
    await markFileDestroyed({ fileId: file.id, reason: destroyReason });
    await deleteFromS3(file.s3_key);

    await logAccess({
      userId: currentUser.sub,
      fileId: file.id,
      action: "delete",
      decision: "allowed",
      reason: destroyReason,
      request,
    });

    return json({
      message: "File deleted permanently and removed from secure storage.",
      fileId: file.id,
      destroyed: true,
    });
  } catch (error) {
    console.error("Delete failed", error);
    return json({ error: "Delete failed" }, { status: 500 });
  }
}

async function handleApiRequestInternal(request, path) {
  const [segment0, segment1, segment2, segment3, segment4] = path;
  const method = request.method;

  if (method === "GET" && path.length === 1 && segment0 === "health") {
    return json({ status: "ok" });
  }

  if (method === "POST" && path.length === 2 && segment0 === "auth" && segment1 === "register") {
    return json({ error: "Self-registration disabled. Contact admin." }, { status: 403 });
  }

  if (method === "POST" && path.length === 2 && segment0 === "auth" && segment1 === "login") {
    return handleLogin(request);
  }

  if (
    method === "POST" &&
    path.length === 4 &&
    segment0 === "auth" &&
    segment1 === "login" &&
    segment2 === "mfa" &&
    segment3 === "verify"
  ) {
    return handleLoginMfaVerify(request);
  }

  if (
    method === "POST" &&
    path.length === 4 &&
    segment0 === "auth" &&
    segment1 === "login" &&
    segment2 === "mfa" &&
    segment3 === "backup"
  ) {
    return handleLoginMfaBackup(request);
  }

  if (
    method === "POST" &&
    path.length === 4 &&
    segment0 === "auth" &&
    segment1 === "login" &&
    segment2 === "mfa" &&
    segment3 === "resend"
  ) {
    return handleLoginMfaResend(request);
  }

  if (method === "GET" && path.length === 2 && segment0 === "abac" && segment1 === "options") {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;

    try {
      const departments = await listDepartments();
      return json({
        roles: ROLE_OPTIONS,
        departments: departments.map((department) => department.name),
        clearances: CLEARANCE_OPTIONS,
        securityLevels: SECURITY_LEVEL_OPTIONS,
      });
    } catch {
      return json({ error: "Failed to load ABAC options" }, { status: 500 });
    }
  }

  if (method === "GET" && path.length === 2 && segment0 === "user" && segment1 === "files") {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;

    try {
      const userId = auth.user.sub;
      const owned = await query(
        "SELECT * FROM files WHERE owner_id = $1 AND is_destroyed = FALSE ORDER BY created_at DESC",
        [userId]
      );
      const sharedWithMe = await listAccessibleFilesForUser(auth.user);
      const sharedByMe = await query(
        `SELECT files.*, shares.id AS share_id, shares.recipient_id, shares.permission, shares.share_mode,
                shares.access_count, shares.max_access_count, shares.created_at AS shared_at,
                shares.last_accessed_at, shares.consumed_at, users.email AS recipient_email
         FROM shares
         JOIN files ON files.id = shares.file_id
         LEFT JOIN users ON users.id = shares.recipient_id
         WHERE shares.owner_id = $1
         ORDER BY shares.created_at DESC`,
        [userId]
      );

      return json({
        owned: owned.rows,
        sharedWithMe,
        sharedByMe: sharedByMe.rows,
      });
    } catch {
      return json({ error: "Failed to load user files" }, { status: 500 });
    }
  }

  if (method === "GET" && path.length === 3 && segment0 === "user" && segment1 === "accessible" && segment2 === "files") {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;

    try {
      const files = await listAccessibleFilesForUser(auth.user);
      return json({ files });
    } catch {
      return json({ error: "Failed to load accessible files" }, { status: 500 });
    }
  }

  if (method === "GET" && path.length === 2 && segment0 === "account" && segment1 === "security") {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;
    return handleAccountSecurity(auth.user);
  }

  if (
    method === "POST" &&
    path.length === 5 &&
    segment0 === "account" &&
    segment1 === "security" &&
    segment2 === "mfa" &&
    segment3 === "enable" &&
    segment4 === "start"
  ) {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;
    return handleStartMfaEnable(request, auth.user);
  }

  if (
    method === "POST" &&
    path.length === 5 &&
    segment0 === "account" &&
    segment1 === "security" &&
    segment2 === "mfa" &&
    segment3 === "enable" &&
    segment4 === "verify"
  ) {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;
    return handleVerifyMfaEnable(request, auth.user);
  }

  if (
    method === "POST" &&
    path.length === 4 &&
    segment0 === "account" &&
    segment1 === "security" &&
    segment2 === "mfa" &&
    segment3 === "disable"
  ) {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;
    return handleDisableMfa(request, auth.user);
  }

  if (
    method === "POST" &&
    path.length === 4 &&
    segment0 === "account" &&
    segment1 === "security" &&
    segment2 === "mfa" &&
    segment3 === "regenerate-backup-codes"
  ) {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;
    return handleRegenerateBackupCodes(request, auth.user);
  }

  if (method === "POST" && path.length === 1 && segment0 === "shares") {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;

    try {
      const body = await parseJson(request);
      const { fileId, recipientEmail, permission } = body;
      if (!fileId || !recipientEmail) {
        return json({ error: "fileId and recipientEmail required" }, { status: 400 });
      }

      const fileResult = await query("SELECT * FROM files WHERE id = $1", [fileId]);
      const file = fileResult.rows[0];
      if (!file) return json({ error: "File not found" }, { status: 404 });
      if (file.is_destroyed) {
        return json(
          { error: "File has already been destroyed after a prior secure access" },
          { status: 410 }
        );
      }

      if (auth.user.role !== "admin" && file.owner_id !== auth.user.sub) {
        return json({ error: "Only owner or admin can share" }, { status: 403 });
      }

      const recipient = await getUserByEmail(recipientEmail);
      if (!recipient) return json({ error: "Recipient not found" }, { status: 404 });

      const existing = await query(
        `SELECT id
         FROM shares
         WHERE file_id = $1
           AND consumed_at IS NULL
           AND access_count < max_access_count`,
        [fileId]
      );
      if (existing.rows.length) {
        return json({ error: "File already has an active one-time share" }, { status: 409 });
      }

      const shareResult = await query(
        `INSERT INTO shares (file_id, owner_id, recipient_id, permission, share_mode, access_count, max_access_count)
         VALUES ($1, $2, $3, $4, 'one_time', 0, 1)
         RETURNING *`,
        [fileId, file.owner_id, recipient.id, permission || "read"]
      );

      await logAccess({
        userId: auth.user.sub,
        fileId,
        action: "share",
        decision: "allowed",
        reason: `Shared with ${recipient.email}`,
        request,
      });

      return json({ share: shareResult.rows[0] });
    } catch {
      return json({ error: "Share failed" }, { status: 500 });
    }
  }

  if (method === "GET" && path.length === 2 && segment0 === "shares" && segment1 === "incoming") {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;

    try {
      const result = await query(
        `SELECT shares.*, files.filename, files.security_level, files.is_destroyed, files.destroyed_at,
                users.email AS owner_email
         FROM shares
         JOIN files ON files.id = shares.file_id
         LEFT JOIN users ON users.id = shares.owner_id
         WHERE shares.recipient_id = $1
           AND shares.consumed_at IS NULL
           AND files.is_destroyed = FALSE
         ORDER BY shares.created_at DESC`,
        [auth.user.sub]
      );
      return json({ shares: result.rows });
    } catch {
      return json({ error: "Failed to load shares" }, { status: 500 });
    }
  }

  if (method === "GET" && path.length === 2 && segment0 === "shares" && segment1 === "outgoing") {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;

    try {
      const result = await query(
        `SELECT shares.*, files.filename, files.is_destroyed, files.destroyed_at, users.email AS recipient_email
         FROM shares
         JOIN files ON files.id = shares.file_id
         LEFT JOIN users ON users.id = shares.recipient_id
         WHERE shares.owner_id = $1
         ORDER BY shares.created_at DESC`,
        [auth.user.sub]
      );
      return json({ shares: result.rows });
    } catch {
      return json({ error: "Failed to load shares" }, { status: 500 });
    }
  }

  if (method === "POST" && path.length === 2 && segment0 === "files" && segment1 === "upload") {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;
    return handleUpload(request, auth.user);
  }

  if (method === "GET" && path.length === 3 && segment0 === "files" && segment1 === "download") {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;
    return handleDownload(request, auth.user, segment2);
  }

  if (method === "DELETE" && path.length === 2 && segment0 === "files") {
    const auth = await authorizeRequest(request);
    if (auth.response) return auth.response;
    return handleDeleteFile(request, auth.user, segment1);
  }

  if (segment0 === "admin") {
    const auth = await authorizeRequest(request, "admin");
    if (auth.response) return auth.response;

    if (method === "GET" && path.length === 2 && segment1 === "departments") {
      try {
        const departments = await listDepartments();
        return json({ departments });
      } catch (error) {
        console.error("Failed to load departments", error);
        return json({ error: "Failed to load departments" }, { status: 500 });
      }
    }

    if (method === "POST" && path.length === 2 && segment1 === "departments") {
      try {
        const body = await parseJson(request);
        const normalized = normalizeToken(body?.name);
        if (!normalized) {
          return json({ error: "Department name is required" }, { status: 400 });
        }
        await ensureDepartment(normalized);
        const departments = await listDepartments();
        return json({ departments });
      } catch (error) {
        console.error("Failed to create department", error);
        if (error?.code === "42P01") {
          return json(
            { error: "Departments table missing. Run migration and restart backend." },
            { status: 500 }
          );
        }
        return json({ error: "Failed to create department" }, { status: 500 });
      }
    }

    if (method === "GET" && path.length === 2 && segment1 === "users") {
      try {
        const result = await query(
          `SELECT id, email, full_name, role, department, clearance, is_active, mfa_enabled, mfa_method, created_at
           FROM users
           ORDER BY created_at DESC`
        );
        const departments = await listDepartments();
        return json({
          users: result.rows,
          departments: departments.map((department) => department.name),
          roleOptions: ROLE_OPTIONS,
          clearanceOptions: CLEARANCE_OPTIONS,
        });
      } catch {
        return json({ error: "Failed to load users" }, { status: 500 });
      }
    }

    if (method === "POST" && path.length === 2 && segment1 === "users") {
      try {
        const body = await parseJson(request);
        const { email, password, fullName, role, department, clearance } = body;
        if (!email || !password || !fullName || !role || !department) {
          return json({ error: "Missing required fields" }, { status: 400 });
        }

        const normalizedRole = normalizeToken(role);
        const normalizedDepartment = normalizeToken(department);
        await ensureDepartment(normalizedDepartment);

        const passwordHash = await hashPassword(password);
        const result = await query(
          `INSERT INTO users (email, password_hash, full_name, role, department, clearance, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)
           RETURNING id, email, full_name, role, department, clearance, is_active, mfa_enabled, mfa_method, created_at`,
          [email, passwordHash, fullName, normalizedRole, normalizedDepartment, Number(clearance || 1)]
        );
        return json({ user: result.rows[0] });
      } catch (error) {
        if (error.code === "23505") {
          return json({ error: "Email already exists" }, { status: 409 });
        }
        return json({ error: "Failed to create user" }, { status: 500 });
      }
    }

    if (method === "PATCH" && path.length === 3 && segment1 === "users") {
      try {
        const body = await parseJson(request);
        const { fullName, role, department, clearance, isActive, password } = body;
        const fields = [];
        const values = [];
        let passwordReset = null;

        if (fullName !== undefined) {
          fields.push(`full_name = $${fields.length + 1}`);
          values.push(fullName);
        }
        if (role !== undefined) {
          fields.push(`role = $${fields.length + 1}`);
          values.push(normalizeToken(role));
        }
        if (department !== undefined) {
          await ensureDepartment(department);
          fields.push(`department = $${fields.length + 1}`);
          values.push(normalizeToken(department));
        }
        if (clearance !== undefined) {
          fields.push(`clearance = $${fields.length + 1}`);
          values.push(Number(clearance));
        }
        if (isActive !== undefined) {
          fields.push(`is_active = $${fields.length + 1}`);
          values.push(Boolean(isActive));
        }
        if (password !== undefined) {
          passwordReset = await resetUserPassword(segment2, password);
          if (passwordReset.error) {
            return json(
              { error: passwordReset.error },
              { status: passwordReset.status || 400 }
            );
          }
        }

        if (!fields.length && !password) {
          return json({ error: "No fields to update" }, { status: 400 });
        }

        if (!fields.length) {
          return json({ user: passwordReset.user });
        }

        values.push(segment2);
        const result = await query(
          `UPDATE users SET ${fields.join(", ")}
           WHERE id = $${fields.length + 1}
           RETURNING id, email, full_name, role, department, clearance, is_active, mfa_enabled, mfa_method, created_at`,
          values
        );

        if (!result.rows[0]) {
          return json({ error: "User not found" }, { status: 404 });
        }

        return json({ user: result.rows[0] });
      } catch {
        return json({ error: "Failed to update user" }, { status: 500 });
      }
    }

    if (
      method === "POST" &&
      path.length === 4 &&
      segment1 === "users" &&
      segment3 === "reset-password"
    ) {
      try {
        const body = await parseJson(request);
        const passwordReset = await resetUserPassword(segment2, body?.password);
        if (passwordReset.error) {
          return json(
            { error: passwordReset.error },
            { status: passwordReset.status || 400 }
          );
        }

        await logAccess({
          userId: auth.user.sub,
          fileId: null,
          action: "password_reset",
          decision: "allowed",
          reason: `Reset password for ${passwordReset.user.email}`,
          request,
        });

        return json({
          message: "Password reset successfully",
          user: passwordReset.user,
        });
      } catch {
        return json({ error: "Failed to reset password" }, { status: 500 });
      }
    }

    if (
      method === "POST" &&
      path.length === 5 &&
      segment1 === "users" &&
      segment3 === "mfa" &&
      segment4 === "reset"
    ) {
      return handleAdminResetMfa(request, auth.user, segment2);
    }

    if (method === "GET" && path.length === 2 && segment1 === "policies") {
      try {
        const result = await query(
          `SELECT files.id, files.filename, files.security_level, files.policy, files.created_at, users.email AS owner_email
           FROM files
           LEFT JOIN users ON users.id = files.owner_id
           WHERE files.is_destroyed = FALSE
           ORDER BY files.created_at DESC`
        );
        const departments = await listDepartments();
        return json({
          policies: result.rows,
          departments: departments.map((department) => department.name),
          roleOptions: ROLE_OPTIONS,
          clearanceOptions: CLEARANCE_OPTIONS,
        });
      } catch {
        return json({ error: "Failed to load policies" }, { status: 500 });
      }
    }

    if (method === "PATCH" && path.length === 3 && segment1 === "policies") {
      try {
        const body = await parseJson(request);
        const { roles, departments, minClearance } = body;
        if (!Array.isArray(roles) || !Array.isArray(departments) || minClearance === undefined) {
          return json(
            { error: "roles, departments and minClearance are required" },
            { status: 400 }
          );
        }

        await ensureDepartments(departments);
        const newPolicy = {
          roles: roles.map(normalizeToken).filter(Boolean),
          departments: departments.map(normalizeToken).filter(Boolean),
          minClearance: Number(minClearance),
        };

        const result = await query(
          `UPDATE files
           SET policy = $1
           WHERE id = $2
           RETURNING id, filename, security_level, policy, created_at`,
          [newPolicy, segment2]
        );

        if (!result.rows[0]) {
          return json({ error: "File not found" }, { status: 404 });
        }

        return json({ policy: result.rows[0] });
      } catch {
        return json({ error: "Failed to update policy" }, { status: 500 });
      }
    }

    if (method === "GET" && path.length === 2 && segment1 === "files") {
      try {
        const result = await query(
          `SELECT files.*, users.email AS owner_email
           FROM files
           LEFT JOIN users ON users.id = files.owner_id
           ORDER BY files.created_at DESC`
        );
        return json({ files: result.rows });
      } catch {
        return json({ error: "Failed to load files" }, { status: 500 });
      }
    }

    if (method === "GET" && path.length === 2 && segment1 === "summary") {
      try {
        const filesCount = await query("SELECT COUNT(*) FROM files WHERE is_destroyed = FALSE");
        const usersCount = await query("SELECT COUNT(*) FROM users");
        const anomalyCount = await query("SELECT COUNT(*) FROM anomaly_events");
        const authDenied = await query(
          "SELECT COUNT(*) FROM access_logs WHERE action = 'login' AND decision = 'denied'"
        );
        const malwareCount = await query("SELECT COUNT(*) FROM malware_events");

        return json({
          files: Number(filesCount.rows[0].count),
          users: Number(usersCount.rows[0].count),
          anomalies: Number(anomalyCount.rows[0].count),
          authDenied: Number(authDenied.rows[0].count),
          malware: Number(malwareCount.rows[0].count),
        });
      } catch {
        return json({ error: "Failed to load summary" }, { status: 500 });
      }
    }

    if (method === "GET" && path.length === 2 && segment1 === "analytics") {
      try {
        const anomalies = await query(
          `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)
           FROM anomaly_events
           WHERE created_at >= NOW() - INTERVAL '7 day'
           GROUP BY 1`
        );
        const malware = await query(
          `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)
           FROM malware_events
           WHERE created_at >= NOW() - INTERVAL '7 day'
           GROUP BY 1`
        );
        const authFailures = await query(
          `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)
           FROM access_logs
           WHERE action = 'login' AND decision = 'denied' AND created_at >= NOW() - INTERVAL '7 day'
           GROUP BY 1`
        );

        return json({
          anomalyDetection: fillSeries(anomalies.rows),
          malwareDetection: fillSeries(malware.rows),
          authFailures: fillSeries(authFailures.rows),
        });
      } catch {
        return json({ error: "Failed to load analytics" }, { status: 500 });
      }
    }

    if (method === "GET" && path.length === 2 && segment1 === "detection-results") {
      const detectionResults = await loadDetectionResults();
      if (detectionResults?.error) {
        return json({ error: detectionResults.error }, { status: detectionResults.status || 500 });
      }
      return json(detectionResults);
    }

    if (method === "GET" && path.length === 3 && segment1 === "logs" && segment2 === "audit") {
      try {
        const result = await query(
          `SELECT access_logs.*, users.email, files.filename
           FROM access_logs
           LEFT JOIN users ON users.id = access_logs.user_id
           LEFT JOIN files ON files.id = access_logs.file_id
           ORDER BY access_logs.created_at DESC
           LIMIT 200`
        );
        return json({ logs: result.rows });
      } catch {
        return json({ error: "Failed to fetch audit logs" }, { status: 500 });
      }
    }

    if (method === "GET" && path.length === 3 && segment1 === "logs" && segment2 === "auth") {
      try {
        const result = await query(
          `SELECT access_logs.*, users.email
           FROM access_logs
           LEFT JOIN users ON users.id = access_logs.user_id
           WHERE access_logs.action = 'login'
           ORDER BY access_logs.created_at DESC
           LIMIT 200`
        );
        return json({ logs: result.rows });
      } catch {
        return json({ error: "Failed to fetch auth logs" }, { status: 500 });
      }
    }

    if (method === "GET" && path.length === 3 && segment1 === "logs" && segment2 === "anomalies") {
      try {
        const anomaly = await query(
          `SELECT anomaly_events.id, anomaly_events.created_at, anomaly_events.score, users.email, files.filename
           FROM anomaly_events
           LEFT JOIN users ON users.id = anomaly_events.user_id
           LEFT JOIN files ON files.id = anomaly_events.file_id
           ORDER BY anomaly_events.created_at DESC
           LIMIT 200`
        );
        return json({ events: anomaly.rows });
      } catch {
        return json({ error: "Failed to fetch anomaly logs" }, { status: 500 });
      }
    }

    if (method === "GET" && path.length === 3 && segment1 === "logs" && segment2 === "malware") {
      try {
        const limitParam = Number(new URL(request.url).searchParams.get("limit") || 200);
        const limit = Number.isFinite(limitParam)
          ? Math.min(Math.max(Math.trunc(limitParam), 1), 200)
          : 200;
        const malware = await query(
          `SELECT malware_events.id,
                  malware_events.created_at,
                  malware_events.score,
                  malware_events.reasons,
                  malware_events.mime_type,
                  malware_events.context,
                  users.email,
                  COALESCE(files.filename, malware_events.filename) AS filename
           FROM malware_events
           LEFT JOIN users ON users.id = malware_events.user_id
           LEFT JOIN files ON files.id = malware_events.file_id
           ORDER BY malware_events.created_at DESC
           LIMIT $1`,
          [limit]
        );
        return json({ events: malware.rows });
      } catch {
        return json({ error: "Failed to fetch malware logs" }, { status: 500 });
      }
    }

    if (method === "GET" && path.length === 3 && segment1 === "logs" && segment2 === "transfers") {
      try {
        const result = await query(
          `SELECT access_logs.*, users.email, files.filename
           FROM access_logs
           LEFT JOIN users ON users.id = access_logs.user_id
           LEFT JOIN files ON files.id = access_logs.file_id
           WHERE access_logs.action IN ('upload', 'download', 'share')
           ORDER BY access_logs.created_at DESC
           LIMIT 200`
        );
        return json({ logs: result.rows });
      } catch {
        return json({ error: "Failed to fetch transfer logs" }, { status: 500 });
      }
    }
  }

  return json({ error: "Not found" }, { status: 404 });
}

export async function handleApiRequest(request, path) {
  try {
    await ensurePlatformReady();
  } catch (error) {
    console.error("Platform warmup failed", error);
    if (isRetryableBootstrapError(error)) {
      return serviceWarmingUpResponse();
    }
    return json({ error: "Internal server error" }, { status: 500 });
  }

  try {
    return await handleApiRequestInternal(request, path);
  } catch (error) {
    console.error("Unhandled API route error", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
