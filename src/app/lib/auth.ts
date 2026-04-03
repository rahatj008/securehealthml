"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type StoredUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  department: string;
  clearance: number;
};

type StoredAuth = {
  token: string;
  user: StoredUser;
} | null;

export function getStoredAuth(): StoredAuth {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("securhealth_token");
  const userRaw = localStorage.getItem("securhealth_user");
  if (!token || !userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as StoredUser;
    return { token, user };
  } catch {
    return null;
  }
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("securhealth_token");
  localStorage.removeItem("securhealth_user");
}

export function useAuthGuard(role?: "admin" | "user") {
  const router = useRouter();
  const [auth, setAuth] = useState<StoredAuth>(null);
  const [hydrated, setHydrated] = useState(false);
  const isAdmin = auth?.user.role === "admin";
  const ready = Boolean(
    hydrated &&
      auth &&
      (role === undefined || (role === "admin" ? isAdmin : !isAdmin))
  );

  useEffect(() => {
    const syncAuth = () => {
      setAuth(getStoredAuth());
      setHydrated(true);
    };

    syncAuth();
    window.addEventListener("storage", syncAuth);
    return () => window.removeEventListener("storage", syncAuth);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!auth) {
      router.replace("/login");
      return;
    }

    if (role === "admin" && !isAdmin) {
      router.replace("/user/dashboard");
      return;
    }

    if (role === "user" && isAdmin) {
      router.replace("/admin/dashboard");
    }
  }, [auth, hydrated, isAdmin, role, router]);

  function logout() {
    clearAuth();
    router.push("/login");
  }

  return {
    token: auth?.token || null,
    user: auth?.user || null,
    ready,
    logout,
  };
}
