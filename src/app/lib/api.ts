export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export async function apiFetch<T = unknown>(
  path: string,
  token?: string,
  options: RequestInit = {}
) {
  const baseHeaders = new Headers(options.headers || {});
  if (token) {
    baseHeaders.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: baseHeaders,
  });

  const raw = await res.text();
  let data: unknown = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const message =
      (data as { error?: string })?.error ||
      raw ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function apiDownload(path: string, token?: string) {
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const raw = await res.text();
    let message = raw || `Request failed (${res.status})`;
    try {
      const json = JSON.parse(raw) as { error?: string };
      if (json.error) {
        message = json.error;
      }
    } catch {
      // Ignore non-JSON responses.
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const fallbackMatch = disposition.match(/filename=\"([^\"]+)\"/i);
  const filename = decodeURIComponent(
    utf8Match?.[1] || fallbackMatch?.[1] || "secured-health-record"
  );

  return { blob, filename };
}
