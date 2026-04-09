import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createUser, getTeamIdByName, updateUser as updateUserAPI, loginUser as loginUserAPI } from '../api/backend';

const AuthContext = createContext(undefined);
const AUTH_STORAGE_KEY = 'sotanita_auth_session_v1';

async function persistSession(session) {
  try {
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Error guardando sesion:', error);
  }
}

async function clearPersistedSession() {
  try {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (error) {
    console.error('Error limpiando sesion:', error);
  }
}

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) {
          setAuthLoading(false);
          return;
        }

        const session = JSON.parse(raw);
        if (session?.isLoggedIn && session?.user?.id) {
          setIsLoggedIn(true);
          setGuestMode(false);
          setUser(session.user);
        } else if (session?.guestMode) {
          setGuestMode(true);
          setIsLoggedIn(false);
          setUser(null);
        }
      } catch (error) {
        console.error('Error restaurando sesion:', error);
      } finally {
        setAuthLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (email, password) => {
    try {
      const userData = await loginUserAPI(email, password);

      const normalizedUser = {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        position: userData.position,
        team: userData.teamName,
        teamId: userData.teamId,
        frameId: userData.frameId,
        teamImageUrl: userData.teamImageUrl,
        frameImageId: userData.frameImageUrl || userData.frameImageId,
      };

      setIsLoggedIn(true);
      setGuestMode(false);
      setUser(normalizedUser);

      await persistSession({
        isLoggedIn: true,
        guestMode: false,
        user: normalizedUser,
      });

      return userData;
    } catch (error) {
      setIsLoggedIn(false);
      setGuestMode(false);
      setUser(null);
      await clearPersistedSession();
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

    const normalizedUser = {
      id: createdUser.id,
      username: createdUser.username,
      email: createdUser.email,
      position: createdUser.position,
      team: createdUser.teamName || data.team,
      teamId: createdUser.teamId,
      frameId: createdUser.frameId,
      teamImageUrl: createdUser.teamImageUrl,
      frameImageId: createdUser.frameImageUrl || createdUser.frameImageId,
    };

    setIsLoggedIn(true);
    setGuestMode(false);
    setUser(normalizedUser);

    await persistSession({
      isLoggedIn: true,
      guestMode: false,
      user: normalizedUser,
    });

    return createdUser;
  };

  const logout = () => {
    setIsLoggedIn(false);
    setGuestMode(false);
    setUser(null);
    clearPersistedSession();
  };

  const enterAsGuest = () => {
    setGuestMode(true);
    setIsLoggedIn(false);
    setUser(null);
    persistSession({
      isLoggedIn: false,
      guestMode: true,
      user: null,
    });
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

          const mergedUser = {
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

          persistSession({
            isLoggedIn: true,
            guestMode: false,
            user: mergedUser,
          });

          return mergedUser;
        });
        return;
      }

      setUser((prev) => {
        if (!prev) return prev;
        const mergedUser = { ...prev, ...data };

        persistSession({
          isLoggedIn: true,
          guestMode: false,
          user: mergedUser,
        });

        return mergedUser;
      });
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
      authLoading,
      login,
      register,
      logout,
      enterAsGuest,
      updateUser,
    }),
    [isLoggedIn, guestMode, user, authLoading]
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
