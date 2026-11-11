import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import SportCover from '../components/SportCover.jsx';
import { Icon } from '../components/icons.jsx';
import { AMENITIES, SIZES, SPORTS, areaDay, dimsLabel, fetchVenue, fmtMin, isoOf, nextDays, pricingOf, runIsFree, sizeOf, toMin, venueSports, weekdayOf } from '../data/venues.js';
import { formatFCFA, formatLength } from '../format.js';

const hoursLabel = (venue, iso) => {
  const intervals = venue.openingHours.find((h) => h.day === weekdayOf(iso))?.intervals ?? [];
  return intervals.length ? intervals.map((i) => `${i.open} – ${fmtMin(toMin(i.close))}`).join(', ') : 'Fermé';
};

const DAY_SETS = { '1,2,3,4,5': 'Lun – Ven', '0,6': 'Sam – Dim', '0,1,2,3,4,5,6': 'Tous les jours' };
/** "Lun – Ven dès 18:00", "Sam – Dim toute la journée" */
const ruleLabel = (venue, rule) => {
  const days = DAY_SETS[[...rule.days].sort().join(',')] ?? rule.days.join(', ');
  const open = Math.min(...venue.openingHours.flatMap((h) => h.intervals.map((i) => toMin(i.open))));
  const close = Math.max(...venue.openingHours.flatMap((h) => h.intervals.map((i) => toMin(i.close))));
  const from = toMin(rule.from);
  const to = toMin(rule.to);
  if (from <= open && to >= close) return `${days}, toute la journée`;
  if (to >= close) return `${days}, dès ${rule.from}`;
  return `${days}, ${rule.from} – ${fmtMin(to)}`;
};

/** The venue's price lists that are in use, each with the areas it applies to, smallest size first. */
function sizePriceCards(venue) {
  const cards = [];
  for (const a of venue.areas) {
    const size = sizeOf(a);
    const pricing = pricingOf(venue, a);
    let card = cards.find((c) => c.pricing === pricing);
    if (!card) cards.push((card = { pricing, size, sport: a.sport, areas: [] }));
    card.areas.push(a);
  }
  const rank = (c) => SIZES[c.sport].indexOf(c.size);
  return cards.sort((x, y) => x.sport.localeCompare(y.sport) || rank(x) - rank(y));
}

/** Groups the selected slots by price: [{ price, count }] for the summary breakdown. */
const breakdown = (slots) =>
  slots.reduce((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.price === s.price) last.count += 1;
    else acc.push({ price: s.price, count: 1 });
    return acc;
  }, []);

export default function VenuePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [venue, setVenue] = useState(null);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [notice, setNotice] = useState('');
  const days = useMemo(() => nextDays(7), []);

  useEffect(() => {
    fetchVenue(id).then(setVenue).catch((e) => setError(e.message));
  }, [id]);

  const date = params.get('date') ?? isoOf(new Date());
  const area = venue?.areas.find((a) => a.id === params.get('area')) ?? venue?.areas[0];
  const slots = useMemo(() => (venue && area ? areaDay(venue, area, date) : []), [venue, area, date]);
  const visible = slots.filter((s) => s.state !== 'past');

  const startIdx = slots.findIndex((s) => s.time === params.get('start'));
  const wanted = Math.max(Number(params.get('len')) || 0, area?.minSlots ?? 1);
  const len = area ? Math.min(wanted, area.maxSlots) : 0;
  const hasSelection = startIdx >= 0 && runIsFree(slots, startIdx, len);
  const picked = hasSelection ? slots.slice(startIdx, startIdx + len) : [];
  const total = picked.reduce((sum, s) => sum + s.price, 0);
  const payNow = venue?.paymentMode === 'deposit' ? Math.min(venue.depositAmount, total) : total;

  const setQuery = (patch) => {
    const next = Object.fromEntries(params);
    Object.entries(patch).forEach(([k, v]) => (v === null ? delete next[k] : (next[k] = v)));
    setParams(next, { replace: true });
    setNotice('');
  };

  const pick = (i) => {
    setHint('');
    // A second click later in the day extends the current selection up to that slot.
    if (hasSelection && i > startIdx) {
      const count = i - startIdx + 1;
      if (count <= area.maxSlots && runIsFree(slots, startIdx, count)) return setQuery({ len: String(count) });
    }
    if (runIsFree(slots, i, area.minSlots)) return setQuery({ start: slots[i].time, len: String(area.minSlots) });
    setHint(`Ce terrain se réserve par ${formatLength(area.minSlots * area.slotMinutes)} minimum, et le créneau suivant est déjà pris.`);
  };

  const canGrow = hasSelection && len < area.maxSlots && runIsFree(slots, startIdx, len + 1);
  const canShrink = hasSelection && len > area.minSlots;

  const book = () => {
    if (!user) {
      return navigate('/login', { state: { from: location.pathname + location.search, reason: 'book' } });
    }
    navigate(`/checkout?${new URLSearchParams({ venue: venue.id, area: area.id, date, start: picked[0].time, len: String(len) })}`);
  };

  if (error) {
    return (
      <div className="empty">
        <h3>{error}</h3>
        <Link to="/search" className="btn btn-ghost">Retour à la recherche</Link>
      </div>
    );
  }
  if (!venue) return <div className="venue-skeleton" />;

  const sports = venueSports(venue);
  const dayInfo = days.find((d) => d.iso === date);
  const blockedRole = user && user.role !== 'client';
  const bookLabel = !user ? 'Se connecter pour réserver' : `Réserver · ${formatFCFA(total)}`;

  return (
    <div className="venue-page">
      <Link to={`/search?city=${encodeURIComponent(venue.city)}&date=${date}`} className="back-link">
        <Icon name="arrow" size={16} /> Tous les terrains à {venue.city}
      </Link>

      {/* Venue header */}
      <section className="venue-hero">
        <div className="venue-hero-cover">
          <SportCover sport={area?.sport ?? sports[0]} />
        </div>
        <div className="venue-hero-info">
          <div className="cover-badges static">
            {sports.map((s) => <span key={s} className="chip-badge">{SPORTS[s].label}</span>)}
          </div>
          <h1>{venue.name}</h1>
          <p className="venue-meta"><Icon name="pin" size={16} /> {venue.address} · {venue.district}, {venue.city}</p>
          <p className="venue-desc">{venue.description}</p>
          <ul className="info-list">
            <li><Icon name="clock" size={18} /> <span><strong>{dayInfo?.top === 'Auj.' ? 'Aujourd’hui' : dayInfo?.long}</strong> {hoursLabel(venue, date)}</span></li>
            <li><Icon name="wallet" size={18} /> <span>{venue.paymentMode === 'deposit' ? `Acompte de ${formatFCFA(venue.depositAmount)} en ligne, le reste sur place` : 'Paiement complet en ligne'}</span></li>
            <li><Icon name="phone" size={18} /> <span>{venue.phone}</span></li>
          </ul>
          <div className="amen-chips">
            {venue.amenities.map((a) => <span key={a}><Icon name="check" size={14} /> {AMENITIES[a]}</span>)}
          </div>
        </div>
      </section>

      {/* Area picker */}
      <section>
        <h2 className="block-title">1. Choisis ton terrain</h2>
        <div className="area-picker" role="radiogroup" aria-label="Terrain">
          {venue.areas.map((a) => (
            <button key={a.id} role="radio" aria-checked={a.id === area.id} className={`area-option ${a.id === area.id ? 'on' : ''}`}
              onClick={() => setQuery({ area: a.id })}>
              <span className={`area-dot sport-${a.sport}`} />
              <span className="area-text">
                <strong>{a.name}</strong>
                <span>{a.format} · {a.surface}{a.indoor ? ' · Couvert' : ''}</span>
                <span className="area-dims"><Icon name="ruler" size={14} /> {dimsLabel(a)}</span>
                <span className="area-price">dès {formatFCFA(pricingOf(venue, a).basePrice)} / {a.slotMinutes} min</span>
              </span>
              <span className={`size-badge size-${sizeOf(a).key}`}>{sizeOf(a).label}</span>
            </button>
          ))}
        </div>

        <div className="size-prices">
          <div className="size-prices-head">
            <h3>Tarifs selon la taille du terrain</h3>
            <p className="muted">Plus le terrain est grand, plus le créneau coûte cher. Prix pour {area.slotMinutes} min.</p>
          </div>
          <div className="size-cards">
            {sizePriceCards(venue).map((c) => {
              const current = c.areas.some((a) => a.id === area.id);
              return (
                <div key={`${c.sport}-${c.size.key}`} className={`size-card ${current ? 'on' : ''}`}>
                  <div className="size-card-head">
                    <span className={`size-badge size-${c.size.key}`}>{c.size.label}</span>
                    <span className="muted">{SPORTS[c.sport].label}</span>
                  </div>
                  <p className="size-hint">{c.areas.map((a) => a.name).join(', ')} · {c.areas[0].length} × {c.areas[0].width} m</p>
                  <dl>
                    <div><dt>Heures creuses</dt><dd>{formatFCFA(c.pricing.basePrice)}</dd></div>
                    {c.pricing.priceRules.map((r) => (
                      <div key={`${r.days}-${r.from}`} className="peak"><dt>{ruleLabel(venue, r)}</dt><dd>{formatFCFA(r.price)}</dd></div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Day grid + summary */}
      <section className="booking-layout">
        <div>
          <h2 className="block-title">2. Choisis ton créneau</h2>
          <div className="date-tabs compact" role="tablist" aria-label="Date">
            {days.map((d) => (
              <button key={d.iso} role="tab" aria-selected={date === d.iso} className={date === d.iso ? 'on' : ''}
                onClick={() => setQuery({ date: d.iso, start: null, len: null })}>
                <span>{d.top}</span>
                <strong>{d.day}</strong>
              </button>
            ))}
          </div>

          <div className="legend">
            <span><i className="lg free" /> Libre</span>
            <span><i className="lg peak" /> Heure de pointe</span>
            <span><i className="lg taken" /> Réservé</span>
            <span><i className="lg picked" /> Ta sélection</span>
          </div>

          {visible.length === 0 ? (
            <div className="empty small"><p>Plus aucun créneau ce jour-là. Choisis une autre date.</p></div>
          ) : (
            <div className="slot-grid">
              {visible.map((s) => {
                const i = slots.indexOf(s);
                const sel = hasSelection && i >= startIdx && i < startIdx + len;
                const cls = ['slot-btn', s.state, s.peak && 'peak', sel && 'picked',
                  sel && i === startIdx && 'first', sel && i === startIdx + len - 1 && 'last'].filter(Boolean).join(' ');
                return (
                  <button key={s.time} className={cls} disabled={s.state !== 'free'} onClick={() => pick(i)}
                    aria-pressed={sel} aria-label={`${s.time}, ${s.state === 'taken' ? 'réservé' : formatFCFA(s.price)}`}>
                    <strong>{s.time}</strong>
                    <span>{s.state === 'taken' ? 'Réservé' : formatFCFA(s.price).replace(' FCFA', '')}</span>
                  </button>
                );
              })}
            </div>
          )}
          {hint && <p className="hint-box">{hint}</p>}
          <p className="grid-help muted">Prix par {area.slotMinutes} min. Clique sur un créneau pour commencer, puis sur un autre plus tard pour rallonger.</p>
        </div>

        {/* Summary (sticky on desktop) */}
        <aside className="summary">
          <div className="summary-card">
            <div className="summary-area">
              <SportCover sport={area.sport} ball={false} />
              <div>
                <strong>{area.name} · {area.format}</strong>
                <span>{sizeOf(area).label} · {area.length} × {area.width} m · {area.maxPlayers} joueurs max</span>
              </div>
            </div>
            {hasSelection ? (
              <>
                <div className="summary-time">
                  <span className="muted">{dayInfo?.long}</span>
                  <strong>{picked[0].time} – {fmtMin(picked[picked.length - 1].end)}</strong>
                </div>
                <div className="stepper">
                  <button onClick={() => setQuery({ len: String(len - 1) })} disabled={!canShrink} aria-label="Raccourcir de 30 minutes">−</button>
                  <span><strong>{formatLength(len * area.slotMinutes)}</strong><small>max {formatLength(area.maxSlots * area.slotMinutes)}</small></span>
                  <button onClick={() => setQuery({ len: String(len + 1) })} disabled={!canGrow} aria-label="Rallonger de 30 minutes">+</button>
                </div>
                <dl className="price-lines">
                  {breakdown(picked).map((b) => (
                    <div key={b.price}>
                      <dt>{b.count} × {area.slotMinutes} min à {formatFCFA(b.price)}</dt>
                      <dd>{formatFCFA(b.count * b.price)}</dd>
                    </div>
                  ))}
                  <div className="total"><dt>Total</dt><dd>{formatFCFA(total)}</dd></div>
                  <div className="sub"><dt>Soit par joueur ({area.maxPlayers} joueurs)</dt><dd>≈ {formatFCFA(Math.ceil(total / area.maxPlayers / 100) * 100)}</dd></div>
                  {venue.paymentMode === 'deposit' && (
                    <>
                      <div className="sub"><dt>Acompte à payer maintenant</dt><dd>{formatFCFA(payNow)}</dd></div>
                      <div className="sub"><dt>Reste à payer sur place</dt><dd>{formatFCFA(total - payNow)}</dd></div>
                    </>
                  )}
                </dl>
                <button className="btn btn-primary btn-lg book-btn" onClick={book} disabled={blockedRole}>
                  {!user && <Icon name="lock" size={18} />} {bookLabel}
                </button>
                {blockedRole && <p className="muted small-note">Seuls les comptes joueurs peuvent réserver.</p>}
                {notice && <p className="notice small-note">{notice}</p>}
                <p className="muted small-note">Annulation gratuite jusqu’à 2 h avant, remboursement complet.</p>
              </>
            ) : (
              <div className="summary-empty">
                <Icon name="clock" size={26} />
                <p>Choisis un créneau libre dans la grille pour voir le prix total.</p>
              </div>
            )}
          </div>
        </aside>
      </section>

      {/* Mobile booking bar */}
      {hasSelection && (
        <div className="mobile-bar">
          <div>
            <strong>{picked[0].time} – {fmtMin(picked[picked.length - 1].end)}</strong>
            <span>{formatFCFA(total)}</span>
          </div>
          <button className="btn btn-primary" onClick={book} disabled={blockedRole}>
            {!user ? <><Icon name="lock" size={16} /> Connexion</> : 'Réserver'}
          </button>
        </div>
      )}
    </div>
  );
}
