# SecurHealth ML

SecurHealth ML is a secure health-record sharing app built as a single Next.js project with an integrated API layer, PostgreSQL, and a separate malware-scanning service.

The current project supports:

- JWT authentication with bcrypt password hashing
- Optional email OTP MFA with backup-code recovery
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

## Teammate Setup

If you are setting this up on a fresh machine, use this order:

1. Install Docker Desktop and Node.js.
2. From the repo root, create the env files.
3. Install Node dependencies with `npm install`.
4. Choose either the development workflow or the full local stack.

Windows env setup:

```bash
copy .env.example .env
copy .env.local.example .env.local
```

Mac/Linux env setup:

```bash
cp .env.example .env
cp .env.local.example .env.local
```

### Development Mode

Use this for day-to-day coding with hot reload.

```bash
npm install
npm run dev:services
npm run dev:app
```

Open:

- `http://localhost:3001`

Dev notes:

- PostgreSQL runs on `localhost:5433`
- ML service runs on `http://localhost:8001`
- ClamAV runs in Docker
- local filesystem storage is used, so AWS credentials are not required
- if you enable MFA, configure the SMTP variables in your env file so email OTP delivery can work
- `npm run dev:app` now waits for Postgres and the ML service before launching Next.js, which avoids the flaky first-request startup failures we were seeing in dev
- if you intentionally want to skip the wait logic, use `npm run dev:app:raw`
- if you want one command for the full dev workflow, use `npm run dev:full`

### Full Local Stack

Use this when you want to run the app more like a deployment.

```bash
docker compose up --build
```

Open:

- `http://localhost:3000`

### Demo Credentials

- Admin: `admin@securehealth.local` / `Admin123!`
- Clinician: `clinician@securehealth.local` / `Clinician123!`

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
npm run dev:app:raw
npm run dev:full
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
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@securehealth.local
ML_SERVICE_URL=http://localhost:8001
STORAGE_DRIVER=fs
LOCAL_STORAGE_ROOT=./local-storage
SEED_DEFAULT_USERS=true
```

MFA-specific environment variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SMTP_SECURE`

With these configured, users can enable email OTP MFA from the shared `/security` page and admins can reset MFA from User Management.

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

## ML Algorithms And Formulas

This project trains two tabular machine learning models for PDF malware detection:

- `Random Forest`
- `XGBoost`

The saved training results in [ai_model_training/artifacts/training_metrics.json](./ai_model_training/artifacts/training_metrics.json) show that `random_forest` was selected as the deployed PDF model because it achieved the best held-out test performance.

### 1. Random Forest

Short explanation:

Random Forest is an ensemble of decision trees. Each tree is trained on a bootstrap sample of the data, and the final prediction is made by averaging the tree outputs. This reduces overfitting compared with using a single decision tree.

Core formulas:

```text
Bootstrap sample for tree t:
D_t ~ sample(D, with replacement)

Gini impurity at a node:
G(S) = 1 - sum(p_k^2)

Split improvement:
Delta G = G(S) - (|S_L| / |S|) G(S_L) - (|S_R| / |S|) G(S_R)

Final forest probability for malware class:
P(y = 1 | x) = (1 / T) * sum(P_t(y = 1 | x))

Final prediction:
y_hat = 1 if P(y = 1 | x) >= tau, else 0
```

Where:

- `S` is the current node sample set
- `S_L` and `S_R` are the left and right child nodes
- `p_k` is the proportion of class `k` at the node
- `T` is the number of trees
- `tau` is the classification threshold

In this project:

- the selected model is `random_forest`
- it achieved the best `ROC-AUC` on the test set

### 2. XGBoost

Short explanation:

XGBoost is a gradient boosting algorithm that adds trees one by one. Each new tree is trained to reduce the errors made by the previous ensemble. It also uses regularization to control model complexity.

Core formulas:

```text
Additive boosting model:
y_hat_i^(t) = y_hat_i^(t-1) + eta * f_t(x_i)

Training objective:
L^(t) = sum(l(y_i, y_hat_i^(t))) + sum(Omega(f_t))

Regularization term:
Omega(f) = gamma * T + (1/2) * lambda * sum(w_j^2)

Second-order approximation used by XGBoost:
L_tilde^(t) = sum(g_i f_t(x_i) + (1/2) h_i f_t(x_i)^2) + Omega(f_t)

Leaf weight:
w_j* = -G_j / (H_j + lambda)

Split gain:
Gain = (1/2) * [ G_L^2 / (H_L + lambda)
               + G_R^2 / (H_R + lambda)
               - (G_L + G_R)^2 / (H_L + H_R + lambda) ] - gamma
```

Where:

- `eta` is the learning rate
- `f_t` is the tree added at step `t`
- `g_i` is the first derivative of the loss
- `h_i` is the second derivative of the loss
- `G_j` and `H_j` are the sums of gradients and Hessians in leaf `j`
- `gamma` and `lambda` are regularization parameters

### 3. Model Selection Rule

The training script compares both models on the held-out test set and selects the winner using:

```text
best_model = argmax_m ROC_AUC(m)
```

Using the saved results:

- `ROC-AUC(Random Forest) = 0.9996607043`
- `ROC-AUC(XGBoost) = 0.9994643760`

Therefore:

```text
best_model = random_forest
```

### 4. Evaluation Metrics

Short explanation:

The confusion matrix for malware detection uses:

- `TP`: malicious PDF correctly classified as malicious
- `TN`: benign PDF correctly classified as benign
- `FP`: benign PDF incorrectly classified as malicious
- `FN`: malicious PDF incorrectly classified as benign

Metric formulas:

```text
Accuracy  = (TP + TN) / (TP + TN + FP + FN)
Precision = TP / (TP + FP)
Recall    = TP / (TP + FN)
F1-score  = 2 * (Precision * Recall) / (Precision + Recall)
```

`ROC-AUC` measures how well the model separates malicious and benign PDFs across different thresholds. A value closer to `1.0` is better.

### 5. Example Calculations From This Project

For the deployed `Random Forest` model, the saved confusion matrix is:

```text
TN = 883, FP = 11
FN = 4,   TP = 1107
Total = 2005
```

So the metric calculations are:

```text
Accuracy
= (TP + TN) / Total
= (1107 + 883) / 2005
= 1990 / 2005
= 0.9925187
= 99.25%

Precision
= TP / (TP + FP)
= 1107 / (1107 + 11)
= 1107 / 1118
= 0.9901610
= 99.02%

Recall
= TP / (TP + FN)
= 1107 / (1107 + 4)
= 1107 / 1111
= 0.9963996
= 99.64%

F1-score
= 2 * (Precision * Recall) / (Precision + Recall)
= 2 * (0.9901610 * 0.9963996) / (0.9901610 + 0.9963996)
= 0.9932705
= 99.33%
```

For comparison, the saved `XGBoost` results are:

```text
Accuracy  = 0.9920200 = 99.20%
Precision = 0.9919137 = 99.19%
Recall    = 0.9936994 = 99.37%
F1-score  = 0.9928058 = 99.28%
ROC-AUC   = 0.9994644
```

### 6. Report Summary

You can describe the model section of the report like this:

- The project extracted structural PDF features and trained two tabular classifiers: Random Forest and XGBoost.
- Model selection was based on test-set `ROC-AUC`.
- `Random Forest` was chosen as the deployed model because it achieved the strongest overall performance.
- The final deployed model achieved:
  - `Accuracy = 99.25%`
  - `Precision = 99.02%`
  - `Recall = 99.64%`
  - `F1-score = 99.33%`
  - `ROC-AUC = 0.9997`

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
