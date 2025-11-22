# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Voice-based meter reading collection system for utility companies. Customers call via Tenios Voice API to report meter readings, which are validated against CSV databases and recorded with timestamps. Includes a real-time supervisor dashboard for call monitoring and intervention.

## Architecture

**Backend** (Node.js 20.x + TypeScript 5.x):

- Express.js webhooks for Tenios Voice API integration
- OpenAI SDK for speech-to-text, text-to-speech, and LLM conversation flow
- CSV-based storage with file locking via proper-lockfile
- WebSocket server for real-time transcript streaming
- Pino structured logging with correlation IDs

**Frontend** (React 18 + Vite):

- Tailwind CSS for UI components
- React Query for server state management
- WebSocket client for live call monitoring
- Supervisor dashboard with intervention capabilities

**Project Structure** (planned):

```
backend/
├── src/
│   ├── models/          # TypeScript domain models
│   ├── services/        # Business logic (CSV, Tenios, OpenAI, validation)
│   ├── api/             # Express routes (webhooks, dashboard API)
│   ├── middleware/      # Auth, logging, error handling, validation
│   ├── websocket/       # Real-time transcript server
│   ├── config/          # Environment config, constants
│   └── utils/           # Logger, file locking, correlation IDs
├── data/                # CSV files (customers, readings, call recordings)
└── tests/               # Contract, integration, and unit tests

frontend/
├── src/
│   ├── components/      # React UI components
│   ├── pages/           # Dashboard, Login
│   ├── services/        # API client, WebSocket client
│   ├── hooks/           # Custom React hooks
│   └── types/           # TypeScript types
└── tests/e2e/           # Playwright E2E tests
```

## Development Commands

**Setup**:

```bash
# Backend
cd backend
npm install
cp .env.example .env  # Configure API keys

# Frontend
cd frontend
npm install
```

**Development**:

```bash
# Backend dev server (http://localhost:3000)
cd backend
npm run dev

# Frontend dev server (http://localhost:5173)
cd frontend
npm run dev

# Expose webhooks for Tenios testing
npx localtunnel --port 3000 --subdomain ki-phone-connect
```

**Testing**:

```bash
# Backend tests
cd backend
npm test                    # Unit tests
npm run test:coverage       # With coverage report
npm run test:integration    # Integration tests
npm run test:contract       # External API contracts

# Frontend tests
cd frontend
npm run test:e2e           # Playwright E2E tests
npm run test:e2e:headless  # Headless mode

# All tests + linting (pre-merge requirement)
npm test && npm run lint
```

**Code Quality**:

```bash
npm run lint           # ESLint check
npm run lint:fix       # Auto-fix issues
npm run type-check     # TypeScript compilation
```

## Key Technical Decisions

**Voice Call Flow**: Uses OpenAI Realtime API for <500ms STT-to-TTS latency. Call state machine tracks conversation progress (greeting → customer number → meter number → reading → confirmation → completion).

**Data Storage**: CSV files with proper-lockfile for atomic writes. Migration path to SQLite documented when >1000 customers or >10MB files.

**Supervisor Dashboard**: WebSocket-based real-time transcripts with <2s latency requirement. Supervisors can join active calls as third party.

**Error Handling**: Maximum 2 retries per validation step. Polite call termination after retry exhaustion. All errors logged with correlation IDs for debugging.

**Security**: Zod validation schemas for all inputs. CSV injection prevention. Helmet.js for HTTP security headers. JWT authentication for supervisor dashboard.

## Constitution Requirements

**Type Safety**: TypeScript strict mode enabled. ESLint complexity max 10.

**Quality Gates**:

- Pre-commit: ESLint, Prettier, TypeScript compilation (Husky hooks)
- Pre-merge: All tests pass, 80% coverage, no TypeScript errors
- Pre-deployment: E2E tests pass, security scan (`npm audit`)

**Performance Targets**:

- <500ms STT-to-TTS latency for voice calls
- <200ms webhook response time (p95)
- <2s transcript latency in supervisor dashboard
- Support 10 concurrent calls minimum

**Observability**: Pino structured logging with JSON output. Correlation IDs for all requests. Audit log for customer lookups and data writes. Call recordings stored 30 days.

## Environment Configuration

**Required API Keys**:

- `OPENAI_API_KEY`: OpenAI platform API key
- `TENIOS_API_KEY`: (value: `9fd94019-4bb8-461e-9dbb-029701db5f5a`)
- `JWT_SECRET`: Min 32 chars for supervisor authentication

**Key Environment Variables**:

```env
NODE_ENV=development|production
PORT=3000
MAX_CONCURRENT_CALLS=10
CSV_LOCK_TIMEOUT=5000
LOG_LEVEL=debug|info|warn|error
CUSTOMERS_CSV_PATH=./data/customers.csv
READINGS_CSV_PATH=./data/meter-readings.csv
```

DEV TEST Setup

ngrok                                                                                                                                                                                                                                               (Ctrl+C to quit)

🤫 Put your secrets in vaults and (re)use them to transform traffic: https://ngrok.com/r/secrets

Session Status                online
Account                       Christian Schröder (Plan: Free)
Update                        update available (version 3.33.0, Ctrl-U to update)
Version                       3.19.1
Region                        Europe (eu)
Latency                       17ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://cd084bdb3032.ngrok-free.app -> http://localhost:80

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00

Tenios

Routingplan mit Schritt 1: Call Control Api auf ngrok und Schritt 2: Weiterleitung auf Tenios SIP Account "cwschroeder"

## Voice Prompts (German)

All voice interactions are in German. Common prompts stored in `backend/src/config/prompts.json`:

- Greeting: "Guten Tag. Willkommen beim Stadtwerk."
- Request customer number: "Bitte nennen Sie Ihre Kundennummer."
- Request meter number: "Bitte nennen Sie Ihre Zählernummer."
- Confirmation: "Vielen Dank. Ihr Zählerstand wurde gespeichert."

## CSV Data Schema

**customers.csv**:

```csv
customer_number,meter_number,customer_name
12345,M-789,Max Mustermann
```

**meter-readings.csv**:

```csv
customer_number,meter_number,reading_value,reading_date,reading_time,call_id
12345,M-789,5432,2025-11-22,14:35:12,call_abc123
```

## Implementation Priority

**P1 (MVP)**: Core call flow - accept calls, validate customer/meter, record readings to CSV
**P2**: Error handling and retries - handle unclear speech, invalid inputs, silence detection
**P3**: Supervisor dashboard - real-time transcripts, call monitoring, intervention

Refer to `specs/001-voice-meter-reading/spec.md` for detailed user stories and acceptance criteria.

## Deployment

**Target Platform**: Hetzner VPS (Ubuntu 22.04 LTS)
**Process Manager**: PM2 for backend
**Reverse Proxy**: Nginx with Let's Encrypt SSL
**Webhook URL**: Configure in Tenios dashboard to point to production server
