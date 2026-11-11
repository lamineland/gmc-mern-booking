import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/icons.jsx';
import {
  draftArea, fetchOwnerVenues, pricingDraft, pricingErrors, pricingWarnings, saveVenuePricing,
} from '../../data/owner.js';
import { SIZES, SPORTS, fmtMin, sizeOf, slotPrice, surfaceOf, toMin } from '../../data/venues.js';
import { formatFCFA } from '../../format.js';

const DAYS = [
  { d: 1, short: 'L', long: 'Lundi' }, { d: 2, short: 'M', long: 'Mardi' }, { d: 3, short: 'M', long: 'Mercredi' },
  { d: 4, short: 'J', long: 'Jeudi' }, { d: 5, short: 'V', long: 'Vendredi' }, { d: 6, short: 'S', long: 'Samedi' },
  { d: 0, short: 'D', long: 'Dimanche' },
];
const TIMES = Array.from({ length: 49 }, (_, i) => fmtMin(i * 30).replace(/^00:00$/, i ? '24:00' : '00:00'));
const PRESETS = [
  { label: 'Soirs de semaine', rule: { days: [1, 2, 3, 4, 5], from: '18:00', to: '24:00' } },
  { label: 'Week-end', rule: { days: [0, 6], from: '08:00', to: '24:00' } },
  { label: 'Midi', rule: { days: [1, 2, 3, 4, 5], from: '12:00', to: '14:00' } },
];
const sizeLabel = (sport, size) => SIZES[sport].find((z) => z.key === size)?.label ?? size;
const nf = (n) => new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ');

function PriceInput({ value, onChange, label }) {
  return (
    <label className="price-input">
      <span className="sr-only">{label}</span>
      <input type="number" min={0} step={500} inputMode="numeric" value={value || ''} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <span className="unit">FCFA</span>
    </label>
  );
}

/** One price list: off-peak base price + periods (days × time band → price). */
function PriceListEditor({ title, name, badge, subtitle, list, slotMinutes, onChange, highlighted }) {
  const set = (patch) => onChange({ ...list, ...patch });
  const setRule = (i, patch) => set({ priceRules: list.priceRules.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const addRule = (rule) => set({ priceRules: [...list.priceRules, { ...rule, price: rule.price ?? Math.round(list.basePrice * 1.3 / 500) * 500 }] });
  const unused = PRESETS.filter((p) => !list.priceRules.some((r) => r.from === p.rule.from && r.to === p.rule.to && r.days.join() === p.rule.days.join()));
  return (
    <section className={`price-list ${highlighted ? 'on' : ''}`}>
      <header>
        <div>
          <h3>{badge}{title}</h3>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
      </header>
      <div className="base-row">
        <div>
          <strong>Heures creuses</strong>
          <span className="muted">Tous les autres créneaux, par {slotMinutes} min</span>
        </div>
        <PriceInput value={list.basePrice} onChange={(v) => set({ basePrice: v })} label={`${name}, prix heures creuses`} />
      </div>
      {list.priceRules.map((r, i) => (
        <div key={i} className="rule-row">
          <div className="rule-days" role="group" aria-label={`${name}, période ${i + 1}, jours`}>
            {DAYS.map(({ d, short, long }) => (
              <button key={d} type="button" className={r.days.includes(d) ? 'on' : ''} aria-pressed={r.days.includes(d)} title={long}
                onClick={() => setRule(i, { days: r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d].sort() })}>
                {short}
              </button>
            ))}
          </div>
          <div className="rule-time">
            <select value={r.from} onChange={(e) => setRule(i, { from: e.target.value })} aria-label="De">
              {TIMES.slice(0, -1).map((t) => <option key={t}>{t}</option>)}
            </select>
            <span>→</span>
            <select value={r.to} onChange={(e) => setRule(i, { to: e.target.value })} aria-label="À">
              {TIMES.slice(1).map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <PriceInput value={r.price} onChange={(v) => setRule(i, { price: v })} label={`${name}, période ${i + 1}, prix`} />
          <button type="button" className="icon-btn" onClick={() => set({ priceRules: list.priceRules.filter((_, k) => k !== i) })} aria-label={`${name} : supprimer la période ${i + 1}`}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      <div className="add-rules">
        {unused.map((p) => <button key={p.label} type="button" className="chip-btn" onClick={() => addRule(p.rule)}>+ {p.label}</button>)}
        <button type="button" className="chip-btn" onClick={() => addRule({ days: [1, 2, 3, 4, 5], from: '17:00', to: '19:00' })}>+ Autre période</button>
      </div>
      <p className="per-hour muted">Soit {formatFCFA(list.basePrice * (60 / slotMinutes))} / h en heures creuses
        {list.priceRules.length > 0 && ` · jusqu’à ${formatFCFA(Math.max(...list.priceRules.map((r) => r.price)) * (60 / slotMinutes))} / h`}</p>
    </section>
  );
}

/** Week heatmap of the price per slot, for one price list, over the venue's opening hours. */
function WeekPreview({ venue, list }) {
  const allIntervals = venue.openingHours.flatMap((h) => h.intervals);
  const start = Math.min(...allIntervals.map((i) => toMin(i.open)));
  const end = Math.max(...allIntervals.map((i) => toMin(i.close)));
  const hours = [];
  for (let m = start; m < end; m += 60) hours.push(m);
  const prices = DAYS.flatMap(({ d }) => hours.map((m) => slotPrice(list, d, m)));
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const isOpen = (d, m) => (venue.openingHours.find((h) => h.day === d)?.intervals ?? []).some((i) => toMin(i.open) <= m && m < toMin(i.close));
  return (
    <div className="week-preview" role="table" aria-label="Prix par heure et par jour">
      <div className="wp-row wp-head" role="row">
        <span role="columnheader" />
        {DAYS.map(({ d, long }) => <span key={d} role="columnheader">{long.slice(0, 3)}</span>)}
      </div>
      {hours.map((m) => (
        <div key={m} className="wp-row" role="row">
          <span className="wp-time" role="rowheader">{fmtMin(m)}</span>
          {DAYS.map(({ d }) => {
            if (!isOpen(d, m)) return <span key={d} className="wp-cell closed" role="cell">Fermé</span>;
            const p = slotPrice(list, d, m);
            const level = hi === lo ? 0 : Math.round(((p - lo) / (hi - lo)) * 3);
            return <span key={d} className={`wp-cell l${level}`} role="cell" title={formatFCFA(p)}>{p >= 1000 ? `${nf(p / 1000)}k` : p}</span>;
          })}
        </div>
      ))}
    </div>
  );
}

export default function OwnerPricing() {
  const [params, setParams] = useSearchParams();
  const [venues, setVenues] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [preview, setPreview] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => { fetchOwnerVenues().then(setVenues); }, []);
  const venue = venues?.find((v) => v.id === params.get('venue')) ?? venues?.[0];
  useEffect(() => {
    if (!venue) return;
    const d = pricingDraft(venue);
    setDraft(d);
    setSaved(JSON.stringify(d));
    setPreview(0);
  }, [venue]);

  // Right after switching venue, the draft still belongs to the previous one for a render.
  const fresh = venue && draft && draft.areas.every((a) => venue.areas.some((x) => x.id === a.id));
  const errors = useMemo(() => (fresh ? pricingErrors(venue, draft) : []), [fresh, venue, draft]);
  const warnings = useMemo(() => (fresh ? pricingWarnings(draft) : []), [fresh, draft]);
  if (!fresh) return <div className="venue-skeleton" />;

  const dirty = JSON.stringify(draft) !== saved;
  const areas = draft.areas.map((a) => draftArea(venue, draft, a.id));
  const slotMinutes = areas[0]?.slotMinutes ?? 30;
  const setArea = (id, patch) => setDraft({ ...draft, areas: draft.areas.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const setList = (sport, size, list) => setDraft({ ...draft, pricing: draft.pricing.map((p) => (p.sport === sport && p.size === size ? list : p)) });

  // Price lists in use, in size order, plus any size an area needs but has no list for yet.
  const sizeRank = (sport, size) => SIZES[sport].findIndex((z) => z.key === size);
  const neededKeys = [...new Set(areas.filter((a) => !draft.areas.find((x) => x.id === a.id).pricing).map((a) => `${a.sport}|${sizeOf(a).key}`))];
  const lists = draft.pricing
    .filter((p) => neededKeys.includes(`${p.sport}|${p.size}`))
    .sort((x, y) => x.sport.localeCompare(y.sport) || sizeRank(x.sport, x.size) - sizeRank(y.sport, y.size));
  const missing = neededKeys.filter((k) => !draft.pricing.some((p) => `${p.sport}|${p.size}` === k)).map((k) => k.split('|'));
  const overrides = draft.areas.filter((a) => a.pricing);
  const previewItems = [
    ...lists.map((p) => ({ key: `${p.sport}|${p.size}`, label: `${SPORTS[p.sport].label} · ${sizeLabel(p.sport, p.size)}`, list: p })),
    ...overrides.map((o) => ({ key: o.id, label: `${areas.find((a) => a.id === o.id).name} (perso)`, list: o.pricing })),
  ];
  const shown = previewItems[Math.min(preview, previewItems.length - 1)];

  const createList = (sport, size) => {
    const same = draft.pricing.filter((p) => p.sport === sport);
    const nearest = same.sort((x, y) => Math.abs(sizeRank(sport, x.size) - sizeRank(sport, size)) - Math.abs(sizeRank(sport, y.size) - sizeRank(sport, size)))[0];
    const base = nearest ?? { basePrice: 10000, priceRules: [] };
    setDraft({ ...draft, pricing: [...draft.pricing, { sport, size, basePrice: base.basePrice, priceRules: JSON.parse(JSON.stringify(base.priceRules)) }] });
  };

  const save = async () => {
    setBusy(true);
    setSaveError('');
    try {
      const clean = await saveVenuePricing(venue.id, draft);
      setDraft(clean);
      setSaved(JSON.stringify(clean));
      setFlash('Tarifs enregistrés. Ils s’appliquent aux nouvelles réservations ; celles déjà faites gardent leur prix.');
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="owner-pricing">
      <header className="cal-head">
        <div>
          <span className="eyebrow">Espace propriétaire</span>
          <div className="cal-title">
            <h1>Tarifs</h1>
            <label className="pill-select venue-switch">
              <select value={venue.id} onChange={(e) => { setFlash(''); setParams({ venue: e.target.value }); }} aria-label="Complexe" disabled={dirty}>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          </div>
          <p className="muted intro">Le prix dépend de la taille du terrain et du moment. Fixe une grille par taille : tous les terrains de cette taille l’utilisent.</p>
        </div>
        <Link className="btn btn-ghost" to={`/venues/${venue.id}`} target="_blank"><Icon name="search" size={18} /> Voir la page joueurs</Link>
      </header>

      {flash && <p className="flash" role="status"><Icon name="check" size={18} /> {flash} <button className="link" onClick={() => setFlash('')} aria-label="Fermer">✕</button></p>}

      {/* 1. Areas and their size */}
      <section className="pricing-block">
        <h2 className="block-title">1. Tes terrains et leur taille</h2>
        <div className="area-table">
          {areas.map((a) => {
            const d = draft.areas.find((x) => x.id === a.id);
            const size = sizeOf(a);
            return (
              <div key={a.id} className="area-line">
                <div className="area-line-name">
                  <strong>{a.name}</strong>
                  <span className="muted">{SPORTS[a.sport].label} · {a.format}</span>
                </div>
                <div className="dims">
                  <label><span className="sr-only">Longueur</span><input type="number" min={5} max={150} value={d.length || ''} onChange={(e) => setArea(a.id, { length: Number(e.target.value) })} aria-label={`${a.name}, longueur en mètres`} /></label>
                  <span>×</span>
                  <label><span className="sr-only">Largeur</span><input type="number" min={5} max={100} value={d.width || ''} onChange={(e) => setArea(a.id, { width: Number(e.target.value) })} aria-label={`${a.name}, largeur en mètres`} /></label>
                  <span className="muted">m · {nf(surfaceOf(a))} m²</span>
                </div>
                <div className="area-line-size">
                  {size && <span className={`size-badge size-${size.key}`}>{size.label}</span>}
                  <span className="muted small">{size?.hint}</span>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={Boolean(d.pricing)}
                    onChange={(e) => setArea(a.id, { pricing: e.target.checked ? JSON.parse(JSON.stringify(draft.pricing.find((p) => p.sport === a.sport && p.size === size.key) ?? { basePrice: 10000, priceRules: [] })) : null })} />
                  <span className="track" aria-hidden="true" />
                  <span>Tarif personnalisé</span>
                </label>
              </div>
            );
          })}
        </div>
        <p className="muted small-note">
          Tailles football : Petit &lt; 1 200 m² · Moyen &lt; 3 500 m² · Grand au-delà. Basket : Demi-terrain &lt; 300 m² · Terrain complet au-delà.
        </p>
      </section>

      {/* 2. Price lists */}
      <section className="pricing-block">
        <h2 className="block-title">2. Prix par taille</h2>
        {missing.map(([sport, size]) => (
          <div key={`${sport}|${size}`} className="missing-list">
            <Icon name="ruler" size={20} />
            <span>Un terrain est maintenant <strong>{SPORTS[sport].label} · {sizeLabel(sport, size)}</strong>, mais cette taille n’a pas encore de prix.</span>
            <button className="btn btn-primary btn-sm" onClick={() => createList(sport, size)}>Créer cette grille</button>
          </div>
        ))}
        <div className="price-lists">
          {lists.map((p) => {
            const using = areas.filter((a) => !draft.areas.find((x) => x.id === a.id).pricing && a.sport === p.sport && sizeOf(a).key === p.size);
            return (
              <PriceListEditor key={`${p.sport}|${p.size}`} list={p} slotMinutes={slotMinutes}
                badge={<span className={`size-badge size-${p.size}`}>{sizeLabel(p.sport, p.size)}</span>}
                title={` ${SPORTS[p.sport].label}`} name={`${SPORTS[p.sport].label} ${sizeLabel(p.sport, p.size)}`}
                subtitle={`Utilisé par : ${using.map((a) => `${a.name} (${a.length} × ${a.width} m)`).join(', ')}`}
                highlighted={shown?.key === `${p.sport}|${p.size}`}
                onChange={(list) => setList(p.sport, p.size, list)} />
            );
          })}
          {overrides.map((o) => {
            const a = areas.find((x) => x.id === o.id);
            return (
              <PriceListEditor key={o.id} list={o.pricing} slotMinutes={slotMinutes}
                badge={<span className="size-badge">Perso</span>} title={` ${a.name}`} name={`${a.name} (tarif personnalisé)`}
                subtitle="Tarif propre à ce terrain, il remplace la grille de sa taille."
                highlighted={shown?.key === o.id}
                onChange={(list) => setArea(o.id, { pricing: list })} />
            );
          })}
        </div>
      </section>

      {/* 3. Preview */}
      {previewItems.length > 0 && shown && (
        <section className="pricing-block">
          <div className="preview-head-row">
            <h2 className="block-title">3. Aperçu de la semaine</h2>
            <div className="sport-tabs" role="tablist" aria-label="Grille affichée">
              {previewItems.map((it, i) => (
                <button key={it.key} role="tab" aria-selected={shown.key === it.key} className={shown.key === it.key ? 'on' : ''} onClick={() => setPreview(i)}>{it.label}</button>
              ))}
            </div>
          </div>
          <p className="muted small-note">Prix pour {slotMinutes} min, heure par heure, tels que les joueurs les verront.</p>
          <WeekPreview venue={venue} list={shown.list} />
        </section>
      )}

      {/* Save bar */}
      <div className={`save-bar ${dirty ? 'show' : ''}`} role="region" aria-label="Enregistrer">
        <div className="save-msgs">
          {errors.length > 0 ? (
            <p className="field-error"><Icon name="close" size={16} /> {errors[0]}{errors.length > 1 && ` (+${errors.length - 1})`}</p>
          ) : warnings.length > 0 ? (
            <p className="warn-text">⚠ {warnings[0]} Tu peux quand même enregistrer.</p>
          ) : (
            <p>Modifications non enregistrées.</p>
          )}
          {saveError && <p className="field-error">{saveError}</p>}
        </div>
        <div className="save-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setDraft(JSON.parse(saved))} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || errors.length > 0}>{busy ? 'Enregistrement…' : 'Enregistrer les tarifs'}</button>
        </div>
      </div>
    </div>
  );
}
