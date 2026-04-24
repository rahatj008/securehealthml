"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";
import { StoredUser } from "../lib/auth";

type LoginSuccessResponse = {
  token: string;
  user: StoredUser;
};

type LoginMfaChallengeResponse = {
  mfaRequired: true;
  challengeId: string;
  maskedEmail: string;
  method: "email_otp";
};

type LoginMfaResendResponse = {
  message?: string;
  challengeId: string;
  maskedEmail: string;
  method: "email_otp";
};

type LoginResponse = LoginSuccessResponse | LoginMfaChallengeResponse;

type Notice = {
  tone: "error" | "info";
  text: string;
};

function isMfaChallengeResponse(value: LoginResponse): value is LoginMfaChallengeResponse {
  return "mfaRequired" in value;
}

export default function LoginPage() {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [form, setForm] = useState({ email: "", password: "" });
  const [mfa, setMfa] = useState({
    challengeId: "",
    maskedEmail: "",
    code: "",
    backupCode: "",
    useBackupCode: false,
  });

  function finishLogin(data: LoginSuccessResponse) {
    localStorage.setItem("securhealth_token", data.token);
    localStorage.setItem("securhealth_user", JSON.stringify(data.user));
    router.push(data.user.role === "admin" ? "/admin/dashboard" : "/user/dashboard");
  }

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setLoading(true);

    try {
      const data = await apiFetch<LoginResponse>("/auth/login", undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
        }),
      });

      if (isMfaChallengeResponse(data)) {
        setStep("mfa");
        setMfa({
          challengeId: data.challengeId,
          maskedEmail: data.maskedEmail,
          code: "",
          backupCode: "",
          useBackupCode: false,
        });
        setNotice({
          tone: "info",
          text: `A 6-digit verification code was sent to ${data.maskedEmail}.`,
        });
        return;
      }

      finishLogin(data);
    } catch (err) {
      setNotice({ tone: "error", text: (err as Error).message || "Authentication failed" });
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setLoading(true);

    try {
      const data = mfa.useBackupCode
        ? await apiFetch<LoginSuccessResponse>("/auth/login/mfa/backup", undefined, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: form.email,
              backupCode: mfa.backupCode,
            }),
          })
        : await apiFetch<LoginSuccessResponse>("/auth/login/mfa/verify", undefined, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              challengeId: mfa.challengeId,
              code: mfa.code,
            }),
          });

      finishLogin(data);
    } catch (err) {
      setNotice({ tone: "error", text: (err as Error).message || "Verification failed" });
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setNotice(null);
    setLoading(true);

    try {
      const data = await apiFetch<LoginMfaResendResponse>("/auth/login/mfa/resend", undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: mfa.challengeId,
        }),
      });
      setMfa((current) => ({
        ...current,
        challengeId: data.challengeId,
        maskedEmail: data.maskedEmail,
        code: "",
      }));
      setNotice({
        tone: "info",
        text: data.message || `A new verification code was sent to ${data.maskedEmail}.`,
      });
    } catch (err) {
      setNotice({ tone: "error", text: (err as Error).message || "Unable to resend the code." });
    } finally {
      setLoading(false);
    }
  }

  function resetMfaStep() {
    setStep("credentials");
    setMfa({
      challengeId: "",
      maskedEmail: "",
      code: "",
      backupCode: "",
      useBackupCode: false,
    });
    setNotice(null);
  }

  return (
    <div className="min-h-screen bg-grid px-4 py-4 sm:px-6 sm:py-5">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-6xl gap-4 lg:grid-cols-[1.02fr_0.98fr]">
        <div className="flex flex-col justify-center rounded-[1.75rem] border border-slate-900/80 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_34%),linear-gradient(180deg,_#08101f_0%,_#0b1528_48%,_#101b31_100%)] p-5 text-white shadow-[0_28px_64px_rgba(8,16,31,0.34)] sm:p-6 lg:p-7">
          <div className="space-y-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-300 sm:text-xs">
                Secured Health Records
              </p>
              <h1 className="mt-3 max-w-2xl text-2xl font-semibold leading-tight sm:text-[2rem] lg:text-[2.45rem]">
                Safer record sharing with ABAC, secure storage, and live threat detection.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                The platform checks user trust, file policy, and malware signals before sensitive records move across
                teams.
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Developed at Ilma University to demonstrate secure, policy-aware, malware-screened health record access.
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {[
                "Policy-driven access based on role, department, and clearance",
                "Live PDF model plus YARA and ClamAV screening during upload",
                "One-time share links that erase files after first secure access",
                "Optional email OTP MFA with backup-code recovery",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[1.15rem] border border-white/12 bg-white/8 px-3.5 py-3 text-[13px] leading-5 text-slate-200 backdrop-blur-sm"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center">
          <div className="surface-card-strong w-full rounded-[1.75rem] p-5 sm:p-6">
            <div className="mb-5 rounded-[1.35rem] border border-slate-100 bg-slate-50/90 px-4 py-4">
              <div className="rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <Image
                  src="/uni_logo.png"
                  alt="Ilma University logo"
                  width={700}
                  height={342}
                  className="h-auto w-full max-w-[220px] object-contain sm:max-w-[280px]"
                  priority
                />
              </div>
              <div className="mt-3">
                <p className="text-sm font-semibold text-slate-800">Final Year Project</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Machine learning-enhanced secure health record access platform.
                </p>
              </div>
            </div>

            <div className="rounded-[1.35rem] bg-blue-50 px-4 py-3.5 text-sm text-blue-800">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">Unified gateway</p>
              <p className="mt-2 font-semibold">
                {step === "credentials"
                  ? "Sign in to the administrator console or clinician workspace."
                  : "Complete the verification step before entering the secure platform."}
              </p>
            </div>

            <div className="mt-5">
              <p className="text-[1.7rem] font-semibold text-slate-900">
                {step === "credentials" ? "Sign in" : "Verify your login"}
              </p>
              {step === "mfa" ? (
                <p className="mt-2 text-sm leading-5 text-slate-500">
                  {`Finish sign-in for ${mfa.maskedEmail || form.email} using the email code or one of your backup codes.`}
                </p>
              ) : null}
            </div>

            {step === "credentials" ? (
              <form onSubmit={handleCredentialsSubmit} className="mt-5 space-y-3.5">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <input
                    className="control-input"
                    placeholder="Enter your email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Password</span>
                  <input
                    type="password"
                    className="control-input"
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </label>

                <button disabled={loading} className="button-primary w-full">
                  {loading ? "Validating..." : "Enter Secure Platform"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleMfaSubmit} className="mt-5 space-y-3.5">
                <div className="rounded-[1.3rem] border border-slate-100 bg-slate-50 px-4 py-3.5 text-sm text-slate-600">
                  Verification email: <span className="font-semibold text-slate-900">{mfa.maskedEmail}</span>
                </div>

                {!mfa.useBackupCode ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">6-digit verification code</span>
                    <input
                      className="control-input"
                      placeholder="Enter the code from your email"
                      value={mfa.code}
                      onChange={(e) => setMfa({ ...mfa, code: e.target.value })}
                    />
                  </label>
                ) : (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Backup code</span>
                    <input
                      className="control-input uppercase"
                      placeholder="Enter one of your saved backup codes"
                      value={mfa.backupCode}
                      onChange={(e) => setMfa({ ...mfa, backupCode: e.target.value.toUpperCase() })}
                    />
                  </label>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="submit" disabled={loading} className="button-primary flex-1">
                    {loading ? "Checking..." : mfa.useBackupCode ? "Use backup code" : "Verify and sign in"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={loading || mfa.useBackupCode}
                    className="button-secondary"
                  >
                    Resend code
                  </button>
                </div>

                <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setMfa((current) => ({ ...current, useBackupCode: !current.useBackupCode }))}
                    className="text-left font-semibold text-blue-700"
                  >
                    {mfa.useBackupCode ? "Use the emailed code instead" : "Use a backup code instead"}
                  </button>
                  <button type="button" onClick={resetMfaStep} className="text-left font-medium text-slate-500">
                    Use a different account
                  </button>
                </div>
              </form>
            )}

            {notice ? (
              <div className={`alert-card mt-4 ${notice.tone === "error" ? "alert-error" : "alert-info"}`}>
                {notice.text}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
