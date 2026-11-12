# WinPitch QA Test Plan

As of 12 Nov 2026 · Copy of the shared doc [WinPitch QA Test Plan](https://claude.ai/artifact/27ciMGyS3Zc8SKNVdm9Len), where testers record results. Keep both in sync when the plan changes.

This plan covers the WinPitch MVP build on branch `winpitch-front-design` (commit `6f2be49`): player booking with mock mobile money payments, the owner calendar and pricing, and admin venue review. Run every P1 test before release; mark each row's Result (Not run, Pass, Fail, Blocked) as you go.

## Test environment

Test on a local build: web app at http://localhost:5173, API at http://localhost:5050. Reset the demo data before each full test run so results are comparable.

| What | How |
| --- | --- |
| Requirements | Node 20+, MongoDB running as a replica set (the repo uses the `booking-mongo` Docker container) |
| Start the app | From the repo root: `npm run dev` (API on :5050, web on :5173) |
| Reset demo data | `npm run seed:reset --prefix server` (wipes and re-creates the WinPitch collections; refused in production) |
| Unit tests | `npm test --prefix server` (19 tests on pricing, sizes, slots, commission) |
| Server log | The terminal running `npm run dev`: emails and WhatsApp messages are printed there, not sent |
| Timezone | Venues are in Africa/Dakar (UTC+0). Run tests with the computer clock on real time; some tests depend on "today" |
| Browsers | Chrome (desktop), Safari on iPhone, Chrome on Android. Phone width checks at 375 px |

### Test payments

Payments use a mock mobile money provider: no real money moves. The last two digits of the paying phone number decide what happens.

| Phone number ends in | Result |
| --- | --- |
| 00 | Payment succeeds after about 3 seconds |
| 01 | Payment is refused after about 3 seconds |
| 02 | The provider never answers; the slot hold expires after 10 minutes |
| Anything else | Nothing happens until you press **Payer** or **Échec** on the "MODE TEST" panel under the payment screen |

A refund of an amount ending in 13 FCFA fails on purpose (used for the admin "retry refund" test). The test panel only appears in development builds.

## Accounts and demo data

All demo accounts use the password `password123`. Log in with the phone number or the email.

| Role | Phone | Email | What they have |
| --- | --- | --- | --- |
| Player | 77 000 00 02 | client@demo.test | About 120 bookings in the seed (upcoming, past, cancelled) |
| Player | 77 000 00 10 to 77 000 00 19 | — | Ten more players with random bookings |
| Owner | 77 000 00 01 | owner@demo.test | Almadies Five, Ouakam Sports Center, Sacré-Cœur Arena |
| Owner | 77 000 00 03 | ibrahima@demo.test | Mermoz Padel Club, Parcelles Foot Park, Grand Yoff Hoops, Yoff Beach Soccer (rejected) |
| Owner | 77 000 00 04 | aissatou@demo.test | Thiès Arena, Saly Beach Padel, Pikine Five (waiting for review) |
| Admin | from `ADMIN_PHONE` in server/.env | from `ADMIN_EMAIL` in server/.env | Password from `ADMIN_PASSWORD`; ask the developer |

### Venues to test with

Prices are per 30-minute slot. "Evening" = Monday to Friday 18:00 to midnight; "weekend" = Saturday and Sunday all day.

| Venue | Pitch (size) | Off-peak | Evening | Weekend | Payment |
| --- | --- | --- | --- | --- | --- |
| Almadies Five | Terrain 1, Terrain 2 (Petit, 40 × 20 m) | 15 000 | 20 000 | 22 500 | Full |
| Almadies Five | Grand terrain (Moyen, 60 × 40 m, 1 h minimum) | 25 000 | 35 000 | 35 000 | Full |
| Sacré-Cœur Arena | Petit terrain (Petit, 42 × 22 m) | 15 000 | 20 000 | 20 000 | Full |
| Sacré-Cœur Arena | Terrain à 7 (Moyen, 60 × 40 m, 1 h minimum) | 25 000 | 40 000 | 40 000 | Full |
| Sacré-Cœur Arena | Terrain principal (Grand, 100 × 64 m, 1 h minimum) | 45 000 | 65 000 | 65 000 | Full |
| Ouakam Sports Center | Terrain de basket (Terrain complet) | 10 000 | 15 000 | 15 000 | Deposit 5 000 |
| Ouakam Sports Center | Demi-terrain (Demi-terrain) | 6 000 | 9 000 | 9 000 | Deposit 5 000 |
| Parcelles Foot Park | Terrain A, Terrain B (Petit) | 10 000 | 15 000 | 15 000 | Deposit 5 000, commission 8 % |
| Mermoz Padel Club | Court 1, Court 2 (1 h minimum, 2 h maximum) | 12 000 | 16 000 | 16 000 | Deposit 5 000 |

The platform commission is 10 % unless a venue has its own rate. Players never see the commission.

## Player tests

Start logged out unless the test says otherwise. Use the player account 77 000 00 02.

| ID | Test | Steps | Expected result | Priority | Result |
| --- | --- | --- | --- | --- | --- |
| P-01 | Home page and login gate | 1) Open the home page logged out. 2) Click **Réserver un terrain**. | Hero, sports chips, how-it-works, basketball and owner sections show. The click opens Connexion with "Connecte-toi pour réserver un terrain" | P1 | |
| P-02 | Sign up as a player | 1) S’inscrire, "Je veux réserver". 2) Try phone `12345`, then a new number like 77 999 88 77; leave email empty. 3) Try the same phone again in a new sign-up. | Invalid phone: "Numéro sénégalais invalide". Valid: account created, lands on search. Same phone again: "Un compte existe déjà avec ce numéro" | P1 | |
| P-03 | Log in | Log in with 77 000 00 02, then with client@demo.test, then with a wrong password. | Both identifiers work; the menu shows "Mes réservations". Wrong password: "Identifiant ou mot de passe incorrect" | P1 | |
| P-04 | Search filters | On Trouver un terrain, change city, district, sport, time, duration and date; then sort by price. | Results update after each change; the count and date line match; districts only list the chosen city’s; "Effacer les filtres" appears when nothing matches | P1 | |
| P-05 | Size filter | Choose Football, then size "Grand". | The size filter only appears once a sport is chosen. Only Sacré-Cœur Arena shows, "dès 45 000 FCFA / 30 min" | P2 | |
| P-06 | Free-time chips | On a venue card, click one of the time chips. | The venue page opens with that pitch, date and start time already selected | P2 | |
| P-07 | Venue page content | Open Sacré-Cœur Arena. | Address, hours for the chosen day, payment mode, amenities, 3 pitch cards with dimensions and size badge, and the "Tarifs selon la taille du terrain" block with 3 sizes | P1 | |
| P-08 | Slot grid states | Look at today and tomorrow on Almadies Five, Terrain 1. | 30-minute slots with price; evening and weekend slots orange; booked slots hatched "Réservé" and not clickable; today’s past times are hidden | P1 | |
| P-09 | Choosing a length | 1) Click a free slot. 2) Click a later free slot. 3) Use − and +. 4) On Almadies Grand terrain, click a slot whose next slot is booked. | Start picks the minimum length; a later click extends up to it; + stops at the maximum or at a booked slot; minimum-length message: "Ce terrain se réserve par 1 h minimum…" | P1 | |
| P-10 | Price across peak hours | Almadies Five, Terrain 1, a weekday: select 17:00 for 1 h 30. | Breakdown 2 × 15 000 + 1 × 20 000; total 50 000 FCFA | P1 | |
| P-11 | Price per player | Same selection as P-10. | "Soit par joueur (10 joueurs) ≈ 5 000 FCFA" | P3 | |
| P-12 | Login keeps the selection | Logged out, select a slot and click **Se connecter pour réserver**; log in. | After login you are back on the same venue, pitch, date and selection | P1 | |
| P-13 | Owners cannot book | Log in as owner@demo.test and open a venue page, select a slot. | The book button is disabled with "Seuls les comptes joueurs peuvent réserver" | P2 | |
| P-14 | My bookings | Log in as the player, open Mes réservations. | Tab counts show; "Prochain match" card with Itinéraire (opens Google Maps), Partager sur WhatsApp, Annuler; Passées and Annulées tabs list the history | P1 | |
| P-15 | Cancel 2 h or more before | Cancel an upcoming paid booking that starts in more than 2 h. | Dialog shows the refund amount, wallet and number; after confirming: "… remboursés sur ton compte …", the booking moves to Annulées with "Remboursé X FCFA" | P1 | |
| P-16 | Cancel less than 2 h before | Book a slot that starts within 2 h (test payment 00), then open Mes réservations. | No Annuler button; "Annulation impossible à moins de 2 h du début" | P2 | |
| P-17 | Book again | On a past or cancelled booking, click **Réserver à nouveau**. | The same venue opens on the same pitch | P3 | |
| P-18 | Unfinished payment | Start a payment with a number ending in 02 and leave the page; open Mes réservations. | The booking shows "Paiement en attente" with "Finir le paiement · N min"; the button returns to the payment screen | P2 | |

## Payment tests

Log in as the player. Each test books a different free slot; note the booking code (WP-XXXX) shown on the confirmation for later tests.

| ID | Test | Steps | Expected result | Priority | Result |
| --- | --- | --- | --- | --- | --- |
| PAY-01 | Checkout, full payment | Almadies Five, any slot → Réserver. | Paiement page: venue, pitch, size, date, time, length, dimensions; "À payer maintenant" = total; "Frais de service: Offerts"; button "Payer X FCFA avec Wave" | P1 | |
| PAY-02 | Checkout, deposit | Ouakam Sports Center, Terrain de basket, a weekday 10:00 for 1 h → Réserver. | "Acompte à payer maintenant 5 000 FCFA", "Reste à payer sur place 15 000 FCFA" | P1 | |
| PAY-03 | Phone validation | On checkout, enter `12 34` and pay. | "Entre un numéro sénégalais valide…"; no booking created | P2 | |
| PAY-04 | Automatic success | Pay with Wave, number 77 123 45 00. | Waiting screen with 10:00 countdown, then within about 3 s "Réservation confirmée !" with code, details and amount paid | P1 | |
| PAY-05 | Refused, then retry | 1) Pay with Orange Money, 77 123 45 01. 2) On the failure screen, "Changer de moyen de paiement" → Wave → Réessayer. 3) Press **Payer** on the test panel. | Failure: "Le paiement n’a pas abouti… Aucun montant n’a été débité", countdown still running. After retry: waiting screen for Wave, then confirmed | P1 | |
| PAY-06 | Hold while paying, then expiry | 1) Pay with 77 123 45 02. 2) In a second browser (logged out), open the same pitch and date. 3) Wait 10 minutes on the payment screen. | The slot shows "Réservé" to others while the countdown runs. At 00:00: "Le délai de paiement est dépassé"; within about 1 minute the slot is free again for others | P1 | |
| PAY-07 | Test panel | Pay with 77 123 45 67; press **Échec**, then retry and press **Payer**. | Échec gives the failure screen; Payer confirms. The panel shows "MODE TEST" and the test-number rules | P2 | |
| PAY-08 | Reload during payment | While the waiting screen shows, reload the page; double-click Payer on checkout in another attempt. | The same booking and countdown come back after reload; a double click creates only one booking (check Mes réservations) | P2 | |
| PAY-09 | Confirmation actions | On a confirmed booking: Partager sur WhatsApp, Ajouter au calendrier. | WhatsApp opens with venue, pitch, date, time, address and code; the downloaded .ics file opens at the right date and time | P1 | |
| PAY-10 | Two players, same slot | Two browsers, two player accounts (e.g. 77 000 00 02 and 77 000 00 10), same pitch and slot; click Payer at the same moment. | Exactly one gets the payment screen; the other sees "Ce créneau n’est plus disponible" | P2 | |
| PAY-11 | Refund on cancellation | Cancel a booking paid in PAY-04 (more than 2 h ahead). | Mes réservations → Annulées shows "Remboursé X FCFA sur Wave"; the server log shows a cancellation message to the owner | P1 | |
| PAY-12 | Mock provider page | In the browser, open the redirectUrl from the response of POST /api/v1/bookings in the browser’s Network tab (`/api/v1/mock-pay/…`) for a pending payment. | A "MODE TEST" page with amount, wallet, number and Payer / Échec / Abandonner; Payer confirms and returns to the app | P3 | |

## Owner calendar tests

Log in as owner@demo.test (77 000 00 01). Use Almadies Five or Sacré-Cœur Arena, today or tomorrow.

| ID | Test | Steps | Expected result | Priority | Result |
| --- | --- | --- | --- | --- | --- |
| O-01 | Owner home | Log in as the owner. | Lands on Calendrier; the menu shows only Calendrier and Tarifs; /owner also opens the calendar | P1 | |
| O-02 | Navigation | Switch venue; use ← →, Aujourd’hui and the date picker. | One column per pitch with its format and size badge; the date line and grid follow each change | P2 | |
| O-03 | Day numbers | On a busy evening, count the confirmed bookings and add their prices. | Réservations, taux d’occupation, chiffre d’affaires, encaissé en ligne and à encaisser sur place match the grid. Blocks and payments in progress are not counted | P1 | |
| O-04 | Bookings in the grid | Make a booking as a player (PAY-04) on an owner venue, then open that day as the owner. | It shows with the player’s name and "Payé" (green); deposit bookings show "Acompte payé" and "À encaisser X"; a payment still in progress shows orange dashed "Paiement en cours" | P1 | |
| O-05 | Phone booking | Hover an empty future cell, click it; enter a name and 77 555 12 34; keep or change the price; Ajouter. | The form has the pitch and time filled in and the normal price suggested; the booking appears in blue "Sur place"; players now see those slots as "Réservé" | P1 | |
| O-06 | Phone booking on a taken time | In the form, pick a start time whose next slot is booked and a length that overlaps it. | Refused: "Ce créneau n’est plus disponible."; nothing added | P1 | |
| O-07 | Cancel a booking | Open an upcoming online booking; Annuler la réservation; try with an empty reason, then with a reason. | Empty reason refused. With a reason: "… annulée, X FCFA remboursés"; the slot is free; the player sees "Annulée par le complexe" with the reason and the refund | P1 | |
| O-08 | No-show | Open a booking that has started or ended today; Marquer comme absent. Then open a future booking. | The started booking turns red, struck through "Absent". A future booking has no no-show button | P2 | |
| O-09 | Block time | 1) Bloquer → Tout le complexe over a booked time. 2) Bloquer one pitch on a free range with a reason. 3) Open the block, Supprimer le blocage. | 1) Refused, naming the pitch, time and client. 2) Hatched block with the reason; players see "Réservé". 3) Slots free again | P1 | |
| O-10 | New bookings appear | Keep today’s calendar open; from another browser, book a slot there as a player. | Within 30 seconds the booking appears without reloading | P2 | |
| O-11 | Current time | Open today. | A red line marks the current time | P3 | |
| O-12 | Phone layout | At 375 px wide, open the calendar. | One pitch at a time with tabs to switch; side panels take the full width; no sideways scrolling | P2 | |

## Owner pricing tests

Log in as owner@demo.test and open Tarifs. Reset the demo data after this section if you saved changes you don’t want to keep.

| ID | Test | Steps | Expected result | Priority | Result |
| --- | --- | --- | --- | --- | --- |
| PR-01 | Page content | Open Tarifs for Sacré-Cœur Arena. | Each pitch with length × width, m² and size badge (Grand, Moyen, Petit); one price card per size with off-peak price and periods; weekly heatmap at the bottom | P2 | |
| PR-02 | Save a price | Change Petit, period "L M M J V 18:00 → 24:00", to 22 500; Enregistrer les tarifs. | Save bar appears on change; after saving: "Tarifs enregistrés…". The player venue page shows 22 500 on weekday evenings for Petit terrain; bookings made before keep their price | P1 | |
| PR-03 | New size from dimensions | Almadies Five: set Grand terrain to 100 × 64. | Badge changes to "Grand" while typing; an orange box says the size has no prices; save is disabled with an error; "Créer cette grille" adds a Grand card copied from the nearest size; save then works | P1 | |
| PR-04 | Bigger size cheaper | Set Moyen off-peak to 12 000 (below Petit). | Save bar warns "… « Moyen » (12 000 FCFA) coûte moins cher que « Petit » …"; saving is still allowed | P2 | |
| PR-05 | Invalid periods | In one card: a period ending before it starts; a period with no day selected; two periods with the same days and same length that overlap; a price of 0. | Each shows an error in the save bar and the save button stays disabled | P1 | |
| PR-06 | Custom price for one pitch | Turn on "Tarif personnalisé" for one pitch, change its prices, save. | A "Perso" card appears for that pitch; after saving, only that pitch shows the new prices on the player page | P2 | |
| PR-07 | Weekly preview | Switch between sizes in "Aperçu de la semaine". | Prices per hour and day match the card’s periods; hours outside opening time show "Fermé" | P3 | |
| PR-08 | Unsaved changes | Change a price, press Annuler in the save bar; change again and try the venue switcher. | Annuler restores the saved prices; the venue switcher is disabled while there are unsaved changes | P3 | |

## Admin tests

The admin has two screens in this build (still in the old English design): venue review at /admin/businesses and users at /admin/users. Commission, settings, payments and payouts have no screen yet: test them through the API (A-04 to A-07).

To call the API, log in and reuse the token:

```
curl -s -X POST http://localhost:5050/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"<ADMIN_EMAIL>","password":"<ADMIN_PASSWORD>"}'
# copy accessToken from the answer, then:
curl -s http://localhost:5050/api/v1/admin/stats -H 'Authorization: Bearer <accessToken>'
```

| ID | Test | Steps | Expected result | Priority | Result |
| --- | --- | --- | --- | --- | --- |
| A-01 | Approve a venue | After a data reset, open /admin/businesses → pending; Approve "Pikine Five". | It moves to approved; searching Dakar, district Pikine now finds it; the server log shows a message to its owner | P1 | |
| A-02 | Reject a venue | Reject an approved venue with a reason, then search for it as a player. | Status rejected with the reason; it no longer appears in search | P2 | |
| A-03 | Suspend an owner | /admin/users: suspend ibrahima@demo.test; search as a player; try to log in as that owner; then reactivate. | Their 3 venues disappear from search; login refused "Ce compte est suspendu"; after reactivation the venues come back | P2 | |
| A-04 | Commission (API) | `PUT /api/v1/admin/settings` with `{"commissionRate":0.12}`; book and pay a slot at Almadies Five; as the owner, read the commission line for that booking in `GET /api/v1/owner/balance?venueId=…`. | New bookings carry a 12 % commission; bookings made before keep 10 %. Set it back to 0.1 afterwards | P2 | |
| A-05 | Retry a failed refund (API) | `GET /api/v1/admin/payments?status=refund_failed` (the seed has one); `POST /api/v1/admin/payments/<id>/retry-refund`. | The refund becomes succeeded | P2 | |
| A-06 | Payout (API) | `GET /api/v1/admin/payouts/balances`; `POST /api/v1/admin/payouts` with venueId, amount 10000, method "wave", reference, paidAt (YYYY-MM-DD). | The venue’s balance drops by 10 000; the owner’s balance (`GET /api/v1/owner/balance?venueId=…`) shows the payout | P2 | |
| A-07 | Stats (API) | `GET /api/v1/admin/stats`. | Users, venues, pending venues, bookings, booked hours, gross booking value and commission earned, all non-zero after a seed | P3 | |

## Business rules

Check these numbers exactly; a difference of 1 FCFA is a bug. Weekday = Monday to Friday.

| Rule | Example to book | Expected |
| --- | --- | --- |
| Size comes from length × width; each limit is exclusive | In Tarifs, set a football pitch to 40 × 30 (1 200 m²) | "Moyen", not "Petit" (Petit is under 1 200 m², Moyen under 3 500 m²) |
| Price = sum of the 30-minute slots | Almadies Terrain 1, weekday 17:00 for 1 h 30 | 15 000 + 15 000 + 20 000 = 50 000 FCFA |
| The shortest matching period wins | In Tarifs, add a Monday 20:00 → 21:00 period at 12 000 to Petit; view a Monday | 20:30 costs 12 000; 21:00 costs 20 000 again |
| Commission is 10 % of the price, paid online | Almadies Terrain 1, weekday 19:00 for 1 h (40 000) | Player pays 40 000; owner balance: +40 000 income, −4 000 commission (net 36 000) |
| Deposit venues take the deposit online, the rest on site | Ouakam Terrain de basket, weekday 10:00 for 1 h (20 000) | Online 5 000; on site 15 000 |
| The online part is never below the commission | Ouakam Terrain de basket, Saturday 18:00 for 3 h (6 × 15 000 = 90 000) | Commission 9 000 is above the 5 000 deposit, so online 9 000; on site 81 000 |
| A venue can have its own commission | Parcelles Terrain A, weekday 20:00 for 2 h (4 × 15 000 = 60 000), rate 8 % | Commission 4 800; online 5 000 (the deposit); on site 55 000; owner net online 200 |
| Phone bookings have no commission | Owner adds a phone booking of 30 000 | Paid on site, no ledger line, 30 000 "à encaisser" |
| Players can cancel until 2 h before the start | A booking at 20:00: try at 17:59 and at 18:01 | 17:59 allowed with full refund; 18:01 refused "Annulation impossible à moins de 2 h du début" |
| Owner cancellation refunds everything | Owner cancels a paid booking | Player refunded the full amount paid online; owner balance gets −refund and +commission back |
| No-show keeps the money | Owner marks a paid booking as absent | No refund; the booking shows "Absent" for the player in Passées |
| Payment hold lasts 10 minutes | Pay with a number ending in 02 | Others see "Réservé" during the hold; free again after it ends |
| Bookings open 30 days ahead | Open a venue URL with `?date=` 40 days from today | Slots show but cannot be selected |
| Minimum and maximum length per pitch | Mermoz Court 1 (1 h minimum, 2 h maximum) | Clicking a slot selects 1 h; + stops at 2 h |

## Cross-cutting checks

| ID | Check | How | Expected | Priority | Result |
| --- | --- | --- | --- | --- | --- |
| X-01 | Phone layout | At 375 px wide (and on a real phone), go through home, search, venue, checkout, payment, Mes réservations, calendar, Tarifs. | No sideways scrolling; the menu opens from the ☰ button; on the venue page a dark bar at the bottom shows the selection and Book button | P1 | |
| X-02 | Keyboard and screen reader | Use Tab and Enter only on search, venue page and checkout; try VoiceOver on the slot grid. | Every control is reachable with a visible focus ring; slots read as "18:30, 20 000 FCFA" or "réservé"; free and booked never differ by colour only | P2 | |
| X-03 | Access by role | Logged out, open /bookings, /owner/calendar and /checkout; as a player open /owner/calendar; as an owner open /bookings. | Logged out → Connexion; wrong role → home page; never a broken page | P1 | |
| X-04 | Owners only see their own venues | As owner@demo.test, call `GET /api/v1/owner/calendar?venueId=<Parcelles Foot Park id>&date=<today>` with your token. | 404 with code NOT_FOUND, no venue data | P1 | |
| X-05 | Session | Log in, reload the page, close and reopen the tab; then log out and press Back. | Still logged in after reload and reopen (7 days); after logout, protected pages send you to Connexion | P1 | |
| X-06 | French copy and money format | Read every screen. | French throughout on the new screens (admin pages excepted); amounts like "20 000 FCFA" with a space and no decimals; 24-hour times; dates like "vendredi 13 novembre" | P2 | |
| X-07 | Slow network | Chrome DevTools → Network → Slow 3G; search and open a venue. | Loading placeholders show; no double submissions; pages work once loaded | P2 | |
| X-08 | Messages in the server log | Make, pay and cancel a booking; approve a venue. | The server log prints the matching email and WhatsApp messages in French with code, venue, time and amounts | P3 | |

## Out of scope and known limitations

Don’t log bugs for these; they are not built yet or are deliberate in this build.

- Owners cannot create a venue, add pitches, set opening hours or upload photos from the app (the API exists, the screens don’t).
- No owner balance screen; the admin has no screen for commission, settings, payments or payouts (API only, see Admin tests).
- The two admin pages keep the old English design.
- Payments are simulated: no real Wave, Orange Money or Free Money. Emails and WhatsApp messages are printed in the server log, not sent.
- No password reset, phone verification (OTP), recurring bookings, linked half-pitches, map search or reviews.
- Venue cover images are drawings, not photos.
- Some API error messages are in English (e.g. "… not found").

## How to report a bug

One bug per report. Include:

1. Test ID (e.g. PAY-05) and a one-line title of what is wrong.
2. Account used and the booking code (WP-XXXX) if there is one.
3. Steps to reproduce, the expected result and what happened instead.
4. Venue, pitch, date and time used, and the phone number used to pay.
5. Browser, device and screen width.
6. A screenshot or screen recording, plus any red error in the browser console and the matching lines from the server log.

Set the row’s Result to Fail and link the report in a comment on that row of the shared doc.
