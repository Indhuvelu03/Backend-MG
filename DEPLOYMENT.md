# Production deployment runbook

## Architecture

Run two independent Render services from this backend directory:

1. **Web service** — build `npm ci`, start `npm start`, health path `/api/health`.
2. **Background worker** — build `npm ci`, start `npm run start:worker`.

The web service accepts requests and writes durable BullMQ jobs to Redis. The
worker consumes transcription, invoice extraction, comparison, and notification
jobs. Never use a serverless function or a sleeping web service as the only
worker process.

`render.yaml` records these commands. If the repository root contains both the
frontend and backend, set Render's root directory to `backend-mg` for both
services.

## Required configuration

Copy `.env.example` into each Render service's Environment page and set real
values. Both services must receive the same Supabase, Redis, Groq, Resend, and
JWT settings. `PUBLIC_FEEDBACK_BASE_URL` must be the deployed Vercel URL plus
`/feedback`; it must not be a localhost address.

Before testing email, verify `RESEND_FROM_EMAIL` belongs to a domain verified in
Resend. Set Twilio values only when live SMS/WhatsApp delivery is intended; the
application logs mock delivery when Twilio credentials are absent.

For Vercel set `VITE_API_BASE_URL` to the Render web-service URL, for example
`https://your-api.onrender.com/api`, then redeploy the frontend.

## Release checklist

1. Deploy the web service and worker service together.
2. Open `GET /api/health`; it must return HTTP 200.
3. Open `GET /api/readiness`; it must return HTTP 200 and include a recent
   `workerHeartbeat`. HTTP 503 means automations are unavailable even if the
   website opens normally.
4. Create one test customer with a controlled email address. Confirm the API
   response says the invite was queued, then confirm the worker log reports the
   notification job completing.
5. Submit one feedback recording and one invoice. Confirm each job advances in
   the worker log: transcription -> extraction -> comparison -> notification.
6. If a provider rejects a message, the notification job now fails and retries
   instead of being marked delivered. Inspect the worker log for the provider's
   error and correct the relevant credential/domain/phone configuration.

## Operational rules

- Keep failed BullMQ jobs (`removeOnFail: false`) until the cause is resolved.
- Treat `/api/readiness` as the automation alert endpoint, not `/api/health`.
- Do not put service-role keys in Vercel or client-side environment variables.
- Do not test with the dashboard's demo-login fallback: it writes local browser
  data and does not exercise the backend or automations.
