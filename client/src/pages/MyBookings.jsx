import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { STATUS_LABELS, formatDateTime, formatDuration, formatPrice } from '../format.js';

const TABS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function MyBookings() {
  const location = useLocation();
  const [tab, setTab] = useState('upcoming');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api(`/bookings/me?tab=${tab}`).then(setData).catch((e) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tab]);

  const cancel = async (b) => {
    if (!window.confirm(`Cancel your booking at ${b.businessId.name}?`)) return;
    setError('');
    try {
      await api(`/bookings/${b._id}/cancel`, { method: 'PATCH', body: {} });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const canCancel = (b) =>
    b.status === 'confirmed' && new Date(b.startAt).getTime() - data.cancellationCutoffHours * 3600e3 > Date.now();

  return (
    <>
      <h1>My bookings</h1>
      {location.state?.justBooked && tab === 'upcoming' && <p className="success">Your booking is confirmed.</p>}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.value} className={tab === t.value ? 'active' : ''} onClick={() => setTab(t.value)}>{t.label}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {data && data.bookings.length === 0 && (
        <p className="muted">Nothing here yet. <Link to="/">Find a place to book</Link></p>
      )}
      <div className="stack">
        {data?.bookings.map((b) => {
          const duration = b.items.reduce((s, i) => s + i.durationMin, 0);
          return (
            <div key={b._id} className="card between">
              <div>
                <strong>{b.businessId?.name}</strong> <span className={`badge ${b.displayStatus}`}>{STATUS_LABELS[b.displayStatus]}</span>
                <div>{formatDateTime(b.startAt, b.businessId?.timezone)}{b.rentalAreaId && ` · ${b.rentalAreaId.name}`}</div>
                <div className="muted">
                  {b.items.map((i) => i.name).join(' + ')} · {formatDuration(duration)} · {formatPrice(b.totalPrice)}
                </div>
                {b.cancelReason && <div className="muted">Reason: {b.cancelReason}</div>}
              </div>
              {tab === 'upcoming' && (
                canCancel(b) ? (
                  <button className="danger" onClick={() => cancel(b)}>Cancel</button>
                ) : (
                  <span className="muted">Can no longer be cancelled ({data.cancellationCutoffHours} h rule)</span>
                )
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
