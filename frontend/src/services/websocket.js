import { store } from '../store';

let ws = null;
let reconnectTimer = null;
let pendingData = null;
let rafId = null;

function scheduleFlush() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    if (pendingData !== null) {
      store.getState().updateTick(pendingData);
      pendingData = null;
    }
  });
}

function handleMessage(event) {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  if (data.type === 'tick') {
    pendingData = data;
    scheduleFlush();
  }
}

export function connectWebSocket() {
  if (ws) return;

  const host = window.location.hostname || 'localhost';
  ws = new WebSocket(`ws://${host}:8001/ws`);

  ws.addEventListener('open', () => {
    store.getState().setConnected(true);
  });

  ws.addEventListener('close', () => {
    store.getState().setConnected(false);
    ws = null;
    reconnectTimer = setTimeout(connectWebSocket, 2000);
  });

  ws.addEventListener('error', () => {
    ws.close();
  });

  ws.addEventListener('message', handleMessage);
}

export function disconnectWebSocket() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
    pendingData = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function sendCommand(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
