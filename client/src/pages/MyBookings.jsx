import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SportCover from '../components/SportCover.jsx';
import { Icon } from '../components/icons.jsx';
import { WALLETS, cancelBooking, listMyBookings } from '../data/payments.js';
import { META } from '../data/venues.js';
import { formatFCFA } from '../format.js';
import { WalletLogo } from './Checkout.jsx';

const TABS = [
  { value: 'upcoming', label: 'À venir' },
  { value: 'past', label: 'Passées' },
  { value: 'cancelled', label: 'Annulées' },
];

const STATUS = {
  confirmed: { label: 'Confirmée', cls: 'ok' },
  pending_payment: { label: 'Paiement en attente', cls: 'warn' },
  completed: { label: 'Terminée', cls: 'neutral' },
  no_show: { label: 'Absent', cls: 'ko' },
  cancelled_by_client: { label: 'Annulée par toi', cls: 'ko' },
  cancelled_by_owner: { label: 'Annulée par le complexe', cls: 'ko' },
};

const dateParts = (ms) => {
  const d = new Date(ms);
  return {
    day: d.getDate(),
    month: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    weekday: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
    long: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
};

/** "dans 2 jours", "demain", "dans 3 h", "dans 25 min" */
function relative(ms, now) {
  const min = Math.round((ms - now) / 60000);
  if (min < 60) return `dans ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  const today = new Date(now).toDateString() === new Date(ms).toDateString();
  if (today) return `aujourd’hui, dans ${h} h`;
  const tomorrow = new Date(now + 86400e3).toDateString() === new Date(ms).toDateString();
  if (tomorrow) return 'demain';
  return `dans ${Math.ceil((ms - now) / 86400e3)} jours`;
}

const mapsHref = (b) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.venueName}, ${b.venueAddress}, Sénégal`)}`;
const shareHref = (p, d) =>
  `https://wa.me/?text=${encodeURIComponent(`⚽ ${p.booking.areaName} réservé à ${p.booking.venueName}, ${d.long} de ${p.booking.start} à ${p.booking.end}. Adresse : ${p.booking.venueAddress}. Réservation ${p.code} sur WinPitch.`)}`;

function PaymentLine({ p }) {
  const b = p.booking;
  if (p.status === 'pending_payment') return <span className="pay-line warn">À payer : {formatFCFA(b.payNow)}</span>;
  if (p.refund) return <span className="pay-line"><Icon name="check" size={14} /> Remboursé {formatFCFA(p.refund.amount)} sur {WALLETS[p.method].label}</span>;
  return (
    <span className="pay-line">
      Payé {formatFCFA(b.payNow)} · {WALLETS[p.method].label}
      {b.atVenue > 0 && <em> · reste {formatFCFA(b.atVenue)} sur place</em>}
    </span>
  );
}

function NextMatch({ p, now, onCancel }) {
  const b = p.booking;
  const d = dateParts(p.startMs);
  return (
    <section className="next-match">
      <div className="next-cover"><SportCover sport={b.sport} /></div>
      <div className="next-body">
        <span className="eyebrow eyebrow-light">Prochain match · {relative(p.startMs, now)}</span>
        <h2>{b.start} – {b.end}</h2>
        <p className="next-when cap">{d.long}</p>
        <p className="next-where"><strong>{b.venueName}</strong> · {b.areaName} ({b.areaFormat})<br />{b.venueAddress}</p>
        <div className="next-meta">
          <span className="code-chip">{p.code}</span>
          <PaymentLine p={p} />
        </div>
        <div className="next-actions">
          <a className="btn btn-light btn-sm" href={mapsHref(b)} target="_blank" rel="noreferrer"><Icon name="pin" size={16} /> Itinéraire</a>
          <a className="btn btn-outline-light btn-sm" href={shareHref(p, d)} target="_blank" rel="noreferrer">Partager sur WhatsApp</a>
          {p.cancellable && <button className="btn btn-outline-light btn-sm" onClick={() => onCancel(p)}>Annuler</button>}
        </div>
      </div>
    </section>
  );
}

function BookingRow({ p, now, onCancel }) {
  const b = p.booking;
  const d = dateParts(p.startMs);
  const st = STATUS[p.status];
  return (
    <article className={`booking-row ${p.status}`}>
      <div className="date-block">
        <span>{d.weekday}</span>
        <strong>{d.day}</strong>
        <span>{d.month}</span>
      </div>
      <div className="booking-info">
        <div className="booking-head">
          <strong className="booking-time">{b.start} – {b.end}</strong>
          <span className={`status-pill ${st.cls}`}>{st.label}</span>
        </div>
        <p className="booking-where"><strong>{b.venueName}</strong> · {b.areaName} · {b.areaFormat}</p>
        <div className="booking-meta">
          <span className="code-chip light">{p.code}</span>
          <PaymentLine p={p} />
        </div>
        {p.cancelReason && <p className="owner-reason"><Icon name="close" size={14} /> {p.cancelReason}</p>}
      </div>
      <div className="booking-actions">
        {p.status === 'pending_payment' && (
          <Link className="btn btn-primary btn-sm" to={`/payment/${p.ref}`}>Finir le paiement · {Math.max(0, Math.ceil((p.holdExpiresAt - now) / 60000))} min</Link>
        )}
        {p.status === 'confirmed' && (p.cancellable ? (
          <button className="btn btn-ghost btn-sm" onClick={() => onCancel(p)}>Annuler</button>
        ) : (
          <span className="no-cancel">Annulation impossible à moins de {META.cancellationCutoffHours} h du début</span>
        ))}
        {(p.status === 'completed' || p.status.startsWith('cancelled')) && (
          <Link className="btn btn-ghost btn-sm" to={`/venues/${b.venueId}?area=${b.areaId}`}>Réserver à nouveau</Link>
        )}
      </div>
    </article>
  );
}

function CancelDialog({ p, busy, error, onClose, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (p && !dialog.open) dialog.showModal();
    if (!p && dialog.open) dialog.close();
  }, [p]);
  const b = p?.booking;
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby="cancel-title">
      {p && (
        <>
          <h2 id="cancel-title">Annuler cette réservation ?</h2>
          <p className="muted cap">{dateParts(p.startMs).long} · {b.start} – {b.end}</p>
          <p><strong>{b.venueName}</strong> · {b.areaName}</p>
          <div className="refund-box">
            <WalletLogo method={p.method} size={36} />
            <span>Tu seras remboursé de <strong>{formatFCFA(b.payNow)}</strong> sur ton compte {WALLETS[p.method].label} ({p.phone}).</span>
          </div>
          <p className="muted small-note">Le créneau sera libéré pour les autres joueurs. Cette action est définitive.</p>
          {error && <p className="field-error">{error}</p>}
          <div className="sheet-actions">
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Garder ma réservation</button>
            <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Annulation…' : 'Oui, annuler'}</button>
          </div>
        </>
      )}
    </dialog>
  );
}

export default function MyBookings() {
  const [tab, setTab] = useState('upcoming');
  const [data, setData] = useState(null);
  const [toCancel, setToCancel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [flash, setFlash] = useState('');
  const now = Date.now();

  const load = () => listMyBookings().then(setData);
  useEffect(() => { load(); }, []);

  const confirmCancel = async () => {
    setBusy(true);
    setDialogError('');
    try {
      const { refund, method } = await cancelBooking(toCancel.ref);
      setFlash(`Réservation ${toCancel.code} annulée. ${formatFCFA(refund.amount)} remboursés sur ton compte ${WALLETS[method].label}.`);
      setToCancel(null);
      load();
    } catch (e) {
      setDialogError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const list = data?.[tab] ?? [];
  const next = data?.upcoming.find((p) => p.status === 'confirmed');
  const rows = tab === 'upcoming' ? list.filter((p) => p !== next) : list;

  return (
    <div className="bookings-page">
      <header className="bookings-head">
        <div>
          <span className="eyebrow">Mon espace</span>
          <h1>Mes réservations</h1>
        </div>
        <Link to="/search" className="btn btn-primary"><Icon name="search" size={18} /> Réserver un terrain</Link>
      </header>

      {flash && (
        <p className="flash" role="status"><Icon name="check" size={18} /> {flash} <button className="link" onClick={() => setFlash('')} aria-label="Fermer">✕</button></p>
      )}

      <div className="booking-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.value} role="tab" aria-selected={tab === t.value} className={tab === t.value ? 'on' : ''} onClick={() => setTab(t.value)}>
            {t.label}
            {data && <span className="count">{data[t.value].length}</span>}
          </button>
        ))}
      </div>

      {!data && <div className="venue-skeleton" style={{ height: 240 }} />}

      {data && tab === 'upcoming' && next && <NextMatch p={next} now={now} onCancel={setToCancel} />}

      {data && list.length === 0 && (
        <div className="empty">
          <Icon name={tab === 'cancelled' ? 'check' : 'calendar'} size={28} />
          <h3>{tab === 'upcoming' ? 'Aucun match prévu' : tab === 'past' ? 'Pas encore de match joué' : 'Aucune annulation'}</h3>
          {tab === 'upcoming' && <p className="muted">Trouve un terrain libre près de chez toi et réserve en 1 minute.</p>}
          {tab === 'upcoming' && <Link to="/search" className="btn btn-primary">Trouver un terrain</Link>}
        </div>
      )}

      {rows.length > 0 && (
        <div className="booking-list">
          {tab === 'upcoming' && next && <h2 className="list-title">Ensuite</h2>}
          {rows.map((p) => <BookingRow key={p.ref} p={p} now={now} onCancel={setToCancel} />)}
        </div>
      )}

      <CancelDialog p={toCancel} busy={busy} error={dialogError} onClose={() => { setToCancel(null); setDialogError(''); }} onConfirm={confirmCancel} />
    </div>
  );
}
