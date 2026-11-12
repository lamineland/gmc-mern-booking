/**
 * Size categories per sport (PRD v2.2 §5.3). An area's category is the first one whose
 * `maxM2` is above its surface (length × width). The admin can change these limits in
 * Settings; these are the defaults.
 */
export const SPORTS = ['football', 'futsal', 'basketball', 'padel', 'volleyball', 'handball', 'tennis', 'other'];

export const DEFAULT_SIZE_CATEGORIES = {
  football: [
    { key: 'small', label: 'Petit', maxM2: 1200 },
    { key: 'medium', label: 'Moyen', maxM2: 3500 },
    { key: 'large', label: 'Grand', maxM2: null },
  ],
  futsal: [
    { key: 'small', label: 'Réduit', maxM2: 700 },
    { key: 'standard', label: 'Standard', maxM2: null },
  ],
  basketball: [
    { key: 'half', label: 'Demi-terrain', maxM2: 300 },
    { key: 'full', label: 'Terrain complet', maxM2: null },
  ],
  padel: [{ key: 'standard', label: 'Standard', maxM2: null }],
  volleyball: [{ key: 'standard', label: 'Standard', maxM2: null }],
  handball: [{ key: 'standard', label: 'Standard', maxM2: null }],
  tennis: [{ key: 'standard', label: 'Standard', maxM2: null }],
  other: [{ key: 'standard', label: 'Standard', maxM2: null }],
};

/** maxM2 null = no upper limit (stored as null because JSON has no Infinity). */
export function sizeCategoryOf(sport, lengthM, widthM, categories = DEFAULT_SIZE_CATEGORIES) {
  const list = categories[sport] ?? categories.other;
  const surface = lengthM * widthM;
  return (list.find((c) => c.maxM2 == null || surface < c.maxM2) ?? list[list.length - 1]).key;
}

export const sizeRank = (sport, key, categories = DEFAULT_SIZE_CATEGORIES) =>
  (categories[sport] ?? categories.other).findIndex((c) => c.key === key);

export const sizeLabel = (sport, key, categories = DEFAULT_SIZE_CATEGORIES) =>
  (categories[sport] ?? categories.other).find((c) => c.key === key)?.label ?? key;
