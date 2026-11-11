import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Logo from './components/Logo.jsx';
import { Icon } from './components/icons.jsx';
import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import BusinessPage from './pages/BusinessPage.jsx';
import VenuePage from './pages/VenuePage.jsx';
import Checkout from './pages/Checkout.jsx';
import PaymentStatus from './pages/PaymentStatus.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import MyBookings from './pages/MyBookings.jsx';
import OwnerDashboard from './pages/owner/OwnerDashboard.jsx';
import OwnerCalendar from './pages/owner/OwnerCalendar.jsx';
import OwnerPricing from './pages/owner/OwnerPricing.jsx';
import OwnerBusinesses from './pages/owner/OwnerBusinesses.jsx';
import OwnerBusinessEdit from './pages/owner/OwnerBusinessEdit.jsx';
import AdminBusinesses from './pages/admin/AdminBusinesses.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';

function RequireRole({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="muted">Chargement…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Link to="/" aria-label="WinPitch, accueil"><Logo /></Link>
        <button className="menu-toggle" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={open ? 'close' : 'menu'} size={24} />
        </button>
        <nav className={`site-nav ${open ? 'open' : ''}`}>
          <NavLink to="/search">Trouver un terrain</NavLink>
          {user?.role === 'client' && <NavLink to="/bookings">Mes réservations</NavLink>}
          {user?.role === 'owner' && (
            <>
              <NavLink to="/owner/calendar">Calendrier</NavLink>
              <NavLink to="/owner/pricing">Tarifs</NavLink>
              <NavLink to="/owner" end>Tableau de bord</NavLink>
              <NavLink to="/owner/businesses">Mes complexes</NavLink>
            </>
          )}
          {user?.role === 'admin' && (
            <>
              <NavLink to="/admin/businesses">Complexes</NavLink>
              <NavLink to="/admin/users">Utilisateurs</NavLink>
            </>
          )}
          {!user && <NavLink to="/register" state={{ role: 'owner' }}>Propriétaires</NavLink>}
          <span className="nav-sep" />
          {user ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              Déconnexion · {user.name.split(' ')[0]}
            </button>
          ) : (
            <>
              <NavLink to="/login" className="nav-login">Connexion</NavLink>
              <Link to="/register" className="btn btn-primary btn-sm">S’inscrire</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <div>
          <Logo variant="light" size={32} />
          <p>Réserve ton terrain de foot ou de basket en 1 minute.</p>
        </div>
        <nav>
          <Link to="/search">Trouver un terrain</Link>
          <Link to="/register" state={{ role: 'owner' }}>Inscrire mon complexe</Link>
          <Link to="/login">Connexion</Link>
        </nav>
        <p className="footer-meta">© {new Date().getFullYear()} WinPitch · Dakar, Sénégal</p>
      </div>
    </footer>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const isLanding = pathname === '/';

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="app">
      <Header />
      <main className={isLanding ? '' : 'container'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/venues/:id" element={<VenuePage />} />
          <Route path="/checkout" element={<RequireRole roles={['client']}><Checkout /></RequireRole>} />
          <Route path="/payment/:ref" element={<RequireRole roles={['client']}><PaymentStatus /></RequireRole>} />
          <Route path="/businesses/:id" element={<BusinessPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/bookings" element={<RequireRole roles={['client']}><MyBookings /></RequireRole>} />
          <Route path="/owner" element={<RequireRole roles={['owner']}><OwnerDashboard /></RequireRole>} />
          <Route path="/owner/calendar" element={<RequireRole roles={['owner']}><OwnerCalendar /></RequireRole>} />
          <Route path="/owner/pricing" element={<RequireRole roles={['owner']}><OwnerPricing /></RequireRole>} />
          <Route path="/owner/businesses" element={<RequireRole roles={['owner']}><OwnerBusinesses /></RequireRole>} />
          <Route path="/owner/businesses/:id" element={<RequireRole roles={['owner']}><OwnerBusinessEdit /></RequireRole>} />
          <Route path="/admin/businesses" element={<RequireRole roles={['admin']}><AdminBusinesses /></RequireRole>} />
          <Route path="/admin/users" element={<RequireRole roles={['admin']}><AdminUsers /></RequireRole>} />
          <Route path="*" element={<p>Page introuvable.</p>} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
