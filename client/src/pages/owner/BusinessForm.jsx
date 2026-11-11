import { useState } from 'react';
import { CATEGORIES, DAYS } from '../../format.js';

const defaultHours = () =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, closed: day === 0, open: '09:00', close: '18:00' }));

// The form edits one opening interval per day; the API supports several (e.g. lunch break).
function toFormHours(openingHours) {
  if (!openingHours?.length) return defaultHours();
  return [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const intervals = openingHours.find((h) => h.day === day)?.intervals ?? [];
    if (!intervals.length) return { day, closed: true, open: '09:00', close: '18:00' };
    return { day, closed: false, open: intervals[0].open, close: intervals[intervals.length - 1].close, split: intervals.length > 1 ? intervals : null };
  });
}

const toApiHours = (hours) =>
  hours.map((h) => ({ day: h.day, intervals: h.closed ? [] : h.split ?? [{ open: h.open, close: h.close }] }));

export default function BusinessForm({ initial, onSubmit, submitLabel }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    category: initial?.category ?? 'salon',
    description: initial?.description ?? '',
    city: initial?.city ?? '',
    address: initial?.address ?? '',
    phone: initial?.phone ?? '',
    slotStepMinutes: initial?.slotStepMinutes ?? 30,
    timezone: initial?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [hours, setHours] = useState(toFormHours(initial?.openingHours));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setDay = (day, patch) => setHours(hours.map((h) => (h.day === day ? { ...h, ...patch, split: null } : h)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      await onSubmit({
        ...form,
        phone: form.phone || undefined,
        slotStepMinutes: Number(form.slotStepMinutes),
        openingHours: toApiHours(hours),
      });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="row">
        <label>Name<input value={form.name} onChange={set('name')} required minLength={2} /></label>
        <label>
          Category
          <select value={form.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      </div>
      <label>Description<textarea rows={3} value={form.description} onChange={set('description')} /></label>
      <div className="row">
        <label>City<input value={form.city} onChange={set('city')} required /></label>
        <label>Address<input value={form.address} onChange={set('address')} required /></label>
        <label>Phone<input value={form.phone} onChange={set('phone')} /></label>
      </div>
      <div className="row">
        <label>
          Time between slot starts
          <select value={form.slotStepMinutes} onChange={set('slotStepMinutes')}>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
          </select>
        </label>
        <label>Timezone<input value={form.timezone} onChange={set('timezone')} required /></label>
      </div>

      <strong>Opening hours</strong>
      {hours.map((h) => (
        <div key={h.day} className="row" style={{ alignItems: 'center' }}>
          <span style={{ flex: '0 0 110px' }}>{DAYS[h.day]}</span>
          <label style={{ flex: '0 0 100px', color: 'var(--text)' }}>
            <input type="checkbox" checked={h.closed} onChange={(e) => setDay(h.day, { closed: e.target.checked })} />
            Closed
          </label>
          {!h.closed && (
            h.split ? (
              <span className="muted">{h.split.map((i) => `${i.open}–${i.close}`).join(', ')} (edit to replace)</span>
            ) : (
              <>
                <input type="time" value={h.open} onChange={(e) => setDay(h.day, { open: e.target.value })} />
                <input type="time" value={h.close} onChange={(e) => setDay(h.day, { close: e.target.value })} />
              </>
            )
          )}
        </div>
      ))}

      {error && <p className="error">{error}</p>}
      {saved && <p className="success">Saved.</p>}
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
