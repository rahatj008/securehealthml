# Fast Dev Workflow

Use this flow for development so you do not rebuild the full app on every change.

## Recommended setup

Run the heavy backing services in Docker:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Run the Next.js app locally with hot reload:

```bash
npm run dev:app
```

`npm run dev:app` now waits for Postgres and the ML service to be reachable before starting Next.js, which makes local startup much more reliable.

Then open:

- App: `http://localhost:3001`
- ML service health: `http://localhost:8001/health`

## Why this is faster

- `next dev` reloads code changes immediately
- PostgreSQL stays in Docker
- the ML service stays in Docker and reloads Python changes automatically
- ClamAV also runs in Docker in dev mode
- no full image rebuild for normal frontend or API route changes

## Environment

Local development uses [`.env.local`](/c:/Users/pc/Desktop/securehealthml/.env.local):

- Postgres on `localhost:5433`
- ML service on `localhost:8001`
- local filesystem storage instead of S3
- seeded demo users enabled

## Useful commands

Start dev services:

```bash
npm run dev:services
```

Stop dev services:

```bash
npm run dev:services:down
```

Tail dev service logs:

```bash
npm run dev:services:logs
```

Run the app on port 3001:

```bash
npm run dev:app
```

If you need the old direct behavior without the startup wait, use:

```bash
npm run dev:app:raw
```

If you want one command that starts Docker services and then launches the app, use:

```bash
npm run dev:full
```

## ClamAV in dev

ClamAV is enabled by default in `docker-compose.dev.yml`, so the development stack now matches the full scanner flow more closely.

One practical note:

- the first startup can still be slow while ClamAV warms up and prepares its database
- the app now waits for Postgres and the ML health check before booting, so a slower service startup should no longer turn into a random login or API failure on the first request
