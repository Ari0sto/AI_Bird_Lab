import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import * as SecureStore from 'expo-secure-store';

import { checkUserToken, loginUser } from '@/services/auth';

const SESSION_KEY = 'birdlab_session';

type Session = {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type AuthContextType = {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore the saved session when the application starts.
  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const saved = await SecureStore.getItemAsync(SESSION_KEY);

        if (saved) {
          const parsed = JSON.parse(saved) as Session;

          if (
            parsed.accessToken &&
            typeof parsed.expiresAt === 'number' &&
            parsed.expiresAt > Date.now()
          ) {
            if (active) {
              setSession(parsed);
            }
          } else {
            await SecureStore.deleteItemAsync(SESSION_KEY);
          }
        }
      } catch (error) {
        console.warn('Could not restore session:', error);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  async function signIn(email: string, password: string) {
    const result = await loginUser(email, password);

    // Verify that the token works with a protected endpoint.
    await checkUserToken(result.accessToken);

    const newSession: Session = {
      email,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: Date.now() + result.expiresIn * 1000,
    };

    await SecureStore.setItemAsync(
      SESSION_KEY,
      JSON.stringify(newSession)
    );

    setSession(newSession);
  }

  async function signOut() {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    setSession(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}