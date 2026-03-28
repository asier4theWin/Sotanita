import { createContext, useContext, useMemo, useState } from 'react';
import { createUser, getTeamIdByName, updateUser as updateUserAPI, loginUser as loginUserAPI } from '../api/backend';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [user, setUser] = useState(null);

  const login = async (email, password) => {
    try {
      const userData = await loginUserAPI(email, password);

      setIsLoggedIn(true);
      setGuestMode(false);
      setUser({
        id: userData.id,
        username: userData.username,
        email: userData.email,
        position: userData.position,
        team: userData.teamName,
        teamId: userData.teamId,
        frameId: userData.frameId,
        teamImageUrl: userData.teamImageUrl,
        frameImageId: userData.frameImageUrl || userData.frameImageId,
      });

      return userData;
    } catch (error) {
      setIsLoggedIn(false);
      setGuestMode(false);
      setUser(null);
      throw error;
    }
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
      id: createdUser.id,
      username: createdUser.username,
      email: createdUser.email,
      position: createdUser.position,
      team: createdUser.teamName || data.team,
      teamId: createdUser.teamId,
      frameId: createdUser.frameId,
      teamImageUrl: createdUser.teamImageUrl,
      frameImageId: createdUser.frameImageUrl || createdUser.frameImageId,
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

  const updateUser = async (data) => {
    if (!user || !user.id) {
      console.warn('No se puede actualizar: usuario sin id');
      return;
    }

    try {
      const payload = {};

      if (data.username && data.username !== user.username) {
        payload.username = data.username;
      }

      if (data.team && data.team !== user.team) {
        payload.teamName = data.team;
      }

      if (data.position && data.position !== user.position) {
        payload.position = data.position;
      }

      if (Object.keys(payload).length > 0) {
        const updatedUser = await updateUserAPI(user.id, payload);

        setUser((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            id: updatedUser.id ?? prev.id,
            username: updatedUser.username ?? prev.username,
            email: updatedUser.email ?? prev.email,
            position: updatedUser.position ?? prev.position,
            team: updatedUser.teamName ?? data.team ?? prev.team,
            teamId: updatedUser.teamId ?? prev.teamId,
            frameId: updatedUser.frameId ?? prev.frameId,
            teamImageUrl: updatedUser.teamImageUrl ?? prev.teamImageUrl,
            frameImageId: updatedUser.frameImageUrl ?? updatedUser.frameImageId ?? prev.frameImageId,
          };
        });
        return;
      }

      setUser((prev) => (prev ? { ...prev, ...data } : prev));
    } catch (error) {
      console.error('Error actualizando usuario:', error);
      throw error;
    }
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
