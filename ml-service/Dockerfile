FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY ml-service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY ml-service/ /app/
COPY ai_model_training/artifacts/ /app/model_artifacts/

ENV MODEL_PATH=/app/model_artifacts/pdf_malware_model.joblib
ENV FEEDBACK_LOG_PATH=/app/data/feedback.jsonl

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
