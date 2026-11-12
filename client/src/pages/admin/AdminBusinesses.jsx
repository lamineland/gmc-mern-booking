import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { DAYS, STATUS_LABELS } from '../../format.js';
import { SPORTS } from '../../data/venues.js';

export default function AdminBusinesses() {
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    api(`/admin/venues?status=${status}`).then(setData).catch((e) => setError(e.message));
    api('/admin/stats').then(setStats).catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [status]);

  const act = async (path, body) => {
    setError('');
    try {
      await api(path, { method: 'PATCH', body });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const reject = (b) => {
    const reason = window.prompt(`Why are you rejecting "${b.name}"? The owner will see this.`);
    if (reason) act(`/admin/venues/${b._id}/reject`, { reason });
  };

  return (
    <>
      <h1>Businesses</h1>
      {stats && (
        <div className="stats" style={{ marginBottom: '1rem' }}>
          <div className="card"><strong>{stats.pendingVenues}</strong><span className="muted">Waiting for review</span></div>
          <div className="card"><strong>{stats.venues}</strong><span className="muted">Businesses</span></div>
          <div className="card"><strong>{stats.users}</strong><span className="muted">Users</span></div>
          <div className="card"><strong>{stats.bookings}</strong><span className="muted">Bookings</span></div>
        </div>
      )}
      <div className="tabs">
        {['pending', 'approved', 'rejected'].map((s) => (
          <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>{STATUS_LABELS[s]}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {data?.items.length === 0 && <p className="muted">Nothing here.</p>}
      <div className="stack">
        {data?.items.map((b) => (
          <div key={b._id} className="card stack">
            <div className="between">
              <div>
                <strong>{b.name}</strong> <span className="muted">· {(b.sports ?? []).map((x) => SPORTS[x]?.label ?? x).join(', ') || 'Aucun terrain'} · {b.district ? `${b.district}, ` : ''}{b.city} · {b.areas?.length ?? 0} terrain(s)</span>
                <div className="muted">{b.address}</div>
                <div className="muted">
                  Owner: {b.ownerId?.name} ({b.ownerId?.phone}{b.ownerId?.email ? ` · ${b.ownerId.email}` : ''}){b.ownerId?.status === 'suspended' && ' · suspended'}
                </div>
              </div>
              <div className="row" style={{ flex: '0 0 auto' }}>
                {b.status !== 'approved' && <button onClick={() => act(`/admin/venues/${b._id}/approve`)}>Approve</button>}
                {b.status !== 'rejected' && <button className="danger" onClick={() => reject(b)}>Reject</button>}
              </div>
            </div>
            {b.description && <p style={{ margin: 0 }}>{b.description}</p>}
            <div className="muted">
              {b.openingHours.filter((h) => h.intervals.length).map((h) => `${DAYS[h.day].slice(0, 3)} ${h.intervals.map((i) => `${i.open}–${i.close}`).join(', ')}`).join(' · ') || 'No opening hours set'}
            </div>
            {b.rejectionReason && <div className="error">Rejected: {b.rejectionReason}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
