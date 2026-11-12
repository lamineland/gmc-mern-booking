# WinPitch (MERN)

Book football pitches, basketball courts, futsal and padel by 30-minute slots in Senegal, and pay
with Wave, Orange Money or Free Money. Requirements: [docs/PRD.md](docs/PRD.md) (v2.2).

```
booking-app/
├── docs/PRD.md
├── server/   Express 5 + Mongoose API (/api/v1)
└── client/   React 18 + Vite
```

## Setup

Requires Node 20+ and MongoDB **running as a replica set**. Bookings are created in a
transaction so two people can't take the same slot, and MongoDB only supports
transactions on replica sets. MongoDB Atlas (free tier) works out of the box. For a local
MongoDB, start it with `mongod --replSet rs0` and run `rs.initiate()` once in `mongosh`.

```bash
npm run install:all
cp server/.env.example server/.env   # then fill in the values
npm run seed                         # admin + Dakar demo data (only if the database has no venues)
npm run dev                          # API on :5050, web on :5173 (5000 is taken by AirPlay on macOS)
```

`npm run seed:reset --prefix server` wipes the WinPitch collections and seeds again (refused in production).
`npm test --prefix server` runs the unit tests of the pricing, size, slot and commission rules.

Demo accounts created by the seed script (password `password123`): `owner@demo.test` (phone
77 000 00 01, runs Almadies Five, Ouakam Sports Center and Sacré-Cœur Arena) and `client@demo.test`
(77 000 00 02). Players log in with their phone number or email. The admin account comes from
`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `server/.env`.

### Test payments

`PAYMENT_PROVIDER=mock` simulates a mobile money provider (hosted page, signed webhooks, refunds).
The paying phone number decides what happens: ending in **00** pays after 3 s, **01** is refused,
**02** never answers (the hold expires after 10 min). Any other number waits for the buttons on the
test page (`/api/v1/mock-pay/:ref`). Refunds of an amount ending in 13 FCFA fail, to test retries.

## Deploy (Render)

One **Web Service** runs the API and serves the built web app (`client/dist`) on the same URL.

| Setting | Value |
|---|---|
| Root directory | *(empty, repo root)* |
| Build command | `npm run build` (installs `server/` and `client/`, then builds the web app) |
| Start command | `npm start` |
| Environment | `MONGODB_URI` (Atlas), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MOCK_WEBHOOK_SECRET`, `ADMIN_*`, `API_URL` and `CLIENT_URL` = the Render URL |

Leave `NODE_ENV` unset while payments use the mock provider: in production mode the mock (and its
test page) is not loaded, so payments can't complete until a real provider is wired.

## How it fits together

| Area | Where |
|---|---|
| Pricing, sizes, slots, commission (pure, unit-tested) | `server/src/domain/` |
| Availability from the database (bookings, holds, blocks) | `server/src/services/availability.js` |
| Booking creation (transaction + area lock) | `server/src/services/bookings.js` |
| Payments: adapter, mock driver, webhooks, refunds, ledger, hold expiry job | `server/src/services/payments/` |
| Public, player, owner, admin routes | `server/src/routes/` |
| Messages (console output until providers are chosen) | `server/src/services/notifier.js` |
| Image storage (MongoDB for now) | `server/src/services/storage.js` |
| Auth (JWT access token + httpOnly refresh cookie, phone or email login) | `server/src/routes/auth.js` |

## Not done yet

- Owner venue setup screens (create a venue, add areas, opening hours, photos): the API exists
  (`/owner/venues`, `/owner/venues/:id/areas`), the screens don't yet
- Owner balance screen and the redesigned admin screens (commission, payments, payouts); the
  admin pages still use the old design
- Real payment provider (PayDunya, PayTech or Wave), email and SMS/WhatsApp providers
- Recurring bookings, linked areas UI, map search, OTP and password reset
- Image resizing on upload (only the 2 MB limit is enforced)
