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

      const token = data.token;
      const user = data.user;
      localStorage.setItem("securhealth_token", token);
      localStorage.setItem("securhealth_user", JSON.stringify(user));

      if (user.role === "admin") {
        router.push("/admin/dashboard");
      } else {
        router.push("/user/dashboard");
      }
    } catch (err) {
      setMessage((err as Error).message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col justify-center rounded-[2rem] bg-slate-900 p-8 text-white shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-300">Secured Health Records</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight">
            Machine Learning-Enhanced Secure Platform for Electronic Health Record Sharing
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Attribute-based access control protects every record, while XGBoost monitors user behavior, authentication
            risk, and file content for anomalies before access is granted.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {[
              "ABAC-enforced decryption policies",
              "Real-time anomaly and malware screening",
              "AWS S3-backed secure record storage",
              "One-time file sharing with auto-destruction",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center">
          <div className="w-full rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl">
            <div className="mb-6">
              <p className="text-2xl font-semibold text-slate-900">Sign in</p>
              <p className="text-sm text-slate-500">
                Access the administrator console or clinician workspace through the unified secure gateway.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Email"
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
              <button
                disabled={loading}
                className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Validating..." : "Enter Secure Platform"}
              </button>
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
