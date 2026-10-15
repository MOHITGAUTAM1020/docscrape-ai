# Deployment

## Recommended: one Docker service

Use a host capable of running Docker containers with persistent disks, plus MongoDB and Redis. The Docker image includes native Office/PDF utilities. This preserves the full supported format set.

1. Build the image from the repository root: `docker build -t docscrape-ai .`.
2. Supply `NODE_ENV=production`, a random 32+ character `JWT_SECRET`, and `CLIENT_ORIGIN=https://your-app.example`.
3. Set `MONGODB_URI` and `REDIS_URL`. Keep database services private.
4. Mount a persistent writable volume at `/app/server/data`. Configure backups for both the database and upload volume.
5. Route HTTPS to port 4000. Set `COOKIE_SECURE=true`. The frontend and API should share the same origin.
6. Optionally set `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL`. Configure them as server secrets.
7. Check `/api/health`, registration, demo login, an upload, verification and all three exports.

For the public beta, also test each extraction route with representative data. Keep the visible **Beta · review required** label and do not market screenshot/poster OCR as visual understanding. The production build disables the local training lab; deploy only reviewed versioned model artifacts to the OCR service.

Local Docker Compose sets `COOKIE_SECURE=false` only for HTTP localhost. Never copy that setting to an HTTPS production deployment.

## Separate frontend/API

For a static frontend host, deploy `client/dist` after `npm run build`. Configure a **same-origin reverse proxy** for `/api/*` and `/socket.io/*` to the API, including WebSocket support. The API uses same-site cookies and relative frontend URLs; a raw cross-domain Vercel frontend + Render API pair is not configured by default. A single Docker deployment avoids this complexity.

The API needs persistent disk, sufficient RAM for OCR/conversion, and outbound HTTPS for AI calls and the initial OCR language download. A serverless function is not a suitable place for the background worker and native conversion tools.

## Operational limits

Run one API/worker instance with this MVP. MongoDB has atomic review version updates; upload quotas and startup recovery are currently coordinated within a single process. Multi-instance deployment needs a shared object store and distributed quota/recovery locking. Redis retries may re-deliver work; document status and version checks prevent concurrent duplicate claims.

Passwords are hashed and document ownership is enforced. Production hardening should add retention/deletion policies for demo sessions, password reset, malware scanning, isolated converter processes, monitoring and encrypted backups before accepting sensitive customer data.

No external deployment or GitHub push is required for local use. Publishing needs your own hosting account, database, secrets and domain/origin settings.
