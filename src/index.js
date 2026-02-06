import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

import { query } from "./db.js";
import { signToken, verifyToken, hashPassword, verifyPassword } from "./auth.js";
import { evaluatePolicy } from "./abac.js";
import { scoreAnomaly, sendFeedback } from "./ml.js";
import { uploadToS3, getSignedDownloadUrl } from "./s3.js";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:3000" }));
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  try {
    const token = auth.replace("Bearer ", "");
    req.user = verifyToken(token);
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

async function logAccess({ userId, fileId, action, decision, reason, req }) {
  await query(
    `INSERT INTO access_logs (user_id, file_id, action, decision, reason, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`
    , [
      userId,
      fileId,
      action,
      decision,
      reason,
      req.ip,
      req.headers["user-agent"] || null,
    ]
  );
}

function buildFeatures({ user, file, action }) {
  const hour = new Date().getHours();
  return {
    behavior: {
      action,
      hour,
      clearance: user.clearance,
      role: user.role,
    },
    content: {
      size_bytes: file?.size_bytes || 0,
      mime_type: file?.mime_type || "unknown",
      security_level: file?.security_level || "unknown",
    },
  };
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/auth/register", async (req, res) => {
  try {
    const { email, password, fullName, role, department, clearance } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    const passwordHash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, role, department, clearance)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, full_name, role, department, clearance`,
      [email, passwordHash, fullName || "", role || "clinician", department || "general", clearance || 1]
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await query(
      "SELECT id, email, password_hash, full_name, role, department, clearance FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      await logAccess({
        userId: null,
        fileId: null,
        action: "login",
        decision: "denied",
        reason: "Invalid credentials",
        req,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      await logAccess({
        userId: user.id,
        fileId: null,
        action: "login",
        decision: "denied",
        reason: "Invalid credentials",
        req,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }
    await logAccess({
      userId: user.id,
      fileId: null,
      action: "login",
      decision: "allowed",
      reason: "Authenticated",
      req,
    });
    const token = signToken(user);
    res.json({ token, user: { ...user, password_hash: undefined } });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/files", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const result = await query("SELECT * FROM files ORDER BY created_at DESC");
    const visible = result.rows.filter((file) => {
      const policy = file.policy;
      return evaluatePolicy(user, policy).allowed;
    });
    res.json({ files: visible });
  } catch (err) {
    res.status(500).json({ error: "Failed to load files" });
  }
});

app.post("/files/upload", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    const user = req.user;
    if (!req.file) {
      return res.status(400).json({ error: "Missing file" });
    }

    const policy = {
      roles: req.body.roles ? req.body.roles.split(",") : [user.role],
      departments: req.body.departments ? req.body.departments.split(",") : [user.department],
      minClearance: req.body.minClearance ? Number(req.body.minClearance) : user.clearance,
    };

    const policyCheck = evaluatePolicy(user, policy);
    if (!policyCheck.allowed) {
      await logAccess({
        userId: user.sub,
        fileId: null,
        action: "upload",
        decision: "denied",
        reason: policyCheck.reason,
        req,
      });
      return res.status(403).json({ error: "ABAC policy denied" });
    }

    const fileMeta = {
      size_bytes: req.file.size,
      mime_type: req.file.mimetype,
      security_level: req.body.securityLevel || "Restricted",
    };

    const features = buildFeatures({ user, file: fileMeta, action: "upload" });
    const mlResult = await scoreAnomaly(features);

    if (mlResult.anomaly) {
      await query(
        "INSERT INTO anomaly_events (user_id, file_id, score, features) VALUES ($1, $2, $3, $4)",
        [user.sub, null, mlResult.score, features]
      );
      await logAccess({
        userId: user.sub,
        fileId: null,
        action: "upload",
        decision: "denied",
        reason: "ML anomaly detected",
        req,
      });
      return res.status(403).json({ error: "Anomalous activity detected" });
    }

    const key = `ehr/${user.sub}/${uuidv4()}-${req.file.originalname}`;
    await uploadToS3({ key, buffer: req.file.buffer, contentType: req.file.mimetype });

    const fileInsert = await query(
      `INSERT INTO files (owner_id, filename, s3_key, mime_type, size_bytes, security_level, policy)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user.sub, req.file.originalname, key, req.file.mimetype, req.file.size, fileMeta.security_level, policy]
    );

    const saved = fileInsert.rows[0];

    await logAccess({
      userId: user.sub,
      fileId: saved.id,
      action: "upload",
      decision: "allowed",
      reason: "Upload completed",
      req,
    });

    await sendFeedback({
      outcome: "normal",
      features,
      user_id: user.sub,
      file_id: saved.id,
    });

    res.json({ file: saved });
  } catch (err) {
    res.status(500).json({ error: "Upload failed" });
  }
});

app.get("/files/download/:id", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const result = await query("SELECT * FROM files WHERE id = $1", [req.params.id]);
    const file = result.rows[0];
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const policyCheck = evaluatePolicy(user, file.policy);
    if (!policyCheck.allowed) {
      await logAccess({
        userId: user.sub,
        fileId: file.id,
        action: "download",
        decision: "denied",
        reason: policyCheck.reason,
        req,
      });
      return res.status(403).json({ error: "ABAC policy denied" });
    }

    const features = buildFeatures({ user, file, action: "download" });
    const mlResult = await scoreAnomaly(features);

    if (mlResult.anomaly) {
      await query(
        "INSERT INTO anomaly_events (user_id, file_id, score, features) VALUES ($1, $2, $3, $4)",
        [user.sub, file.id, mlResult.score, features]
      );
      await logAccess({
        userId: user.sub,
        fileId: file.id,
        action: "download",
        decision: "denied",
        reason: "ML anomaly detected",
        req,
      });
      return res.status(403).json({ error: "Anomalous activity detected" });
    }

    const url = await getSignedDownloadUrl(file.s3_key);

    await logAccess({
      userId: user.sub,
      fileId: file.id,
      action: "download",
      decision: "allowed",
      reason: "Download link issued",
      req,
    });

    await sendFeedback({
      outcome: "normal",
      features,
      user_id: user.sub,
      file_id: file.id,
    });

    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: "Download failed" });
  }
});

app.get("/audit", authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT access_logs.*, users.email, files.filename
       FROM access_logs
       LEFT JOIN users ON users.id = access_logs.user_id
       LEFT JOIN files ON files.id = access_logs.file_id
       ORDER BY access_logs.created_at DESC
       LIMIT 50`
    );
    res.json({ logs: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

const port = process.env.PORT || 8000;
app.listen(port, () => {
  console.log(`Server listening on ${port}`);
});
