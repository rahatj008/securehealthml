"use client";

import { useEffect, useEffectEvent, useState } from "react";
import AppShell from "../components/AppShell";
import { apiFetch } from "../lib/api";
import { useAuthGuard } from "../lib/auth";
import { adminNav, userNav } from "../lib/nav";

type SecurityResponse = {
  mfaEnabled: boolean;
  mfaStatus: "enabled" | "disabled";
  method: string | null;
  backupCodesRemaining: number;
};

type ChallengeResponse = {
  message?: string;
  challengeId: string;
  maskedEmail: string;
  method: string;
};

type EnableVerifyResponse = {
  message?: string;
  mfaEnabled: boolean;
  method: string;
  backupCodes: string[];
};

type DisableResponse = {
  message?: string;
  mfaEnabled: boolean;
  method: null;
};

type RegenerateResponse = {
  message?: string;
  backupCodes: string[];
};

function formatMethod(method: string | null) {
  if (!method) return "Not enabled";
  if (method === "email_otp") return "Email OTP";
  return method;
}

function roleMeta(role: string, clearance: number) {
  const label = role.slice(0, 1).toUpperCase() + role.slice(1);
  return `${label} | Clearance ${clearance}`;
}

export default function SecurityPage() {
  const { token, user, ready, logout } = useAuthGuard();
  const [security, setSecurity] = useState<SecurityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [working, setWorking] = useState<string | null>(null);

  async function loadSecurity() {
    const data = await apiFetch<SecurityResponse>("/account/security", token || undefined);
    setSecurity(data);
  }

  const loadSecurityEvent = useEffectEvent(async () => {
    await loadSecurity();
  });

  useEffect(() => {
    if (!token) return;
    loadSecurityEvent()
      .catch((err) => setError((err as Error).message || "Failed to load security settings."))
      .finally(() => setLoading(false));
  }, [token]);

  async function startEnable() {
    try {
      setWorking("enable-start");
      setError("");
      const data = await apiFetch<ChallengeResponse>("/account/security/mfa/enable/start", token || undefined, {
        method: "POST",
      });
      setChallengeId(data.challengeId);
      setMaskedEmail(data.maskedEmail);
      setMessage(data.message || "A verification code has been sent to your email.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function verifyEnable(e: React.FormEvent) {
    e.preventDefault();

    try {
      setWorking("enable-verify");
      setError("");
      const data = await apiFetch<EnableVerifyResponse>("/account/security/mfa/enable/verify", token || undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code: setupCode }),
      });
      setBackupCodes(data.backupCodes || []);
      setChallengeId("");
      setMaskedEmail("");
      setSetupCode("");
      setMessage(data.message || "MFA enabled successfully.");
      await loadSecurity();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function disableMfa(e: React.FormEvent) {
    e.preventDefault();

    try {
      setWorking("disable");
      setError("");
      const data = await apiFetch<DisableResponse>("/account/security/mfa/disable", token || undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword }),
      });
      setBackupCodes([]);
      setCurrentPassword("");
      setMessage(data.message || "MFA disabled.");
      await loadSecurity();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function regenerateBackupCodes() {
    try {
      setWorking("regenerate");
      setError("");
      const data = await apiFetch<RegenerateResponse>(
        "/account/security/mfa/regenerate-backup-codes",
        token || undefined,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword }),
        }
      );
      setBackupCodes(data.backupCodes || []);
      setCurrentPassword("");
      setMessage(data.message || "Backup codes regenerated.");
      await loadSecurity();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(null);
    }
  }

  if (!ready || !user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <AppShell
      title="Secured Health Records"
      subtitle="Account protection and recovery settings"
      userName={user.full_name || user.email}
      userMeta={roleMeta(user.role, user.clearance)}
      onLogout={logout}
      nav={user.role === "admin" ? adminNav : userNav}
    >
      <section className="page-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="page-eyebrow text-blue-600">Security</p>
            <h1 className="page-title">
              Protect your account with an email verification step and single-use recovery codes.
            </h1>
            <p className="page-copy">
              Enable multi-factor authentication to require a one-time email code after your password, then save the
              backup codes somewhere safe for emergencies.
            </p>
          </div>
          <span
            className={`hero-chip ${
              security?.mfaEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"
            }`}
          >
            MFA {security?.mfaEnabled ? "enabled" : "disabled"}
          </span>
        </div>
      </section>

      {error ? (
        <div className="alert-card alert-error">{error}</div>
      ) : null}

      {message ? (
        <div className="alert-card alert-info">{message}</div>
      ) : null}

      {loading && !security ? (
        <div className="section-card text-sm text-slate-500">Loading security settings...</div>
      ) : null}

      {security ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="section-card">
            <div className="section-header">
              <div>
                <p className="section-title">MFA status</p>
                <p className="section-copy mt-1">
                  Review whether your account currently requires email verification during sign-in.
                </p>
              </div>
              <span className="status-pill bg-slate-100 text-slate-700">{formatMethod(security.method)}</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.35rem] bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Status</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {security.mfaEnabled ? "Enabled" : "Disabled"}
                </p>
              </div>
              <div className="rounded-[1.35rem] bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Backup codes left</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{security.backupCodesRemaining}</p>
              </div>
            </div>

            {!security.mfaEnabled ? (
              <div className="alert-card alert-info mt-5">
                MFA is currently off. Turn it on to require a 6-digit email verification code after the password step.
              </div>
            ) : (
              <div className="alert-card alert-success mt-5">
                MFA is active on this account. Save your backup codes somewhere secure before you need them.
              </div>
            )}
          </section>

          <section className="section-card">
            {!security.mfaEnabled ? (
              <>
                <div className="section-header">
                  <div>
                    <p className="section-title">Enable email OTP</p>
                    <p className="section-copy mt-1">
                      Send a setup code to your account email, then verify it to turn MFA on.
                    </p>
                  </div>
                  <button
                    onClick={startEnable}
                    disabled={working === "enable-start"}
                    className="button-primary"
                  >
                    {working === "enable-start" ? "Sending..." : "Send setup code"}
                  </button>
                </div>

                {challengeId ? (
                  <form onSubmit={verifyEnable} className="mt-5 space-y-4">
                    <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                      Enter the code sent to <span className="font-semibold text-slate-900">{maskedEmail}</span>.
                    </div>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Verification code</span>
                      <input
                        className="control-input"
                        placeholder="6-digit code"
                        value={setupCode}
                        onChange={(event) => setSetupCode(event.target.value)}
                      />
                    </label>

                    <button disabled={working === "enable-verify"} className="button-dark w-full">
                      {working === "enable-verify" ? "Verifying..." : "Enable MFA"}
                    </button>
                  </form>
                ) : null}
              </>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="section-title">Recovery actions</p>
                  <p className="section-copy mt-1">
                    Confirm your current password before disabling MFA or generating a fresh set of backup codes.
                  </p>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Current password</span>
                  <input
                    type="password"
                    className="control-input"
                    placeholder="Enter your current password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={regenerateBackupCodes}
                    disabled={working === "regenerate"}
                    className="button-primary"
                  >
                    {working === "regenerate" ? "Regenerating..." : "Regenerate backup codes"}
                  </button>

                  <form onSubmit={disableMfa}>
                    <button
                      disabled={working === "disable"}
                      className="button-danger-soft w-full"
                    >
                      {working === "disable" ? "Disabling..." : "Disable MFA"}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {backupCodes.length ? (
        <section className="section-card">
          <div className="section-header">
            <div>
              <p className="section-title">Backup codes</p>
              <p className="section-copy mt-1">
                These codes are shown once. Save them now and use each code only one time.
              </p>
            </div>
            <span className="status-pill bg-amber-50 text-amber-700">{backupCodes.length} codes</span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {backupCodes.map((code) => (
              <div key={code} className="rounded-[1.25rem] border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-base font-semibold tracking-[0.18em] text-slate-900">{code}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
