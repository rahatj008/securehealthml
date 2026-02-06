import fetch from "node-fetch";

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";

export async function scoreAnomaly(payload) {
  const res = await fetch(`${ML_URL}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`ML service error: ${res.status}`);
  }

  return res.json();
}

export async function sendFeedback(payload) {
  const res = await fetch(`${ML_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`ML feedback error: ${res.status}`);
  }

  return res.json();
}
