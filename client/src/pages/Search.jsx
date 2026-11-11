import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, imageUrl } from '../api.js';
import { CATEGORIES, categoryLabel } from '../format.js';

export default function Home() {
  const [params, setParams] = useSearchParams();
  const [city, setCity] = useState(params.get('city') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const page = Number(params.get('page') || 1);

  useEffect(() => {
    const q = new URLSearchParams();
    if (params.get('city')) q.set('city', params.get('city'));
    if (params.get('category')) q.set('category', params.get('category'));
    q.set('page', page);
    setError('');
    api(`/businesses?${q}`).then(setResult).catch((e) => setError(e.message));
  }, [params, page]);

  const search = (e) => {
    e.preventDefault();
    const next = {};
    if (city.trim()) next.city = city.trim();
    if (category) next.category = category;
    setParams(next);
  };

  return (
    <>
      <h1>Find and book a place</h1>
      <form className="card row" onSubmit={search}>
        <label>
          City
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Dakar" />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" style={{ flex: '0 0 auto' }}>Search</button>
      </form>

      {error && <p className="error">{error}</p>}
      {result && (
        <>
          <p className="muted">{result.total} result{result.total === 1 ? '' : 's'}</p>
          <div className="grid">
            {result.items.map((b) => (
              <Link key={b._id} to={`/businesses/${b._id}`} className="card" style={{ color: 'inherit' }}>
                {b.photoIds?.[0] && <img className="cover" src={imageUrl(b.photoIds[0])} alt="" />}
                <strong>{b.name}</strong>
                <div className="muted">{categoryLabel(b.category)} · {b.city}</div>
                <div className="muted">{b.address}</div>
              </Link>
            ))}
          </div>
          {result.pages > 1 && (
            <div className="between" style={{ marginTop: '1rem' }}>
              <button className="secondary" disabled={page <= 1} onClick={() => setParams({ ...Object.fromEntries(params), page: page - 1 })}>
                Previous
              </button>
              <span className="muted">Page {page} of {result.pages}</span>
              <button className="secondary" disabled={page >= result.pages} onClick={() => setParams({ ...Object.fromEntries(params), page: page + 1 })}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
