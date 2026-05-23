import { useStore, store } from '../store'
import { sendCommand } from '../services/websocket'

// Selectors (stable references for useStore)
const selectJsonText = (s) => s.jsonText

export default function JsonEditor() {
  const jsonText = useStore(selectJsonText)

  const inject = () => {
    try {
      const obj = JSON.parse(jsonText)
      Object.entries(obj).forEach(([k, v]) => {
        sendCommand({ cmd: 'set_sensor', key: k, value: v })
      })
    } catch {
      alert('JSON 解析失败')
    }
  }

  return (
    <div className="json-editor">
      <textarea
        className="json-textarea"
        value={jsonText}
        onChange={(e) => store.setState({ jsonText: e.target.value })}
      />
      <button className="json-inject-btn" onClick={inject}>
        注入
      </button>
    </div>
  )
}
