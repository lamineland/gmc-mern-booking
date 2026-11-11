import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, imageUrl } from '../../api.js';
import { STATUS_LABELS, formatDuration, formatPrice } from '../../format.js';
import BusinessForm from './BusinessForm.jsx';

export default function OwnerBusinessEdit() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api(`/owner/businesses/${id}`).then(setData).catch((e) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const run = async (fn) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!data) return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;
  const { business, services, rentalAreas } = data;

  const uploadPhoto = (file) =>
    run(() => {
      const body = new FormData();
      body.append('photo', file);
      return api(`/owner/businesses/${id}/photos`, { method: 'POST', body });
    });

  return (
    <>
      <h1>{business.name} <span className={`badge ${business.status}`}>{STATUS_LABELS[business.status]}</span></h1>
      {business.status === 'pending' && <p className="muted">Waiting for admin approval. Clients can't see it yet.</p>}
      {business.status === 'rejected' && <p className="error">Rejected: {business.rejectionReason}. Edit and save to send it for review again.</p>}
      {error && <p className="error">{error}</p>}

      <h2>Details & opening hours</h2>
      <p className="muted">Changing the name, category or city of an approved business sends it back for review.</p>
      <BusinessForm
        key={business.updatedAt}
        initial={business}
        submitLabel="Save"
        onSubmit={async (body) => {
          await api(`/owner/businesses/${id}`, { method: 'PUT', body });
          await load();
        }}
      />

      <h2>Photos</h2>
      <div className="card stack">
        <div className="photos">
          {business.photoIds.map((p) => (
            <div key={p}>
              <img src={imageUrl(p)} alt="" />
              <button className="link" onClick={() => run(() => api(`/owner/businesses/${id}/photos/${p}`, { method: 'DELETE' }))}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <label>
          Add a photo (JPEG, PNG or WebP, max 2 MB)
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files[0] && uploadPhoto(e.target.files[0])} />
        </label>
      </div>

      <h2>Rental areas</h2>
      <p className="muted">Pitches, courts, rooms… Each area is booked separately. Leave empty if you don't need them.</p>
      <ItemList
        items={rentalAreas}
        render={(a) => `${a.name}${a.type ? ` · ${a.type}` : ''} · capacity ${a.capacity}`}
        onDeactivate={(a) => run(() => api(`/owner/businesses/${id}/areas/${a._id}`, { method: 'DELETE' }))}
        onReactivate={(a) => run(() => api(`/owner/businesses/${id}/areas/${a._id}`, { method: 'PUT', body: { active: true } }))}
      />
      <AddForm
        fields={[
          { name: 'name', label: 'Name', required: true },
          { name: 'type', label: 'Type (e.g. 5-a-side)' },
          { name: 'capacity', label: 'Capacity', type: 'number', min: 1, defaultValue: 1 },
        ]}
        onSubmit={(v) => run(() => api(`/owner/businesses/${id}/areas`, { method: 'POST', body: { ...v, capacity: Number(v.capacity) || 1 } }))}
        submitLabel="Add area"
      />

      <h2>Services</h2>
      <ItemList
        items={services}
        render={(s) => `${s.name} · ${formatDuration(s.durationMin)} · ${formatPrice(s.price)}${s.usesRentalArea ? ' · needs an area' : ''}`}
        onDeactivate={(s) => run(() => api(`/owner/businesses/${id}/services/${s._id}`, { method: 'DELETE' }))}
        onReactivate={(s) => run(() => api(`/owner/businesses/${id}/services/${s._id}`, { method: 'PUT', body: { active: true } }))}
      />
      <AddForm
        fields={[
          { name: 'name', label: 'Name', required: true },
          { name: 'durationMin', label: 'Duration (min)', type: 'number', min: 5, required: true },
          { name: 'price', label: 'Price', type: 'number', min: 0, step: 'any', required: true },
          ...(rentalAreas.length ? [{ name: 'usesRentalArea', label: 'Needs a rental area', type: 'checkbox' }] : []),
        ]}
        onSubmit={(v) =>
          run(() =>
            api(`/owner/businesses/${id}/services`, {
              method: 'POST',
              body: { name: v.name, durationMin: Number(v.durationMin), price: Number(v.price), usesRentalArea: !!v.usesRentalArea },
            }),
          )
        }
        submitLabel="Add service"
      />
    </>
  );
}

function ItemList({ items, render, onDeactivate, onReactivate }) {
  if (!items.length) return <p className="muted">None yet.</p>;
  return (
    <div className="card stack">
      {items.map((item) => (
        <div key={item._id} className="between">
          <span className={item.active ? '' : 'muted'}>{render(item)}{!item.active && ' (inactive)'}</span>
          {item.active ? (
            <button className="link" onClick={() => onDeactivate(item)}>Deactivate</button>
          ) : (
            <button className="link" onClick={() => onReactivate(item)}>Reactivate</button>
          )}
        </div>
      ))}
    </div>
  );
}

function AddForm({ fields, onSubmit, submitLabel }) {
  const empty = Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? false : f.defaultValue ?? '']));
  const [values, setValues] = useState(empty);
  return (
    <form
      className="row"
      style={{ marginTop: '0.75rem' }}
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit(values);
        setValues(empty);
      }}
    >
      {fields.map(({ name, label, type = 'text', defaultValue, ...rest }) =>
        type === 'checkbox' ? (
          <label key={name} style={{ color: 'var(--text)', alignSelf: 'center' }}>
            <input type="checkbox" checked={values[name]} onChange={(e) => setValues({ ...values, [name]: e.target.checked })} />
            {label}
          </label>
        ) : (
          <label key={name}>
            {label}
            <input type={type} value={values[name]} onChange={(e) => setValues({ ...values, [name]: e.target.value })} {...rest} />
          </label>
        ),
      )}
      <button type="submit" style={{ flex: '0 0 auto' }}>{submitLabel}</button>
    </form>
  );
}
