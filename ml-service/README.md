# ML Service

This service exposes the `/assess` and `/feedback` endpoints expected by the Next.js backend.

## What it does

- Scores uploaded PDFs with the trained model at `../ai_model_training/artifacts/pdf_malware_model.joblib`
- Applies YARA rules for supported upload types
- Calls ClamAV when a `clamd` server is reachable
- Applies rule-based checks for `DOCX`, `PNG`, and `JPEG`
- Writes feedback events to `ml-service/data/feedback.jsonl`

## Run locally

```bash
pip install -r ml-service/requirements.txt
uvicorn app:app --app-dir ml-service --host 0.0.0.0 --port 8001
```

If you prefer, you can also run it from inside the folder:

```bash
cd ml-service
uvicorn app:app --host 0.0.0.0 --port 8001
```

## Important environment variables

- `MODEL_PATH`: path to the trained `joblib` model
- `PDF_MALWARE_THRESHOLD`: probability threshold used to mark PDFs as malicious
- `FEEDBACK_LOG_PATH`: path for `/feedback` JSONL events
- `YARA_RULES_PATH`: path to the YARA rules file
- `ENABLE_YARA`: enable or disable YARA matching
- `ENABLE_CLAMAV`: enable or disable ClamAV lookups
- `CLAMAV_HOST`: host for the `clamd` daemon
- `CLAMAV_PORT`: port for the `clamd` daemon
