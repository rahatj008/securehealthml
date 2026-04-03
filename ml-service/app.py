from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from scanner import assess_payload, record_feedback


class AssessRequest(BaseModel):
    context: str | None = None
    behavior: dict[str, Any] = Field(default_factory=dict)
    content: dict[str, Any] = Field(default_factory=dict)
    sample_base64: str | None = None
    auth: dict[str, Any] = Field(default_factory=dict)


class FeedbackRequest(BaseModel):
    outcome: str | None = None
    user_id: str | None = None
    file_id: str | None = None
    features: dict[str, Any] = Field(default_factory=dict)


app = FastAPI(title="SecureHealth ML Service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/assess")
def assess(request: AssessRequest) -> dict[str, Any]:
    return assess_payload(request.model_dump())


@app.post("/feedback")
def feedback(request: FeedbackRequest) -> dict[str, str]:
    return record_feedback(request.model_dump())
