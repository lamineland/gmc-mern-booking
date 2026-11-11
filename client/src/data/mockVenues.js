/**
 * Mock venues in the PRD v2.2 shape (Venue + Area, §7), used until the backend schema
 * rewrite lands. Prices are XOF per slot (30 min).
 *
 * Size drives price: each area has real dimensions, its size category is derived from them
 * (see SIZES in venues.js), and the venue sets one price list per sport + size category.
 * An area can still override it with its own `pricing`.
 *
 * Owner edits from the pricing page (dimensions, price lists, overrides) are saved in the
 * session store and applied on top of these defaults, so the player screens use them too.
 */
import { KEYS, readJSON } from './store.js';

const WEEK = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const hours = (open, close, days = WEEK) => days.map((day) => ({ day, intervals: [{ open, close }] }));

/** One price list for a sport + size category: off-peak base, weekday evenings, weekend all day. */
const price = (sport, size, basePrice, peak, weekend = peak) => ({
  sport,
  size,
  basePrice,
  priceRules: [
    { days: WEEKDAYS, from: '18:00', to: '24:00', price: peak },
    { days: WEEKEND, from: '08:00', to: '24:00', price: weekend },
  ],
});

const area = (id, fields) => ({
  id,
  slotMinutes: 30,
  minSlots: 1,
  maxSlots: 6,
  indoor: false,
  lit: true,
  active: true,
  ...fields,
});

export const SPORTS = {
  football: { label: 'Football', short: 'Foot' },
  futsal: { label: 'Futsal', short: 'Futsal' },
  basketball: { label: 'Basketball', short: 'Basket' },
  padel: { label: 'Padel', short: 'Padel' },
};

export const AMENITIES = {
  vestiaires: 'Vestiaires',
  douches: 'Douches',
  parking: 'Parking',
  buvette: 'Buvette',
  wifi: 'Wi-Fi',
  location: 'Location de ballons',
};

export const VENUES = [
  {
    id: 'almadies-five',
    name: 'Almadies Five',
    city: 'Dakar',
    district: 'Almadies',
    address: 'Route des Almadies, en face du King Fahd',
    phone: '+221 77 000 00 01',
    description: 'Deux terrains de foot à 5 et un terrain de foot à 7, synthétiques et éclairés, à deux pas de la corniche.',
    amenities: ['vestiaires', 'douches', 'parking', 'buvette', 'location'],
    openingHours: hours('08:00', '24:00'),
    paymentMode: 'full',
    pricing: [
      price('football', 'small', 15000, 20000, 22500),
      price('football', 'medium', 25000, 35000),
    ],
    areas: [
      area('alm-1', { name: 'Terrain 1', sport: 'football', format: 'Foot à 5', surface: 'Gazon synthétique', length: 40, width: 20, maxPlayers: 10 }),
      area('alm-2', { name: 'Terrain 2', sport: 'football', format: 'Foot à 5', surface: 'Gazon synthétique', length: 40, width: 20, maxPlayers: 10 }),
      area('alm-3', { name: 'Grand terrain', sport: 'football', format: 'Foot à 7', surface: 'Gazon synthétique', length: 60, width: 40, maxPlayers: 14, minSlots: 2 }),
    ],
  },
  {
    id: 'ouakam-sports',
    name: 'Ouakam Sports Center',
    city: 'Dakar',
    district: 'Ouakam',
    address: 'Cité Avion, rue OKM-120',
    phone: '+221 77 000 00 02',
    description: 'Salle couverte avec parquet : terrain de basket complet, demi-terrain pour le 3x3, et un futsal.',
    amenities: ['vestiaires', 'douches', 'parking', 'wifi'],
    openingHours: hours('07:00', '23:00'),
    paymentMode: 'deposit',
    depositAmount: 5000,
    pricing: [
      price('basketball', 'full', 10000, 15000),
      price('basketball', 'half', 6000, 9000),
      price('futsal', 'standard', 12000, 18000),
    ],
    areas: [
      area('ouk-1', { name: 'Terrain de basket', sport: 'basketball', format: '5 contre 5', surface: 'Parquet', indoor: true, length: 28, width: 15, maxPlayers: 10 }),
      area('ouk-3', { name: 'Demi-terrain', sport: 'basketball', format: '3 contre 3', surface: 'Parquet', indoor: true, length: 15, width: 14, maxPlayers: 6 }),
      area('ouk-2', { name: 'Futsal', sport: 'futsal', format: 'Futsal', surface: 'Sol synthétique', indoor: true, length: 40, width: 20, maxPlayers: 10 }),
    ],
  },
  {
    id: 'mermoz-padel',
    name: 'Mermoz Padel Club',
    city: 'Dakar',
    district: 'Mermoz',
    address: 'VDN, après la station Total',
    phone: '+221 77 000 00 03',
    description: 'Deux courts de padel vitrés, raquettes en location. Idéal en fin de journée.',
    amenities: ['vestiaires', 'parking', 'buvette', 'location'],
    openingHours: hours('08:00', '23:00'),
    paymentMode: 'deposit',
    depositAmount: 5000,
    pricing: [price('padel', 'standard', 12000, 16000)],
    areas: [
      area('mer-1', { name: 'Court 1', sport: 'padel', format: 'Double', surface: 'Gazon synthétique', length: 20, width: 10, maxPlayers: 4, minSlots: 2, maxSlots: 4 }),
      area('mer-2', { name: 'Court 2', sport: 'padel', format: 'Double', surface: 'Gazon synthétique', length: 20, width: 10, maxPlayers: 4, minSlots: 2, maxSlots: 4 }),
    ],
  },
  {
    id: 'sacre-coeur-arena',
    name: 'Sacré-Cœur Arena',
    city: 'Dakar',
    district: 'Sacré-Cœur',
    address: 'Sacré-Cœur 3, près de la pharmacie Keur Gorgui',
    phone: '+221 77 000 00 04',
    description: 'Le seul grand terrain de foot à 11 du quartier, avec un terrain à 7 et un petit terrain à 5. Tribune et éclairage LED.',
    amenities: ['vestiaires', 'douches', 'buvette'],
    openingHours: hours('09:00', '24:00'),
    paymentMode: 'full',
    pricing: [
      price('football', 'small', 15000, 20000),
      price('football', 'medium', 25000, 40000),
      price('football', 'large', 45000, 65000),
    ],
    areas: [
      area('sac-1', { name: 'Terrain principal', sport: 'football', format: 'Foot à 11', surface: 'Gazon synthétique', length: 100, width: 64, maxPlayers: 22, minSlots: 2 }),
      area('sac-3', { name: 'Terrain à 7', sport: 'football', format: 'Foot à 7', surface: 'Gazon synthétique', length: 60, width: 40, maxPlayers: 14, minSlots: 2 }),
      area('sac-2', { name: 'Petit terrain', sport: 'football', format: 'Foot à 5', surface: 'Gazon synthétique', length: 42, width: 22, maxPlayers: 10 }),
    ],
  },
  {
    id: 'parcelles-foot-park',
    name: 'Parcelles Foot Park',
    city: 'Dakar',
    district: 'Parcelles Assainies',
    address: 'Unité 15, à côté du terminus',
    phone: '+221 77 000 00 05',
    description: 'Deux terrains de foot à 5 aux meilleurs prix de Dakar.',
    amenities: ['vestiaires', 'parking'],
    openingHours: hours('08:00', '24:00'),
    paymentMode: 'deposit',
    depositAmount: 5000,
    pricing: [price('football', 'small', 10000, 15000)],
    areas: [
      area('par-1', { name: 'Terrain A', sport: 'football', format: 'Foot à 5', surface: 'Gazon synthétique', length: 38, width: 19, maxPlayers: 10 }),
      area('par-2', { name: 'Terrain B', sport: 'football', format: 'Foot à 5', surface: 'Gazon synthétique', length: 38, width: 19, maxPlayers: 10 }),
    ],
  },
  {
    id: 'grand-yoff-hoops',
    name: 'Grand Yoff Hoops',
    city: 'Dakar',
    district: 'Grand Yoff',
    address: 'Route de l’aéroport, Arafat',
    phone: '+221 77 000 00 06',
    description: 'Terrains de basket en plein air, éclairés jusqu’à 23 h.',
    amenities: ['parking', 'buvette'],
    openingHours: hours('07:00', '23:00'),
    paymentMode: 'full',
    pricing: [
      price('basketball', 'full', 10000, 15000),
      price('basketball', 'half', 6000, 9000),
    ],
    areas: [
      area('gy-1', { name: 'Terrain 5x5', sport: 'basketball', format: '5 contre 5', surface: 'Résine', length: 28, width: 15, maxPlayers: 10 }),
      area('gy-2', { name: 'Terrain 3x3', sport: 'basketball', format: '3 contre 3', surface: 'Résine', length: 15, width: 11, maxPlayers: 6 }),
    ],
  },
  {
    id: 'thies-arena',
    name: 'Thiès Arena',
    city: 'Thiès',
    district: 'Médina Fall',
    address: 'Avenue Caen, Médina Fall',
    phone: '+221 77 000 00 07',
    description: 'Le complexe de foot à 5 de référence à Thiès.',
    amenities: ['vestiaires', 'douches', 'parking'],
    openingHours: hours('09:00', '24:00'),
    paymentMode: 'full',
    pricing: [price('football', 'small', 10000, 14000)],
    areas: [
      area('thi-1', { name: 'Terrain 1', sport: 'football', format: 'Foot à 5', surface: 'Gazon synthétique', length: 40, width: 20, maxPlayers: 10 }),
    ],
  },
  {
    id: 'saly-beach-padel',
    name: 'Saly Beach Padel',
    city: 'Saly',
    district: 'Saly Portudal',
    address: 'Route des hôtels, Saly Portudal',
    phone: '+221 77 000 00 08',
    description: 'Padel face à la mer, courts couverts pour jouer même en plein soleil.',
    amenities: ['vestiaires', 'douches', 'parking', 'buvette', 'location', 'wifi'],
    openingHours: hours('08:00', '22:00'),
    paymentMode: 'deposit',
    depositAmount: 5000,
    pricing: [price('padel', 'standard', 15000, 20000)],
    areas: [
      area('sal-1', { name: 'Court Océan', sport: 'padel', format: 'Double', surface: 'Gazon synthétique', indoor: true, length: 20, width: 10, maxPlayers: 4, minSlots: 2, maxSlots: 4 }),
    ],
  },
];

/** Applies saved owner edits onto VENUES in place (every module holds these same objects). */
export function applyVenueEdits() {
  const edits = readJSON(KEYS.owner, {}).venueEdits ?? {};
  for (const [venueId, edit] of Object.entries(edits)) {
    const venue = VENUES.find((v) => v.id === venueId);
    if (!venue) continue;
    venue.pricing = edit.pricing;
    for (const a of edit.areas) {
      const area = venue.areas.find((x) => x.id === a.id);
      if (!area) continue;
      Object.assign(area, { length: a.length, width: a.width });
      if (a.pricing) area.pricing = a.pricing;
      else delete area.pricing;
    }
  }
}
applyVenueEdits();
