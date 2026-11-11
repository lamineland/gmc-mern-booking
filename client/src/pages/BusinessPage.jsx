import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, imageUrl } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { DAYS, categoryLabel, formatDuration, formatPrice, formatTime, todayISO } from '../format.js';

export default function BusinessPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]); // ordered service ids
  const [areaId, setAreaId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [availability, setAvailability] = useState(null);
  const [slot, setSlot] = useState(null);
  const [message, setMessage] = useState('');
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    api(`/businesses/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  const needsArea = useMemo(
    () => data?.services.some((s) => selected.includes(s._id) && s.usesRentalArea),
    [data, selected],
  );

  const loadSlots = () => {
    setSlot(null);
    if (!selected.length || (needsArea && !areaId)) return setAvailability(null);
    const q = new URLSearchParams({ serviceIds: selected.join(','), date });
    if (needsArea) q.set('areaId', areaId);
    api(`/businesses/${id}/availability?${q}`)
      .then(setAvailability)
      .catch((e) => setMessage(e.message));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadSlots, [id, selected, areaId, date, needsArea]);

  const toggle = (serviceId) =>
    setSelected((cur) => (cur.includes(serviceId) ? cur.filter((s) => s !== serviceId) : [...cur, serviceId]));

  const book = async () => {
    if (!user) return navigate('/login', { state: { from: location.pathname, reason: 'book' } });
    setBooking(true);
    setMessage('');
    try {
      await api('/bookings', {
        method: 'POST',
        body: { businessId: id, serviceIds: selected, rentalAreaId: needsArea ? areaId : undefined, startAt: slot.startAt },
      });
      navigate('/bookings', { state: { justBooked: true } });
    } catch (e) {
      setMessage(e.message);
      if (e.code === 'SLOT_UNAVAILABLE') loadSlots();
    } finally {
      setBooking(false);
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { business, services, rentalAreas } = data;
  const tz = business.timezone;

  return (
    <>
      <h1>{business.name}</h1>
      <p className="muted">
        {categoryLabel(business.category)} · {business.address}, {business.city}
        {business.phone && ` · ${business.phone}`}
      </p>
      {business.description && <p>{business.description}</p>}
      {business.photoIds?.length > 0 && (
        <div className="photos">{business.photoIds.map((p) => <img key={p} src={imageUrl(p)} alt="" />)}</div>
      )}

      <h2>Opening hours</h2>
      <div className="card">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const hours = business.openingHours.find((h) => h.day === d)?.intervals ?? [];
          return (
            <div key={d} className="between">
              <span>{DAYS[d]}</span>
              <span className="muted">{hours.length ? hours.map((i) => `${i.open}–${i.close}`).join(', ') : 'Closed'}</span>
            </div>
          );
        })}
      </div>

      <h2>1. Pick one or more services</h2>
      <div className="card stack">
        {services.length === 0 && <p className="muted">No services yet.</p>}
        {services.map((s) => (
          <label key={s._id} className="between" style={{ color: 'var(--text)', fontSize: '1rem' }}>
            <span>
              <input type="checkbox" checked={selected.includes(s._id)} onChange={() => toggle(s._id)} />
              {s.name} <span className="muted">· {formatDuration(s.durationMin)}</span>
            </span>
            <strong>{formatPrice(s.price)}</strong>
          </label>
        ))}
      </div>

      {needsArea && (
        <>
          <h2>2. Pick an area</h2>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">Choose…</option>
            {rentalAreas.map((a) => (
              <option key={a._id} value={a._id}>{a.name}{a.type ? ` (${a.type})` : ''}</option>
            ))}
          </select>
        </>
      )}

      <h2>{needsArea ? '3' : '2'}. Pick a date and time</h2>
      <input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 220 }} />
      <div style={{ marginTop: '0.75rem' }}>
        {!selected.length && <p className="muted">Pick a service to see free times.</p>}
        {availability && availability.slots.length === 0 && <p className="muted">No free times on this day.</p>}
        {availability && (
          <div className="slots">
            {availability.slots.map((s) => (
              <button key={s.startAt} className={slot?.startAt === s.startAt ? 'active' : ''} onClick={() => setSlot(s)}>
                {formatTime(s.startAt, tz)}
              </button>
            ))}
          </div>
        )}
      </div>

      {slot && availability && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="between">
            <div>
              <strong>{formatTime(slot.startAt, tz)} – {formatTime(slot.endAt, tz)}</strong>
              <div className="muted">{formatDuration(availability.durationMin)} · Total {formatPrice(availability.totalPrice)}</div>
            </div>
            <button onClick={book} disabled={booking || (user && user.role !== 'client')}>
              {user ? 'Book now' : 'Log in to book'}
            </button>
          </div>
          {user && user.role !== 'client' && <p className="muted">Only client accounts can book.</p>}
        </div>
      )}
      {message && <p className="error">{message}</p>}
    </>
  );
}
