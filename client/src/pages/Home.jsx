import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { BasketballScene, FootballScene } from '../components/illustrations.jsx';
import { Icon } from '../components/icons.jsx';

const SPORTS = [
  { value: 'football', label: 'Football', icon: 'football' },
  { value: 'basketball', label: 'Basketball', icon: 'basketball' },
  { value: 'futsal', label: 'Futsal', icon: 'football' },
  { value: 'padel', label: 'Padel', icon: 'racket' },
];

const DEMO_SLOTS = [
  { time: '17:30', price: '15 000', state: 'free' },
  { time: '18:00', price: '20 000', state: 'taken' },
  { time: '18:30', price: '20 000', state: 'picked' },
  { time: '19:00', price: '20 000', state: 'taken' },
  { time: '19:30', price: '20 000', state: 'free' },
  { time: '20:00', price: '20 000', state: 'free' },
];

/** Booking needs an account: logged-out visitors go to login first, then land on the search page. */
function useBookingTarget() {
  const { user } = useAuth();
  return (search = '') =>
    user ? { pathname: '/search', search } : { pathname: '/login', state: { from: `/search${search}`, reason: 'book' } };
}

function BookButton({ children = 'Réserver un terrain', className = 'btn btn-primary btn-lg', search = '' }) {
  const target = useBookingTarget()(search);
  return (
    <Link to={target.pathname + (target.search ?? '')} state={target.state} className={className}>
      {children}
      <Icon name="arrow" />
    </Link>
  );
}

function HeroSearch() {
  const navigate = useNavigate();
  const target = useBookingTarget();
  const [city, setCity] = useState('Dakar');
  const [sport, setSport] = useState('football');

  const submit = (e) => {
    e.preventDefault();
    const q = new URLSearchParams();
    if (city.trim()) q.set('city', city.trim());
    if (sport) q.set('sport', sport);
    const t = target(`?${q}`);
    navigate(t.pathname + (t.search ?? ''), { state: t.state });
  };

  return (
    <form className="hero-search" onSubmit={submit}>
      <label className="field">
        <span><Icon name="pin" /> Ville</span>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dakar" />
      </label>
      <label className="field">
        <span><Icon name="ball" /> Sport</span>
        <select value={sport} onChange={(e) => setSport(e.target.value)}>
          {SPORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <button type="submit" className="btn btn-primary">
        <Icon name="search" /> Trouver
      </button>
    </form>
  );
}

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="landing">
      {/* HERO */}
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="eyebrow"><span className="dot" /> Dakar · Thiès · Saly</span>
            <h1>
              Ton terrain, <span className="hl">ton créneau</span>, en 1 minute.
            </h1>
            <p className="lead">
              Foot à 5, basket, futsal… Vois les créneaux libres et les prix en direct, réserve de 18:30 à 19:00
              et paie avec Wave ou Orange Money. Fini les appels et les WhatsApp.
            </p>
            <HeroSearch />
            <div className="hero-actions">
              <BookButton />
              {!user && (
                <Link to="/register" className="btn btn-ghost btn-lg">Créer un compte</Link>
              )}
            </div>
            {!user && (
              <p className="hint"><Icon name="lock" /> Connexion requise pour réserver. L’inscription prend 30 secondes.</p>
            )}
          </div>

          <div className="hero-art">
            <FootballScene className="scene" />
            <div className="float-card float-slot">
              <span className="float-label">Terrain 1 · Foot à 5</span>
              <strong>18:30 – 19:00</strong>
              <span className="price">20 000 FCFA</span>
            </div>
            <div className="float-card float-paid">
              <span className="check"><Icon name="check" /></span>
              <span>
                <strong>Payé avec Wave</strong>
                <span className="float-label">Réservation confirmée</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SPORTS */}
      <section className="wrap sports">
        {SPORTS.map((s) => (
          <BookButton key={s.value} className="sport-chip" search={`?sport=${s.value}`}>
            <Icon name={s.icon} /> {s.label}
          </BookButton>
        ))}
      </section>

      {/* HOW IT WORKS */}
      <section className="wrap section">
        <div className="section-head">
          <span className="eyebrow">Comment ça marche</span>
          <h2>Réserver n’a jamais été aussi simple</h2>
        </div>
        <div className="steps">
          {[
            { icon: 'search', title: 'Cherche', text: 'Choisis ta ville, ton sport et ton heure. On te montre les terrains libres autour de toi.' },
            { icon: 'clock', title: 'Choisis ton créneau', text: 'Des créneaux de 30 minutes, avec le prix fixé par le propriétaire. Pas de surprise.' },
            { icon: 'wallet', title: 'Paie et joue', text: 'Paie avec Wave, Orange Money ou Free Money. Ta réservation est confirmée tout de suite.' },
          ].map((s, i) => (
            <div key={s.title} className="step">
              <span className="step-num">{i + 1}</span>
              <span className="step-icon"><Icon name={s.icon} /></span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BASKETBALL + FEATURES */}
      <section className="band band-warm">
        <div className="wrap split">
          <div className="split-art">
            <BasketballScene className="scene" />
          </div>
          <div>
            <span className="eyebrow">Tous les terrains</span>
            <h2>Du foot au basket, un seul compte</h2>
            <p className="lead">Que tu joues entre amis le mardi soir ou que tu organises un match d’équipe le week-end, WinPitch trouve le bon terrain.</p>
            <ul className="checks">
              <li><Icon name="check" /> Prix affichés pour chaque créneau, en FCFA</li>
              <li><Icon name="check" /> Disponibilités en temps réel : jamais de double réservation</li>
              <li><Icon name="check" /> Annulation gratuite jusqu’à 2 h avant, remboursement complet</li>
              <li><Icon name="check" /> Rappel et partage de la réservation sur WhatsApp</li>
            </ul>
            <BookButton className="btn btn-dark btn-lg">Voir les terrains</BookButton>
          </div>
        </div>
      </section>

      {/* PRODUCT PREVIEW */}
      <section className="wrap section split split-rev">
        <div>
          <span className="eyebrow">Les créneaux en direct</span>
          <h2>Vois ce qui est libre, et à quel prix</h2>
          <p className="lead">
            Chaque terrain affiche sa journée en créneaux de 30 minutes. Les heures de pointe et le week-end ont
            leur propre tarif, fixé par le propriétaire. Tu choisis, tu vois le total, tu réserves.
          </p>
          <div className="pay-logos">
            <span className="pay wave">Wave</span>
            <span className="pay om">Orange Money</span>
            <span className="pay free">Free Money</span>
          </div>
        </div>
        <div className="preview-card">
          <div className="preview-head">
            <div>
              <strong>Terrain 1 · Foot à 5</strong>
              <span className="muted">Complexe Almadies · gazon synthétique</span>
            </div>
            <span className="tag">Éclairé</span>
          </div>
          <div className="date-strip">
            {['Lun 16', 'Mar 17', 'Mer 18', 'Jeu 19', 'Ven 20'].map((d, i) => (
              <span key={d} className={i === 1 ? 'on' : ''}>{d}</span>
            ))}
          </div>
          <ul className="slot-list">
            {DEMO_SLOTS.map((s) => (
              <li key={s.time} className={`slot ${s.state}`}>
                <span className="slot-time">{s.time}</span>
                <span className="slot-state">{s.state === 'taken' ? 'Réservé' : s.state === 'picked' ? 'Ton choix' : 'Libre'}</span>
                <span className="slot-price">{s.state === 'taken' ? '—' : `${s.price} FCFA`}</span>
              </li>
            ))}
          </ul>
          <div className="preview-foot">
            <span><strong>18:30 – 19:00</strong> · 20 000 FCFA</span>
            <span className="btn btn-primary btn-sm">Réserver</span>
          </div>
        </div>
      </section>

      {/* OWNERS */}
      <section className="band band-dark">
        <div className="wrap owners">
          <div>
            <span className="eyebrow eyebrow-light">Propriétaires de complexes</span>
            <h2>Remplissez vos terrains, sans le carnet</h2>
            <p className="lead">Un calendrier pour tous vos terrains, vos tarifs par heure, les réservations payées d’avance et celles prises au téléphone, au même endroit.</p>
            <Link to="/register" state={{ role: 'owner' }} className="btn btn-accent btn-lg">
              Inscrire mon complexe <Icon name="arrow" />
            </Link>
          </div>
          <div className="owner-stats">
            {[
              { icon: 'calendar', title: 'Calendrier unique', text: 'Tous vos terrains, heure par heure' },
              { icon: 'tag', title: 'Vos prix', text: 'Tarifs heures creuses et heures de pointe' },
              { icon: 'wallet', title: 'Paiement d’avance', text: 'Moins de joueurs qui ne viennent pas' },
              { icon: 'phone', title: 'Réservations au téléphone', text: 'Ajoutées en 2 clics, sans commission' },
            ].map((f) => (
              <div key={f.title} className="owner-feature">
                <span className="step-icon"><Icon name={f.icon} /></span>
                <strong>{f.title}</strong>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="wrap section">
        <div className="cta-band">
          <div>
            <h2>Prêt à jouer ce soir ?</h2>
            <p>{user ? 'Trouve un créneau libre près de chez toi.' : 'Crée ton compte gratuitement, puis réserve ton premier terrain.'}</p>
          </div>
          <div className="cta-actions">
            <BookButton className="btn btn-light btn-lg" />
            {!user && <Link to="/login" className="btn btn-outline-light btn-lg">J’ai déjà un compte</Link>}
          </div>
        </div>
      </section>
    </div>
  );
}
