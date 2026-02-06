"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

type NavItem = {
  label: string;
  href: string;
};

type ShellProps = {
  title: string;
  subtitle: string;
  userName: string;
  userMeta: string;
  onLogout: () => void;
  nav: NavItem[];
  children: ReactNode;
};

export default function AppShell({
  title,
  subtitle,
  userName,
  userMeta,
  onLogout,
  nav,
  children,
}: ShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-grid text-slate-900">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-slate-50" />
      <div className="relative">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 2l7 4v6c0 5-3.8 9-7 10-3.2-1-7-5-7-10V6l7-4z" />
                <path d="M9.5 12l1.8 1.8 3.7-3.7" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold">{title}</p>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                {userName.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">{userName}</p>
                <p className="text-xs text-slate-500">{userMeta}</p>
              </div>
              <button onClick={onLogout} className="ml-3 text-xs font-semibold text-rose-500">
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-16">
          <section className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <aside className="flex h-fit flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              {nav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                      active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                System Secure
                <span className="mt-1 block text-[11px] text-emerald-600">Last audit: 12m ago</span>
              </div>
            </aside>

            <div className="flex flex-col gap-6">{children}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
