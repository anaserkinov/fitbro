import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setBackButton, inTelegram } from './tg.js';
import { makeFmt } from './format.js';
import { setLanguage } from './i18n.js';
import { localDate } from '../../tgcloud/lib/dates.js';

// ── Signed-in user ───────────────────────────────────────────────────────────

const UserCtx = createContext(null);

export function UserProvider({ user, setUser, children }) {
  setLanguage(user?.language);   // before anything below renders text
  const value = useMemo(() => ({ user, setUser, fmt: makeFmt(user), today: localDate(user?.timezone || 'UTC') }), [user]);
  return <UserCtx.Provider value={value}>{children}</UserCtx.Provider>;
}

export const useUser = () => useContext(UserCtx);

// ── Navigation: five tabs, each with a push/pop stack of screens ─────────────

const NavCtx = createContext(null);
let nextKey = 1;

export function NavProvider({ children }) {
  const [tab, setTabState] = useState('home');
  const [stack, setStack] = useState([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const push = useCallback((screen, params = {}) => {
    setStack((s) => [...s, { screen, params, key: nextKey++ }]);
    window.scrollTo(0, 0);
  }, []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const replace = useCallback((screen, params = {}) => setStack((s) => [...s.slice(0, -1), { screen, params, key: nextKey++ }]), []);
  const setTab = useCallback((t) => { setStack([]); setTabState(t); window.scrollTo(0, 0); }, []);
  const reset = useCallback((t = 'home') => { setStack([]); setTabState(t); }, []);

  useEffect(() => {
    setBackButton(stack.length ? () => setStack((s) => s.slice(0, -1)) : null);
  }, [stack.length]);

  const value = useMemo(() => ({ tab, stack, top: stack[stack.length - 1] || null, push, pop, replace, setTab, reset, showDevBack: !inTelegram && stack.length > 0 }), [tab, stack, push, pop, replace, setTab, reset]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export const useNav = () => useContext(NavCtx);
