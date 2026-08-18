# AI Vehicle Service Feedback & Invoice Verification System (Backend)

A production-grade, highly secure, fully typed Node.js/TypeScript backend system for automobile service centers. This system allows clients to securely upload voice complaints (without logging in), transcribes them asynchronously, parses invoice PDFs (digitally or using OCR fallback), and executes a semantic GPT audit check comparing charges against customer complaints.

---

## Architecture Overview

```
Route → Middleware (Auth/Zod/Multer) → Controller → Service → Model/Repository → Database
                                              ↓
                                     Background Job (BullMQ) → Services (Whisper/OCR/GPT)
```

The system strictly follows layered architecture principles. Dynamic, long-running AI calculations (Whisper transcription, scanned PDF OCR parsing, and GPT-4o-mini comparisons) are delegated to background job workers using **BullMQ** and **Redis**.

---

## Tech Stack
- **Runtime:** Node.js 20 LTS
- **Language:** TypeScript (Strict mode enabled)
- **Framework:** Express.js
- **Database:** MongoDB Atlas + Mongoose
- **Background Queues:** BullMQ + Redis
- **Cloud Storage:** AWS S3 (Audio, Invoices) + CloudFront URLs
- **OpenAI Integrations:** Whisper API (transcription) + GPT API (semantic structured matching)
- **PDF Extraction:** `pdf-parse` (digital PDFs) + `tesseract.js` (scanned PDF OCR)
- **Messaging:** Nodemailer SMTP (Office 365), Twilio SMS, Twilio WhatsApp Business API
- **Testing:** Jest + Supertest (Unit + Integration in-memory tests)
- **Process Manager:** PM2

---

## Directory Layout

```
vehicle-service-ai-backend/
├── src/
│   ├── config/             # Environment, Database, S3, OpenAI, and Redis initialization
│   ├── controllers/        # Route orchestrators (parses inputs, calls services, sends envelopes)
│   ├── services/           # Reusable business logic layers (AI APIs, storage, notifications)
│   ├── jobs/               # BullMQ background workers and queues definitions
│   ├── models/             # Mongoose/MongoDB data schemas
│   ├── routes/             # Express routes with JSDoc Swagger documentation annotations
│   ├── middleware/         # Auth, Roles, Multer uploads, Rate-limiters, and Error handling
│   ├── validators/         # Zod request validators
│   ├── utils/              # Structured logging (Winston), AppError, and Token tools
│   ├── app.ts              # App configurations bootstrap
│   └── server.ts           # Server start entrypoint (drives connections and starts workers)
├── tests/
│   ├── unit/               # Service unit tests mocking external dispatches (S3, Whisper)
│   └── integration/        # Auth & Customer CRUD using mongodb-memory-server
├── .env.example            # Documented environment template
├── jest.config.js          # ESM-compliant Jest options
├── tsconfig.json           # Strict compiler rules
├── ecosystem.config.js     # PM2 cluster options
└── README.md               # User manual
```

---

## Environment Variables (.env)

The system performs strict validation using Zod schemas at startup (`src/config/env.ts`) and will fail to boot if any environment variables are missing. Configure the following variables in a `.env` file in the root directory:

```dotenv
# --- SERVER ---
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
PUBLIC_FEEDBACK_BASE_URL=http://localhost:3000/feedback

# --- DATABASE ---
MONGODB_URI=mongodb://127.0.0.1:27017/vehicle_service_feedback

# --- AUTH ---
JWT_SECRET=supersecuresecretchangeinproduction
JWT_EXPIRES_IN=24h

# --- OPENAI ---
OPENAI_API_KEY=your_openai_api_key_here

# --- AWS S3 ---
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_REGION=ap-south-1
AWS_S3_BUCKET=your_s3_bucket_name
AWS_CLOUDFRONT_DOMAIN=https://your-cloudfront-id.cloudfront.net

# --- EMAIL (SMTP) ---
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_office_365_username@yourdomain.com
SMTP_PASS=your_office_365_password
SHOP_EMAIL=noreply@yourdomain.com

# --- WHATSAPP (TWILIO PRODUCTION) ---
WA_TWILIO_ACCOUNT_SID=your_production_twilio_sid
WA_TWILIO_AUTH_TOKEN=your_production_twilio_token
WA_TWILIO_WHATSAPP_NUMBER=+14155238886
WA_TWILIO_SHOP_WHATSAPP=+14155238886
WA_TW_WABA_ID=your_waba_id
WA_PHONE_NUMBER_ID=your_phone_id
WA_TWILIO_INVITE_TEMPLATE_SID=your_waba_template_sid

# --- TWILIO SANDBOX/FALLBACK ---
TWILIO_ACCOUNT_SID=your_sandbox_twilio_sid
TWILIO_AUTH_TOKEN=your_sandbox_twilio_token
TWILIO_WHATSAPP_NUMBER=+14155238886
TWILIO_SHOP_WHATSAPP=+14155238886
TWILIO_INVITE_TEMPLATE_SID=your_sandbox_template_sid

# --- SMS (TWILIO) ---
TWILIO_SMS_NUMBER=+15005550006
TWILIO_SMS_NUMBER_SID=PNdummysmsnumberid

# --- REDIS / QUEUES ---
REDIS_URL=redis://127.0.0.1:6379

# --- RATE LIMITING ---
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

---

## Installation & Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Start Services:**
   Make sure **MongoDB** and **Redis** are running locally:
   ```bash
   # Start Redis (Windows/Linux)
   redis-server
   ```

3. **Run in Development Mode:**
   Starts the Express server alongside the BullMQ workers, monitoring changes:
   ```bash
   npm run dev
   ```

4. **Production Build:**
   Compile TypeScript source to standard javascript inside `dist/`:
   ```bash
   npm run build
   ```

5. **Start Production Servers (PM2):**
   ```bash
   pm2 start ecosystem.config.js
   ```

---

## Running Tests

Tests run in-memory and mock external APIs:
- **Unit Tests:** Verify service calls (AWS S3, OpenAI, Twilio, SMTP).
- **Integration Tests:** Verify User Registration/JWT Logins and Customer CRUD operations using a mock in-memory database server.

```bash
# Execute test suite
npm run test
```

---

## API Surface & Operations

### Auth (No authentication required on login)
- `POST /api/auth/register` (Bootstrap logic: first user registered automatically inherits `ADMIN` permissions, subsequent registrations require an authenticated `ADMIN` session).
- `POST /api/auth/login` (Standard login, returns Bearer JWT token).
- `GET /api/auth/profile` (Returns current user details).

### Customers (ADMIN/STAFF permissions)
- `POST /api/customers` (Creates a customer service record).
- `GET /api/customers` (Paginated list supporting `?search=`, `?page=`, and `?limit=`).
- `GET /api/customers/:id` (Get customer details).
- `PUT /api/customers/:id` (Update customer record).
- `DELETE /api/customers/:id` (Delete customer record — **ADMIN only**).

### Feedback Link Management (ADMIN/STAFF permissions)
- `POST /api/feedback-links/create` (Generate secure hex token, valid for 7 days).
- `POST /api/feedback-links/send` (Queue invitations in the background via email, SMS, and WhatsApp).
- `GET /api/feedback-links/:token` (**Public Route** — Validates link token validity and returns associated customer details).

### Public Submission (No Auth, Rate-Limited)
- `POST /api/public/feedback/:token` (Multipart file upload containing `vehicleNumber` string verify and `audio` recording. Uploads to S3 and queues audio transcription worker).

### Invoices (ADMIN/STAFF permissions)
- `POST /api/invoices/upload` (Multipart file upload mapping `complaintId` and `file` PDF. Uploads to S3 and queues parsing worker).
- `GET /api/invoices/:id` (Retrieve invoice status).

### AI Audit Comparison (ADMIN/STAFF permissions)
- `POST /api/comparison/analyze/:complaintId` (Triggers background audit worker if not already run automatically).
- `GET /api/comparison/:complaintId` (Get matched issues, missing issues, extra invoice items, match score, status, and summaries).

### Executive Reports (ADMIN permissions only)
- `GET /api/reports/dashboard` (Returns aggregated metrics: response rates, average match scores, discrepancy counts, and service center rankings).

### System Meta
- `GET /api/health` (MongoDB liveness and system health probes).
- `GET /api-docs` (Swagger UI documentation console).
#   B a c k e n d - M G  
 