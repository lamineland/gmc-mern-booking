# Product Requirements Document: Sports Area Booking App

**Stack:** MongoDB · Express · React · Node.js (MERN)
**Version:** 2.2 (MVP) · **Status:** Product decisions resolved (see §12). Front design in progress.
**Changes from 2.1:** areas have **dimensions** (length × width). A **size category** is derived from them, and **prices are set per sport + size category**, so a bigger area costs more (§5.3).
**Changes from 2.0:** launch in **Senegal** (XOF, Africa/Dakar). **Mobile money payment is in the MVP**, behind a provider adapter with a **mock provider** for development and tests. The platform takes a **commission per booking** that the admin can set. Staff accounts are postponed.

---

## 1. Overview

A web platform where players in Senegal find a sports venue, see which pitches or courts are free, and book and pay for one for a set time. Example: *Terrain 1 (foot à 5), today 18:30–19:00, 20 000 FCFA, paid with Wave*. Venue owners list their venues and areas, set opening hours and prices, and manage bookings, including bookings that come in by phone. The platform keeps a commission on each online booking. Admins moderate venues and set the commission.

### 1.1 Problem
- Players call or WhatsApp several venues to find a free pitch at the time they want, and prices are rarely published.
- Owners track bookings in notebooks or WhatsApp. This leads to double bookings, forgotten slots, no-shows and lost evening revenue.

### 1.2 Goals
1. A player finds, books and pays for a free area in **under 2 minutes** from the home screen.
2. **Zero double bookings**, including bookings the owner enters by hand.
3. Prices are always visible before booking and set only by the owner.
4. **Fewer no-shows**: every online booking is paid (fully or as a deposit) before it is confirmed.
5. Owners see every area's day on one screen and can fill it from the app or by phone.
6. The platform earns a commission on each online booking.

### 1.3 Target market
- **Launch: Senegal, Dakar first** (then Thiès, Saint-Louis, Mbour/Saly). Currency **XOF (FCFA)**, timezone **Africa/Dakar (UTC+0, no daylight saving)**, phone numbers `+221 7X XXX XX XX`.
- Players book mostly on mobile phones, with mobile data, often in the evening (17:00–23:00) and at weekends.
- Phone number is the main identity. WhatsApp is the main messaging channel. **Wave and Orange Money** are the main ways to pay, then Free Money and cards.

### 1.4 Non-Goals (MVP)
- Native mobile apps (responsive web / installable PWA only)
- Staff accounts (owners only)
- Finding players, open matches, leagues, tournaments (v2)
- Split payment between players (v2)
- Automatic payouts to owners (MVP: admin pays owners by hand and records it)
- Coaching, equipment rental, food and drink sales
- Countries other than Senegal

---

## 2. Benchmark

### 2.1 Apps reviewed

| App | Market | What it does well | What we take |
|---|---|---|---|
| **Playtomic** | Europe, padel/tennis | Book a court in a few taps. **Split payment**: each player pays their share ([source](https://help.playtomic.com/en/articles/5505954-split-payment-vs-single-payment)). A private booking can become an **open match** that others join ([source](https://playerhelp.playtomic.com/hc/en-gb/articles/19831958258193-Private-Bookings-vs-Open-Matches)). Player levels. | Fast booking flow; split payment and open matches in v2 |
| **MATCHi** | Nordics/Europe, racket sports | Club pages, find players, split payment in the app ([review](https://padelspeed.com/blogs/news/padel-apps-reviewed-and-listed)) | Venue page structure |
| **Playo / Hudle** | India, football/badminton/turf | Multi-sport venue search by location; prices by time of day; "join a game" community | Search by sport and area; peak/off-peak pricing |
| **Pitchbooking** (UK) | Councils, schools, 3G pitches | Splitting a full pitch into halves or thirds; regular weekly team bookings; staff calendar | Linked areas (full pitch vs. halves); recurring bookings |
| **FiveUp** | France/Belgium, foot à 5 | Booking for five-a-side centres ([App Store](https://apps.apple.com/fr/app/fiveup/id6756242862)) | Shows the five-a-side niche works in French-speaking markets |
| **Local practice** (Dakar) | No clear leading booking platform found | Phone/WhatsApp bookings; sometimes a deposit by Wave/Orange Money to hold the slot ([source](https://kolonell.com/fr/blog/app-reservation-terrain-sport-mini-foot-padel-2026)) | Owner manual booking; mobile money deposit; WhatsApp notifications |

Notes on Playo, Hudle and Pitchbooking come from general product knowledge, not checked against current documentation.

### 2.2 What this means for us
1. **Prices must depend on the time.** Every reviewed app prices evenings and weekends higher.
2. **The owner's calendar matters as much as the player's app.** Owners will keep taking phone bookings, so they must enter them in the app, or the availability shown is wrong.
3. **Recurring bookings drive revenue.** Teams book "every Tuesday 20:00" for a season.
4. **No-shows are the biggest risk.** Local practice already uses a mobile money deposit, so paying online is familiar.
5. **Phone-first and WhatsApp-first**, in French, on a slow connection.

### 2.3 Feature list

| Feature | Priority | Reason |
|---|---|---|
| Search venues by city/district, sport, date and time ("free at 19:00?") | **Must** | Core use case |
| Area availability grid by day, with price on each slot | **Must** | Players compare price and time at a glance |
| Owner-defined pricing by day and time band | **Must** | Core requirement; benchmark standard |
| Area dimensions and size category; prices set per size | **Must** | Bigger areas cost more; owners price once per size, not per area |
| Min/max booking length per area, 30 min slots by default | **Must** | "18:30–19:00" style bookings |
| **Mobile money payment** (Wave, Orange Money, Free Money) through a provider adapter, with a mock provider | **Must** | No-show protection; platform revenue |
| **Commission per booking**, set by the admin (default + per-venue override) | **Must** | Business model |
| Owner balance and admin payout records | **Must** | Owners must see what they are owed |
| Owner calendar (areas × hours) with manual booking for walk-in/phone clients | **Must** | Keeps availability true |
| Owner time blocks (maintenance, tournament) | **Must** | Pitches are often closed for events |
| Notifications by email + "share on WhatsApp" links | **Must** | Main channel in the market |
| French UI, FCFA prices without decimals | **Must** | Target market |
| WhatsApp/SMS notifications and OTP | **Should** (provider later) | Main channel; behind the `notifier` module |
| Mark no-show (owner) | **Should** | Tracks unreliable clients |
| Recurring weekly booking (owner-created first) | **Should** | Team seasons |
| Linked areas (full pitch = 2 halves) | **Should** | Common setup for foot à 5 / à 7 |
| Map and "near me" search | **Should** | Players search by district |
| Installable PWA | **Should** | Feels like an app, no store needed |
| Staff accounts | Later | Decision 14 |
| Automatic payouts to owners (provider payout API) | v2 | MVP pays owners by hand |
| Split payment between players | v2 | Needs payments working first |
| Open matches / find players, team pages | v2 | Community features |
| Reviews and ratings | v2 | Needs volume first |
| Promo codes, last-minute discounts | v2 | Owners fill empty off-peak slots |

---

## 3. Actors & Permissions

| Actor | Description | Key abilities |
|---|---|---|
| **Player** (`client`) | Person or team captain renting an area | Sign up, search, see availability and prices, book and pay, see and cancel own bookings |
| **Owner** | Operates one or more venues | Create/manage venues, areas, hours, pricing, payment mode; calendar; manual and recurring bookings; time blocks; cancel; mark no-show; see balance and payouts |
| **Admin** | Platform moderator | Approve/reject venues; set commission (default and per venue); record payouts; manage users; view payments |

Roles are exclusive per account. Admins are seeded. The role keeps the code name `client` to avoid a migration; the UI says "Joueur". No staff role in MVP.

---

## 4. Functional Requirements

### 4.1 Authentication
- **FR-A1** Sign up with name, phone (required, unique, Senegal format `+221`), email (optional), password, role (`client` or `owner`).
- **FR-A2** Log in with phone **or** email + password. JWT access token + httpOnly refresh cookie (unchanged).
- **FR-A3** Logout and token revocation (unchanged). **FR-A4** Suspended users cannot log in.
- **FR-A5** *(Should, provider later)* Phone verification and password reset by SMS/WhatsApp OTP. Until then: email reset if an email is set, otherwise reset by an admin.

### 4.2 Player
| ID | Story | Acceptance criteria |
|---|---|---|
| P1 | Search venues | Filter by city, district, sport, size category (once a sport is chosen), and optionally date + start time + length ("free at 19:00 for 1 h"). Shows only approved venues. Each result shows photo, district, sports, "dès X FCFA / 30 min", and next free slots for the chosen date |
| P2 | View venue page | Photos, address + map link, opening hours, amenities, areas (sport, format, surface, indoor/outdoor, lighting, **dimensions and size category**), price list per size category, payment mode ("acompte 5 000 FCFA" or "paiement complet") |
| P3 | Pick a time | Choose area and date → day grid of 30-min slots. Each slot shows free or "Réservé" and its price. Taken slots never show who booked. Player picks a start and a length between the area's min and max → summary shows start–end time, **total price**, and **amount to pay now** |
| P4 | Book and pay | Player chooses a payment method (Wave, Orange Money, Free Money) and confirms. The slot is held for **10 minutes** while the player pays. On payment success the booking is `confirmed`; on failure or timeout the hold is released and the player can try again. The same slot can never be booked twice, even with concurrent requests |
| P5 | My bookings | Upcoming / past / cancelled tabs, showing venue, area, date, start–end, price, amount paid, amount left to pay at the venue, status. "Ajouter au calendrier" and "Partager sur WhatsApp" on each booking. A booking waiting for payment shows "Payer" with the time left |
| P6 | Cancel | Allowed while `confirmed` and at least **2 h before start** (platform setting). Frees the slot. The amount paid online is **refunded in full** to the same wallet |
| P7 | *(Should)* Rebook | "Réserver à nouveau" from a past booking opens the same area, weekday and time |

### 4.3 Owner
| ID | Story | Acceptance criteria |
|---|---|---|
| O1 | Create venue | Name, description, city, district, address, GPS pin *(Should)*, phone/WhatsApp, photos, amenities (changing rooms, showers, parking, lighting, drinks), **payout wallet** (provider + number, used by the admin to pay the owner). Saved as `pending` until an admin approves. One owner can have several venues, each approved separately |
| O1b | Switch venue | Venue switcher in the owner area; every owner screen is scoped to the selected venue |
| O2 | Opening hours | Per weekday, several intervals or closed. Exception days (holidays such as Tabaski or Magal, closures) |
| O3 | Define areas | Name, sport (football, basketball, futsal, volleyball, handball, tennis, padel, other), format (e.g., 5v5, 7v7, 3x3), **length and width in metres** (required), surface, indoor/outdoor, lit, max players, photos; activate/deactivate. The size category is shown as soon as the dimensions are typed |
| O4 | Booking rules per area | Slot length (15/30/60 min, **default 30**), min length (default 1 slot), max length (default 3 h), how far ahead players can book (default 30 days) |
| O5 | Pricing per size | One price list per **sport + size category** used at the venue (e.g., Football · Petit, Football · Moyen): **base price per slot** + **price rules** by weekday(s) and time band (e.g., Mon–Fri 18:00–24:00 = 20 000 FCFA / 30 min; Sat–Sun all day = 22 500). Every area of that sport and size uses it. An area can **override** it with its own list (e.g., a newer pitch). The most specific rule wins. A preview shows the weekly price grid per size. A warning (not a block) appears when a bigger size is cheaper than a smaller one. Price changes never affect existing bookings |
| O6 | Payment mode per venue | **Full payment** or **deposit** (fixed amount in FCFA, never less than the platform commission on the booking; capped at the booking price). Default: full payment. The rest of a deposit booking is paid at the venue |
| O7 | Calendar | Day view: areas as columns, time as rows, bookings, held slots and blocks shown in place. Week view per area. Today's bookings, booked hours and expected revenue |
| O8 | Manual booking | Click an empty slot → enter client name + phone (no account needed), length, price (pre-filled, editable). Paid at the venue; no online payment, **no commission**. Same double-booking protection. Marked "manuelle" |
| O9 | *(Should)* Recurring booking | Weekly on a weekday/time until an end date, created by the owner (paid at the venue, like manual bookings). Lists clashing weeks so the owner can skip them. Cancel one or all |
| O10 | Time blocks | Block an area, or the whole venue, for a time range with a reason. Blocks clashing with bookings are refused |
| O11 | Cancel | Cancel any confirmed booking before its start, with a required reason. Client notified; slot freed; amount paid online **refunded in full**; commission on it is cancelled |
| O12 | *(Should)* Mark no-show | After start time, mark a booking `no_show`. No refund. Player profile shows a no-show count to owners |
| O13 | *(Should)* Linked areas | An area can include other areas (e.g., "Grand terrain" = "Demi-terrain A" + "Demi-terrain B"). Booking one blocks the others for that time |
| O14 | Balance | Per venue: online payments received, commission, net owed, payouts already received, balance. Line by line, filterable by month |
| O15 | Edit venue | Changing name or city after approval triggers re-review *(Should)* |

### 4.4 Admin
| ID | Story | Acceptance criteria |
|---|---|---|
| AD1 | Review venues | Filter by status; view details, areas, prices and payment mode |
| AD2 | Approve / reject | Approval makes the venue searchable; rejection needs a reason shown to the owner |
| AD3 | Manage users | Search by role/status/phone; suspend, reactivate, delete. Suspending an owner hides their venues and flags their upcoming bookings |
| AD4 | **Set commission** | Platform default rate (%, e.g., 10 %) and an optional per-venue override. Optional minimum and maximum commission per booking in FCFA. Changes apply to new bookings only; each booking keeps the rate it was created with |
| AD5 | **Payments** | List of payments with status, provider, method, amount, booking; filter by status and date. Retry a failed refund |
| AD6 | **Payouts** | Balance owed per venue; record a payout (amount, date, method, reference) after paying the owner by hand. Recorded payouts appear in the owner's balance |
| AD7 | *(Should)* Platform stats | Users, venues, bookings, booked hours, gross booking value, commission earned (FCFA) |

---

## 5. Booking Rules

### 5.1 Status machine
```
(online create) ──▶ pending_payment ──payment succeeded──▶ confirmed ──end passes──▶ completed (computed)
                         │                                    │
                         ├─ payment failed ──▶ (back to pending_payment, retry allowed while the hold lasts)
                         └─ hold expires (10 min) ──▶ expired
                                                              ├─ cancel (player, ≥ 2 h before start) ─▶ cancelled_by_client  + full refund
                                                              ├─ cancel (owner, before start, reason) ▶ cancelled_by_owner   + full refund
                                                              └─ no-show (owner, after start) ───────▶ no_show              (Should, no refund)

(manual / recurring create) ──▶ confirmed   (no payment step)
```
- A `pending_payment` booking holds its slot until `holdExpiresAt`. Expired holds are released by a job that runs every minute, and are ignored by the availability check as soon as `holdExpiresAt` has passed (so a late job never blocks a slot).
- A payment success that arrives after the hold expired: if the slot is still free, confirm the booking; otherwise mark it `expired` and refund automatically.

### 5.2 Slots and length
- Each area has a fixed **slot length** (default **30 min**). Start times sit on that grid, counted from the start of each opening interval.
- A booking covers **N consecutive slots**, with the area's min ≤ N × slot length ≤ max. Example: slot 30 min, min 30, max 180 → 18:30–19:00, 18:30–20:00, and so on.
- A slot is free if it is inside an opening interval (after exceptions), in the future, within the booking horizon, and does not overlap a confirmed booking, a live hold, a time block, or a linked area's booking.
- Times stored in UTC, shown in Africa/Dakar time.

### 5.3 Pricing
- Prices are whole numbers in XOF, shown as `20 000 FCFA`.
- **Size drives price.** Each area has a length and width in metres. Its **size category** is the first category of its sport whose limit is above its surface (length × width):

  | Sport | Categories (surface limit) | Typical use |
  |---|---|---|
  | Football | Petit (< 1 200 m²) · Moyen (< 3 500 m²) · Grand | Foot à 5 (≈ 40 × 20 m) · Foot à 7/8 (≈ 60 × 40 m) · Foot à 11 (≈ 100 × 64 m) |
  | Futsal | Réduit (< 700 m²) · Standard | Standard ≈ 40 × 20 m |
  | Basketball | Demi-terrain (< 300 m²) · Terrain complet | 3x3 ≈ 15 × 14 m · 5x5 = 28 × 15 m |
  | Padel | Standard | 20 × 10 m |

  The limits live in one platform setting, so the admin can change them or add sports without code changes.
- **Price list used for an area** = the area's own override if it has one, otherwise the venue's list for the area's sport + size category. A venue cannot publish an area whose sport + size has no price list.
- Each slot's price = the matching rule of that price list for its weekday and start time, otherwise the list's base price. When several rules match, the one with the narrowest time band wins. Overlapping rules with the same band are refused when saved.
- **Booking price = sum of its slots' prices.** A booking can cross from off-peak to peak pricing.
- The UI also shows an indicative **price per player** (total ÷ the area's max players, rounded up to 100 FCFA).
- The price is computed **on the server** and saved on the booking (snapshot, with the size category and dimensions at booking time). The client never sends a price, except an owner's override on a manual booking.

### 5.4 Commission and amounts
For an online booking, saved on the booking when it is created:
```
price            = sum of slot prices                       e.g. 40 000
commissionRate   = venue override ?? platform default        e.g. 10 %
commission       = clamp(round(price × rate), min, max)      e.g. 4 000
amountDueOnline  = price (full mode) or depositAmount        e.g. 40 000 or 5 000
amountDueAtVenue = price − amountDueOnline                   e.g. 0 or 35 000
ownerNet         = amountDueOnline − commission              e.g. 36 000 or 1 000
```
- The deposit must be ≥ the commission, so the platform always collects its commission online.
- Commission is earned when the booking is `confirmed` and cancelled if the booking is refunded. A `no_show` keeps it.
- Manual and recurring bookings carry no commission.
- Provider fees (about 1–3 % depending on the aggregator) are paid by the platform out of the commission in MVP. Recorded per payment so the business model can be checked.

### 5.5 Concurrency
The overlap check and the insert run in one MongoDB transaction, with a lock on the area document (and on linked areas). Live holds (`pending_payment` with `holdExpiresAt` in the future) count as taken. The second of two concurrent requests gets `409 Conflict` and the player sees fresh slots. Booking creation takes an idempotency key to avoid duplicate taps. Payment webhooks are idempotent (same provider event processed once).

### 5.6 Cancellation and refunds
- Players can cancel until **2 h before start** (`CANCELLATION_CUTOFF_HOURS`). Full refund of the amount paid online.
- Owners can cancel any time before start, with a reason. Full refund.
- Refunds go through the provider adapter. A refund that fails stays `refund_failed`, is shown to the admin (AD5) and can be retried.
- No refund for no-shows.

### 5.7 Notifications
- **Email** (MVP, through the `notifier` module): booking confirmed (player + owner), payment failed, cancellation and refund (the other party), venue approved/rejected, payout recorded (owner).
- **WhatsApp/SMS** *(Should, provider to choose later)*: same events, plus a reminder 2 h before start. The `notifier` module gets a `whatsapp`/`sms` channel with a console driver until then. MVP fallback: "Partager sur WhatsApp" buttons (`wa.me` links with a pre-filled message).

---

## 6. Payments Integration

### 6.1 Approach
- One **payment provider adapter** interface; the rest of the code never calls a provider directly (same pattern as `notifier` and `storage`).
- Drivers: **`mock`** (development, tests, demos) now; a real driver later. Recommended first real driver: one **Senegalese aggregator** that covers Wave, Orange Money and Free Money behind one API and one webhook, such as **PayDunya** or **PayTech** ([comparison](https://kolonell.com/en/blog/paydunya-cinetpay-paytech-aggregator-comparison-senegal-2026)). PayDunya also offers a payout API to Wave/Orange Money/Free Money, useful for automatic payouts in v2 ([source](https://jentic.com/apis/paydunya.com/paydunya-disbursement)). Check fees and API details with the provider before choosing.
- Selected by environment: `PAYMENT_PROVIDER=mock|paydunya|paytech|wave`, with provider keys in `server/.env`.

### 6.2 Adapter interface (`server/src/services/payments/`)
```js
// Every driver implements:
createPayment({ paymentId, amount, currency, method, customerPhone, customerName,
                description, returnUrl, callbackUrl })
  → { providerRef, redirectUrl?, instructions?, expiresAt }
    // redirectUrl: hosted checkout page (Wave/aggregator)
    // instructions: e.g. "Confirmez le paiement sur votre téléphone" (USSD push)

parseWebhook(req)                 // checks the signature, returns a normalised event
  → { providerRef, eventId, status: 'succeeded'|'failed', amount, raw }

getPaymentStatus(providerRef)     // used when the player returns and as a backup to the webhook
  → { status: 'pending'|'succeeded'|'failed', amount }

refund({ providerRef, amount, reason })
  → { refundRef, status: 'succeeded'|'pending'|'failed' }

methods()                         // what this driver supports, for the UI
  → ['wave', 'orange_money', 'free_money']
```
A `payments` service on top of the adapter owns the business logic: creating the `Payment`, applying webhook events to the booking (§5.1), refunds, and writing ledger entries. Drivers only translate to and from the provider.

### 6.3 Mock provider
- `createPayment` returns a `redirectUrl` to a page served by the API in non-production only: `GET /api/v1/mock-pay/:providerRef`. The page shows the amount, the chosen wallet, and three buttons: **Payer**, **Échec**, **Abandonner**.
- **Payer** / **Échec** post a signed webhook to our own `POST /api/v1/webhooks/payments/mock`, exactly like a real provider, then redirect to `returnUrl`. **Abandonner** redirects without a webhook (tests hold expiry).
- Automatic mode for tests: `MOCK_PAYMENT_AUTO=success|fail|none`. Phone-number rules for deterministic tests: numbers ending in `00` succeed, ending in `01` fail, ending in `02` never answer.
- `refund` succeeds at once, except for amounts ending in `13` FCFA, which fail (to test `refund_failed`).
- The mock route and driver are **never loaded** when `NODE_ENV=production`.

### 6.4 Mock and seed data (Dakar)
The seed script creates realistic test data so the full flow works without any real account:
- Admin; 3 owners; 10 players with `+221 77 000 00xx` numbers.
- 6 approved venues in Dakar districts (Almadies, Ouakam, Mermoz, Sacré-Cœur, Parcelles Assainies, Grand Yoff), 1 pending, 1 rejected. Mix of foot à 5, foot à 7, basketball, futsal and padel areas, with day/evening/weekend prices from 10 000 to 40 000 FCFA per 30 min, and one linked full pitch / two halves.
- Venues in both payment modes (full, deposit 5 000 FCFA); one venue with a commission override.
- About 2 weeks of past and future bookings in every status (confirmed, completed, cancelled with refund, no-show, expired, manual, recurring), with matching payments, ledger entries and one recorded payout.
- Demo password for all seeded accounts: `password123` (unchanged).

---

## 7. Data Model (MongoDB / Mongoose)

```
User       { _id, name, phone (unique, E.164), email? (unique, sparse), passwordHash,
             role: client|owner|admin, status: active|suspended,
             noShowCount, phoneVerifiedAt?, createdAt }

Venue      { _id, ownerId→User, name, description, city, cityKey, district,
  (was       address, location?: GeoJSON Point, phone, whatsapp?,
  Business)  photoIds[]→Image, amenities[], sports[] (derived from areas),
             timezone: 'Africa/Dakar', currency: 'XOF',
             status: pending|approved|rejected, rejectionReason,
             openingHours: [{ day: 0-6, intervals: [{ open, close }] }],
             exceptions: [{ date, closed | intervals }],
             paymentMode: full|deposit, depositAmount?,
             pricing: [{ sport, size, basePrice,                 // one list per sport + size category
                         priceRules: [{ days: [0-6], from, to, price }] }],
             commissionRate?            // override, set by admin only
             payoutWallet: { method: wave|orange_money|free_money, phone },
             createdAt }

Area       { _id, venueId, name, sport, format, surface, indoor, lit, maxPlayers,
  (was       photoIds[], active,
  RentalArea) lengthM, widthM, sizeCategory (derived on save from sport + lengthM × widthM),
             slotMinutes (default 30), minSlots, maxSlots, bookingHorizonDays,
             pricing?: { basePrice, priceRules[] }        // optional override of the venue's size list
             linkedAreaIds[]  (Should),
             lockVersion }

Booking    { _id, venueId, areaId, clientId? → User,
             guest?: { name, phone },                     // manual bookings
             source: online|manual|recurring, seriesId?,
             startAt, endAt, slotCount,
             price, currency, priceBreakdown: [{ startAt, price }],
             areaSnapshot: { name, sizeCategory, lengthM, widthM },
             commissionRate, commission,                  // 0 for manual/recurring
             amountDueOnline, amountDueAtVenue, ownerNet,
             paymentMode: full|deposit|on_site,
             holdExpiresAt?,                              // pending_payment only
             note?,
             status: pending_payment|confirmed|expired|
                     cancelled_by_client|cancelled_by_owner|no_show,
             cancelReason?, cancelledAt?, createdBy→User, idempotencyKey?,
             createdAt }

Payment    { _id, bookingId, venueId, clientId,
             kind: charge|refund, provider, method, amount, currency,
             status: pending|succeeded|failed|expired|refund_failed,
             providerRef, providerFee?, failureReason?,
             events: [{ eventId, status, receivedAt, raw }],   // webhook log, idempotency
             createdAt, updatedAt }

LedgerEntry { _id, venueId, bookingId?, paymentId?, payoutId?,
              type: booking_income|commission|refund|commission_reversal|payout,
              amount (signed, XOF), createdAt }
              // owner balance = sum of entries for the venue

Payout     { _id, venueId, amount, method, reference, paidAt, recordedBy→User, note? }

Settings   { _id: 'platform', commissionRate, commissionMin?, commissionMax?,
             cancellationCutoffHours, holdMinutes,
             sizeCategories: { [sport]: [{ key, label, maxM2 }] },   // §5.3 table
             updatedBy, updatedAt }   // single document

TimeBlock  { _id, venueId, areaId? (null = whole venue), startAt, endAt, reason, createdBy }

BookingSeries { _id, venueId, areaId, guest | clientId, weekday, startTime, slotCount,
                fromDate, untilDate, price?, status }   (Should)

Image      { unchanged }
```

**Indexes:** `Venue {cityKey, status}`, `Venue {sports}`, `Venue {location: 2dsphere}`, `Venue {ownerId}`, `Area {venueId}`, `Booking {areaId, startAt}`, `Booking {venueId, startAt}`, `Booking {clientId, startAt}`, `Booking {status, holdExpiresAt}`, `Booking {idempotencyKey}` unique sparse, `Payment {providerRef}` unique, `Payment {bookingId}`, `Payment {"events.eventId"}`, `LedgerEntry {venueId, createdAt}`, `Payout {venueId, paidAt}`, `TimeBlock {areaId, startAt}`, `User {phone}` unique, `User {email}` unique sparse.

### 7.1 Changes from the current code
| Today | v2.1 |
|---|---|
| `Business` with `category` enum (salon, football, gym, other) | `Venue` without category; sports come from its areas; payment mode, commission override, payout wallet |
| `Service` (duration + price) and `Booking.items[]` | Removed. Length and price live on `Area` and `Booking` |
| `RentalArea { type, capacity }` | `Area` with sport, format, dimensions, size category and booking rules; prices on `Venue.pricing` per sport + size, optional per-area override |
| Email required and used for login; phone optional | Phone required and unique; login by phone or email; email optional |
| `Booking.totalPrice`, statuses confirmed/cancelled | `price`, `priceBreakdown`, commission and amounts; `pending_payment`, `expired`, `no_show` |
| `CANCELLATION_CUTOFF_HOURS` env variable | `Settings` document edited by the admin (env variable as the initial value) |
| No payments | `Payment`, `LedgerEntry`, `Payout`, payment adapter + mock driver |
| No manual, recurring or blocked time | `source`, `guest`, `seriesId`, `TimeBlock` |

There is no production data yet, so the change is a **schema rewrite + new seed**, not a data migration.

---

## 8. API Outline (REST, `/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login` (phone or email), `POST /auth/refresh`, `POST /auth/logout`, *(Should)* `POST /auth/otp/request`, `POST /auth/otp/verify` |
| Public | `GET /venues?city=&district=&sport=&size=&date=&time=&duration=&near=lat,lng&page=`, `GET /venues/:id` (with areas, price rules, payment mode), `GET /areas/:id/availability?date=` → `[{ startAt, endAt, free, price }]`, `GET /areas/:id/quote?startAt=&slots=` → price, amount due now, amount at venue, `GET /payments/methods`, `GET /images/:id` |
| Player | `POST /bookings` (`areaId`, `startAt`, `slotCount`, `method`, `note?`, header `Idempotency-Key`) → booking + `redirectUrl` or `instructions`, `POST /bookings/:id/pay` (retry while held), `GET /bookings/:id` (status polling after payment), `GET /bookings/me?tab=`, `PATCH /bookings/:id/cancel` |
| Owner | `GET/POST/PUT /owner/venues[/:id]`, photos, `CRUD /owner/venues/:id/areas`, `PUT /owner/venues/:id/pricing` (lists per sport + size), `PUT /owner/areas/:id/pricing` (override), `GET /owner/calendar?venueId=&date=&view=day|week`, `POST /owner/bookings` (manual), `POST /owner/booking-series`, `PATCH /owner/bookings/:id/cancel`, `PATCH /owner/bookings/:id/no-show`, `CRUD /owner/time-blocks`, `GET /owner/balance?venueId=&month=`, `GET /owner/stats?venueId=&range=` |
| Admin | `GET /admin/venues?status=`, `PATCH /admin/venues/:id/approve|reject`, `PATCH /admin/venues/:id/commission`, `GET/PUT /admin/settings`, `GET /admin/payments?status=&from=&to=`, `POST /admin/payments/:id/retry-refund`, `GET /admin/payouts/balances`, `POST /admin/payouts`, `GET /admin/users`, `PATCH /admin/users/:id/suspend|reactivate`, `DELETE /admin/users/:id`, `GET /admin/stats` |
| Webhooks | `POST /webhooks/payments/:provider` (no auth; signature checked by the driver) |
| Dev only | `GET /mock-pay/:providerRef`, `POST /mock-pay/:providerRef/:outcome` (not mounted in production) |

Conventions unchanged: JSON, error shape `{ error: { code, message, details } }`, role middleware, Zod validation, `page`/`limit` pagination.

---

## 9. UI / Screens (input for the front design)

Mobile first (360 px), French copy, fast on 3G. Large tap targets. Prices always visible.

**Player**
1. **Accueil / recherche**: city (Dakar by default) + district + sport chips + "Quand ?" (aujourd'hui, demain, date) + optional time. Short list of venues with a free slot soon.
2. **Résultats**: list (with *Should* map toggle). Card shows photo, name, district, sports icons, "dès 15 000 FCFA", next 3 free times as chips.
3. **Fiche du complexe**: photo carousel, info, amenities, areas (tabs or cards), opening hours, payment mode.
4. **Terrains et tarifs**: area cards show format, dimensions (e.g., 40 × 20 m · 800 m²) and a size badge; a "Tarifs selon la taille" block lists each size's off-peak, evening and weekend prices.
5. **Grille du jour** (key screen): date strip at the top; vertical list of 30-min slots with price and Libre/Réservé; pick a start and a length (stepper or drag); sticky footer "18:30 – 19:00 · 20 000 FCFA · Réserver".
6. **Paiement**: summary (area, time, total, à payer maintenant, reste à payer sur place), wallet choice (Wave, Orange Money, Free Money logos), "Payer 20 000 FCFA", hold countdown (10:00). Then provider page or "Confirmez sur votre téléphone".
7. **Résultat du paiement**: waiting state (polling), success (booking card, "Ajouter au calendrier", "Partager sur WhatsApp"), failure ("Réessayer", "Changer de moyen de paiement").
8. **Mes réservations**: tabs À venir / Passées / Annulées; pay pending; cancel with refund notice; rebook.
9. **Connexion / Inscription**: phone first (`+221`).

**Owner**
1. **Calendrier** (home screen): date switcher; areas as columns × hours; tap an empty slot → manual booking sheet; tap a booking → details / cancel / no-show. Paid, deposit, held and manual bookings look different. On mobile: one area at a time with swipe.
2. **Aujourd'hui**: bookings, booked hours, expected revenue (online + at venue).
3. **Solde**: received online, commission, net, payouts, balance; monthly list.
4. **Création du complexe** (wizard): details & photos → hours → areas (with dimensions; size category shown live) → prices per size (weekly price grid preview) → booking rules → payment mode & payout wallet → submit for review.
5. **Terrains & tarifs**, **Blocages**, **Réservations récurrentes** *(Should)*, **venue switcher**.

**Admin**: venue review queue, venue detail (areas, prices, commission override), commission & platform settings, payments list, payouts (balances + record payout), users table.

**Dev only**: mock payment page (amount, wallet, Payer / Échec / Abandonner) with a clear "MODE TEST" banner.

Stack unchanged: React + Vite, React Router, TanStack Query, Tailwind CSS, React Hook Form. Design system to define in the next step (colours, typography, components: slot chip, price tag, area card, wallet picker, calendar cell, bottom sheet, status badge).

---

## 10. Non-Functional Requirements

- **Security:** bcrypt, short JWT, httpOnly refresh, helmet, CORS allowlist, rate limiting on auth, OTP and booking creation, Zod validation, ownership checks. Prices, commission and amounts always computed server-side. Webhook signatures verified; amounts in webhooks checked against the `Payment`. Provider keys only in environment variables. Mock payment routes not mounted in production.
- **Payments reliability:** webhook handling idempotent by provider event id; status checked with `getPaymentStatus` when the player returns and by a job for payments pending more than 15 min; every money movement written to the ledger.
- **Performance:** search and availability p95 < 500 ms at 1 000 venues. First load < 200 KB JS gzip; usable on 3G; images resized and lazy-loaded.
- **Reliability:** zero double bookings across online, held, manual and recurring bookings; idempotent booking creation.
- **Localisation:** French UI (strings in one i18n file); `fr-SN` number format with spaces as thousands separator; 24 h clock; Africa/Dakar time.
- **Accessibility:** WCAG 2.1 AA basics; free/taken never shown by colour alone.
- **Privacy:** other players only see "Réservé". Owners see the player's name and phone only for bookings at their own venues. Guest phone numbers are not reused. Comply with Senegal's personal data law (Loi n° 2008-12, CDP).
- **Observability:** structured logs (with payment and booking ids), error tracking, health endpoint.
- **Testing:** unit tests for slot generation, size categories, pricing, commission and overlap rules; API integration tests with the mock provider (success, failure, timeout, late webhook, duplicate webhook, refund failure); E2E for search → book → pay (mock) → cancel and owner manual booking (Playwright).

---

## 11. Success Metrics (first 3 months, Dakar)

| Metric | Target |
|---|---|
| Median time from home screen to paid booking | < 2 min |
| Payment success rate (started → succeeded) | > 85 % |
| Double bookings | 0 |
| No-show rate on online bookings | < 3 % |
| Share of a venue's bookings entered in the app (online + manual) | > 80 % at active venues |
| Owner cancellations | < 5 % |
| Approved venues / active areas | 30 / 80 |
| Repeat players (≥ 2 bookings in 30 days) | 30 % |
| Commission earned | tracked baseline |

---

## 12. Decisions, Risks & Open Questions

**Decisions**
| # | Decision | Date |
|---|---|---|
| 1 | Auto-confirm: no owner approval (online bookings confirm on payment) | 2026-11-09 |
| 3 | Several venues per owner | 2026-11-09 |
| 4 | Platform-wide cancellation cutoff, 2 h | 2026-11-09 |
| 5 | Email and SMS/WhatsApp providers chosen later, behind the `notifier` module | 2026-11-11 |
| 6 | Images in MongoDB behind a `storage` module | 2026-11-09 |
| 7 | Sports area rental only; booking = area + time range | 2026-11-11 |
| 8 | Owner sets the price per slot, with rules by weekday and time band | 2026-11-11 |
| 9 | Phone number required and used for login; email optional | 2026-11-11 |
| 10 | French UI; FCFA without decimals | 2026-11-11 |
| 11 | Owners can enter manual bookings for clients without an account | 2026-11-11 |
| 12 | **Launch in Senegal** (Dakar first): XOF, Africa/Dakar, `+221` | 2026-11-11 |
| 13 | **Online mobile money payment in MVP**, behind a provider adapter; mock provider until a real one is wired | 2026-11-11 |
| 14 | **No staff accounts** in MVP | 2026-11-11 |
| 15 | **Default slot length 30 min** | 2026-11-11 |
| 16 | **Commission per booking**, set by the admin: platform default + per-venue override | 2026-11-11 |
| 17 | Taken slots show only "Réservé" to other players | 2026-11-11 |
| 18 | **Areas have dimensions; price is set per sport + size category** (derived from the dimensions), with an optional per-area override | 2026-11-11 |

**Proposed, to confirm**
- Manual and recurring bookings: no commission (otherwise owners stop entering them, and the calendar goes wrong).
- Deposit must be ≥ commission; default payment mode is full payment.
- Full refund (commission included) when a booking is cancelled within the rules; no refund for no-shows.
- Owners paid by hand by the admin in MVP (weekly suggested); automatic payouts in v2.
- Provider fees paid by the platform out of its commission.

**Risks**
- Payment provider onboarding (KYC, contract) takes weeks → start the paperwork early; the mock provider keeps development unblocked.
- Webhooks lost or delayed → status check on return and a reconciliation job (§10).
- Owners keep using WhatsApp and the app shows wrong availability → manual booking and calendar are the fastest tools for owners; no commission on them.
- Pricing rules too complex for owners → simple default (one base price + one evening/weekend rule) and a visual price grid preview.
- Commission too high pushes owners to take bookings off the platform → admin can tune it per venue.
- Images in MongoDB → resize, size limits, `storage` module.

**Still open**
1. Which real payment provider (aggregator such as PayDunya or PayTech, or Wave directly)? Needs a business account.
2. Default commission rate, and min/max per booking.
3. SMS/WhatsApp provider and budget (decided later).
4. Payout frequency to owners (weekly suggested).

---

## 13. Milestones

| Phase | Scope | Est. |
|---|---|---|
| 0 | Front design: design system + key screens (player day grid, payment, owner calendar) | 1 wk |
| 1 | Schema rewrite (Venue, Area, Booking, Settings), pricing + slot + commission engine with unit tests, Dakar seed data | 1.5 wk |
| 2 | Player: search, venue page, day grid, booking with hold, my bookings, cancel | 2 wk |
| 3 | Payments: adapter, mock driver + mock page, webhooks, refunds, ledger; integration tests | 1.5 wk |
| 4 | Owner: setup wizard, pricing editor, calendar, manual booking, time blocks, balance | 2 wk |
| 5 | Admin: commission settings, payments, payouts; notifications; French copy; hardening; E2E; deploy | 1.5 wk |
| 6 (Should) | Recurring bookings, no-show, linked areas, map search, PWA | 2 wk |
| — | Real payment driver, once the provider account is ready | ~1 wk |

---

## 14. Future (v2+)
Automatic payouts, split payment between players, open matches and find players, teams and squads, leagues and tournaments, reviews and ratings, promo codes and last-minute discounts, staff accounts, owner revenue analytics, other cities and countries (XAF), native apps.
