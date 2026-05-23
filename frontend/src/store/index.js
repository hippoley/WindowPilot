import { useSyncExternalStore, useRef, useCallback } from 'react';

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

  // Initialize state by invoking the initializer with set/get helpers
  state = initializer(setState, getState);

  return { getState, setState, subscribe };
}

// --- Application store instance ---

const store = create((set) => ({
  // Connection
  connected: false,

  // World state (from WebSocket tick)
  tick: 0,
  thingModel: null, // { window, actuator, screen, sensors, security }
  tree: null,       // behavior tree data
  btBranch: '...',
  decisionLog: [],

  // UI state
  activeTab: 'scenes', // 'scenes' | 'sensors' | 'json' | 'manual'
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
// Uses useSyncExternalStore for safe concurrent-mode integration.
// Selector should be a stable reference (defined outside component or wrapped in useCallback).

function useStore(selector) {
  const getSnapshot = selector
    ? () => selector(store.getState())
    : () => store.getState();

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

// --- Shallow equality helper ---
// Use with useStoreShallow for object selectors that return new references each call.

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

// useStoreShallow: like useStore but uses shallow comparison to avoid re-renders
// when the selected object has the same values but a new reference.
function useStoreShallow(selector) {
  const prevRef = useRef(undefined);

  const getSnapshot = useCallback(() => {
    const next = selector(store.getState());
    if (shallow(prevRef.current, next)) return prevRef.current;
    prevRef.current = next;
    return next;
  }, [selector]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export { create, store, useStore, useStoreShallow, shallow };
export default useStore;
