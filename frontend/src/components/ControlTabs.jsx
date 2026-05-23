import { useStore, store } from '../store'
import ScenePanel from './ScenePanel'
import JsonEditor from './JsonEditor'
import ManualControl from './ManualControl'
import SensorPanel from './SensorPanel'

const selectTab = (s) => s.activeTab

export default function ControlTabs() {
  const activeTab = useStore(selectTab)

  const switchTab = (tab) => {
    store.getState().setActiveTab(tab)
  }

  return (
    <div className="control-tabs">
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'scenes' ? 'active' : ''}`}
          onClick={() => switchTab('scenes')}
        >
          场景注入
        </button>
        <button
          className={`tab-btn ${activeTab === 'sensors' ? 'active' : ''}`}
          onClick={() => switchTab('sensors')}
        >
          传感器
        </button>
        <button
          className={`tab-btn ${activeTab === 'json' ? 'active' : ''}`}
          onClick={() => switchTab('json')}
        >
          JSON编辑
        </button>
        <button
          className={`tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => switchTab('manual')}
        >
          人工干预
        </button>
      </div>
      <div className="tab-content">
        {activeTab === 'scenes' && <ScenePanel />}
        {activeTab === 'sensors' && <SensorPanel />}
        {activeTab === 'json' && <JsonEditor />}
        {activeTab === 'manual' && <ManualControl />}
      </div>
    </div>
  )
}
