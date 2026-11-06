import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchProfile } from '@/api/profiles';
import { describeError } from '@/domain/errors';
import { notifyError } from '@/lib/notify';
import { AuthContext, type AuthContextValue, type AuthState } from '@/auth/authContext';

const MISSING_PROFILE = 'Для этого пользователя не создан профиль. Обратитесь к администратору.';

/**
 * Session comes from Supabase Auth; the role comes from `profiles` (never from
 * user_metadata, which a user can edit). The role only drives the UI — RLS uses
 * the same table on the server.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        setSession(data.session);
      })
      .catch((err: unknown) => {
        notifyError(err);
        setSession(null);
      });
    // Do not call Supabase inside this callback (it can deadlock); just store the session.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Re-load the profile only when the user changes, not on every token refresh.
  const userId = session === undefined ? undefined : (session?.user.id ?? null);
  useEffect(() => {
    if (userId === undefined) return;
    if (userId === null) {
      setState({ status: 'signedOut' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    fetchProfile(userId)
      .then((profile) => {
        if (cancelled) return;
        setState(profile ? { status: 'ready', profile } : { status: 'error', message: MISSING_PROFILE });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: describeError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
