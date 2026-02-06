"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredAuth } from "./lib/auth";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const auth = getStoredAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    if (auth.user.role === "admin") {
      router.replace("/admin/dashboard");
    } else {
      router.replace("/user/dashboard");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      Loading...
    </div>
  );
}
