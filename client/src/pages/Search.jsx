import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SportCover from '../components/SportCover.jsx';
import { Icon } from '../components/icons.jsx';
import { AMENITIES, CITIES, SIZES, SPORTS, districtsOf, fetchVenues, fmtMin, isoOf, nextDays, sizeOf } from '../data/venues.js';
import { formatFCFA, formatLength } from '../format.js';

const TIMES = Array.from({ length: 30 }, (_, i) => fmtMin(8 * 60 + i * 30)); // 08:00 … 22:30
const DURATIONS = [30, 60, 90, 120];

function VenueCard({ item, date }) {
  const { venue, areas, sports, fromPrice, nextFree, freeCount } = item;
  const rank = (a) => SIZES[a.sport].indexOf(sizeOf(a));
  const sizes = [...new Map([...areas].sort((x, y) => rank(x) - rank(y))
    .map((a) => [`${a.sport}-${sizeOf(a).key}`, { key: sizeOf(a).key, label: sizeOf(a).label }])).values()];
  const base = `/venues/${venue.id}`;
  return (
    <article className="venue-card">
      <Link to={`${base}?date=${date}`} className="venue-cover" aria-label={venue.name}>
        <SportCover sport={sports[0]} />
        <span className="cover-badges">
          {sports.map((s) => <span key={s} className="chip-badge">{SPORTS[s].label}</span>)}
        </span>
        {venue.paymentMode === 'deposit' && <span className="cover-pay">Acompte {formatFCFA(venue.depositAmount)}</span>}
      </Link>
      <div className="venue-body">
        <div className="venue-title">
          <Link to={`${base}?date=${date}`}><h3>{venue.name}</h3></Link>
          <span className="venue-price">
            <small>dès</small> {formatFCFA(fromPrice)}<small> / 30 min</small>
          </span>
        </div>
        <p className="venue-meta"><Icon name="pin" size={15} /> {venue.district}, {venue.city}</p>
        <div className="venue-sizes">
          {sizes.map((z) => <span key={z.key + z.label} className={`size-badge size-${z.key}`}>{z.label}</span>)}
          <span className="venue-amen">{areas.length} terrain{areas.length > 1 ? 's' : ''} · {venue.amenities.slice(0, 2).map((a) => AMENITIES[a]).join(' · ')}</span>
        </div>
        <div className="venue-free">
          {nextFree.length ? (
            <>
              <span className="free-label">{freeCount > nextFree.length ? `${freeCount} créneaux libres` : 'Libre à'}</span>
              <div className="free-chips">
                {nextFree.map((f) => (
                  <Link key={f.time} className="time-chip" to={`${base}?date=${date}&area=${f.areaId}&start=${f.time}`}>{f.time}</Link>
                ))}
              </div>
            </>
          ) : (
            <span className="free-label none">Complet ce jour-là</span>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const days = useMemo(() => nextDays(7), []);
  const filters = {
    city: params.get('city') ?? 'Dakar',
    district: params.get('district') ?? '',
    sport: params.get('sport') ?? '',
    size: params.get('size') ?? '',
    date: params.get('date') ?? isoOf(new Date()),
    time: params.get('time') ?? '',
    duration: Number(params.get('duration')) || 0,
  };
  const [items, setItems] = useState(null);
  const [sort, setSort] = useState('recommended');

  const update = (patch) => {
    const next = { ...filters, ...patch };
    if (patch.city !== undefined) next.district = '';
    if (patch.sport !== undefined) next.size = '';
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '' && v !== 0));
    setParams(clean, { replace: true });
  };

  useEffect(() => {
    let live = true;
    setItems(null);
    fetchVenues(filters).then((r) => live && setItems(r));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const sorted = useMemo(() => {
    if (!items) return null;
    const list = [...items];
    if (sort === 'price') list.sort((a, b) => a.fromPrice - b.fromPrice);
    else list.sort((a, b) => b.freeCount - a.freeCount);
    return list;
  }, [items, sort]);

  const dayLabel = days.find((d) => d.iso === filters.date)?.long ?? filters.date;

  return (
    <div className="search-page">
      <header className="page-head">
        <span className="eyebrow">Réserver un terrain</span>
        <h1>Trouver un terrain</h1>
      </header>

      <section className="filters" aria-label="Filtres">
        <div className="filter-row">
          <label className="pill-select">
            <Icon name="pin" size={16} />
            <select value={filters.city} onChange={(e) => update({ city: e.target.value })} aria-label="Ville">
              {CITIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="pill-select">
            <select value={filters.district} onChange={(e) => update({ district: e.target.value })} aria-label="Quartier">
              <option value="">Tous les quartiers</option>
              {districtsOf(filters.city).map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          {filters.sport && SIZES[filters.sport].length > 1 && (
            <label className="pill-select">
              <Icon name="ruler" size={16} />
              <select value={filters.size} onChange={(e) => update({ size: e.target.value })} aria-label="Taille du terrain">
                <option value="">Toutes tailles</option>
                {SIZES[filters.sport].map((z) => <option key={z.key} value={z.key}>{z.label} · {z.hint.split(' · ')[0]}</option>)}
              </select>
            </label>
          )}
          <label className="pill-select">
            <Icon name="clock" size={16} />
            <select value={filters.time} onChange={(e) => update({ time: e.target.value })} aria-label="Heure">
              <option value="">Toute heure</option>
              {TIMES.map((t) => <option key={t} value={t}>À {t}</option>)}
            </select>
          </label>
          <label className="pill-select">
            <select value={filters.duration} onChange={(e) => update({ duration: Number(e.target.value) })} aria-label="Durée">
              <option value={0}>Toute durée</option>
              {DURATIONS.map((d) => <option key={d} value={d}>{formatLength(d)}</option>)}
            </select>
          </label>
        </div>

        <div className="sport-tabs" role="tablist" aria-label="Sport">
          {[['', 'Tous'], ...Object.entries(SPORTS).map(([k, v]) => [k, v.label])].map(([value, label]) => (
            <button key={value || 'all'} role="tab" aria-selected={filters.sport === value}
              className={filters.sport === value ? 'on' : ''} onClick={() => update({ sport: value })}>
              {label}
            </button>
          ))}
        </div>

        <div className="date-tabs" role="tablist" aria-label="Date">
          {days.map((d) => (
            <button key={d.iso} role="tab" aria-selected={filters.date === d.iso}
              className={filters.date === d.iso ? 'on' : ''} onClick={() => update({ date: d.iso })}>
              <span>{d.top}</span>
              <strong>{d.day}</strong>
            </button>
          ))}
        </div>
      </section>

      <div className="results-head">
        <p>
          {sorted ? <strong>{sorted.length} complexe{sorted.length > 1 ? 's' : ''}</strong> : 'Recherche…'}
          <span className="muted"> · {dayLabel}{filters.time && ` · à ${filters.time}`}</span>
        </p>
        <label className="sort">
          Trier
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recommended">Plus de créneaux libres</option>
            <option value="price">Prix croissant</option>
          </select>
        </label>
      </div>

      {sorted === null && (
        <div className="venue-grid">{[0, 1, 2].map((i) => <div key={i} className="venue-card skeleton" />)}</div>
      )}
      {sorted?.length === 0 && (
        <div className="empty">
          <Icon name="search" size={28} />
          <h3>Aucun terrain libre avec ces critères</h3>
          <p className="muted">Essaie une autre heure, un autre jour ou un autre quartier.</p>
          <button className="btn btn-ghost" onClick={() => setParams({ city: filters.city, date: filters.date })}>Effacer les filtres</button>
        </div>
      )}
      {sorted?.length > 0 && (
        <div className="venue-grid">
          {sorted.map((item) => <VenueCard key={item.venue.id} item={item} date={filters.date} />)}
        </div>
      )}
    </div>
  );
}
