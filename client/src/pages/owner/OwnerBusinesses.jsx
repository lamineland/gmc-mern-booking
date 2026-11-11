import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { STATUS_LABELS, categoryLabel } from '../../format.js';
import BusinessForm from './BusinessForm.jsx';

export default function OwnerBusinesses() {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/owner/businesses').then((d) => setBusinesses(d.businesses)).catch((e) => setError(e.message));
  }, []);

  const create = async (body) => {
    const { business } = await api('/owner/businesses', { method: 'POST', body });
    navigate(`/owner/businesses/${business._id}`);
  };

  return (
    <>
      <div className="between">
        <h1>My businesses</h1>
        {!creating && <button onClick={() => setCreating(true)}>Add a business</button>}
      </div>
      {error && <p className="error">{error}</p>}

      {creating && (
        <>
          <h2>New business</h2>
          <p className="muted">An admin reviews every new business before clients can see it.</p>
          <BusinessForm onSubmit={create} submitLabel="Create and continue" />
        </>
      )}

      <div className="grid" style={{ marginTop: '1rem' }}>
        {businesses?.map((b) => (
          <Link key={b._id} to={`/owner/businesses/${b._id}`} className="card" style={{ color: 'inherit' }}>
            <strong>{b.name}</strong> <span className={`badge ${b.status}`}>{STATUS_LABELS[b.status]}</span>
            <div className="muted">{categoryLabel(b.category)} · {b.city}</div>
            {b.status === 'rejected' && <div className="error">Rejected: {b.rejectionReason}</div>}
          </Link>
        ))}
      </div>
      {businesses?.length === 0 && !creating && <p className="muted">You have no business yet.</p>}
    </>
  );
}
