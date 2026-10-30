import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, get, mutate, renewSessionRequests } from './http';

export type User = { id: string; name: string; email: string; role: 'cliente' | 'barbero' | 'admin' };
type State = { status: 'checking' | 'authenticated' | 'anonymous' | 'error'; user: User | null; error?: string };
type Session = State & { refresh: () => Promise<void>; authenticate: (kind: 'login' | 'register', data: object) => Promise<User>; logout: () => Promise<void> };
const Context = createContext<Session | null>(null);

function identity(value: unknown): User {
  const user = value as User | undefined;
  if (!user || typeof user.id !== 'string' || typeof user.name !== 'string' || typeof user.email !== 'string'
    || !['cliente', 'barbero', 'admin'].includes(user.role)) throw new ApiError(502, 'No pudimos verificar tu cuenta. Inténtalo de nuevo.');
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'checking', user: null });
  const generation = useRef(0);
  const busy = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const invalidate = useCallback(() => {
    renewSessionRequests();
    generation.current++;
    setState({ status: 'anonymous', user: null });
  }, []);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    renewSessionRequests();
    const current = ++generation.current;
    // Revalidar sin desmontar formularios ni perder el foco al volver a la pestaña.
    // El primer montaje ya comienza en checking; errores/401 retiran la identidad.
    try {
      const response = await get<{ user: unknown }>('/auth/me');
      if (current === generation.current) setState({ status: 'authenticated', user: identity(response.user) });
    } catch (error) {
      if (current !== generation.current) return;
      setState(error instanceof ApiError && error.status === 401 ? { status: 'anonymous', user: null }
        : { status: 'error', user: null, error: error instanceof Error ? error.message : 'No pudimos comprobar tu sesión.' });
    }
  }, []);
  useEffect(() => {
    const sync = () => { if (document.visibilityState === 'visible') void refresh(); };
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('linderos-session');
      channel.current.onmessage = () => void refresh();
    }
    window.addEventListener('session-invalid', invalidate);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    void refresh();
    return () => {
      generation.current++;
      channel.current?.close();
      window.removeEventListener('session-invalid', invalidate);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [refresh, invalidate]);

  const authenticate = async (kind: 'login' | 'register', data: object) => {
    if (busy.current) throw new Error('Hay una solicitud en curso.');
    busy.current = true;
    renewSessionRequests();
    generation.current++;
    try {
      await mutate('/auth/' + kind, data);
      const response = await get<{ user: unknown }>('/auth/me');
      const user = identity(response.user);
      setState({ status: 'authenticated', user });
      channel.current?.postMessage('changed');
      return user;
    } finally { busy.current = false; }
  };
  const logout = async () => {
    if (busy.current) throw new Error('Hay una solicitud en curso.');
    busy.current = true;
    renewSessionRequests();
    generation.current++;
    try {
      await mutate('/auth/logout');
      invalidate();
      channel.current?.postMessage('changed');
    } finally { busy.current = false; }
  };
  return <Context.Provider value={{ ...state, refresh, authenticate, logout }}>{children}</Context.Provider>;
}

export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error('Falta SessionProvider.');
  return value;
}
