import { useEffect, useRef, useState } from 'react';
import { tg, inTelegram } from './tg.js';

// call(name, input) → result. Every call goes to the server's single `api` endpoint as
// { fn: name, input } (tgcloud/lib/api-routes.js lists the names). Inside Telegram it
// goes through Serverless.call (which attaches the verified init data); in a browser it
// posts to the dev server.

export class ApiError extends Error {
  constructor(message, type, parameters) {
    super(message);
    this.type = type;
    this.parameters = parameters || {};
    this.code = this.parameters.code;
    this.field = this.parameters.field;
  }
}

export function call(name, input = {}) {
  const body = { fn: name, input };
  if (inTelegram && tg.Serverless) {
    return new Promise((resolve, reject) => {
      tg.Serverless.call('api', body, (err, result) => {
        if (err) reject(new ApiError(err.message, err.type, err.parameters));
        else resolve(result);
      });
    });
  }
  return fetch('/api/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => {
    const body = await res.json().catch(() => null);
    if (body && body.ok) return body.result;
    throw new ApiError(body?.description || `Request failed (${res.status})`, body?.error_type, body?.parameters);
  });
}

// ── Tiny query cache ──────────────────────────────────────────────────────────
// useApi shows cached data instantly and always refetches on mount (stale-while-
// revalidate). invalidate(...names) refetches mounted queries for those endpoints.

const cache = new Map();
const listeners = new Set();
const keyOf = (name, input) => `${name}:${JSON.stringify(input || {})}`;

export function useApi(name, input, { skip = false } = {}) {
  const key = keyOf(name, input);
  const [state, setState] = useState(() => ({ key, data: cache.get(key), error: null, loading: !cache.has(key) }));
  const [nonce, setNonce] = useState(0);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    const onInvalidate = (names) => { if (!names || names.includes(name)) setNonce((n) => n + 1); };
    listeners.add(onInvalidate);
    return () => listeners.delete(onInvalidate);
  }, [name]);

  useEffect(() => {
    if (skip) return undefined;
    let alive = true;
    setState((s) => ({ key, data: cache.has(key) ? cache.get(key) : s.key === key ? s.data : undefined, error: null, loading: true }));
    call(name, inputRef.current).then(
      (data) => { cache.set(key, data); if (alive) setState({ key, data, error: null, loading: false }); },
      (error) => { if (alive) setState((s) => ({ ...s, error, loading: false })); },
    );
    return () => { alive = false; };
  }, [key, nonce, skip]);

  const data = state.key === key ? state.data : cache.get(key);
  return {
    data,
    error: state.error,
    loading: state.loading,
    reload: () => setNonce((n) => n + 1),
    // Accepts a value or an updater (current => next), like React's setState.
    setData: (d) => setState((s) => {
      const next = typeof d === 'function' ? d(s.key === key ? s.data : cache.get(key)) : d;
      cache.set(key, next);
      return { ...s, key, data: next };
    }),
  };
}

export function invalidate(...names) {
  for (const k of [...cache.keys()]) if (!names.length || names.some((n) => k.startsWith(`${n}:`))) cache.delete(k);
  for (const l of listeners) l(names.length ? names : null);
}

// Endpoints whose data changes after each kind of write.
export const AFFECTS = {
  workout: ['getWorkout', 'getToday', 'getMyProgram', 'listPrograms', 'listWorkouts', 'getConsistency', 'getMuscleVolume', 'getExerciseHistory', 'listRoutines', 'listExercises', 'getGroup', 'getGroupFeed', 'getAchievements', 'listChallenges'],
  food: ['getFoodDay', 'getToday', 'searchFoods', 'browseFoods'],
  body: ['getBody', 'getToday'],
  routines: ['listRoutines', 'getRoutine', 'getToday'],
  exercises: ['listExercises', 'getExerciseHistory'],
  settings: ['getSettings', 'getToday', 'getMe', 'getFoodDay', 'listPrograms'],
  groups: ['listGroups', 'getGroup', 'getGroupFeed', 'listChallenges'],
};

export async function mutate(name, input, affects = []) {
  const result = await call(name, input);
  invalidate(...affects);
  return result;
}
