# SecurHealth ML

SecurHealth ML is a secure health-record sharing app built as a single Next.js project with an integrated API layer, PostgreSQL, and a separate malware-scanning service.

The current project supports:

- JWT authentication with bcrypt password hashing
- PostgreSQL-backed users, files, policies, shares, and audit logs
- Role-aware dashboards for admin and clinician users
- PDF malware detection with a trained machine learning model
- YARA and ClamAV scanning layered on top of file-type validation
- Local demo storage by default, with optional AWS S3 support for production-style deployments

## Current Architecture

- `src/app`: Next.js App Router UI
- `src/app/api/[...path]/route.ts`: catch-all API route that forwards requests into the server layer
- `src/server/platform.js`: main backend flow for auth, uploads, downloads, shares, and logging
- `src/server/db.js`: PostgreSQL connection
- `src/server/s3.js`: storage adapter for local filesystem mode or AWS S3 mode
- `ml-service/`: FastAPI scanner service for PDF ML scoring, YARA, ClamAV, and rule-based checks
- `ai_model_training/`: PDF malware training assets and saved model artifacts

## Supported Upload Types

The app currently accepts:

- `PDF`
- `DOCX`
- `PNG`
- `JPEG`

Scanning behavior:

- `PDF`: ML model + YARA + ClamAV + structural checks
- `DOCX`: rule-based checks + YARA + ClamAV
- `PNG` / `JPEG`: signature and validity checks + YARA + ClamAV

## Quick Start

The easiest way to run the whole project locally is:

```bash
docker compose up --build
```

This starts:

- `app`: Next.js frontend and API
- `db`: PostgreSQL
- `ml-service`: malware scanning service
- `clamav`: antivirus daemon used by the scanner

Open:

- `http://localhost:3000`

Demo accounts:

- Admin: `admin@securehealth.local` / `Admin123!`
- Clinician: `clinician@securehealth.local` / `Clinician123!`

Notes:

- The default Docker stack uses local filesystem storage, so no AWS credentials are required for local demos.
- On first startup, ClamAV may take a while to warm up its malware database.

More local-stack details are in [LOCAL_STACK.md](./LOCAL_STACK.md).

## Development Workflow

For normal development, use the fast workflow instead of rebuilding the app container on every change.

Start the backing services:

```bash
npm run dev:services
```

Start the Next.js app with hot reload:

```bash
npm run dev:app
```

Open:

- `http://localhost:3001`

Helpful commands:

```bash
npm run dev:services:logs
npm run dev:services:down
```

More details are in [DEV_WORKFLOW.md](./DEV_WORKFLOW.md).

## Environment

For general app configuration, start from [`.env.example`](./.env.example).

For local development, start from [`.env.local.example`](./.env.local.example).

Typical setup:

```bash
copy .env.example .env
copy .env.local.example .env.local
```

Typical local-development settings:

```dotenv
DATABASE_URL=postgresql://securhealth:securhealth@localhost:5433/securhealth
JWT_SECRET=local-dev-secret-change-me
ML_SERVICE_URL=http://localhost:8001
STORAGE_DRIVER=fs
LOCAL_STORAGE_ROOT=./local-storage
SEED_DEFAULT_USERS=true
```

## Storage Modes

Local/demo mode:

- `STORAGE_DRIVER=fs`
- files are stored on local disk or in a Docker volume

Production-style S3 mode:

```dotenv
STORAGE_DRIVER=s3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

## ML Service

The scanner service lives in [ml-service](./ml-service) and exposes:

- `POST /assess`
- `POST /feedback`
- `GET /health`

It uses:

- the trained PDF model from [ai_model_training/artifacts/pdf_malware_model.joblib](./ai_model_training/artifacts/pdf_malware_model.joblib)
- custom YARA rules from [ml-service/rules/uploads.yar](./ml-service/rules/uploads.yar)
- ClamAV when enabled and reachable

See [ml-service/README.md](./ml-service/README.md) for service-specific details.

## Training The PDF Model

Training assets live in [ai_model_training](./ai_model_training).

The training script is:

- [ai_model_training/train_pdf_model.py](./ai_model_training/train_pdf_model.py)

Saved outputs:

- [ai_model_training/artifacts/pdf_malware_model.joblib](./ai_model_training/artifacts/pdf_malware_model.joblib)
- [ai_model_training/artifacts/training_metrics.json](./ai_model_training/artifacts/training_metrics.json)

## Main Application Flow

1. A user logs in and receives a JWT.
2. The frontend calls `/api/*`, which routes through the Next.js catch-all API handler.
3. Uploads are validated and sent to the ML service for scanning.
4. Clean files are stored through the configured storage driver.
5. Downloads and shares are checked against auth, policy, and logging rules.
6. Audit and security events are written to PostgreSQL.

## Tech Stack

- Next.js 16
- React 19
- PostgreSQL 16
- FastAPI
- scikit-learn / XGBoost tooling
- YARA
- ClamAV
- Docker Compose
