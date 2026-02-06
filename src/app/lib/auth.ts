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

export function getStoredAuth() {
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
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const auth = getStoredAuth();
    if (!auth) {
      router.push("/login");
      return;
    }
    const isAdmin = auth.user.role === "admin";
    if (role === "admin" && !isAdmin) {
      router.push("/user/dashboard");
      return;
    }
    if (role === "user" && isAdmin) {
      router.push("/admin/dashboard");
      return;
    }
    setToken(auth.token);
    setUser(auth.user);
    setReady(true);
  }, [router, role]);

  function logout() {
    clearAuth();
    router.push("/login");
  }

  return { token, user, ready, logout };
}
