const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";

async function postJson(path, payload) {
  const res = await fetch(`${ML_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`ML service error: ${res.status}`);
  }

  return res.json();
}

export async function assessSecurity(payload) {
  return postJson("/assess", payload);
}

export async function sendFeedback(payload) {
  return postJson("/feedback", payload);
}
