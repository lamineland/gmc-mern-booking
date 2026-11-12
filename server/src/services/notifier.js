import { DateTime } from 'luxon';
import { Booking } from '../models/Booking.js';
import { Venue } from '../models/Venue.js';
import { formatPhone } from '../utils/phone.js';

/**
 * Email and SMS/WhatsApp providers are not chosen yet (PRD §5.7). Plug them into `send`;
 * every other module calls the helpers below. Until then messages are printed to the console.
 */
async function send({ to, channel = 'email', subject, text }) {
  if (!to) return;
  console.log(`\n[${channel}] to: ${to}\n[${channel}] ${subject}\n${text}\n`);
}

const fcfa = (n) => `${new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ')} FCFA`;
const when = (b, tz) => {
  const s = DateTime.fromJSDate(b.startAt).setZone(tz).setLocale('fr');
  return `${s.toFormat('cccc d LLLL')} de ${s.toFormat('HH:mm')} à ${DateTime.fromJSDate(b.endAt).setZone(tz).toFormat('HH:mm')}`;
};

async function load(bookingId) {
  return Booking.findById(bookingId)
    .populate('clientId', 'name email phone')
    .populate({ path: 'venueId', select: 'name timezone address ownerId', populate: { path: 'ownerId', select: 'name email phone' } });
}

/** Contacts of a booking's player (account or guest) and owner. */
const contacts = (b) => ({
  player: { email: b.clientId?.email, phone: formatPhone(b.clientId?.phone ?? b.guest?.phone), name: b.clientId?.name ?? b.guest?.name },
  owner: { email: b.venueId.ownerId.email, phone: formatPhone(b.venueId.ownerId.phone) },
});

// Fire-and-forget: a failed message must never fail the request that triggered it.
const safe = (fn) => (...args) => fn(...args).catch((err) => console.error('[notifier]', err));

const toBoth = async (person, subject, text) => {
  await send({ to: person.email, subject, text });
  await send({ to: person.phone, channel: 'whatsapp', subject, text });
};

export const notifier = {
  bookingConfirmed: safe(async (bookingId) => {
    const b = await load(bookingId);
    const { player, owner } = contacts(b);
    const at = when(b, b.venueId.timezone);
    const rest = b.amountDueAtVenue ? ` Reste à payer sur place : ${fcfa(b.amountDueAtVenue)}.` : '';
    await toBoth(player, `Réservation confirmée ${b.code} · ${b.venueId.name}`, `${b.areaSnapshot.name}, ${at}. Payé : ${fcfa(b.amountDueOnline)}.${rest} Adresse : ${b.venueId.address}.`);
    await toBoth(owner, `Nouvelle réservation ${b.code}`, `${player.name} · ${b.areaSnapshot.name}, ${at}.`);
  }),

  bookingCancelled: safe(async (bookingId, refund = null) => {
    const b = await load(bookingId);
    const { player, owner } = contacts(b);
    const at = when(b, b.venueId.timezone);
    if (b.status === 'cancelled_by_client') {
      await toBoth(owner, `Réservation annulée ${b.code}`, `${player.name} a annulé ${b.areaSnapshot.name}, ${at}. Le créneau est de nouveau libre.`);
    } else {
      const money = refund?.status === 'succeeded' ? ` Tu es remboursé de ${fcfa(refund.amount)}.` : '';
      await toBoth(player, `Réservation annulée par ${b.venueId.name}`, `${b.areaSnapshot.name}, ${at}. Raison : ${b.cancelReason}.${money}`);
    }
  }),

  venueReviewed: safe(async (venueId) => {
    const v = await Venue.findById(venueId).populate('ownerId', 'email phone');
    const approved = v.status === 'approved';
    await toBoth(
      { email: v.ownerId.email, phone: formatPhone(v.ownerId.phone) },
      `${v.name} ${approved ? 'est en ligne' : 'n’a pas été validé'}`,
      approved ? 'Ton complexe est visible par les joueurs.' : `Raison : ${v.rejectionReason}. Corrige-le et il sera revu.`,
    );
  }),

  payoutRecorded: safe(async (payout) => {
    const v = await Venue.findById(payout.venueId).populate('ownerId', 'email phone');
    await toBoth({ email: v.ownerId.email, phone: formatPhone(v.ownerId.phone) }, `Versement de ${fcfa(payout.amount)}`, `Versement pour ${v.name} (${payout.method}, réf. ${payout.reference || '—'}).`);
  }),
};
