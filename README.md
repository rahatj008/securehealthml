# SecurHealth ML

A machine learning-enhanced secure platform for EHR sharing with proactive threat detection. This project implements:
- Real authentication (JWT + bcrypt)
- ABAC policy enforcement backed by PostgreSQL
- XGBoost anomaly detection service (FastAPI)
- AWS S3 encrypted storage integration
- Immutable access/audit logs

## Architecture
- **Frontend:** Next.js (App Router)
- **Backend:** Node/Express API (`/server`)
- **Database:** PostgreSQL (Docker)
- **ML Service:** FastAPI + XGBoost (`/ml-service`)

## Setup

### 1) Environment Variables
Copy the example env files and update values:

```
cp .env.example .env
cp server/.env.example server/.env
```

### 2) Start Postgres + ML service

```
docker compose up -d
```

This will start:
- PostgreSQL on `localhost:5432`
- ML service on `http://localhost:8001`

### 3) Install dependencies

```
npm install
npm --prefix server install
```

### 4) Run the API server

```
npm --prefix server run dev
```

### 5) Run the Next.js app

```
npm run dev
```

Open `http://localhost:3000`

## API Overview
- `POST /auth/register`
- `POST /auth/login`
- `GET /files`
- `POST /files/upload`
- `GET /files/download/:id`
- `GET /audit`

## Flow
1. User requests login/upload/download
2. Auth validation (failed attempts logged)
3. ABAC policy evaluation
4. Real-time ML detection (behavioral + content)
5. Decision: normal vs anomaly
6. Normal path: secure S3 storage + audit logging
7. Anomaly path: deny + log + alert
8. Feedback loop: ML feedback logged
