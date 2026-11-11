import { createContext, useContext, useEffect, useState } from 'react';
import { api, refreshSession, setAccessToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    refreshSession()
      .then(setUser)
      .finally(() => setReady(true));
  }, []);

  const startSession = ({ user, accessToken }) => {
    setAccessToken(accessToken);
    setUser(user);
    return user;
  };

  const value = {
    user,
    ready,
    login: async (email, password) => startSession(await api('/auth/login', { method: 'POST', body: { email, password } })),
    register: async (data) => startSession(await api('/auth/register', { method: 'POST', body: data })),
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      setAccessToken(null);
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
