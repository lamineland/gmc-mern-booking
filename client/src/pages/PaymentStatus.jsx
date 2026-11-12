import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/icons.jsx';
import { WALLETS, getPayment, isMockRedirect, retry, simulate } from '../data/payments.js';
import { META, longDate } from '../data/venues.js';
import { formatFCFA } from '../format.js';
import { Steps, WalletLogo } from './Checkout.jsx';

const POLL_MS = 2000;
const isDev = import.meta.env.DEV;

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** .ics file for "Ajouter au calendrier" (Dakar is UTC+0 all year, so local time = UTC). */
function icsHref(b) {
  const stamp = (date, time) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00Z`;
  const end = b.end === '00:00' ? '23:59' : b.end;
  const text = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WinPitch//FR', 'BEGIN:VEVENT',
    `UID:${b.code}@winpitch`, `DTSTART:${stamp(b.date, b.start)}`, `DTEND:${stamp(b.date, end)}`,
    `SUMMARY:${b.areaName} · ${b.venueName}`, `LOCATION:${b.venueAddress}`,
    `DESCRIPTION:Réservation WinPitch ${b.code}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(text)}`;
}

function BookingCard({ p, day }) {
  const b = p.booking;
  return (
    <div className="ticket">
      <div className="ticket-top">
        <div>
          <span className="muted">Réservation</span>
          <strong className="ticket-code">{p.code}</strong>
        </div>
        <WalletLogo method={p.method} size={36} />
      </div>
      <div className="ticket-main">
        <strong>{b.start} – {b.end}</strong>
        <span className="cap">{day}</span>
      </div>
      <dl className="ticket-lines">
        <div><dt>Complexe</dt><dd>{b.venueName}</dd></div>
        <div><dt>Terrain</dt><dd>{b.areaName} · {b.areaFormat}</dd></div>
        <div><dt>Adresse</dt><dd>{b.venueAddress}</dd></div>
        {p.note && <div><dt>Équipe</dt><dd>{p.note}</dd></div>}
        <div><dt>Payé ({WALLETS[p.method].label})</dt><dd>{formatFCFA(b.payNow)}</dd></div>
        {b.atVenue > 0 && <div className="due"><dt>Reste à payer sur place</dt><dd>{formatFCFA(b.atVenue)}</dd></div>}
      </dl>
    </div>
  );
}

export default function PaymentStatus() {
  const { ref } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [changing, setChanging] = useState(false);
  const [method, setMethod] = useState('wave');

  const refresh = useCallback(() => getPayment(ref).then(setP).catch((e) => setError(e.message)), [ref]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    // Poll the provider while pending; keep the hold countdown running after a failure too.
    if (p?.status !== 'pending' && p?.status !== 'failed') return undefined;
    setNow(Date.now());
    const poll = p.status === 'pending' ? setInterval(refresh, POLL_MS) : null;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [p?.status, refresh]);
  useEffect(() => { if (p) setMethod(p.method); }, [p?.method]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (outcome) => {
    await simulate(ref, outcome);
    refresh();
  };
  const tryAgain = async () => {
    const { redirectUrl } = await retry(ref, { method, phone: p.phone });
    if (redirectUrl && !isMockRedirect(redirectUrl)) return window.location.assign(redirectUrl);
    setChanging(false);
    refresh();
  };

  if (error) {
    return (
      <div className="empty">
        <h3>{error}</h3>
        <Link to="/search" className="btn btn-ghost">Trouver un terrain</Link>
      </div>
    );
  }
  if (!p) return <div className="venue-skeleton" />;

  const b = p.booking;
  const day = longDate(b.date);
  const left = p.holdExpiresAt - now;
  const venueLink = `/venues/${b.venueId}?area=${b.areaId}&date=${b.date}`;
  const share = encodeURIComponent(
    `⚽ ${b.areaName} réservé à ${b.venueName}, ${day} de ${b.start} à ${b.end}. Adresse : ${b.venueAddress}. Réservation ${p.code} sur WinPitch.`,
  );

  return (
    <div className="status-page">
      <Steps current={p.status === 'succeeded' ? 3 : 1} />

      {p.status === 'pending' && (
        <section className="status-card">
          <div className="status-icon pending"><Icon name="phone" size={34} /></div>
          <h1>Confirme le paiement sur ton téléphone</h1>
          <p className="lead">{WALLETS[p.method].pending} <strong>{formatFCFA(b.payNow)}</strong> au numéro {p.phone}.</p>
          <div className="hold-timer" role="timer" aria-live="off">
            <Icon name="clock" size={18} /> Créneau bloqué pour toi encore <strong>{mmss(left)}</strong>
            <span className="hold-bar"><span style={{ width: `${Math.max(0, Math.min(100, (left / (META.holdMinutes * 60000)) * 100))}%` }} /></span>
          </div>
          <p className="waiting"><span className="dot-pulse" /> En attente de la confirmation de {WALLETS[p.method].label}…</p>
          <div className="status-actions">
            <button className="btn btn-ghost" onClick={refresh}>J’ai payé, vérifier</button>
          </div>
        </section>
      )}

      {p.status === 'succeeded' && (
        <section className="status-card is-success">
          <div className="status-icon ok"><Icon name="check" size={38} /></div>
          <h1>Réservation confirmée !</h1>
          <p className="lead">Ton terrain t’attend. Tu recevras aussi le récapitulatif par e-mail.</p>
          <BookingCard p={p} day={day} />
          <div className="status-actions">
            <a className="btn btn-primary" href={`https://wa.me/?text=${share}`} target="_blank" rel="noreferrer">Partager sur WhatsApp</a>
            <a className="btn btn-ghost" href={icsHref({ ...b, code: p.code })} download={`winpitch-${p.code}.ics`}><Icon name="calendar" size={18} /> Ajouter au calendrier</a>
          </div>
          <p className="muted small-note">Annulation gratuite jusqu’à 2 h avant le début depuis « Mes réservations ».</p>
        </section>
      )}

      {p.status === 'failed' && (
        <section className="status-card is-failed">
          <div className="status-icon ko"><Icon name="close" size={34} /></div>
          <h1>Le paiement n’a pas abouti</h1>
          <p className="lead">{p.failureReason} Aucun montant n’a été débité.</p>
          <div className="hold-timer"><Icon name="clock" size={18} /> Ton créneau reste bloqué encore <strong>{mmss(left)}</strong></div>
          {changing ? (
            <div className="wallets compact" role="radiogroup" aria-label="Moyen de paiement">
              {Object.entries(WALLETS).map(([key, w]) => (
                <label key={key} className={`wallet-option ${method === key ? 'on' : ''}`}>
                  <input type="radio" name="method" checked={method === key} onChange={() => setMethod(key)} />
                  <WalletLogo method={key} size={36} />
                  <span className="wallet-text"><strong>{w.label}</strong></span>
                  <span className="radio-dot" />
                </label>
              ))}
            </div>
          ) : null}
          <div className="status-actions">
            <button className="btn btn-primary" onClick={tryAgain} disabled={left <= 0}>
              Réessayer avec {WALLETS[method].label}
            </button>
            {!changing && <button className="btn btn-ghost" onClick={() => setChanging(true)}>Changer de moyen de paiement</button>}
          </div>
        </section>
      )}

      {p.status === 'expired' && (
        <section className="status-card is-failed">
          <div className="status-icon ko"><Icon name="clock" size={34} /></div>
          <h1>Le délai de paiement est dépassé</h1>
          <p className="lead">Le créneau {b.start} – {b.end} a été libéré pour les autres joueurs. Aucun montant n’a été débité.</p>
          <div className="status-actions">
            <Link className="btn btn-primary" to={venueLink}>Choisir un autre créneau</Link>
          </div>
        </section>
      )}

      {p.status.startsWith('cancelled') && (
        <section className="status-card is-failed">
          <div className="status-icon ko"><Icon name="close" size={34} /></div>
          <h1>Cette réservation a été annulée</h1>
          <p className="lead">{p.cancelReason ?? 'Annulée.'}{p.refund && ` ${formatFCFA(p.refund.amount)} remboursés.`}</p>
          <div className="status-actions"><Link className="btn btn-primary" to="/bookings">Mes réservations</Link></div>
        </section>
      )}

      {p.status !== 'succeeded' && (
        <aside className="status-summary">
          <span className="muted">{b.venueName} · {b.areaName}</span>
          <strong>{b.start} – {b.end}</strong>
          <span className="muted cap">{day}</span>
          <span className="amount">{formatFCFA(b.payNow)}</span>
        </aside>
      )}

      {isDev && p.status === 'pending' && (
        <section className="test-panel" aria-label="Mode test">
          <span className="test-badge">MODE TEST</span>
          <p>Aucun vrai paiement. Simule la réponse de l’opérateur :</p>
          <div className="test-actions">
            <button className="btn btn-sm btn-primary" onClick={() => act('success')}>Payer</button>
            <button className="btn btn-sm btn-ghost" onClick={() => act('fail')}>Échec</button>
          </div>
          <p className="muted">Numéros de test : finissant par 00 = payé après 3 s, 01 = refusé, 02 = pas de réponse (le créneau se libère après {META.holdMinutes} min).</p>
        </section>
      )}
    </div>
  );
}
