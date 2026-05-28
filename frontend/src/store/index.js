import { useState, useEffect, useRef } from 'react';

// --- Zustand-style store factory (zero dependencies) ---

function create(initializer) {
  let state;
  const listeners = new Set();

  const getState = () => state;

  const setState = (partial) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    if (Object.is(state, next)) return;
    state = Object.assign({}, state, next);
    listeners.forEach((l) => l(state));
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  state = initializer(setState, getState);

  return { getState, setState, subscribe };
}

// --- Application store instance ---

const store = create((set) => ({
  // Connection
  connected: false,

  // World state (from WebSocket tick)
  tick: 0,
  thingModel: null,
  tree: null,
  btBranch: '...',
  decisionLog: [],

  // UI state
  activeTab: 'scenes',
  jsonText: '{}',

  // Actions
  setConnected: (v) => set({ connected: v }),

  updateTick: (data) =>
    set({
      tick: data.tick,
      thingModel: data.thing_model,
      tree: data.tree,
      btBranch: data.bt_branch || '...',
      decisionLog: data.decision_log || [],
    }),

  setActiveTab: (tab) =>
    set((s) => ({
      activeTab: tab,
      jsonText:
        tab === 'json'
          ? JSON.stringify(s.thingModel?.sensors || {}, null, 2)
          : s.jsonText,
    })),

  setJsonText: (text) => set({ jsonText: text }),
}));

// --- React hook: useStore(selector?) ---
// Simple useState + subscribe pattern. Bulletproof.

function useStore(selector) {
  const select = selector || ((s) => s);
  const [slice, setSlice] = useState(() => select(store.getState()));
  const selectorRef = useRef(select);
  selectorRef.current = select;

  useEffect(() => {
    // Update immediately in case state changed between render and effect
    const current = selectorRef.current(store.getState());
    setSlice(current);

    return store.subscribe((newState) => {
      const next = selectorRef.current(newState);
      setSlice(next);
    });
  }, []);

  return slice;
}

// --- useStoreShallow: same but with shallow comparison ---

function shallow(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const key of keysA) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

function useStoreShallow(selector) {
  const [slice, setSlice] = useState(() => selector(store.getState()));
  const prevRef = useRef(slice);

  useEffect(() => {
    return store.subscribe((newState) => {
      const next = selector(newState);
      if (!shallow(prevRef.current, next)) {
        prevRef.current = next;
        setSlice(next);
      }
    });
  }, [selector]);

  return slice;
}

export { create, store, useStore, useStoreShallow, shallow };
export default useStore;
