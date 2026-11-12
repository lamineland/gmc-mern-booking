import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Icon } from '../components/icons.jsx';

export const homeFor = (role) => ({ owner: '/owner/calendar', admin: '/admin/businesses' })[role] ?? '/search';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const fromBooking = location.state?.reason === 'book';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login(identifier, password);
      // Only players book; owners and admins go to their own area.
      const from = user.role === 'client' ? location.state?.from : null;
      navigate(from ?? homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="auth-card stack" onSubmit={submit}>
      <h1>Connexion</h1>
      {fromBooking && (
        <p className="notice"><Icon name="lock" size={18} /> Connecte-toi pour réserver un terrain.</p>
      )}
      <label>Téléphone ou e-mail<input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoComplete="username" placeholder="77 123 45 67" /></label>
      <label>Mot de passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>Se connecter</button>
      <p className="muted">
        Pas encore de compte ? <Link to="/register" state={location.state}>Créer un compte</Link>
      </p>
    </form>
  );
}
