export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch(
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
  return data as any;
}
