import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import SportCover from '../components/SportCover.jsx';
import { Icon } from '../components/icons.jsx';
import { WALLETS, createBookingAndPay, isMockRedirect, quote } from '../data/payments.js';
import { META, longDate, sizeOf } from '../data/venues.js';
import { formatFCFA, formatLength } from '../format.js';

export function WalletLogo({ method, size = 44 }) {
  return (
    <span className={`wallet-logo wallet-${method}`} style={{ width: size, height: size }} aria-hidden="true">
      {WALLETS[method].short}
    </span>
  );
}

export function Steps({ current }) {
  const steps = ['Créneau', 'Paiement', 'Confirmation'];
  return (
    <ol className="steps-bar">
      {steps.map((s, i) => (
        <li key={s} className={i < current ? 'done' : i === current ? 'on' : ''}>
          <span>{i < current ? <Icon name="check" size={14} /> : i + 1}</span> {s}
        </li>
      ))}
    </ol>
  );
}

/** Senegal mobile numbers: 9 digits starting with 7, with or without +221. */
const normalisePhone = (v) => {
  const digits = v.replace(/\D/g, '').replace(/^221/, '');
  return /^7\d{8}$/.test(digits) ? `+221 ${digits.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4')}` : null;
};

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const selection = {
    venueId: params.get('venue'),
    areaId: params.get('area'),
    date: params.get('date'),
    start: params.get('start'),
    len: params.get('len'),
  };
  const [q, setQ] = useState(null);
  const [error, setError] = useState(null);
  const [method, setMethod] = useState('wave');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [note, setNote] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    quote(selection).then(setQ).catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const backToVenue = `/venues/${selection.venueId}?${new URLSearchParams({ area: selection.areaId ?? '', date: selection.date ?? '' })}`;

  const pay = async (e) => {
    e.preventDefault();
    const normalised = normalisePhone(phone);
    if (!normalised) return setPhoneError('Entre un numéro sénégalais valide, par exemple 77 123 45 67.');
    setPhoneError('');
    setPaying(true);
    try {
      const { ref, redirectUrl } = await createBookingAndPay({ ...selection, method, phone: normalised, note });
      // A real provider hosts its own payment page and sends the player back to /payment/:ref.
      if (redirectUrl && !isMockRedirect(redirectUrl)) window.location.assign(redirectUrl);
      else navigate(`/payment/${ref}`, { replace: true });
    } catch (err) {
      setError(err);
      setPaying(false);
    }
  };

  if (error) {
    return (
      <div className="checkout-page">
        <div className="empty">
          <Icon name="clock" size={28} />
          <h3>{error.message}</h3>
          <p className="muted">Quelqu’un a peut-être réservé ce créneau entre-temps. Choisis-en un autre.</p>
          <Link to={backToVenue} className="btn btn-primary">Voir les créneaux libres</Link>
        </div>
      </div>
    );
  }
  if (!q) return <div className="venue-skeleton" />;

  const day = longDate(q.date);
  const size = sizeOf(q.area);
  const deposit = q.venue.paymentMode === 'deposit';

  return (
    <div className="checkout-page">
      <Link to={`${backToVenue}&start=${q.start}&len=${q.slotCount}`} className="back-link">
        <Icon name="arrow" size={16} /> Modifier le créneau
      </Link>
      <Steps current={1} />
      <h1>Paiement</h1>

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={pay}>
          <section className="form-block">
            <h2>Moyen de paiement</h2>
            <div className="wallets" role="radiogroup" aria-label="Moyen de paiement">
              {Object.entries(WALLETS).map(([key, w]) => (
                <label key={key} className={`wallet-option ${method === key ? 'on' : ''}`}>
                  <input type="radio" name="method" value={key} checked={method === key} onChange={() => setMethod(key)} />
                  <WalletLogo method={key} />
                  <span className="wallet-text">
                    <strong>{w.label}</strong>
                    <span>{w.hint}</span>
                  </span>
                  <span className="radio-dot" />
                </label>
              ))}
            </div>
          </section>

          <section className="form-block">
            <h2>Numéro {WALLETS[method].label}</h2>
            <label className="phone-field">
              <span className="prefix">+221</span>
              <input
                type="tel"
                inputMode="tel"
                value={phone.replace(/^\+221\s?/, '')}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="77 123 45 67"
                aria-label={`Numéro ${WALLETS[method].label}`}
                autoComplete="tel-national"
                required
              />
            </label>
            {phoneError ? <p className="field-error">{phoneError}</p> : <p className="field-help">Le numéro lié à ton compte {WALLETS[method].label}.</p>}
          </section>

          <section className="form-block">
            <h2>Nom de l’équipe <span className="optional">facultatif</span></h2>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. Les Lions de Ouakam" maxLength={60} />
          </section>

          <div className="pay-box">
            <button type="submit" className="btn btn-primary btn-lg pay-btn" disabled={paying}>
              {paying ? 'Création du paiement…' : <><Icon name="lock" size={18} /> Payer {formatFCFA(q.payNow)} avec {WALLETS[method].label}</>}
            </button>
            <ul className="pay-notes">
              <li><Icon name="clock" size={16} /> Le créneau est bloqué pour toi pendant {META.holdMinutes} minutes le temps de payer.</li>
              <li><Icon name="check" size={16} /> Annulation gratuite jusqu’à 2 h avant le début, remboursement complet sur ton compte {WALLETS[method].label}.</li>
            </ul>
          </div>
        </form>

        <aside className="summary">
          <div className="summary-card">
            <div className="summary-area">
              <SportCover sport={q.area.sport} ball={false} />
              <div>
                <strong>{q.venue.name}</strong>
                <span>{q.area.name} · {q.area.format} · {size.label}</span>
              </div>
            </div>
            <div className="summary-time">
              <span className="muted">{day}</span>
              <strong>{q.start} – {q.end}</strong>
              <span className="muted">{formatLength(q.slotCount * q.area.slotMinutes)} · {q.area.length} × {q.area.width} m · {q.venue.district}</span>
            </div>
            <dl className="price-lines">
              <div><dt>Location ({q.slotCount} × {q.area.slotMinutes} min)</dt><dd>{formatFCFA(q.price)}</dd></div>
              <div className="sub"><dt>Frais de service</dt><dd>Offerts</dd></div>
              <div className="total"><dt>{deposit ? 'Acompte à payer maintenant' : 'À payer maintenant'}</dt><dd>{formatFCFA(q.payNow)}</dd></div>
              {deposit && <div className="sub"><dt>Reste à payer sur place</dt><dd>{formatFCFA(q.atVenue)}</dd></div>}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
