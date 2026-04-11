import { randomBytes, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { pool, query } from "./db.js";
import { hashPassword, verifyPassword } from "./auth.js";

export const MFA_METHOD_EMAIL_OTP = "email_otp";
export const MFA_PURPOSE_LOGIN = "login";
export const MFA_PURPOSE_ENABLE = "enable_mfa";
export const MFA_OTP_EXPIRY_MINUTES = 10;
export const MFA_MAX_ATTEMPTS = 5;
export const MFA_BACKUP_CODE_COUNT = 8;

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function smtpBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const from = String(process.env.SMTP_FROM || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if (!host || !Number.isFinite(port) || port <= 0 || !from) {
    throw createHttpError("SMTP is not configured for MFA email delivery.", 503);
  }

  if ((user && !pass) || (!user && pass)) {
    throw createHttpError("SMTP credentials are incomplete for MFA email delivery.", 503);
  }

  const auth = user && pass ? { user, pass } : undefined;
  const secure =
    process.env.SMTP_SECURE === undefined || process.env.SMTP_SECURE === ""
      ? port === 465
      : smtpBoolean(process.env.SMTP_SECURE);

  return {
    host,
    port,
    from,
    secure,
    auth,
  };
}

function buildTransporter() {
  const config = getSmtpConfig();
  return {
    from: config.from,
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    }),
  };
}

export function maskEmail(email) {
  const value = String(email || "").trim();
  const [localPart, domainPart] = value.split("@");
  if (!localPart || !domainPart) {
    return value;
  }

  const maskedLocal =
    localPart.length <= 2 ? `${localPart.slice(0, 1)}*` : `${localPart.slice(0, 2)}${"*".repeat(Math.min(4, localPart.length - 2))}`;
  return `${maskedLocal}@${domainPart}`;
}

function purposeCopy(purpose) {
  if (purpose === MFA_PURPOSE_ENABLE) {
    return {
      subject: "Your SecurHealth MFA setup code",
      intro: "Use this code to finish enabling multi-factor authentication on your SecurHealth account.",
    };
  }

  return {
    subject: "Your SecurHealth verification code",
    intro: "Use this code to finish signing in to your SecurHealth account.",
  };
}

function generateOtpCode() {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

function normalizeBackupCode(value) {
  return String(value || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
}

function generateBackupCode() {
  const normalized = normalizeBackupCode(randomBytes(5).toString("hex")).slice(0, 10);
  return `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
}

async function sendOtpEmail({ to, code, purpose }) {
  const { subject, intro } = purposeCopy(purpose);
  const { from, transporter } = buildTransporter();

  await transporter.sendMail({
    from,
    to,
    subject,
    text: `${intro}\n\nVerification code: ${code}\nExpires in ${MFA_OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this code, you can ignore this email.`,
  });
}

async function invalidateActiveChallenges({ userId, purpose, client = null }) {
  const executor = client || { query };
  await executor.query(
    `UPDATE mfa_challenges
     SET consumed_at = NOW()
     WHERE user_id = $1
       AND purpose = $2
       AND consumed_at IS NULL`,
    [userId, purpose]
  );
}

export async function createMfaChallenge({ userId, deliveryEmail, purpose }) {
  const code = generateOtpCode();
  const codeHash = await hashPassword(code);

  try {
    await sendOtpEmail({ to: deliveryEmail, code, purpose });
  } catch {
    throw createHttpError("Unable to deliver the verification code right now. Please try again later.", 503);
  }

  await invalidateActiveChallenges({ userId, purpose });
  const result = await query(
    `INSERT INTO mfa_challenges (user_id, purpose, code_hash, delivery_email, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${MFA_OTP_EXPIRY_MINUTES} minutes')
     RETURNING id, expires_at`,
    [userId, purpose, codeHash, deliveryEmail]
  );

  return {
    challengeId: result.rows[0].id,
    maskedEmail: maskEmail(deliveryEmail),
    expiresAt: result.rows[0].expires_at,
    method: MFA_METHOD_EMAIL_OTP,
  };
}

export async function resendMfaChallenge({ challengeId, purpose }) {
  const result = await query(
    `SELECT id, user_id, purpose, delivery_email
     FROM mfa_challenges
     WHERE id = $1`,
    [challengeId]
  );
  const challenge = result.rows[0];
  if (!challenge) {
    throw createHttpError("Verification session not found. Please start again.", 404);
  }
  if (purpose && challenge.purpose !== purpose) {
    throw createHttpError("Verification session is not valid for this action.", 400);
  }

  return createMfaChallenge({
    userId: challenge.user_id,
    deliveryEmail: challenge.delivery_email,
    purpose: challenge.purpose,
  });
}

export async function verifyMfaChallenge({ challengeId, code, purpose }) {
  const result = await query(
    `SELECT id, user_id, purpose, code_hash, delivery_email, expires_at, consumed_at, attempt_count
     FROM mfa_challenges
     WHERE id = $1`,
    [challengeId]
  );
  const challenge = result.rows[0];
  if (!challenge) {
    throw createHttpError("Verification session not found. Please start again.", 404);
  }
  if (purpose && challenge.purpose !== purpose) {
    throw createHttpError("Verification session is not valid for this action.", 400);
  }
  if (challenge.consumed_at) {
    throw createHttpError("This verification code is no longer active. Please request a new code.", 410);
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await query(
      `UPDATE mfa_challenges
       SET consumed_at = NOW()
       WHERE id = $1 AND consumed_at IS NULL`,
      [challenge.id]
    );
    throw createHttpError("This verification code has expired. Please request a new code.", 410);
  }
  if (Number(challenge.attempt_count || 0) >= MFA_MAX_ATTEMPTS) {
    await query(
      `UPDATE mfa_challenges
       SET consumed_at = NOW()
       WHERE id = $1 AND consumed_at IS NULL`,
      [challenge.id]
    );
    throw createHttpError("Too many invalid attempts. Please request a new code.", 429);
  }

  const valid = await verifyPassword(String(code || "").trim(), challenge.code_hash);
  if (!valid) {
    const nextAttemptCount = Number(challenge.attempt_count || 0) + 1;
    await query(
      `UPDATE mfa_challenges
       SET attempt_count = attempt_count + 1,
           consumed_at = CASE WHEN $2 >= $3 THEN NOW() ELSE consumed_at END
       WHERE id = $1`,
      [challenge.id, nextAttemptCount, MFA_MAX_ATTEMPTS]
    );
    throw createHttpError(
      nextAttemptCount >= MFA_MAX_ATTEMPTS
        ? "Too many invalid attempts. Please request a new code."
        : "Invalid verification code.",
      nextAttemptCount >= MFA_MAX_ATTEMPTS ? 429 : 401
    );
  }

  await query(
    `UPDATE mfa_challenges
     SET consumed_at = NOW()
     WHERE id = $1 AND consumed_at IS NULL`,
    [challenge.id]
  );

  return {
    userId: challenge.user_id,
    purpose: challenge.purpose,
    deliveryEmail: challenge.delivery_email,
  };
}

export async function consumeLoginChallenges(userId) {
  await invalidateActiveChallenges({ userId, purpose: MFA_PURPOSE_LOGIN });
}

export async function hasActiveLoginChallenge(userId) {
  const result = await query(
    `SELECT COUNT(*)
     FROM mfa_challenges
     WHERE user_id = $1
       AND purpose = $2
       AND consumed_at IS NULL
       AND expires_at > NOW()`,
    [userId, MFA_PURPOSE_LOGIN]
  );
  return Number(result.rows[0]?.count || 0) > 0;
}

export async function replaceBackupCodes(userId) {
  const client = await pool.connect();
  const plainCodes = [];

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM mfa_backup_codes WHERE user_id = $1", [userId]);

    for (let index = 0; index < MFA_BACKUP_CODE_COUNT; index += 1) {
      const code = generateBackupCode();
      const codeHash = await hashPassword(normalizeBackupCode(code));
      plainCodes.push(code);
      await client.query(
        `INSERT INTO mfa_backup_codes (user_id, code_hash)
         VALUES ($1, $2)`,
        [userId, codeHash]
      );
    }

    await client.query("COMMIT");
    return plainCodes;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function consumeBackupCode({ userId, backupCode }) {
  const normalized = normalizeBackupCode(backupCode);
  if (!normalized) {
    return false;
  }

  const result = await query(
    `SELECT id, code_hash
     FROM mfa_backup_codes
     WHERE user_id = $1
       AND consumed_at IS NULL
     ORDER BY created_at ASC`,
    [userId]
  );

  for (const row of result.rows) {
    const match = await verifyPassword(normalized, row.code_hash);
    if (!match) {
      continue;
    }

    const updateResult = await query(
      `UPDATE mfa_backup_codes
       SET consumed_at = NOW()
       WHERE id = $1
         AND consumed_at IS NULL`,
      [row.id]
    );
    if (updateResult.rowCount) {
      return true;
    }
  }

  return false;
}

export async function countRemainingBackupCodes(userId) {
  const result = await query(
    `SELECT COUNT(*)
     FROM mfa_backup_codes
     WHERE user_id = $1
       AND consumed_at IS NULL`,
    [userId]
  );
  return Number(result.rows[0]?.count || 0);
}

export async function resetUserMfaState(userId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE users
       SET mfa_enabled = FALSE,
           mfa_method = $2
       WHERE id = $1`,
      [userId, MFA_METHOD_EMAIL_OTP]
    );
    await client.query("DELETE FROM mfa_challenges WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM mfa_backup_codes WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
