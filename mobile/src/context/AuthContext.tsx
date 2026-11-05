import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiRequest } from '@/services/api';
import {
  loginUser,
  refreshUser,
  registerUser,
  type IdentityTokens,
} from '@/services/auth';

const SESSION_KEY = 'birdlab_session';
const EXPIRY_MARGIN_MS = 60_000;

type Session = {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  authenticatedFetch: (path: string, options?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function createSession(email: string, tokens: IdentityTokens): Session {
  return {
    email,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);
  const refreshInProgress = useRef<Promise<Session> | null>(null);

  const saveSession = useCallback(async (value: Session) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(value));
    sessionRef.current = value;
    setSession(value);
  }, []);

  const signOut = useCallback(async () => {
    sessionRef.current = null;
    setSession(null);
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }, []);

  const renewSession = useCallback(async (): Promise<Session> => {
    if (refreshInProgress.current) return refreshInProgress.current;

    const pending = (async () => {
      const current = sessionRef.current;
      if (!current?.refreshToken) throw new Error('No refresh token is available.');
      const tokens = await refreshUser(current.refreshToken);
      const next = createSession(current.email, tokens);
      // Do not restore a session after the user logged out during the request.
      if (sessionRef.current !== current) {
        throw new Error('The session has changed.');
      }
      await saveSession(next);
      return next;
    })();

    refreshInProgress.current = pending;
    try {
      return await pending;
    } finally {
      if (refreshInProgress.current === pending) refreshInProgress.current = null;
    }
  }, [saveSession]);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const raw = await SecureStore.getItemAsync(SESSION_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as Session;
        if (!saved.accessToken || !saved.refreshToken || !saved.email ||
            typeof saved.expiresAt !== 'number') {
          await SecureStore.deleteItemAsync(SESSION_KEY);
          return;
        }
        if (!active) return;
        sessionRef.current = saved;
        setSession(saved);
        if (saved.expiresAt <= Date.now() + EXPIRY_MARGIN_MS) {
          try {
            await renewSession();
          } catch {
            if (active) await signOut();
          }
        }
      } catch (error) {
        console.warn('Session restore failed:', error);
        if (active) await signOut();
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void restore();
    return () => { active = false; };
  }, [renewSession, signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim();
    const tokens = await loginUser(cleanEmail, password);
    await saveSession(createSession(cleanEmail, tokens));
  }, [saveSession]);

  const signUp = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim();
    await registerUser(cleanEmail, password);
    await signIn(cleanEmail, password);
  }, [signIn]);

  const authenticatedFetch = useCallback(async (
    path: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    let current = sessionRef.current;
    if (!current) throw new Error('Please sign in first.');

    if (current.expiresAt <= Date.now() + EXPIRY_MARGIN_MS) {
      try {
        current = await renewSession();
      } catch {
        await signOut();
        throw new Error('Session expired. Please sign in again.');
      }
    }

    async function send(token: string) {
      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return apiRequest(path, { ...options, headers });
    }

    let response = await send(current.accessToken);
    if (response.status === 401) {
      try {
        current = await renewSession();
        response = await send(current.accessToken);
      } catch {
        await signOut();
        throw new Error('Session expired. Please sign in again.');
      }
      if (response.status === 401) {
        await signOut();
        throw new Error('Session expired. Please sign in again.');
      }
    }
    return response;
  }, [renewSession, signOut]);

  return (
    <AuthContext.Provider value={{
      session, isLoading, signIn, signUp, signOut, authenticatedFetch,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
