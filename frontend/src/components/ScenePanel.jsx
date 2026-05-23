import { memo } from 'react'
import { SCENES } from '../data/scenes'
import { sendCommand } from '../services/websocket'

function ScenePanel() {
  const applyScene = (scene) => {
    sendCommand({ cmd: 'reset' })
    setTimeout(() => {
      Object.entries(scene.event).forEach(([k, v]) => {
        sendCommand({ cmd: 'set_sensor', key: k, value: v })
      })
    }, 100)
  }

  return (
    <div className="scene-grid">
      {SCENES.map(s => (
        <button key={s.id} className="scene-btn" onClick={() => applyScene(s)}>
          <span className="scene-icon">{s.icon}</span>
          <span className="scene-name">{s.name}</span>
        </button>
      ))}
    </div>
  )
}

export default memo(ScenePanel)
