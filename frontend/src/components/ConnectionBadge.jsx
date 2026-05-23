import { useStore } from '../store'

const selectConnected = (s) => s.connected

export default function ConnectionBadge() {
  const connected = useStore(selectConnected)

  return (
    <span className={`conn-badge ${connected ? 'connected' : 'disconnected'}`}>
      {connected ? '● 已连接' : '○ 断开'}
    </span>
  )
}
