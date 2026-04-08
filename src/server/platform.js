import { query } from "./db.js";
import { signToken, verifyToken, hashPassword, verifyPassword } from "./auth.js";
import { evaluatePolicy } from "./abac.js";
import { assessSecurity, sendFeedback } from "./ml.js";
import { uploadToS3, downloadFromS3, deleteFromS3 } from "./s3.js";
import { uuidv4 } from "./backend-require.js";

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

function isRetryableBootstrapError(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  return [
    "57P03", // database system is starting up / in recovery mode
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
  ].includes(code);
}

function json(data, init = {}) {
  return Response.json(data, init);
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

    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
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

async function getUserByEmail(email) {
  const result = await query(
    "SELECT id, email, full_name, role, department, clearance, is_active FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0];
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
     RETURNING id, email, full_name, role, department, clearance, is_active, created_at`,
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

  await query(
    `UPDATE files
     SET is_destroyed = TRUE,
         destroyed_at = NOW(),
         destroyed_reason = $2
     WHERE id = $1`,
    [fileId, reason]
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

function toDownloadBody(value) {
  if (!value) return new Uint8Array();
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  return new Uint8Array(value);
}

async function handleLogin(request) {
  try {
    const body = await parseJson(request);
    const { email, password } = body;
    if (!email || !password) {
      return json({ error: "Email and password required" }, { status: 400 });
    }

    const userResult = await query(
      "SELECT id, email, password_hash, full_name, role, department, clearance, is_active FROM users WHERE email = $1",
      [email]
    );
    const user = userResult.rows[0] || null;

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

    await logAccess({
      userId: user.id,
      fileId: null,
      action: "login",
      decision: "allowed",
      reason: "Authenticated",
      request,
    });

    const token = signToken(user);
    return json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        department: user.department,
        clearance: user.clearance,
      },
    });
  } catch {
    return json({ error: "Login failed" }, { status: 500 });
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
    const mlAssessment = await assessSecurity({
      context: "file_upload",
      behavior: buildBehaviorFeatures({ request, user: currentUser, action: "upload" }),
      content: buildContentFeatures({ file, securityLevel }),
      sample_base64: buffer.toString("base64"),
    });

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

    await sendFeedback({
      outcome: "normal",
      user_id: currentUser.sub,
      file_id: saved.id,
      features: mlAssessment.features || {},
    });

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

    const mlAssessment = await assessSecurity({
      context: "file_download",
      behavior: buildBehaviorFeatures({ request, user: currentUser, action: "download" }),
      content: {
        filename: file.filename,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
        security_level: file.security_level,
      },
    });

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

async function handleApiRequestInternal(request, path) {
  const [segment0, segment1, segment2, segment3] = path;
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
      const sharedWithMe = await query(
        `SELECT files.*, shares.id AS share_id, shares.permission, shares.share_mode, shares.access_count,
                shares.max_access_count, shares.created_at AS shared_at
         FROM shares
         JOIN files ON files.id = shares.file_id
         WHERE shares.recipient_id = $1
           AND shares.consumed_at IS NULL
           AND files.is_destroyed = FALSE
         ORDER BY shares.created_at DESC`,
        [userId]
      );
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
        sharedWithMe: sharedWithMe.rows,
        sharedByMe: sharedByMe.rows,
      });
    } catch {
      return json({ error: "Failed to load user files" }, { status: 500 });
    }
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
          `SELECT id, email, full_name, role, department, clearance, is_active, created_at
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
           RETURNING id, email, full_name, role, department, clearance, is_active, created_at`,
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
           RETURNING id, email, full_name, role, department, clearance, is_active, created_at`,
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
  await ensurePlatformReady();
  try {
    return await handleApiRequestInternal(request, path);
  } catch (error) {
    console.error("Unhandled API route error", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
