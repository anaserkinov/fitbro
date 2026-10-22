// Superset rules, shared by the server, the chat card and the Mini App (pure — no sdk).
//
// Exercises next to each other with the same `supersetGroup` form a superset and
// are done round-robin: A1 B1 A2 B2 … — no rest inside a round, rest after its last
// exercise. A group number on a lone exercise means nothing.

// Ordered exercises → blocks of consecutive exercises sharing a group:
// [{ group: 3, exercises: [A, B] }, { group: null, exercises: [C] }]
export function blocks(exercises) {
  const out = [];
  for (const e of exercises) {
    const last = out[out.length - 1];
    if (last && e.supersetGroup != null && last.group === e.supersetGroup) last.exercises.push(e);
    else out.push({ group: e.supersetGroup ?? null, exercises: [e] });
  }
  for (const b of out) if (b.exercises.length < 2) b.group = null;
  return out;
}

// An exercise's sets as rounds: each set plus the drop sets right after it.
function rounds(sets) {
  const out = [];
  for (const s of sets) {
    if (s.setType === 'drop' && out.length) out[out.length - 1].push(s);
    else out.push([s]);
  }
  return out;
}

// The order sets are done in: [{ set, exercise, round }]. Each exercise needs `.sets`
// (in position order). `round` ('block:index') is what's done without resting.
export function setOrder(exercises) {
  const order = [];
  blocks(exercises).forEach((b, k) => {
    const per = b.exercises.map((e) => rounds(e.sets));
    const n = Math.max(...per.map((r) => r.length));
    for (let i = 0; i < n; i++) {
      b.exercises.forEach((e, j) => { for (const set of per[j][i] || []) order.push({ set, exercise: e, round: `${k}:${i}` }); });
    }
  });
  return order;
}

// The first set still to do, or null.
export function nextOpenSet(exercises) {
  return setOrder(exercises).find((x) => !x.set.completed) || null;
}

// Rest after ticking `setId`? Not when the next set to do is in the same round:
// a drop set right after it, or the next exercise of the superset.
export function restsAfter(exercises, setId) {
  const order = setOrder(exercises);
  const i = order.findIndex((x) => x.set.id === setId);
  if (i < 0) return true;
  const next = order.slice(i + 1).find((x) => !x.set.completed);
  return !next || next.round !== order[i].round;
}

// Renumbers groups 1, 2, 3 … in order and clears lone ones. Takes and returns
// items with `supersetGroup` (routine items or workout exercises).
export function normalizeGroups(items) {
  let n = 0;
  return blocks(items).flatMap((b) => {
    const group = b.group === null ? null : ++n;
    return b.exercises.map((e) => ({ ...e, supersetGroup: group }));
  });
}
