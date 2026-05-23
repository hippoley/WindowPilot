import { memo } from 'react'
import { sendCommand } from '../services/websocket'

function Btn({ label, onClick }) {
  return (
    <button className="ctrl-btn" onClick={onClick}>
      {label}
    </button>
  )
}

function ManualControl() {
  return (
    <div className="manual-control">
      <div className="manual-warning">⚠️ 人工干预（调试用）</div>
      <div className="ctrl-btn-group">
        <Btn label="开50%" onClick={() => sendCommand({ cmd: 'user_open_to', value: 50 })} />
        <Btn label="全开" onClick={() => sendCommand({ cmd: 'user_open_to', value: 100 })} />
        <Btn label="停止" onClick={() => sendCommand({ cmd: 'user_stop' })} />
        <Btn label="关窗" onClick={() => sendCommand({ cmd: 'user_open_to', value: 0 })} />
        <Btn label="布防" onClick={() => sendCommand({ cmd: 'arm_security' })} />
        <Btn label="撤防" onClick={() => sendCommand({ cmd: 'disarm_security' })} />
      </div>
    </div>
  )
}

export default memo(ManualControl)
