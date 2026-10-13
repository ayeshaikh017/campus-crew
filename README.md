# CampusCrew Backend

Node.js + Express + MongoDB/Mongoose API for the CampusCrew college volunteer and event coordination app. No Flutter, Docker, Redis, or Python required.

## Requirements
- Node.js 20+
- npm
- MongoDB local or MongoDB Atlas connection string

## Windows PowerShell quick start
```powershell
cd campuscrew-backend
Copy-Item .env.example .env
notepad .env
npm install
npm run dev
```
Edit `.env` and set `MONGODB_URI` plus a strong random `JWT_SECRET` (at least 32 characters). For local MongoDB use `mongodb://127.0.0.1:27017/campuscrew`. For Atlas paste your connection string. Leave `SMTP_HOST` empty during development; registration/reset OTPs appear in this terminal.

In another PowerShell window, verify:
```powershell
Invoke-RestMethod http://localhost:5000/api/health
```
Expected shape: `success = True`, message `CampusCrew API is healthy`.

## macOS/Linux quick start
```bash
cd campuscrew-backend
cp .env.example .env
# Edit .env and set MONGODB_URI and JWT_SECRET
npm install
npm run dev
```

## Seed demo data
```powershell
npm run seed
# Destructive reset of demo collections, then reseed:
npm run seed:reset
```
All demo passwords: `Demo@12345`. Demo emails are listed in the seed command output. Do not run reset against a database containing real data.

## Useful commands
- `npm run dev` — development server with nodemon
- `npm start` — start server
- `npm run check` — syntax-check the server/app entry points
- `npm test` — Node test runner
- `npm run seed` — idempotent demo seed
- `npm run seed:reset` — clear seeded app collections and reseed

## API
- Health: `GET /api/health`
- App API prefix: `/api/v1`
- API response contract: `{ success, message, data }`
- Frontend contract and all implemented endpoint bodies: [`docs/FRONTEND_GUIDE.md`](docs/FRONTEND_GUIDE.md)

## SMTP (optional)
For Gmail, enable 2-step verification and create a Google App Password. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=your Gmail`, `SMTP_PASS=your App Password`, and `MAIL_FROM` to your sender address. Never commit `.env` or expose credentials in frontend code.

## Local mobile-device testing
Use your computer's LAN IP (for example `http://192.168.1.20:5000`) and permit the port in the firewall. Update `CLIENT_ORIGIN` to the exact frontend origin. Production cookies/PWA require HTTPS; a plain LAN URL is not a production deployment.

## Deployment outline
- MongoDB Atlas for database
- Render (or another Node host) for API
- Vercel (or another static host) for React/Vite frontend
- Set production environment variables, exact `CLIENT_ORIGIN`, secure cookie settings, SMTP, and HTTPS URLs.

## Security and limitations
This is a starter baseline and needs testing/hardening before real users. See the limitations section in `docs/FRONTEND_GUIDE.md`. Do not use the demo credentials in production. Email OTP verifies mailbox control, not college ID authenticity; use an official college roster/admin review if identity verification is required.
