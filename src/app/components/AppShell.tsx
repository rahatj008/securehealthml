"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";

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

function navItemClasses(active: boolean) {
  return active
    ? "rounded-2xl bg-[linear-gradient(135deg,_#1d72f2,_#2563eb)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200/70"
    : "rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900";
}

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
  const [menuOpen, setMenuOpen] = useState(false);

  const userInitials = userName
    .split(" ")
    .map((part) => part.slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-grid text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(29,114,242,0.12),_transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.72),rgba(247,249,252,0.82))]" />
      <div className="relative">
        <header className="sticky top-0 z-40 border-b border-white/70 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,_#1d72f2,_#2563eb)] text-white shadow-lg shadow-blue-200/80">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M12 2l7 4v6c0 5-3.8 9-7 10-3.2-1-7-5-7-10V6l7-4z" />
                  <path d="M9.5 12l1.8 1.8 3.7-3.7" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-900 sm:text-lg">{title}</p>
                <p className="hidden text-xs text-slate-500 sm:block">{subtitle}</p>
              </div>
            </div>

            <div className="hidden items-center gap-3 lg:flex">
              <div className="surface-card flex items-center gap-3 rounded-full px-3 py-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                  {userInitials}
                </div>
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm font-semibold text-slate-800">{userName}</p>
                  <p className="truncate text-xs text-slate-500">{userMeta}</p>
                </div>
                <button
                  onClick={onLogout}
                  className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                >
                  Logout
                </button>
              </div>
            </div>

            <button
              onClick={() => setMenuOpen((open) => !open)}
              className="surface-card inline-flex h-11 w-11 items-center justify-center rounded-2xl text-slate-700 lg:hidden"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <>
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h16" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </header>

        {menuOpen ? (
          <div className="fixed inset-0 z-30 bg-slate-950/20 backdrop-blur-[2px] lg:hidden" onClick={() => setMenuOpen(false)}>
            <div
              className="surface-card-strong absolute inset-x-4 top-24 rounded-[1.75rem] p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-3 rounded-[1.5rem] bg-slate-50 px-4 py-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                  {userInitials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{userName}</p>
                  <p className="text-xs text-slate-500">{userMeta}</p>
                </div>
              </div>

              <nav className="flex flex-col gap-2">
                {nav.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={navItemClasses(active)}
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-4 rounded-[1.5rem] border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                <p className="font-semibold">ABAC + ML online</p>
                <p className="mt-1 text-xs text-emerald-700">Protected sharing and scanner checks are active.</p>
              </div>

              <button
                onClick={onLogout}
                className="button-dark mt-4 w-full"
              >
                Logout
              </button>
            </div>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:py-7">
          <section className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
            <aside className="surface-card sticky top-24 hidden h-fit flex-col gap-4 rounded-[1.75rem] p-5 lg:flex">
              <div className="rounded-[1.5rem] bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">{userName}</p>
                <p className="mt-1 text-xs text-slate-500">{userMeta}</p>
              </div>

              <nav className="flex flex-col gap-2">
                {nav.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link key={item.href} href={item.href} className={navItemClasses(active)}>
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="rounded-[1.5rem] border border-dashed border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                <p className="font-semibold">ABAC + ML online</p>
                <p className="mt-1 text-xs text-emerald-700">One-time shares and live threat checks are armed.</p>
              </div>

              <button onClick={onLogout} className="button-dark w-full">
                Logout
              </button>
            </aside>

            <div className="flex min-w-0 flex-col gap-5 lg:gap-6">{children}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
