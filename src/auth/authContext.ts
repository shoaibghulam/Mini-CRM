import { createContext, useContext } from 'react';
import type { ProfileRow } from '@/lib/database.types';

export type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'signedOut' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly profile: ProfileRow };

export interface AuthContextValue {
  readonly state: AuthState;
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** For screens behind RequireAuth: the profile is guaranteed there. */
export function useProfile(): ProfileRow {
  const { state } = useAuth();
  if (state.status !== 'ready') throw new Error('useProfile used outside an authenticated route');
  return state.profile;
}
