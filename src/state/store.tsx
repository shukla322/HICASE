import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type Dispatch, type ReactNode,
} from 'react';
import type { AppState, FeedKey } from '../domain/types';
import { initialState, nowOf, reducer, type Action } from './reducer';

const STORAGE_KEY = 'hicase.workbench.v1';
const CALL_TICK_MS = 250;

/** State survives a refresh. Storage can be blocked, so every access is guarded. */
const load = (): AppState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : initialState();
  } catch {
    return initialState();
  }
};

const save = (s: AppState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* The demo still works for this session. */
  }
};

interface Store {
  state: AppState;
  now: Date;
  dispatch: Dispatch<Action>;
  toast: (message: string) => void;
  toastMessage: string;
  sources: { id: string; feed?: FeedKey } | null;
  openSources: (id: string, feed?: FeedKey) => void;
  closeSources: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const [toastMessage, setToast] = useState('');
  const [sources, setSources] = useState<Store['sources']>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => save(state), [state]);

  const onCall = Object.values(state.cases).some((c) => c.call);
  useEffect(() => {
    if (!onCall) return undefined;
    const t = window.setInterval(() => dispatch({ type: 'callTick' }), CALL_TICK_MS);
    return () => window.clearInterval(t);
  }, [onCall]);

  const toast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

  const openSources = useCallback((id: string, feed?: FeedKey) => setSources({ id, feed }), []);
  const closeSources = useCallback(() => setSources(null), []);

  const value = useMemo(
    () => ({ state, now: nowOf(state), dispatch, toast, toastMessage, sources, openSources, closeSources }),
    [state, toast, toastMessage, sources, openSources, closeSources],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = (): Store => {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore needs StoreProvider');
  return s;
};
