from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from xgboost import XGBClassifier

app = FastAPI()

MODEL_PATH = Path("model.joblib")
FEEDBACK_PATH = Path("feedback.csv")

class ScoreRequest(BaseModel):
    behavior: dict
    content: dict

class FeedbackRequest(BaseModel):
    outcome: str
    features: dict
    user_id: str | None = None
    file_id: str | None = None


def build_feature_vector(payload: dict) -> np.ndarray:
    behavior = payload.get("behavior", {})
    content = payload.get("content", {})
    hour = float(behavior.get("hour", 0))
    clearance = float(behavior.get("clearance", 0))
    size_bytes = float(content.get("size_bytes", 0))
    security_level = content.get("security_level", "unknown")
    sec_map = {
        "Restricted": 1.0,
        "Confidential": 2.0,
        "Highly Sensitive": 3.0,
    }
    security_value = sec_map.get(security_level, 0.5)
    return np.array([[hour, clearance, size_bytes, security_value]])


def load_or_train_model() -> XGBClassifier:
    if MODEL_PATH.exists():
        return joblib.load(MODEL_PATH)

    rng = np.random.default_rng(42)
    hours = rng.integers(0, 24, 600)
    clearance = rng.integers(1, 5, 600)
    size = rng.lognormal(mean=8, sigma=1.2, size=600)
    sec = rng.integers(1, 4, 600)
    X = np.vstack([hours, clearance, size, sec]).T

    # Simple synthetic labels: large size + low clearance + off hours -> anomaly
    y = ((size > np.percentile(size, 90)) & (clearance < 3) & (hours < 6)).astype(int)

    model = XGBClassifier(
        n_estimators=120,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.9,
        colsample_bytree=0.9,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X, y)
    joblib.dump(model, MODEL_PATH)
    return model


model = load_or_train_model()

@app.post("/score")
async def score(req: ScoreRequest):
    vector = build_feature_vector(req.model_dump())
    prob = float(model.predict_proba(vector)[0][1])
    anomaly = prob >= 0.7
    return {"score": prob, "anomaly": anomaly}


@app.post("/feedback")
async def feedback(req: FeedbackRequest):
    payload = req.model_dump()
    row = {
        "outcome": payload.get("outcome"),
        "user_id": payload.get("user_id"),
        "file_id": payload.get("file_id"),
        "features": payload.get("features"),
    }
    df = pd.DataFrame([row])
    if FEEDBACK_PATH.exists():
        df.to_csv(FEEDBACK_PATH, mode="a", header=False, index=False)
    else:
        df.to_csv(FEEDBACK_PATH, index=False)
    return {"status": "logged"}

@app.get("/health")
async def health():
    return {"status": "ok"}
