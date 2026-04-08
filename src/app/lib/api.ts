export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export class ApiError<T = unknown> extends Error {
  status: number;
  data: T | undefined;

  constructor(message: string, status: number, data?: T) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function isApiError<T = unknown>(error: unknown): error is ApiError<T> {
  return error instanceof ApiError;
}

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
    cache: options.cache ?? "no-store",
    headers: baseHeaders,
  });

  const raw = await res.text();
  let data: unknown;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = undefined;
    }
  }
  if (!res.ok) {
    const message =
      (data as { error?: string })?.error ||
      raw ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
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
    let data: unknown;
    try {
      const json = JSON.parse(raw) as { error?: string };
      data = json;
      if (json.error) {
        message = json.error;
      }
    } catch {
      // Ignore non-JSON responses.
    }
    throw new ApiError(message, res.status, data);
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
