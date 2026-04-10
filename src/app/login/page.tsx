"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";
import { StoredUser } from "../lib/auth";

type LoginResponse = {
  token: string;
  user: StoredUser;
};

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
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

      localStorage.setItem("securhealth_token", data.token);
      localStorage.setItem("securhealth_user", JSON.stringify(data.user));

      router.push(data.user.role === "admin" ? "/admin/dashboard" : "/user/dashboard");
    } catch (err) {
      setMessage((err as Error).message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-grid px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="surface-card-strong flex flex-col justify-between rounded-[2rem] bg-slate-950 p-6 text-white sm:p-8 lg:p-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-300 sm:text-sm">
              Secured Health Records
            </p>
            <h1 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl lg:text-[2.85rem]">
              Safer record sharing with ABAC, secure storage, and live threat detection.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              The platform checks user trust, file policy, and malware signals before sensitive records move across
              teams.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              "Policy-driven access based on role, department, and clearance",
              "Live PDF model plus YARA and ClamAV screening during upload",
              "One-time share links that erase files after first secure access",
              "Local demo mode or AWS S3-backed storage for deployment",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[1.4rem] border border-white/10 bg-white/8 px-4 py-4 text-sm leading-6 text-slate-200"
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center">
          <div className="surface-card-strong w-full rounded-[2rem] p-6 sm:p-8">
            <div className="rounded-[1.6rem] bg-blue-50 px-4 py-4 text-sm text-blue-800">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">Unified gateway</p>
              <p className="mt-2 font-semibold">Sign in to the administrator console or clinician workspace.</p>
            </div>

            <div className="mt-6">
              <p className="text-2xl font-semibold text-slate-900">Sign in</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Use your seeded demo account or your assigned credentials to enter the secure platform.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  placeholder="Enter your email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Password</span>
                <input
                  type="password"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </label>

              <button
                disabled={loading}
                className="w-full rounded-2xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Validating..." : "Enter Secure Platform"}
              </button>
            </form>

            {message ? (
              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {message}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
