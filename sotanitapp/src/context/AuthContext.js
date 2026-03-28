import { createContext, useContext, useMemo, useState } from 'react';
import { createUser, getTeamIdByName } from '../api/backend';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [user, setUser] = useState(null);

  const login = (email) => {
    setIsLoggedIn(true);
    setGuestMode(false);
    setUser({
      username: 'Ronaldo10',
      email,
      position: 'Delantero',
      team: 'Real Madrid',
    });
  };

  const register = async (data) => {
    const teamId = await getTeamIdByName(data.team);

    const createdUser = await createUser({
      username: data.username,
      email: data.email,
      password: data.password,
      position: data.position,
      teamId,
      teamName: data.team,
      frameId: data.frameId || 'bronce',
    });

    setIsLoggedIn(true);
    setGuestMode(false);
    setUser({
      username: createdUser.username,
      email: createdUser.email,
      position: createdUser.position,
      team: createdUser.teamName || data.team,
      teamId: createdUser.teamId,
      frameId: createdUser.frameId,
    });

    return createdUser;
  };

  const logout = () => {
    setIsLoggedIn(false);
    setGuestMode(false);
    setUser(null);
  };

  const enterAsGuest = () => {
    setGuestMode(true);
    setIsLoggedIn(false);
    setUser(null);
  };

  const updateUser = (data) => {
    setUser((prev) => (prev ? { ...prev, ...data } : prev));
  };

  const value = useMemo(
    () => ({
      isLoggedIn,
      guestMode,
      user,
      login,
      register,
      logout,
      enterAsGuest,
      updateUser,
    }),
    [isLoggedIn, guestMode, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
