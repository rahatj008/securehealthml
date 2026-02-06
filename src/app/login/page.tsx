"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";
import { StoredUser } from "../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "clinician",
    department: "radiology",
    clearance: 2,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      const payload =
        authMode === "login"
          ? { email: form.email, password: form.password }
          : {
              email: form.email,
              password: form.password,
              fullName: form.fullName,
              role: form.role,
              department: form.department,
              clearance: Number(form.clearance),
            };

      const data = await apiFetch(authMode === "login" ? "/auth/login" : "/auth/register", undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const token = data.token as string;
      const user = data.user as StoredUser;
      localStorage.setItem("securhealth_token", token);
      localStorage.setItem("securhealth_user", JSON.stringify(user));

      if (user.role === "admin") {
        router.push("/admin/dashboard");
      } else {
        router.push("/user/dashboard");
      }
    } catch (err) {
      setMessage((err as Error).message || "Authentication failed");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.25),_transparent_55%)]" />
        <div className="absolute -left-40 top-24 h-96 w-96 rounded-full bg-blue-600/30 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-400/20 blur-[120px]" />

        <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-900/40">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 2l7 4v6c0 5-3.8 9-7 10-3.2-1-7-5-7-10V6l7-4z" />
                  <path d="M9.5 12l1.8 1.8 3.7-3.7" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-semibold">SecurHealth ML</p>
                <p className="text-sm text-blue-100/80">Secure EHR exchange with proactive threat detection</p>
              </div>
            </div>

            <h1 className="mt-10 text-4xl font-semibold leading-tight sm:text-5xl">
              Zero-trust sharing for sensitive health records.
            </h1>
            <p className="mt-5 text-lg text-blue-100/70">
              Attribute-Based Encryption, ABAC enforcement, and XGBoost anomaly detection work together to stop
              unauthorized access before it happens.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "Real-time anomaly scoring",
                "S3 encrypted storage",
                "Immutable audit trails",
                "Adaptive ML feedback loop",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-blue-50/80">
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-10 flex items-center gap-6 text-xs text-blue-100/70">
              <div>
                <p className="text-2xl font-semibold text-white">99.97%</p>
                <p>Secure uptime</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-white">24/7</p>
                <p>Threat monitoring</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-white">SOC2</p>
                <p>Aligned controls</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/95 p-8 text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">Secure Access</p>
                <p className="text-sm text-slate-500">Authenticate to continue</p>
              </div>
              <div className="flex rounded-full bg-slate-100 p-1 text-xs">
                <button
                  onClick={() => setAuthMode("login")}
                  className={`rounded-full px-4 py-2 font-semibold ${
                    authMode === "login" ? "bg-white shadow" : "text-slate-500"
                  }`}
                >
                  Login
                </button>
                <button
                  onClick={() => setAuthMode("register")}
                  className={`rounded-full px-4 py-2 font-semibold ${
                    authMode === "register" ? "bg-white shadow" : "text-slate-500"
                  }`}
                >
                  Register
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-3">
                <input
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Email address"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <input
                  type="password"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>

              {authMode === "register" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Full name"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                  <input
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Role (clinician, radiology, ER)"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  />
                  <input
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Department"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  />
                  <input
                    type="number"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Clearance"
                    value={form.clearance}
                    onChange={(e) => setForm({ ...form, clearance: Number(e.target.value) })}
                  />
                </div>
              ) : null}

              <button className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200">
                {authMode === "login" ? "Authenticate" : "Create Account"}
              </button>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
                Multi-factor ready • All sessions are encrypted end-to-end
              </div>
            </form>

            {message ? (
              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-600">
                {message}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
