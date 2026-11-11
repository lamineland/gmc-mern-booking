import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { homeFor } from './Login.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'client' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await register({ ...form, phone: form.phone || undefined });
      navigate(homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="card stack" onSubmit={submit} style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1>Create an account</h1>
      <div className="tabs">
        <button type="button" className={form.role === 'client' ? 'active' : ''} onClick={() => setForm({ ...form, role: 'client' })}>
          I want to book
        </button>
        <button type="button" className={form.role === 'owner' ? 'active' : ''} onClick={() => setForm({ ...form, role: 'owner' })}>
          I own a business
        </button>
      </div>
      <label>Name<input value={form.name} onChange={set('name')} required minLength={2} /></label>
      <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
      <label>Phone (optional)<input value={form.phone} onChange={set('phone')} /></label>
      <label>Password (8+ characters)<input type="password" value={form.password} onChange={set('password')} required minLength={8} /></label>
      {error && <p className="error">{error}</p>}
      <button type="submit">Sign up</button>
      <p className="muted">Already have an account? <Link to="/login">Log in</Link></p>
    </form>
  );
}
