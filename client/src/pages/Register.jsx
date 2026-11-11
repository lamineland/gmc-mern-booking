import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { homeFor } from './Login.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const initialRole = location.state?.role === 'owner' ? 'owner' : 'client';
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: initialRole });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await register({ ...form, phone: form.phone || undefined });
      // A player who was sent here from a "Réserver" button goes back to where they were heading.
      const from = user.role === 'client' ? location.state?.from : null;
      navigate(from ?? homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="auth-card stack" onSubmit={submit}>
      <h1>Créer un compte</h1>
      <div className="tabs">
        <button type="button" className={form.role === 'client' ? 'active' : ''} onClick={() => setForm({ ...form, role: 'client' })}>
          Je veux réserver
        </button>
        <button type="button" className={form.role === 'owner' ? 'active' : ''} onClick={() => setForm({ ...form, role: 'owner' })}>
          J’ai un complexe
        </button>
      </div>
      <label>Nom<input value={form.name} onChange={set('name')} required minLength={2} autoComplete="name" /></label>
      <label>E-mail<input type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></label>
      <label>Téléphone (facultatif)<input type="tel" value={form.phone} onChange={set('phone')} placeholder="+221 77 000 00 00" autoComplete="tel" /></label>
      <label>Mot de passe (8 caractères minimum)<input type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" /></label>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>S’inscrire</button>
      <p className="muted">Déjà un compte ? <Link to="/login" state={location.state}>Se connecter</Link></p>
    </form>
  );
}
