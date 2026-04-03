# Local Demo Stack

This repo can now run as a self-contained local stack with one command:

```bash
docker compose up --build
```

For day-to-day coding with fast reloads, use the development workflow in [DEV_WORKFLOW.md](/c:/Users/pc/Desktop/securehealthml/DEV_WORKFLOW.md).

## What starts

- `app`: Next.js frontend + API routes
- `db`: local PostgreSQL container
- `ml-service`: local PDF malware scanner service
- `clamav`: local antivirus daemon used by the ML service

## URLs

- App: `http://localhost:3000`

## Demo credentials

- Admin:
  - email: `admin@securehealth.local`
  - password: `Admin123!`
- Clinician:
  - email: `clinician@securehealth.local`
  - password: `Clinician123!`

## Notes

- Uploaded files are stored in a Docker volume through the local filesystem storage driver.
- The app no longer needs external Postgres credentials to run in this local stack.
- The ML service uses the trained PDF model from `ai_model_training/artifacts/pdf_malware_model.joblib`, YARA rules, and ClamAV.
- On the first startup, the `clamav` container may take a while to warm up because it has to prepare its malware database.
