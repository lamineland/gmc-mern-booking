import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Home from './pages/Home.jsx';
import BusinessPage from './pages/BusinessPage.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import MyBookings from './pages/MyBookings.jsx';
import OwnerDashboard from './pages/owner/OwnerDashboard.jsx';
import OwnerBusinesses from './pages/owner/OwnerBusinesses.jsx';
import OwnerBusinessEdit from './pages/owner/OwnerBusinessEdit.jsx';
import AdminBusinesses from './pages/admin/AdminBusinesses.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';

function RequireRole({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="nav">
      <Link to="/" className="brand">Booking</Link>
      <nav>
        <NavLink to="/" end>Search</NavLink>
        {user?.role === 'client' && <NavLink to="/bookings">My bookings</NavLink>}
        {user?.role === 'owner' && (
          <>
            <NavLink to="/owner" end>Dashboard</NavLink>
            <NavLink to="/owner/businesses">My businesses</NavLink>
          </>
        )}
        {user?.role === 'admin' && (
          <>
            <NavLink to="/admin/businesses">Businesses</NavLink>
            <NavLink to="/admin/users">Users</NavLink>
          </>
        )}
        {user ? (
          <button
            className="link"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            Log out ({user.name})
          </button>
        ) : (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/register">Sign up</NavLink>
          </>
        )}
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/businesses/:id" element={<BusinessPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/bookings" element={<RequireRole roles={['client']}><MyBookings /></RequireRole>} />
          <Route path="/owner" element={<RequireRole roles={['owner']}><OwnerDashboard /></RequireRole>} />
          <Route path="/owner/businesses" element={<RequireRole roles={['owner']}><OwnerBusinesses /></RequireRole>} />
          <Route path="/owner/businesses/:id" element={<RequireRole roles={['owner']}><OwnerBusinessEdit /></RequireRole>} />
          <Route path="/admin/businesses" element={<RequireRole roles={['admin']}><AdminBusinesses /></RequireRole>} />
          <Route path="/admin/users" element={<RequireRole roles={['admin']}><AdminUsers /></RequireRole>} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}
