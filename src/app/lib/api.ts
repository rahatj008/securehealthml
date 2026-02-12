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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string })?.error || "Request failed";
    throw new Error(message);
  }
  return data as any;
}
