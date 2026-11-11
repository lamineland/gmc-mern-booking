# Booking App (MERN)

Book salons, football pitches, gyms and more. Requirements: [docs/PRD.md](docs/PRD.md).

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
npm run seed                         # admin + demo data
npm run dev                          # API on :5050, web on :5173 (5000 is taken by AirPlay on macOS)
```

Demo accounts created by the seed script (password `password123`): `owner@demo.test`,
`client@demo.test`. The admin account comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in
`server/.env`.

## How it fits together

| Area | Where |
|---|---|
| Slot calculation & selection checks | `server/src/services/availability.js` |
| Booking creation (transaction + resource lock) | `server/src/routes/bookings.js` |
| Emails (console output until a provider is chosen) | `server/src/services/notifier.js` |
| Image storage (MongoDB for now) | `server/src/services/storage.js` |
| Auth (JWT access token + httpOnly refresh cookie) | `server/src/routes/auth.js` |

## Not done yet

- Automated tests (slot calculation and booking rules first)
- Image resizing on upload (only the 2 MB limit is enforced)
- Owner time blocks, holiday exceptions UI (the API accepts `exceptions`), password reset
- Email provider and hosting (still to be chosen, see PRD §11)
