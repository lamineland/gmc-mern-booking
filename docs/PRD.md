# Product Requirements Document — Multi-Business Booking App

**Stack:** MongoDB · Express · React · Node.js (MERN)
**Version:** 1.1 (MVP) · **Status:** Draft — product decisions resolved (see §11)

---

## 1. Overview

A web platform where clients discover and book appointments or rentals at local businesses — salons, football pitches, gyms, and similar. Business owners list their business, define services and rental areas, and manage incoming bookings. Admins moderate the platform.

### 1.1 Problem
- Clients phone or message businesses to check availability; slow and error-prone.
- Owners juggle bookings in notebooks/WhatsApp, causing double bookings and no-shows.

### 1.2 Goals
1. Let a client find a business and book a slot in under 2 minutes.
2. Eliminate double bookings.
3. Give owners a clear view of today's and this week's schedule.
4. Keep the platform trustworthy via admin approval of businesses.

### 1.3 Non-Goals (MVP)
- Online payments / deposits
- Native mobile apps (responsive web only)
- Reviews & ratings, loyalty, promo codes
- Multi-staff scheduling inside one business
- Multi-language / multi-currency (single locale and currency at launch)

---

## 2. Actors & Permissions

| Actor | Description | Key abilities |
|---|---|---|
| **Client** | End user booking services | Sign up/log in, search, view services & slots, book, view/cancel own bookings |
| **Owner** | Business operator | Create/manage one or more businesses (details, rental areas, hours, services), dashboard, cancel bookings |
| **Admin** | Platform moderator | Approve/reject businesses, manage users (suspend/reactivate/delete) |

Roles are mutually exclusive per account (`client`, `owner`, `admin`). Admins are seeded, not self-registered.

---

## 3. User Stories & Functional Requirements

### 3.1 Authentication (all roles)
- **FR-A1** Sign up with name, email, password, phone, and role (`client` or `owner`).
- **FR-A2** Log in with email + password; receive JWT access token (+ refresh token in httpOnly cookie).
- **FR-A3** Log out; token invalidation on refresh-token revoke.
- **FR-A4** Suspended users cannot log in.
- **FR-A5** (Should) Password reset by email.

### 3.2 Client
| ID | Story | Acceptance criteria |
|---|---|---|
| C1 | Search businesses by city and category | Filter by `city` and `category` (salon, football, gym, other); only `approved` + active businesses appear; paginated; empty-state message |
| C2 | View business page | Shows description, address, photos, opening hours, services (name, duration, price), rental areas |
| C3 | View available slots | Pick one or more services (+ rental area if applicable) and date → list of free slots computed from opening hours, total duration, and existing bookings; past slots hidden |
| C4 | Book a slot | Creates booking directly as `confirmed` (availability is known in real time, so no owner approval step); one booking may contain several services, performed back-to-back; slot cannot be double-booked, even under concurrent requests |
| C5 | View my bookings | List with tabs: upcoming / past / cancelled; shows status, services, total duration and total price |
| C6 | Cancel a booking | Allowed while `confirmed` and at least **2 h before start** (single platform-wide rule); frees the slot |

### 3.3 Owner
| ID | Story | Acceptance criteria |
|---|---|---|
| O1 | Create business | Name, category, description, city, address, phone, photos; saved as `pending` until admin approves. An owner can create **several businesses** under one account (e.g., a salon and a pitch), each approved separately |
| O1b | Switch between businesses | Business switcher in the owner area; every owner screen is scoped to the selected business |
| O2 | Define opening hours | Per weekday open/close times, support multiple intervals (lunch break) and closed days; optional exceptions (holidays) |
| O3 | Define services | Name, duration (min), price, optional description; edit, deactivate |
| O4 | Define rental areas | For pitches/rooms/courts: name, capacity/type, optional price override; a booking targets a service and, where relevant, a rental area. Each area has its own independent availability |
| O5 | Dashboard | "Today" and "This week" views per business (plus an "All businesses" total): count of bookings by status, chronological list, quick actions |
| O6 | Confirmation | Bookings are confirmed automatically on creation; the owner does not approve them. (Replaces the earlier confirm/decline step.) |
| O7 | Cancel a booking | Confirmed → cancelled by owner with a required reason, at any time before start (e.g., pitch unusable); client notified; slot freed |
| O7b | Block time | (Should) Owner can block a time range on the business or a rental area (maintenance, private event) so it is not bookable |
| O8 | Edit business | Edits to key fields after approval (name, category, city) trigger re-review (Should) |

### 3.4 Admin
| ID | Story | Acceptance criteria |
|---|---|---|
| AD1 | Review businesses | List filtered by status (`pending`, `approved`, `rejected`); view details |
| AD2 | Approve / reject business | Approve makes it publicly searchable; reject requires a reason shown to the owner |
| AD3 | Manage users | List/search users by role/status; suspend, reactivate, delete; suspending an owner hides their businesses; cancelling-impact: upcoming bookings of a suspended owner are flagged |
| AD4 | (Should) Platform stats | Totals: users, businesses, bookings |

---

## 4. Booking Rules & Lifecycle

### 4.1 Status machine
Bookings are confirmed automatically at creation: the availability check is the confirmation.
```
(create) ──▶ confirmed ──complete (auto, after end time)──▶ completed
                 │
                 ├─cancel (client, ≥ 2 h before start)──▶ cancelled_by_client
                 └─cancel (owner, before start, reason)──▶ cancelled_by_owner
```

### 4.2 Multi-service bookings
- A booking holds an ordered list of services from the **same business**, performed back-to-back.
- Total duration = sum of service durations; total price = sum of prices (snapshotted at booking time).
- If any selected service uses a rental area, the whole booking occupies that area for the total duration.

### 4.3 Slot generation
- Slot length = total duration of the selected services; start times step at a business-defined interval (default 15/30 min).
- A slot is available if it fits entirely within an opening interval and does not overlap any `confirmed` booking (or owner time block) for the same resource.
- **Resource** = rental area if the service uses one, otherwise the business (one booking at a time unless `capacity > 1`).
- All times stored in UTC; displayed in the business's timezone.

### 4.4 Concurrency
- Because bookings confirm instantly, the overlap check and insert must be atomic: run them in a MongoDB transaction (bookings can have variable lengths, so a unique index on start time alone is not enough). The second concurrent request receives `409 Conflict` and the client is shown refreshed slots.

### 4.5 Cancellation policy
- One platform-wide rule: clients can cancel up to **2 hours** before start. Stored in server config (`CANCELLATION_CUTOFF_HOURS=2`), not per business.

### 4.6 Notifications (MVP)
- Email on: new booking (to owner, and a confirmation to the client), cancellation (to the other party), business approved/rejected (to owner).
- Email provider: to be decided (see §11). Wrap sending in a `notifier` module so the provider can be plugged in later; log emails to the console in development.
- In-app notification badge is a Should-have.

---

## 5. Data Model (MongoDB / Mongoose)

```
User        { _id, name, email (unique), passwordHash, phone, role, status: active|suspended, createdAt }

Business    { _id, ownerId→User (one owner → many businesses), name, category, description,
              city, address, phone, photoIds[]→Image,
              timezone, status: pending|approved|rejected, rejectionReason,
              openingHours: [{ day: 0-6, intervals: [{ open:"09:00", close:"18:00" }] }],
              exceptions: [{ date, closed | intervals }],
              slotStepMinutes, createdAt }

Service     { _id, businessId, name, description, durationMin, price, usesRentalArea, active }

RentalArea  { _id, businessId, name, type, capacity, photoIds[]→Image, active }

Booking     { _id, clientId, businessId, rentalAreaId?,
              items: [{ serviceId, name, durationMin, price }]   // snapshot, ≥ 1 item
              startAt, endAt, totalPrice,
              status: confirmed|completed|cancelled_by_client|cancelled_by_owner,
              cancelReason?, cancelledAt?, createdAt }

TimeBlock   { _id, businessId, rentalAreaId?, startAt, endAt, reason }   // Should-have

Image       { _id, ownerId→User, contentType, size, data: Binary, createdAt }
```

Indexes: `Business {city, category, status}`, `Business {ownerId}`, `Booking {businessId, startAt}`, `Booking {rentalAreaId, startAt}`, `Booking {clientId, startAt}`, `User {email}` unique.

### 5.1 Image storage
- Images are stored **in MongoDB** for now, in a dedicated `Image` collection (not embedded in Business, to keep business documents small and fast to query).
- Limits: JPEG/PNG/WebP only, max 2 MB after server-side resize (e.g., `sharp`, max 1600 px), max 10 photos per business.
- Served by `GET /api/v1/images/:id` with long cache headers.
- All reads/writes go through a `storage` module (`save`, `get`, `delete`) so we can move to Cloudinary or S3 later without changing the rest of the code.

---

## 6. API Outline (REST, `/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| Public | `GET /businesses?city=&category=&page=`, `GET /businesses/:id`, `GET /businesses/:id/services`, `GET /businesses/:id/availability?serviceIds=a,b&areaId=&date=`, `GET /images/:id` |
| Client | `POST /bookings` (body: `businessId`, `serviceIds[]`, `rentalAreaId?`, `startAt`), `GET /bookings/me`, `PATCH /bookings/:id/cancel` |
| Owner | `GET /owner/businesses`, `POST /owner/businesses`, `PUT /owner/businesses/:id`, `POST/DELETE /owner/businesses/:id/photos`, `CRUD /owner/businesses/:id/services`, `CRUD /owner/businesses/:id/areas`, `GET /owner/bookings?businessId=&range=today|week`, `PATCH /owner/bookings/:id/cancel` |
| Admin | `GET /admin/businesses?status=`, `PATCH /admin/businesses/:id/approve|reject`, `GET /admin/users`, `PATCH /admin/users/:id/suspend|reactivate`, `DELETE /admin/users/:id` |

Conventions: JSON, consistent error shape `{ error: { code, message, details } }`, role-based middleware, request validation (Zod/Joi), pagination via `page`/`limit`.

---

## 7. UI / Screens (React)

**Public/Client:** Landing + search (city, category) · Results list · Business detail (services, areas, hours) · Booking flow (pick services → area → date → slot → summary with total duration & price → book) · My bookings · Login / Sign up
**Owner:** My businesses list + switcher · Business setup wizard (details & photos → hours → services → areas) · Dashboard (Today / This week) · Bookings list with Cancel · Edit business
**Admin:** Pending businesses queue · Business detail review · Users table

Suggested stack: React + Vite, React Router, TanStack Query, Tailwind CSS, React Hook Form. Fully responsive (mobile first).

---

## 8. Non-Functional Requirements

- **Security:** bcrypt password hashing, JWT with short expiry, httpOnly refresh cookie, helmet, CORS allowlist, rate limiting on auth, input validation/sanitization, ownership checks on every owner/client resource.
- **Performance:** search and availability endpoints p95 < 500 ms at 1k businesses; paginated lists.
- **Reliability:** no double bookings; idempotent booking creation (client token) to avoid duplicate submits.
- **Accessibility:** WCAG 2.1 AA basics (labels, keyboard nav, contrast).
- **Privacy:** store minimal PII; owners see only the client name/phone for their own bookings.
- **Observability:** structured logs, error tracking (Sentry), health endpoint.
- **Testing:** unit tests for slot generation and booking rules; API integration tests (Jest + Supertest); E2E for the core booking flow (Playwright).

---

## 9. Success Metrics

| Metric | Target (first 3 months) |
|---|---|
| Time from search to confirmed booking request | < 2 min median |
| Double bookings | 0 |
| Owner-initiated cancellations | < 5 % of bookings |
| Booking-to-no-show/cancel ratio | tracked baseline |
| Approved businesses | 50 |

---

## 10. Milestones

| Phase | Scope | Est. |
|---|---|---|
| 0 | Repo setup, CI, auth, roles | 1 wk |
| 1 | Business, services, areas, hours (owner) + admin approval | 2 wk |
| 2 | Search, availability engine, booking flow (client) | 2 wk |
| 3 | Owner dashboard, owner cancellation, email notifications | 1.5 wk |
| 4 | Admin user management, hardening, tests, deploy | 1.5 wk |

---

## 11. Risks & Open Questions

**Risks**
- Slot logic complexity (breaks, exceptions, timezones) → isolate in a tested service module.
- Fake/low-quality listings → admin approval gate; later add reporting.
- No-shows without payment → consider deposits in v2.
- Instant confirmation means owners can't filter out bad bookings → owner cancellation with reason, plus time blocks.
- Images in MongoDB grow the database quickly → size limits, resizing, and a `storage` module so moving them out later is easy.

**Decisions (resolved 2026-11-09)**
| # | Question | Decision |
|---|---|---|
| 1 | Auto-confirm or owner approval? | **Auto-confirm.** Availability is known in real time, so a booking is `confirmed` when created |
| 2 | Several services in one booking? | **Yes.** Back-to-back, same business, durations and prices summed |
| 3 | Several businesses per owner? | **Yes.** One owner account, many businesses, each approved separately |
| 4 | Cancellation cutoff? | **Same for everyone:** 2 h before start, set in platform config |
| 5 | Hosting & email provider? | **Decide later.** Code against a `notifier` module; console output in development |
| 6 | Image storage? | **MongoDB for now** (`Image` collection, behind a `storage` module); move to Cloudinary or S3 later |

**Still open**
- Hosting and email provider (decision 5).
- Exact limit on how many services one booking can hold (suggest max 5).

---

## 12. Future (v2+)
Online payments/deposits, reviews & ratings, staff calendars, recurring bookings, SMS/WhatsApp reminders, Google Calendar sync, map-based search, promo codes, analytics for owners.
