import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { STATUS_LABELS } from '../../format.js';

export default function AdminUsers() {
  const [filters, setFilters] = useState({ q: '', role: '', status: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => {
    const q = new URLSearchParams({ page });
    Object.entries(filters).forEach(([k, v]) => v && q.set(k, v));
    api(`/admin/users?${q}`).then(setData).catch((e) => setError(e.message));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [filters, page]);

  const act = async (fn) => {
    setError('');
    setNotice('');
    try {
      const res = await fn();
      if (res?.upcomingBookingsAffected) {
        setNotice(`This owner has ${res.upcomingBookingsAffected} upcoming booking(s). Their businesses are now hidden.`);
      }
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const setFilter = (k) => (e) => {
    setPage(1);
    setFilters({ ...filters, [k]: e.target.value });
  };

  return (
    <>
      <h1>Users</h1>
      <div className="card row" style={{ marginBottom: '1rem' }}>
        <label>Search<input value={filters.q} onChange={setFilter('q')} placeholder="Name or email" /></label>
        <label>
          Role
          <select value={filters.role} onChange={setFilter('role')}>
            <option value="">All</option>
            <option value="client">Client</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={setFilter('status')}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td><span className={`badge ${u.status}`}>{STATUS_LABELS[u.status]}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {u.role !== 'admin' && (
                    <>
                      {u.status === 'active' ? (
                        <button className="link" onClick={() => act(() => api(`/admin/users/${u._id}/suspend`, { method: 'PATCH' }))}>Suspend</button>
                      ) : (
                        <button className="link" onClick={() => act(() => api(`/admin/users/${u._id}/reactivate`, { method: 'PATCH' }))}>Reactivate</button>
                      )}{' '}
                      <button
                        className="link"
                        style={{ color: 'var(--danger)', marginLeft: '0.75rem' }}
                        onClick={() => window.confirm(`Delete ${u.email}? This cannot be undone.`) && act(() => api(`/admin/users/${u._id}`, { method: 'DELETE' }))}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.pages > 1 && (
        <div className="between" style={{ marginTop: '1rem' }}>
          <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted">Page {page} of {data.pages}</span>
          <button className="secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
