import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { STATUS_LABELS, formatDateTime, formatPrice } from '../../format.js';

export default function OwnerDashboard() {
  const [businesses, setBusinesses] = useState(null);
  const [businessId, setBusinessId] = useState('');
  const [range, setRange] = useState('today');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/owner/businesses').then((d) => setBusinesses(d.businesses)).catch((e) => setError(e.message));
  }, []);

  const load = () => {
    const q = new URLSearchParams({ range });
    if (businessId) q.set('businessId', businessId);
    api(`/owner/bookings?${q}`).then(setData).catch((e) => setError(e.message));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [businessId, range]);

  const cancel = async (b) => {
    const reason = window.prompt(`Why are you cancelling ${b.clientId?.name}'s booking?`);
    if (!reason) return;
    setError('');
    try {
      await api(`/owner/bookings/${b._id}/cancel`, { method: 'PATCH', body: { reason } });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (businesses && businesses.length === 0) {
    return (
      <>
        <h1>Dashboard</h1>
        <p>You have no business yet. <Link to="/owner/businesses">Create your first business</Link></p>
      </>
    );
  }

  const counts = data?.counts ?? {};
  return (
    <>
      <div className="between">
        <h1>Dashboard</h1>
        <select value={businessId} onChange={(e) => setBusinessId(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">All businesses</option>
          {businesses?.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
      </div>

      <div className="tabs">
        <button className={range === 'today' ? 'active' : ''} onClick={() => setRange('today')}>Today</button>
        <button className={range === 'week' ? 'active' : ''} onClick={() => setRange('week')}>This week</button>
      </div>

      <div className="stats">
        <div className="card"><strong>{data?.bookings.length ?? '–'}</strong><span className="muted">Total</span></div>
        <div className="card"><strong>{(counts.confirmed ?? 0)}</strong><span className="muted">Upcoming</span></div>
        <div className="card"><strong>{counts.completed ?? 0}</strong><span className="muted">Completed</span></div>
        <div className="card">
          <strong>{(counts.cancelled_by_client ?? 0) + (counts.cancelled_by_owner ?? 0)}</strong>
          <span className="muted">Cancelled</span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      <h2>Bookings</h2>
      {data?.bookings.length === 0 && <p className="muted">No bookings in this period.</p>}
      <div className="stack">
        {data?.bookings.map((b) => (
          <div key={b._id} className="card between">
            <div>
              <strong>{formatDateTime(b.startAt, b.businessId?.timezone)}</strong>{' '}
              <span className={`badge ${b.displayStatus}`}>{STATUS_LABELS[b.displayStatus]}</span>
              <div>
                {b.clientId?.name ?? 'Deleted user'}{b.clientId?.phone && ` · ${b.clientId.phone}`}
              </div>
              <div className="muted">
                {!businessId && `${b.businessId?.name} · `}
                {b.items.map((i) => i.name).join(' + ')}
                {b.rentalAreaId && ` · ${b.rentalAreaId.name}`} · {formatPrice(b.totalPrice)}
              </div>
              {b.cancelReason && <div className="muted">Reason: {b.cancelReason}</div>}
            </div>
            {b.displayStatus === 'confirmed' && new Date(b.startAt) > new Date() && (
              <button className="danger" onClick={() => cancel(b)}>Cancel</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
