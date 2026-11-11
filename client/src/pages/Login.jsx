import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export const homeFor = (role) => ({ owner: '/owner', admin: '/admin/businesses' })[role] ?? '/';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login(email, password);
      navigate(location.state?.from ?? homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="card stack" onSubmit={submit} style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1>Log in</h1>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <p className="error">{error}</p>}
      <button type="submit">Log in</button>
      <p className="muted">No account? <Link to="/register">Sign up</Link></p>
    </form>
  );
}
