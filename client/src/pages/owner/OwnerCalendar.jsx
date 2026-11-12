import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/icons.jsx';
import {
  cancelEvent, createBlock, createManualBooking, deleteBlock, fetchDay, fetchFreeStarts, fetchOwnerVenues, markNoShow, quoteManual,
} from '../../data/owner.js';
import { WALLETS } from '../../data/payments.js';
import { fmtMin, isoOf, sizeOf } from '../../data/venues.js';
import { formatFCFA, formatLength } from '../../format.js';

const ROW_H = 30; // px per 30 min

const shiftIso = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d + days));
};
const longDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

function useNarrow(query = '(max-width: 720px)') {
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

/** Modal panel built on <dialog>: focus trap, Esc to close and backdrop for free. */
function Sheet({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`sheet side-sheet ${wide ? 'wide' : ''}`} onClose={onClose} aria-label={title}>
      {open && (
        <>
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" size={20} /></button>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}

const STATUS_TAG = (e) => {
  if (e.kind === 'block') return { label: 'Bloqué', cls: 'block' };
  if (e.status === 'pending_payment') return { label: 'Paiement en cours', cls: 'pending' };
  if (e.status === 'no_show') return { label: 'Absent', cls: 'noshow' };
  if (e.source === 'manual') return { label: 'Sur place', cls: 'manual' };
  if (e.atVenue > 0) return { label: 'Acompte payé', cls: 'deposit' };
  return { label: 'Payé', cls: 'paid' };
};

function EventDetails({ e, area, onCancel, onNoShow, onDeleteBlock, busy, error }) {
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  if (e.kind === 'block') {
    return (
      <div className="sheet-body">
        <dl className="detail-list">
          <div><dt>Terrain</dt><dd>{e.wholeVenue ? 'Tout le complexe' : area.name}</dd></div>
          <div><dt>Horaire</dt><dd>{e.time}</dd></div>
          <div><dt>Motif</dt><dd>{e.reason}</dd></div>
        </dl>
        <p className="muted small-note">Les joueurs voient ces créneaux comme « Réservé ».</p>
        {error && <p className="field-error">{error}</p>}
        <div className="sheet-actions"><button className="btn btn-ghost" onClick={onDeleteBlock} disabled={busy}>Supprimer le blocage</button></div>
      </div>
    );
  }
  const tag = STATUS_TAG(e);
  const wa = `https://wa.me/${e.phone.replace(/\D/g, '')}`;
  return (
    <div className="sheet-body">
      <div className="detail-top">
        <span className={`ev-tag ${tag.cls}`}>{tag.label}</span>
        <span className="muted">{e.source === 'online' ? 'Réservé en ligne' : 'Ajouté par toi'} · {e.code}</span>
      </div>
      <p className="detail-time">{e.time}</p>
      <p className="muted">{area.name} · {area.format} · {formatLength(e.endMin - e.startMin)}</p>
      <div className="contact-row">
        <a className="btn btn-ghost btn-sm" href={`tel:${e.phone.replace(/\s/g, '')}`}><Icon name="phone" size={16} /> {e.phone}</a>
        <a className="btn btn-ghost btn-sm" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>
      </div>
      <dl className="detail-list">
        {e.team && <div><dt>Équipe</dt><dd>{e.team}</dd></div>}
        <div><dt>Prix</dt><dd>{formatFCFA(e.price)}</dd></div>
        <div><dt>Payé en ligne{e.method ? ` (${WALLETS[e.method].label})` : ''}</dt><dd>{formatFCFA(e.paidOnline)}</dd></div>
        <div className={e.atVenue ? 'due' : ''}><dt>À encaisser sur place</dt><dd>{formatFCFA(e.atVenue)}</dd></div>
      </dl>
      {e.status === 'pending_payment' && (
        <p className="notice small-note">Le joueur est en train de payer. Le créneau est bloqué jusqu’à {new Date(e.holdExpiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</p>
      )}
      {e.status === 'confirmed' && !e.started && (
        confirming ? (
          <div className="cancel-box">
            <label>Raison de l’annulation (le joueur la verra)
              <textarea rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Ex. Terrain impraticable après la pluie" autoFocus />
            </label>
            {e.paidOnline > 0 && <p className="small-note">Le joueur sera remboursé de <strong>{formatFCFA(e.paidOnline)}</strong> automatiquement.</p>}
            {error && <p className="field-error">{error}</p>}
            <div className="sheet-actions">
              <button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>Retour</button>
              <button className="btn btn-danger" onClick={() => onCancel(reason)} disabled={busy}>{busy ? 'Annulation…' : 'Annuler la réservation'}</button>
            </div>
          </div>
        ) : (
          <div className="sheet-actions"><button className="btn btn-ghost danger-text" onClick={() => setConfirming(true)}>Annuler la réservation</button></div>
        )
      )}
      {e.status === 'confirmed' && e.started && (
        <div className="sheet-actions">
          {error && <p className="field-error">{error}</p>}
          <button className="btn btn-ghost" onClick={onNoShow} disabled={busy}>Marquer comme absent</button>
        </div>
      )}
    </div>
  );
}

function ManualForm({ venue, iso, initial, onDone }) {
  const [areaId, setAreaId] = useState(initial.areaId);
  const area = venue.areas.find((a) => a.id === areaId);
  const [starts, setStarts] = useState([]);
  useEffect(() => {
    let live = true;
    fetchFreeStarts(area.id, iso).then((list) => live && setStarts(list)).catch(() => live && setStarts([]));
    return () => { live = false; };
  }, [area.id, iso]);
  const [startMin, setStartMin] = useState(initial.startMin);
  const [count, setCount] = useState(Math.max(area.minSlots, 2));
  const [form, setForm] = useState({ clientName: '', phone: '', note: '' });
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const suggested = quoteManual(venue, area, iso, startMin, count);
  useEffect(() => { setPrice(''); }, [areaId, startMin, count]);
  const set = (k) => (ev) => setForm({ ...form, [k]: ev.target.value });

  const submit = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createManualBooking({ venueId: venue.id, areaId, date: iso, startMin, slotCount: count, ...form, price: price === '' ? suggested : price });
      onDone(`Réservation de ${form.clientName} ajoutée : ${area.name}, ${fmtMin(startMin)} – ${fmtMin(startMin + count * area.slotMinutes)}.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="sheet-body form-grid" onSubmit={submit}>
      <label>Terrain
        <select value={areaId} onChange={(ev) => setAreaId(ev.target.value)}>
          {venue.areas.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.format}</option>)}
        </select>
      </label>
      <div className="form-row">
        <label>Début
          <select value={startMin} onChange={(ev) => setStartMin(Number(ev.target.value))}>
            {!starts.some((s) => s.start === startMin) && <option value={startMin}>{fmtMin(startMin)} (pris)</option>}
            {starts.map((s) => <option key={s.start} value={s.start}>{s.time}</option>)}
          </select>
        </label>
        <div>
          <span className="label-like">Durée</span>
          <div className="stepper compact">
            <button type="button" onClick={() => setCount(count - 1)} disabled={count <= area.minSlots} aria-label="Raccourcir">−</button>
            <strong>{formatLength(count * area.slotMinutes)}</strong>
            <button type="button" onClick={() => setCount(count + 1)} disabled={count >= area.maxSlots} aria-label="Rallonger">+</button>
          </div>
        </div>
      </div>
      <label>Nom du client<input value={form.clientName} onChange={set('clientName')} required minLength={2} placeholder="Ex. Moussa Diop" /></label>
      <label>Téléphone<input type="tel" value={form.phone} onChange={set('phone')} required placeholder="77 123 45 67" /></label>
      <label>Équipe ou note <span className="optional">facultatif</span><input value={form.note} onChange={set('note')} /></label>
      <label>Prix (FCFA)
        <input type="number" min={0} step={500} value={price === '' ? suggested : price} onChange={(ev) => setPrice(ev.target.value)} />
        <span className="field-help">Tarif du terrain : {formatFCFA(suggested)}. Modifiable pour un prix négocié. Payé sur place, sans commission.</span>
      </label>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Ajout…' : 'Ajouter la réservation'}</button>
    </form>
  );
}

function BlockForm({ venue, iso, initial, dayStart, dayEnd, onDone }) {
  const times = [];
  for (let m = dayStart; m <= dayEnd; m += 30) times.push(m);
  const [areaId, setAreaId] = useState(initial.areaId ?? '');
  const [startMin, setStartMin] = useState(initial.startMin ?? dayStart);
  const [endMin, setEndMin] = useState(Math.min((initial.startMin ?? dayStart) + 120, dayEnd));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createBlock({ venueId: venue.id, areaId, date: iso, startMin, endMin, reason });
      onDone(`Créneau bloqué : ${fmtMin(startMin)} – ${fmtMin(endMin)} (${reason}).`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="sheet-body form-grid" onSubmit={submit}>
      <label>Terrain
        <select value={areaId} onChange={(ev) => setAreaId(ev.target.value)}>
          <option value="">Tout le complexe</option>
          {venue.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <div className="form-row">
        <label>De
          <select value={startMin} onChange={(ev) => setStartMin(Number(ev.target.value))}>
            {times.slice(0, -1).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
          </select>
        </label>
        <label>À
          <select value={endMin} onChange={(ev) => setEndMin(Number(ev.target.value))}>
            {times.slice(1).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
          </select>
        </label>
      </div>
      <label>Motif<input value={reason} onChange={(ev) => setReason(ev.target.value)} required placeholder="Ex. Entretien du gazon, tournoi privé" /></label>
      <p className="field-help">Les joueurs verront ces créneaux comme « Réservé ». Impossible de bloquer par-dessus une réservation existante.</p>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" className="btn btn-dark btn-lg" disabled={busy}>{busy ? 'Blocage…' : 'Bloquer ce créneau'}</button>
    </form>
  );
}

export default function OwnerCalendar() {
  const [params, setParams] = useSearchParams();
  const narrow = useNarrow();
  const [venues, setVenues] = useState(null);
  const [day, setDay] = useState(null);
  const [sheet, setSheet] = useState(null); // { type: 'event' | 'manual' | 'block', ... }
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [flash, setFlash] = useState('');
  const [mobileArea, setMobileArea] = useState(null);
  const [now, setNow] = useState(new Date());

  const today = isoOf(new Date());
  const iso = params.get('date') ?? today;
  const venueId = params.get('venue') ?? venues?.[0]?.id;
  const setQuery = (patch) => setParams({ ...Object.fromEntries(params), ...patch }, { replace: true });

  const [loadError, setLoadError] = useState('');
  useEffect(() => { fetchOwnerVenues().then(setVenues).catch((e) => setLoadError(e.message)); }, []);
  const reload = useCallback(
    () => venueId && fetchDay(venueId, iso).then((d) => { setDay(d); setLoadError(''); }).catch((e) => setLoadError(e.message)),
    [venueId, iso],
  );
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const t = setInterval(() => { setNow(new Date()); reload(); }, 30000); // new online bookings show up on their own
    return () => clearInterval(t);
  }, [reload]);

  const close = () => { setSheet(null); setSheetError(''); };
  const done = (message) => { close(); setFlash(message); reload(); };
  const run = async (fn, message) => {
    setBusy(true);
    setSheetError('');
    try {
      await fn();
      done(message);
    } catch (err) {
      setSheetError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loadError && !day) return <div className="empty"><h3>Impossible de charger le calendrier</h3><p className="muted">{loadError}</p></div>;
  if (venues && venues.length === 0) {
    return <div className="empty"><h3>Aucun complexe pour l’instant</h3><p className="muted">Ton complexe apparaîtra ici une fois créé et validé.</p></div>;
  }
  if (!venues || !day || day.venue.id !== venueId) return <div className="venue-skeleton" />;

  const { venue, dayStart, dayEnd, events, stats } = day;
  const closed = dayEnd <= dayStart;
  const rows = closed ? [] : Array.from({ length: (dayEnd - dayStart) / 30 }, (_, i) => dayStart + i * 30);
  const shownAreas = narrow ? venue.areas.filter((a) => a.id === (mobileArea ?? venue.areas[0].id)) : venue.areas;
  const nowMin = iso === today ? now.getHours() * 60 + now.getMinutes() : null;
  const sheetArea = sheet?.event ? venue.areas.find((a) => a.id === sheet.event.areaId) : null;

  return (
    <div className="owner-cal">
      <header className="cal-head">
        <div>
          <span className="eyebrow">Espace propriétaire</span>
          <div className="cal-title">
            <h1>Calendrier</h1>
            <label className="pill-select venue-switch">
              <select value={venueId} onChange={(ev) => setQuery({ venue: ev.target.value })} aria-label="Complexe">
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="cal-actions">
          <button className="btn btn-ghost" onClick={() => setSheet({ type: 'block', initial: {} })}><Icon name="lock" size={18} /> Bloquer</button>
          <button className="btn btn-primary" onClick={() => setSheet({ type: 'manual', initial: { areaId: shownAreas[0].id, startMin: Math.max(dayStart, Math.ceil(((nowMin ?? dayStart) + 1) / 30) * 30) } })}>
            + Réservation
          </button>
        </div>
      </header>

      <div className="date-nav">
        <button className="icon-btn" onClick={() => setQuery({ date: shiftIso(iso, -1) })} aria-label="Jour précédent"><Icon name="arrow" size={18} /></button>
        <strong className="cap">{longDate(iso)}</strong>
        <button className="icon-btn next" onClick={() => setQuery({ date: shiftIso(iso, 1) })} aria-label="Jour suivant"><Icon name="arrow" size={18} /></button>
        {iso !== today && <button className="btn btn-ghost btn-sm" onClick={() => setQuery({ date: today })}>Aujourd’hui</button>}
        <input type="date" className="date-input" value={iso} onChange={(ev) => ev.target.value && setQuery({ date: ev.target.value })} aria-label="Choisir une date" />
      </div>

      {flash && <p className="flash" role="status"><Icon name="check" size={18} /> {flash} <button className="link" onClick={() => setFlash('')} aria-label="Fermer">✕</button></p>}

      <section className="stat-tiles" aria-label="Chiffres du jour">
        <div className="tile">
          <span>Réservations</span>
          <strong>{stats.bookings}</strong>
          <small>{stats.online} en ligne · {stats.bookings - stats.online} sur place</small>
        </div>
        <div className="tile">
          <span>Taux d’occupation</span>
          <strong>{Math.round(stats.occupancy * 100)} %</strong>
          <span className="occ-bar"><span style={{ width: `${Math.round(stats.occupancy * 100)}%` }} /></span>
          <small>{formatLength(stats.bookedMinutes)} réservées</small>
        </div>
        <div className="tile">
          <span>Chiffre d’affaires du jour</span>
          <strong>{formatFCFA(stats.revenue)}</strong>
          <small>Avant commission WinPitch</small>
        </div>
        <div className="tile">
          <span>Déjà encaissé en ligne</span>
          <strong>{formatFCFA(stats.paidOnline)}</strong>
          <small className="due">{formatFCFA(stats.atVenue)} à encaisser sur place</small>
        </div>
      </section>

      <div className="legend cal-legend">
        <span><i className="lg ev-paid" /> Payé en ligne</span>
        <span><i className="lg ev-deposit" /> Acompte payé</span>
        <span><i className="lg ev-manual" /> À payer sur place</span>
        <span><i className="lg ev-pending" /> Paiement en cours</span>
        <span><i className="lg ev-block" /> Bloqué</span>
      </div>

      {narrow && (
        <div className="sport-tabs area-tabs" role="tablist" aria-label="Terrain">
          {venue.areas.map((a) => (
            <button key={a.id} role="tab" aria-selected={a.id === shownAreas[0].id} className={a.id === shownAreas[0].id ? 'on' : ''} onClick={() => setMobileArea(a.id)}>
              {a.name}
            </button>
          ))}
        </div>
      )}

      {closed ? (
        <div className="empty"><h3>Fermé ce jour-là</h3><p className="muted">Modifie tes horaires d’ouverture pour ouvrir ce jour.</p></div>
      ) : (
        <div className="cal-scroll">
          <div className="cal-grid" style={{ gridTemplateColumns: `56px repeat(${shownAreas.length}, minmax(170px, 1fr))` }}>
            <div className="cal-corner" />
            {shownAreas.map((a) => (
              <div key={a.id} className="cal-area-head">
                <strong>{a.name}</strong>
                <span>{a.format} · <span className={`size-badge size-${sizeOf(a).key}`}>{sizeOf(a).label}</span></span>
              </div>
            ))}

            <div className="cal-times" style={{ height: rows.length * ROW_H }}>
              {rows.map((m) => m % 60 === 0 && <span key={m} style={{ top: (m - dayStart) / 30 * ROW_H }}>{fmtMin(m)}</span>)}
            </div>

            {shownAreas.map((a) => {
              const mine = events.filter((e) => e.areaId === a.id);
              const covered = (m) => mine.some((e) => e.startMin < m + 30 && e.endMin > m);
              return (
                <div key={a.id} className="cal-col" style={{ height: rows.length * ROW_H }}>
                  {rows.map((m) => (
                    <div key={m} className={`cal-cell ${m % 60 === 0 ? 'hour' : ''}`} style={{ top: (m - dayStart) / 30 * ROW_H, height: ROW_H }}>
                      {!covered(m) && (nowMin === null ? iso > today : m > nowMin) && (
                        <button className="cell-add" onClick={() => setSheet({ type: 'manual', initial: { areaId: a.id, startMin: m } })} aria-label={`Ajouter une réservation sur ${a.name} à ${fmtMin(m)}`}>
                          + {fmtMin(m)}
                        </button>
                      )}
                    </div>
                  ))}
                  {mine.map((e) => {
                    const tag = STATUS_TAG(e);
                    const h = (e.endMin - e.startMin) / 30 * ROW_H;
                    return (
                      <button key={e.id} className={`cal-event ev-${tag.cls} ${e.past ? 'is-past' : ''} ${h < 40 ? 'short' : ''}`}
                        style={{ top: (e.startMin - dayStart) / 30 * ROW_H + 1, height: h - 2 }}
                        onClick={() => setSheet({ type: 'event', event: e })}>
                        <strong>{e.kind === 'block' ? e.reason : e.clientName}</strong>
                        <span>{e.time}{e.kind === 'booking' && h >= 40 && ` · ${tag.label}`}</span>
                        {e.kind === 'booking' && e.atVenue > 0 && h >= 58 && <span className="ev-due">À encaisser {formatFCFA(e.atVenue)}</span>}
                      </button>
                    );
                  })}
                  {nowMin !== null && nowMin > dayStart && nowMin < dayEnd && (
                    <div className="now-line" style={{ top: (nowMin - dayStart) / 30 * ROW_H }} aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Sheet open={sheet?.type === 'event'} onClose={close} title={sheet?.event?.kind === 'block' ? 'Créneau bloqué' : sheet?.event?.clientName ?? ''}>
        {sheet?.type === 'event' && (
          <EventDetails
            e={sheet.event} area={sheetArea} busy={busy} error={sheetError}
            onCancel={(reason) => run(() => cancelEvent(sheet.event, reason), `Réservation de ${sheet.event.clientName} annulée${sheet.event.paidOnline ? `, ${formatFCFA(sheet.event.paidOnline)} remboursés` : ''}.`)}
            onNoShow={() => run(() => markNoShow(sheet.event), `${sheet.event.clientName} marqué absent.`)}
            onDeleteBlock={() => run(() => deleteBlock(sheet.event.blockId), 'Blocage supprimé, les créneaux sont de nouveau réservables.')}
          />
        )}
      </Sheet>
      <Sheet open={sheet?.type === 'manual'} onClose={close} title="Nouvelle réservation">
        {sheet?.type === 'manual' && <ManualForm venue={venue} iso={iso} initial={sheet.initial} onDone={done} />}
      </Sheet>
      <Sheet open={sheet?.type === 'block'} onClose={close} title="Bloquer un créneau">
        {sheet?.type === 'block' && <BlockForm venue={venue} iso={iso} initial={sheet.initial} dayStart={dayStart} dayEnd={dayEnd} onDone={done} />}
      </Sheet>
    </div>
  );
}
