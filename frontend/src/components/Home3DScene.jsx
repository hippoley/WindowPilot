import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ChevronDown, ChevronLeft, ChevronUp, Crosshair, Home, Maximize2, Move, RotateCcw } from 'lucide-react'

const ROOM_LAYOUT = [
  {
    id: 'second_bed_a',
    name: '次卧A',
    persona: '北侧卧室 / 顶部采光 / 静音换气',
    logic: '次卧A 位于左上角，外窗朝北，通过开口连接餐厅左侧通道，夜间以低噪通风为主。',
    product: 'CWDS-DM01 无线基础版',
    color: '#f2b35d',
    position: [-3.12, 0, -2.2],
    size: [2.8, 1.85],
    floor: 'wood',
    windows: [{ id: 'W1', side: 'north', offset: -0.1, width: 1.1 }],
    furniture: 'elderly',
  },
  {
    id: 'second_bed_b',
    name: '次卧B',
    persona: '北侧卧室 / 顶部采光 / 纱窗保护',
    logic: '次卧B 位于上方中间，外窗朝北，通过开口连向餐厅，自动开窗默认保守限位。',
    product: 'CWDS-CA01 常电旗舰版',
    color: '#5be38b',
    position: [-0.18, 0, -2.2],
    size: [2.8, 1.85],
    floor: 'wood',
    windows: [{ id: 'W2', side: 'north', offset: -0.05, width: 1.35 }],
    furniture: 'kids',
  },
  {
    id: 'kitchen',
    name: '厨房',
    persona: '右上厨房 / 油烟 / VOC / 安全联动',
    logic: '厨房位于右上角，外窗朝北，开口连向餐厅，VOC 和温升触发快速排风。',
    product: 'CWDS-CA01 常电旗舰版',
    color: '#ff7070',
    position: [2.82, 0, -2.2],
    size: [2.75, 1.85],
    floor: 'tile',
    windows: [{ id: 'W3', side: 'north', offset: 0, width: 1.05 }],
    furniture: 'kitchen',
  },
  {
    id: 'guest_bath',
    name: '客卫',
    persona: '左侧客卫 / 湿度 / 隐私',
    logic: '客卫在左侧中部，外窗朝西，开口连向餐厅，湿度高时执行隐私微通风。',
    product: 'CWDS-CM01 常电基础版',
    color: '#62c7ff',
    position: [-4.02, 0, -0.62],
    size: [1.35, 0.95],
    floor: 'tile',
    windows: [{ id: 'W4', side: 'west', offset: 0, width: 0.68 }],
    furniture: 'bath',
  },
  {
    id: 'master_bath',
    name: '主卫',
    persona: '主卧套内卫浴 / 干湿分离',
    logic: '主卫位于客卫下方，东侧开口与主卧入口区相连，以湿度和异味控制为主。',
    product: 'CWDS-CM01 常电基础版',
    color: '#7dd3fc',
    position: [-4.02, 0, 0.42],
    size: [1.35, 0.95],
    floor: 'tile',
    windows: [],
    furniture: 'bath',
  },
  {
    id: 'master_bedroom',
    name: '主卧',
    persona: '左下主卧 / 南向采光 / 睡眠舒适',
    logic: '主卧位于左下角，南向外窗，开口接入餐客厅，睡眠时段限制开度。',
    product: 'CWDS-CA01 常电旗舰版',
    color: '#ff6fb7',
    position: [-3.15, 0, 2.22],
    size: [2.8, 2.2],
    floor: 'wood',
    windows: [{ id: 'W5', side: 'south', offset: 0, width: 1.25 }],
    furniture: 'bedroom',
  },
  {
    id: 'dining_room',
    name: '餐厅',
    persona: '中心餐厅 / 连接卧室厨房玄关',
    logic: '餐厅位于户型中心上半区，是次卧、厨房、客卫和玄关进入客厅的交通核心。',
    product: '中心动线区',
    color: '#d7b98a',
    position: [0.28, 0, -0.42],
    size: [4.6, 2.0],
    floor: 'stone',
    windows: [],
    furniture: 'dining',
  },
  {
    id: 'living_room',
    name: '客厅',
    persona: '中心客厅 / 南向采光 / 会客联动',
    logic: '客厅位于中心下半区，南向外窗，向上连接餐厅，向右连接玄关与阳台。',
    product: 'CWDS-CA01 常电旗舰版',
    color: '#d7b98a',
    position: [0.28, 0, 1.72],
    size: [3.45, 2.28],
    floor: 'stone',
    windows: [{ id: 'W6', side: 'south', offset: 0, width: 1.35 }],
    furniture: 'living',
  },
  {
    id: 'entry',
    name: '玄关',
    persona: '右侧入户 / 连接客餐厅与阳台',
    logic: '玄关位于右侧中下部，北侧接入餐厅，南侧接阳台，右侧保留入户开口。',
    product: '入户动线区',
    color: '#c7a17a',
    position: [3.12, 0, 1.36],
    size: [1.8, 1.45],
    floor: 'wood',
    windows: [],
    furniture: 'entry',
  },
  {
    id: 'balcony',
    name: '阳台',
    persona: '右下阳台 / 南向采光',
    logic: '阳台位于右下角，南向外窗，开口与玄关相接，适合展示 WD2 大开度推窗过程。',
    product: 'CWDS-DA01 无线旗舰版',
    color: '#91c9ff',
    position: [3.12, 0, 2.92],
    size: [1.8, 1.25],
    floor: 'tile',
    windows: [{ id: 'W7', side: 'south', offset: 0, width: 1.25 }],
    furniture: 'balcony',
  },
]

const ROOM_EVENTS = {
  second_bed_a: { room_type: 'bedroom', temp_indoor_c: 18, temp_outdoor_c: 6, human_detected: true },
  second_bed_b: { room_type: 'child_room', co2_ppm: 980, human_detected: true },
  kitchen: { room_type: 'kitchen', voc_mg: 0.9, temp_indoor_c: 29, human_detected: true },
  guest_bath: { room_type: 'bathroom', humidity_pct: 82, voc_mg: 0.35, human_detected: true },
  master_bath: { room_type: 'bathroom', humidity_pct: 78, voc_mg: 0.28, human_detected: true },
  master_bedroom: { room_type: 'bedroom', time_hour: 22, co2_ppm: 1100, human_detected: true },
  dining_room: { room_type: 'living_room', co2_ppm: 760, human_detected: true },
  living_room: { room_type: 'living_room', co2_ppm: 980, human_detected: true },
  entry: { room_type: 'living_room', human_detected: true },
  balcony: { room_type: 'living_room', temp_outdoor_c: 24, human_detected: true },
}

const PLAN_BOUNDS = { minX: -4.85, maxX: 4.15, minZ: -3.35, maxZ: 3.55 }

const GLOBAL_PASSAGES = [
  { id: 'D1', roomId: 'second_bed_a', side: 'south', x: -2.12, z: -1.28 },
  { id: 'D2', roomId: 'second_bed_b', side: 'south', x: -1.02, z: -1.28 },
  { id: 'D3', roomId: 'guest_bath', side: 'east', x: -3.35, z: -0.62 },
  { id: 'D4', roomId: 'kitchen', side: 'south', x: 1.84, z: -1.28 },
  { id: 'D5', roomId: 'master_bath', side: 'east', x: -3.35, z: 0.42 },
  { id: 'D6', roomId: 'master_bedroom', side: 'east', x: -1.75, z: 1.52 },
  { id: 'D7', roomId: 'master_bedroom', side: 'east', x: -1.75, z: 2.56 },
  { id: 'D8', roomId: 'entry', side: 'west', x: 2.03, z: 1.18 },
  { id: 'D9', roomId: 'balcony', side: 'north', x: 3.12, z: 2.18 },
]

const GLOBAL_WINDOWS = [
  { id: 'W1', roomId: 'second_bed_a', side: 'north', x: -3.2, z: -3.13, width: 1.1 },
  { id: 'W2', roomId: 'second_bed_b', side: 'north', x: -0.18, z: -3.13, width: 1.35 },
  { id: 'W3', roomId: 'kitchen', side: 'north', x: 2.82, z: -3.13, width: 1.05 },
  { id: 'W4', roomId: 'guest_bath', side: 'west', x: -4.7, z: -0.62, width: 0.68 },
  { id: 'W5', roomId: 'master_bedroom', side: 'south', x: -3.15, z: 3.32, width: 1.25 },
  { id: 'W6', roomId: 'living_room', side: 'south', x: 0.28, z: 2.86, width: 1.35 },
  { id: 'W7', roomId: 'balcony', side: 'south', x: 3.12, z: 3.55, width: 1.25 },
]

const GLOBAL_WALLS = [
  { axis: 'h', z: -3.13, from: -4.52, to: 4.2, cuts: ['W1', 'W2', 'W3'] },
  { axis: 'h', z: -1.28, from: -4.52, to: 4.2, cuts: ['D1', 'D2', 'D4'] },
  { axis: 'h', z: -1.1, from: -4.7, to: -3.35 },
  { axis: 'h', z: -0.15, from: -4.7, to: -3.35 },
  { axis: 'h', z: -0.06, from: -4.7, to: -3.35 },
  { axis: 'h', z: 0.9, from: -4.7, to: -3.35 },
  { axis: 'h', z: 1.12, from: -4.55, to: -1.75 },
  { axis: 'h', z: 2.08, from: 2.22, to: 4.02, cuts: ['D9'] },
  { axis: 'h', z: 2.86, from: -1.45, to: 2.0, cuts: ['W6'] },
  { axis: 'h', z: 3.32, from: -4.55, to: -1.75, cuts: ['W5'] },
  { axis: 'h', z: 3.55, from: 2.22, to: 4.02, cuts: ['W7'] },
  { axis: 'v', x: -4.52, from: -3.13, to: -1.28 },
  { axis: 'v', x: -4.7, from: -1.1, to: 0.9, cuts: ['W4'] },
  { axis: 'v', x: -4.55, from: 1.12, to: 3.32 },
  { axis: 'v', x: -3.35, from: -1.1, to: 0.9, cuts: ['D3', 'D5'] },
  { axis: 'v', x: -1.75, from: 1.12, to: 3.32, cuts: ['D6', 'D7'] },
  { axis: 'v', x: -1.65, from: -3.13, to: -1.28 },
  { axis: 'v', x: 1.33, from: -3.13, to: -1.28 },
  { axis: 'v', x: 2.03, from: 0.58, to: 2.86, cuts: ['D8'] },
  { axis: 'v', x: 2.22, from: 0.64, to: 3.55 },
  { axis: 'v', x: 4.02, from: 0.64, to: 3.55 },
  { axis: 'v', x: 4.2, from: -3.13, to: -1.28 },
]

const FLOOR3D_ENTITY_BINDINGS = ROOM_LAYOUT.map(room => ({
  objectId: `${room.id}.floor`,
  entityId: `sensor.windowpilot_${room.id}`,
  label: room.name,
  domain: 'room',
  action: 'select-room',
})).concat(
  ROOM_LAYOUT.flatMap(room => getRoomWindowSpecs(room).map(window => ({
    objectId: `${room.id}.${window.id}`,
    entityId: `cover.windowpilot_${window.id.toLowerCase()}`,
    label: `${room.name} ${window.id}`,
    domain: 'window',
    action: 'open-window-detail',
  }))),
)

const FLOOR3D_ZOOM_AREAS = ROOM_LAYOUT.map(room => ({
  id: room.id,
  label: room.name,
  position: room.position,
  size: room.size,
}))

function getRoomWindowSpecs(room) {
  if (room.windows) return room.windows
  if (room.window) return [{ id: 'W', side: room.window, offset: 0, width: 1 }]
  return []
}

function floor3dBindingFor(objectId) {
  if (!objectId) return null
  return FLOOR3D_ENTITY_BINDINGS.find(binding => binding.objectId === objectId) || null
}

function planStyle(room) {
  const width = PLAN_BOUNDS.maxX - PLAN_BOUNDS.minX
  const height = PLAN_BOUNDS.maxZ - PLAN_BOUNDS.minZ
  return {
    '--room-color': room.color,
    left: `${((room.position[0] - room.size[0] / 2 - PLAN_BOUNDS.minX) / width) * 100}%`,
    top: `${((room.position[2] - room.size[1] / 2 - PLAN_BOUNDS.minZ) / height) * 100}%`,
    width: `${(room.size[0] / width) * 100}%`,
    height: `${(room.size[1] / height) * 100}%`,
  }
}

function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0.03,
    transparent: options.opacity !== undefined && options.opacity < 1,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  })
}

function woodTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#e1c59a'
  ctx.fillRect(0, 0, 512, 512)
  for (let y = 0; y < 512; y += 34) {
    ctx.fillStyle = y % 68 === 0 ? '#d5b483' : '#e8d0aa'
    ctx.fillRect(0, y, 512, 30)
    ctx.strokeStyle = 'rgba(92, 60, 36, .16)'
    ctx.beginPath()
    ctx.moveTo(0, y + 30)
    ctx.lineTo(512, y + 30)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 248, 236, .28)'
    ctx.beginPath()
    ctx.moveTo(0, y + 5)
    ctx.lineTo(512, y + 5)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3, 3)
  return texture
}

function box({ size, position, color, opacity = 1, roughness = 0.72, metalness = 0.03, map }) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    map
      ? new THREE.MeshStandardMaterial({
        color: color || '#ffffff',
        map,
        roughness,
        metalness,
        transparent: opacity < 1,
        opacity,
      })
      : mat(color, { opacity, roughness, metalness }),
  )
  mesh.position.set(position[0], position[1], position[2])
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function screenTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(15, 23, 42, .16)'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(226, 232, 240, .42)'
  ctx.lineWidth = 0.75
  for (let i = 0; i < 256; i += 6) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 256)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(256, i)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(56, 189, 248, .2)'
  ctx.lineWidth = 1.2
  for (let i = -256; i < 512; i += 28) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + 256, 256)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(5, 4)
  return texture
}

function addLabel(text, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(25, 23, 22, .74)'
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.roundRect(18, 24, 476, 76, 12)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#fff7ed'
  ctx.font = '700 34px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 62)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }))
  sprite.scale.set(1.55, 0.39, 1)
  return sprite
}

function addOpeningTag(text, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(10, 16, 24, .78)'
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  ctx.roundRect(18, 14, 156, 58, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = '800 36px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 96, 44)
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }))
}

function getWindows(room) {
  return getRoomWindowSpecs(room)
}

function uniqueOpeningCount(kind) {
  const ids = new Set()
  ROOM_LAYOUT.forEach((room) => {
    const openings = kind === 'window' ? getWindows(room) : []
    openings.forEach((opening) => {
      if (opening.id && opening.id !== 'D0') ids.add(opening.id)
    })
  })
  return ids.size
}

function totalFloorArea() {
  return ROOM_LAYOUT.reduce((sum, room) => sum + room.size[0] * room.size[1], 0)
}

function totalWallLength() {
  return ROOM_LAYOUT.reduce((sum, room) => sum + (room.size[0] + room.size[1]) * 2, 0)
}

function openingCutFor(id) {
  const passage = GLOBAL_PASSAGES.find(item => item.id === id)
  if (passage) return { center: passage.side === 'north' || passage.side === 'south' ? passage.x : passage.z, half: 0.46 }
  const win = GLOBAL_WINDOWS.find(item => item.id === id)
  if (win) return { center: win.side === 'north' || win.side === 'south' ? win.x : win.z, half: (win.width || 1) / 2 }
  return null
}

function wallSegments(wall) {
  const cuts = (wall.cuts || []).map(openingCutFor).filter(Boolean).sort((a, b) => a.center - b.center)
  const segments = []
  let cursor = wall.from
  cuts.forEach((cut) => {
    const start = Math.max(wall.from, cut.center - cut.half)
    const end = Math.min(wall.to, cut.center + cut.half)
    if (start - cursor > 0.08) segments.push([cursor, start])
    cursor = Math.max(cursor, end)
  })
  if (wall.to - cursor > 0.08) segments.push([cursor, wall.to])
  return segments
}

function addGlobalWall(scene, wall, topologyMeshes) {
  const wallHeight = 0.84
  const wallThickness = 0.08
  wallSegments(wall).forEach(([from, to]) => {
    const length = to - from
    const center = from + length / 2
    const mesh = wall.axis === 'h'
      ? box({ size: [length, wallHeight, wallThickness], position: [center, wallHeight / 2, wall.z], color: '#efe7dc' })
      : box({ size: [wallThickness, wallHeight, length], position: [wall.x, wallHeight / 2, center], color: '#efe7dc' })
    mesh.userData.kind = 'wallBody'
    mesh.userData.objectId = 'topology.wall'
    mesh.material.transparent = true
    mesh.material.depthWrite = true
    mesh.renderOrder = 1
    scene.add(mesh)
    topologyMeshes.push(mesh)
    const cap = wall.axis === 'h'
      ? box({ size: [length, 0.08, wallThickness + 0.04], position: [center, wallHeight + 0.04, wall.z], color: '#272625', roughness: 0.55 })
      : box({ size: [wallThickness + 0.04, 0.08, length], position: [wall.x, wallHeight + 0.04, center], color: '#272625', roughness: 0.55 })
    cap.userData.kind = 'wallCap'
    cap.userData.objectId = 'topology.wall'
    cap.material.transparent = true
    cap.material.depthWrite = true
    cap.renderOrder = 1
    scene.add(cap)
    topologyMeshes.push(cap)
    const baseboard = wall.axis === 'h'
      ? box({ size: [length, 0.06, wallThickness + 0.025], position: [center, 0.16, wall.z], color: '#d7c4a8', roughness: 0.5 })
      : box({ size: [wallThickness + 0.025, 0.06, length], position: [wall.x, 0.16, center], color: '#d7c4a8', roughness: 0.5 })
    baseboard.userData.kind = 'wallCap'
    baseboard.userData.objectId = 'topology.wall'
    baseboard.material.transparent = true
    baseboard.material.depthWrite = true
    baseboard.renderOrder = 2
    scene.add(baseboard)
    topologyMeshes.push(baseboard)
  })
}

function addPassageFrame(scene, passage, topologyMeshes) {
  const horizontal = passage.side === 'north' || passage.side === 'south'
  const objectId = `passage.${passage.id}`
  const trimColor = '#b58a62'
  const innerTrim = '#d2b18a'
  const threshold = box({
    size: horizontal ? [0.96, 0.03, 0.18] : [0.18, 0.03, 0.96],
    position: [passage.x, 0.074, passage.z],
    color: '#d9bf9b',
    roughness: 0.52,
  })
  threshold.userData.roomId = passage.roomId
  threshold.userData.objectId = objectId
  scene.add(threshold)
  topologyMeshes.push(threshold)

  ;[-0.47, 0.47].forEach((offset) => {
    const jamb = box({
      size: horizontal ? [0.07, 0.76, 0.085] : [0.085, 0.76, 0.07],
      position: horizontal ? [passage.x + offset, 0.4, passage.z] : [passage.x, 0.4, passage.z + offset],
      color: trimColor,
      roughness: 0.42,
    })
    jamb.userData.roomId = passage.roomId
    jamb.userData.objectId = objectId
    scene.add(jamb)
    topologyMeshes.push(jamb)
    const inner = box({
      size: horizontal ? [0.026, 0.68, 0.1] : [0.1, 0.68, 0.026],
      position: horizontal ? [passage.x + offset * 0.94, 0.38, passage.z] : [passage.x, 0.38, passage.z + offset * 0.94],
      color: innerTrim,
      roughness: 0.5,
    })
    inner.userData.roomId = passage.roomId
    inner.userData.objectId = objectId
    scene.add(inner)
    topologyMeshes.push(inner)
  })

  const header = box({
    size: horizontal ? [1.02, 0.075, 0.095] : [0.095, 0.075, 1.02],
    position: [passage.x, 0.78, passage.z],
    color: trimColor,
    roughness: 0.42,
  })
  header.userData.roomId = passage.roomId
  header.userData.objectId = objectId
  scene.add(header)
  topologyMeshes.push(header)
}

function addGlobalWindow(scene, opening, roomState, topologyMeshes) {
  const horizontal = opening.side === 'north' || opening.side === 'south'
  const width = opening.width || 1
  const objectId = `${opening.roomId}.${opening.id}`
  const position = [opening.x, 0.53, opening.z]
  const open = Math.max(0.02, Math.min(1, (roomState.windowOpenPct || 0) / 100))
  const screen = Math.max(0.02, Math.min(1, (roomState.screenPct ?? 100) / 100))
  const outward = {
    north: new THREE.Vector3(0, 0, -1),
    south: new THREE.Vector3(0, 0, 1),
    west: new THREE.Vector3(-1, 0, 0),
    east: new THREE.Vector3(1, 0, 0),
  }[opening.side]
  const tangent = horizontal ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
  const panelWidth = width * 0.42
  const slideRange = width * 0.28
  const fixedPane = new THREE.Vector3(...position).addScaledVector(tangent, -width * 0.21).addScaledVector(outward, 0.036)
  const slidingPane = new THREE.Vector3(...position).addScaledVector(tangent, width * 0.18).addScaledVector(outward, -0.036)
  const handleBase = slidingPane.clone().addScaledVector(tangent, -panelWidth * 0.32).addScaledVector(outward, -0.018)
  const screenTopY = 0.76
  const screenBase = new THREE.Vector3(opening.x, screenTopY - 0.24, opening.z).addScaledVector(outward, -0.082)
  const screenBarBase = new THREE.Vector3(opening.x, screenTopY - 0.48 * screen + 0.012, opening.z).addScaledVector(outward, -0.1)
  const voidBase = new THREE.Vector3(opening.x, 0.52, opening.z).addScaledVector(outward, -0.108)
  const face = new THREE.Vector3(opening.x, 0.53, opening.z).addScaledVector(outward, -0.11)
  const rail = (span, height, depth, center, color, options = {}) => box({
    size: horizontal ? [span, height, depth] : [depth, height, span],
    position: center.toArray(),
    color,
    opacity: options.opacity ?? 1,
    roughness: options.roughness ?? 0.28,
    metalness: options.metalness ?? 0.18,
  })
  const post = (span, height, depth, center, color, options = {}) => box({
    size: horizontal ? [span, height, depth] : [depth, height, span],
    position: center.toArray(),
    color,
    opacity: options.opacity ?? 1,
    roughness: options.roughness ?? 0.28,
    metalness: options.metalness ?? 0.18,
  })
  const topRail = face.clone()
  topRail.y = 0.85
  const bottomRail = face.clone()
  bottomRail.y = 0.25
  const leftPost = face.clone().addScaledVector(tangent, -width * 0.47)
  const rightPost = face.clone().addScaledVector(tangent, width * 0.47)
  const centerPost = face.clone()
  const screenCase = new THREE.Vector3(opening.x, screenTopY + 0.04, opening.z).addScaledVector(outward, -0.1)
  const fixedTop = fixedPane.clone()
  fixedTop.y = 0.79
  const fixedBottom = fixedPane.clone()
  fixedBottom.y = 0.25
  const fixedMid = fixedPane.clone()
  fixedMid.y = 0.53
  const fixedLeft = fixedPane.clone().addScaledVector(tangent, -panelWidth / 2)
  const fixedRight = fixedPane.clone().addScaledVector(tangent, panelWidth / 2)
  const sashTop = slidingPane.clone()
  sashTop.y = 0.79
  const sashBottom = slidingPane.clone()
  sashBottom.y = 0.25
  const sashMid = slidingPane.clone()
  sashMid.y = 0.53
  const sashLeft = slidingPane.clone().addScaledVector(tangent, -panelWidth / 2)
  const sashRight = slidingPane.clone().addScaledVector(tangent, panelWidth / 2)
  const meshMap = screenTexture()
  const meshItems = [
    { mesh: box({ size: horizontal ? [width + 0.36, 0.09, 0.38] : [0.38, 0.09, width + 0.36], position: [opening.x, 0.22, opening.z], color: '#f0e8dc', roughness: 0.54 }) },
    { mesh: box({ size: horizontal ? [width * 0.88, 0.52, 0.018] : [0.018, 0.52, width * 0.88], position: voidBase.toArray(), color: '#101820', opacity: 0.5, roughness: 0.36 }) },
    { mesh: rail(width + 0.06, 0.035, 0.04, topRail, '#20262c', { metalness: 0.42, roughness: 0.18 }) },
    { mesh: rail(width + 0.06, 0.035, 0.04, bottomRail, '#20262c', { metalness: 0.42, roughness: 0.18 }) },
    { mesh: post(0.034, 0.62, 0.04, leftPost, '#20262c', { metalness: 0.42, roughness: 0.18 }) },
    { mesh: post(0.034, 0.62, 0.04, rightPost, '#20262c', { metalness: 0.42, roughness: 0.18 }) },
    { mesh: box({ size: horizontal ? [width * 0.84, 0.055, 0.064] : [0.064, 0.055, width * 0.84], position: screenCase.toArray(), color: '#f8fafc', metalness: 0.12, roughness: 0.3 }) },
    { mesh: box({ size: horizontal ? [width * 0.82, 0.48, 0.014] : [0.014, 0.48, width * 0.82], position: screenBase.toArray(), color: '#e2e8e8', opacity: 0.72, roughness: 0.88, map: meshMap }), kind: 'screen', base: screenBase.clone(), topY: screenTopY, screen },
    { mesh: box({ size: horizontal ? [width * 0.82, 0.034, 0.048] : [0.048, 0.034, width * 0.82], position: screenBarBase.toArray(), color: '#f8fafc', metalness: 0.16, roughness: 0.24 }), kind: 'screenPullBar', base: screenBarBase.clone(), topY: screenTopY, screen },
    { mesh: box({ size: horizontal ? [panelWidth, 0.52, 0.022] : [0.022, 0.52, panelWidth], position: fixedPane.toArray(), color: '#48a4f8', opacity: 0.28, metalness: 0.06, roughness: 0.16 }) },
    { mesh: rail(panelWidth + 0.04, 0.026, 0.05, fixedTop, '#1f2933', { metalness: 0.44, roughness: 0.18 }) },
    { mesh: rail(panelWidth + 0.04, 0.026, 0.05, fixedBottom, '#1f2933', { metalness: 0.44, roughness: 0.18 }) },
    { mesh: rail(panelWidth * 0.88, 0.01, 0.022, fixedMid, '#64748b', { opacity: 0.48, metalness: 0.2, roughness: 0.2 }) },
    { mesh: post(0.026, 0.54, 0.05, fixedLeft, '#1f2933', { metalness: 0.44, roughness: 0.18 }) },
    { mesh: post(0.026, 0.54, 0.05, fixedRight, '#1f2933', { metalness: 0.44, roughness: 0.18 }) },
    { mesh: box({ size: horizontal ? [panelWidth, 0.52, 0.028] : [0.028, 0.52, panelWidth], position: slidingPane.toArray(), color: '#123247', opacity: 0.36, metalness: 0.08, roughness: 0.14 }), kind: 'slidingSash', base: slidingPane.clone(), slideVector: tangent.clone().multiplyScalar(-slideRange) },
    { mesh: post(0.034, 0.62, 0.064, centerPost, '#111827', { metalness: 0.5, roughness: 0.14 }), kind: 'slidingSash', base: centerPost.clone(), slideVector: tangent.clone().multiplyScalar(-slideRange) },
    { mesh: rail(panelWidth + 0.04, 0.026, 0.054, sashTop, '#111827', { metalness: 0.46, roughness: 0.16 }), kind: 'slidingSash', base: sashTop.clone(), slideVector: tangent.clone().multiplyScalar(-slideRange) },
    { mesh: rail(panelWidth + 0.04, 0.026, 0.054, sashBottom, '#111827', { metalness: 0.46, roughness: 0.16 }), kind: 'slidingSash', base: sashBottom.clone(), slideVector: tangent.clone().multiplyScalar(-slideRange) },
    { mesh: rail(panelWidth * 0.88, 0.01, 0.022, sashMid, '#64748b', { opacity: 0.46, metalness: 0.2, roughness: 0.2 }), kind: 'slidingSash', base: sashMid.clone(), slideVector: tangent.clone().multiplyScalar(-slideRange) },
    { mesh: post(0.028, 0.54, 0.054, sashLeft, '#111827', { metalness: 0.46, roughness: 0.16 }), kind: 'slidingSash', base: sashLeft.clone(), slideVector: tangent.clone().multiplyScalar(-slideRange) },
    { mesh: post(0.028, 0.54, 0.054, sashRight, '#111827', { metalness: 0.46, roughness: 0.16 }), kind: 'slidingSash', base: sashRight.clone(), slideVector: tangent.clone().multiplyScalar(-slideRange) },
    { mesh: box({ size: horizontal ? [0.035, 0.34, 0.035] : [0.035, 0.34, 0.035], position: handleBase.toArray(), color: '#f8fafc', metalness: 0.18, roughness: 0.26 }), kind: 'slidingSash', base: handleBase.clone(), slideVector: tangent.clone().multiplyScalar(-slideRange) },
  ]
  meshItems.forEach((item) => {
    const { mesh } = item
    mesh.userData.roomId = opening.roomId
    mesh.userData.openingId = opening.id
    mesh.userData.objectId = objectId
    mesh.userData.kind = item.kind
    mesh.userData.side = opening.side
    mesh.userData.base = item.base || mesh.position.clone()
    mesh.userData.slideVector = item.slideVector
    mesh.userData.axis = item.axis
    mesh.userData.topY = item.topY
    mesh.userData.open = open
    mesh.userData.screen = item.screen ?? screen
    if (mesh.material?.transparent) {
      mesh.material.depthWrite = false
      mesh.renderOrder = item.renderOrder ?? 4
    }
    scene.add(mesh)
    topologyMeshes.push(mesh)
  })

  const tag = addOpeningTag(opening.id, '#58a8ff')
  tag.position.set(opening.x, 1.18, opening.z)
  tag.scale.set(0.54, 0.27, 1)
  tag.userData.roomId = opening.roomId
  tag.userData.objectId = objectId
  scene.add(tag)
  topologyMeshes.push(tag)
}

function addGlobalTopology(scene, roomState, topologyMeshes) {
  GLOBAL_WALLS.forEach(wall => addGlobalWall(scene, wall, topologyMeshes))
  GLOBAL_PASSAGES.forEach(passage => addPassageFrame(scene, passage, topologyMeshes))
  GLOBAL_WINDOWS.forEach(win => addGlobalWindow(scene, win, roomState, topologyMeshes))
}

function addRug(group, color, x, z, w = 0.9, d = 0.6) {
  group.add(box({ size: [w, 0.025, d], position: [x, 0.075, z], color, opacity: 0.85, roughness: 0.9 }))
}

function addPlant(group, x, z) {
  group.add(box({ size: [0.18, 0.18, 0.18], position: [x, 0.15, z], color: '#c08457' }))
  const leafMat = mat('#3ba66b', { roughness: 0.85 })
  for (let i = 0; i < 5; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 8), leafMat.clone())
    leaf.position.set(x + Math.sin(i) * 0.08, 0.42, z + Math.cos(i) * 0.08)
    leaf.rotation.z = Math.sin(i) * 0.55
    group.add(leaf)
  }
}

function addFurniture(group, room) {
  const [w, d] = room.size
  const wood = '#b98a5d'
  const linen = '#eee5d6'

  if (room.furniture === 'living') {
    group.add(box({ size: [1.18, 0.2, 0.62], position: [-0.55, 0.17, 0.18], color: '#f0e8dc' }))
    group.add(box({ size: [0.72, 0.13, 0.46], position: [0.25, 0.15, 0.22], color: wood }))
    group.add(box({ size: [0.78, 0.5, 0.06], position: [0.65, 0.48, -1.25], color: '#111827', metalness: 0.2 }))
    addPlant(group, -1.45, 1.02)
    addRug(group, '#ead9bd', -0.16, 0.28, 1.95, 1.1)
  }

  if (room.furniture === 'dining') {
    group.add(box({ size: [1.08, 0.16, 0.62], position: [0, 0.28, 0], color: wood }))
    ;[[-0.7, 0], [0.7, 0], [0, -0.48], [0, 0.48]].forEach(([x, z]) => {
      group.add(box({ size: [0.24, 0.26, 0.24], position: [x, 0.17, z], color: '#a9794f' }))
    })
    addPlant(group, 0.42, 0)
  }

  if (room.furniture === 'entry') {
    group.add(box({ size: [0.36, 0.62, 1.08], position: [0.5, 0.35, 0], color: wood }))
    group.add(box({ size: [0.7, 0.12, 0.34], position: [-0.2, 0.18, -0.42], color: '#d8c3a5' }))
    addRug(group, '#c7a17a', -0.18, 0.32, 0.78, 0.46)
  }

  if (room.furniture === 'balcony') {
    group.add(box({ size: [w * 0.72, 0.06, d * 0.2], position: [0, 0.16, -d * 0.2], color: '#dbeafe', opacity: 0.58, roughness: 0.35 }))
    group.add(box({ size: [w * 0.22, 0.22, d * 0.28], position: [-w * 0.28, 0.16, d * 0.18], color: '#4ade80', opacity: 0.82 }))
    group.add(box({ size: [w * 0.22, 0.22, d * 0.28], position: [w * 0.28, 0.16, d * 0.18], color: '#4ade80', opacity: 0.82 }))
  }

  if (room.furniture === 'elderly') {
    group.add(box({ size: [w * 0.5, 0.22, d * 0.48], position: [-w * 0.12, 0.17, -d * 0.05], color: linen }))
    group.add(box({ size: [w * 0.52, 0.2, 0.16], position: [-w * 0.12, 0.36, -d * 0.3], color: '#f8fafc' }))
    group.add(box({ size: [0.35, 0.34, 0.35], position: [w * 0.31, 0.2, d * 0.2], color: wood }))
    addRug(group, '#ead3aa', -w * 0.08, d * 0.22, 1.1, 0.62)
  }

  if (room.furniture === 'kids') {
    group.add(box({ size: [w * 0.42, 0.18, d * 0.34], position: [-w * 0.23, 0.15, -d * 0.12], color: '#f7d9e8' }))
    group.add(box({ size: [0.34, 0.34, 0.34], position: [w * 0.22, 0.24, d * 0.12], color: '#fbbf24' }))
    group.add(box({ size: [0.28, 0.28, 0.28], position: [w * 0.03, 0.2, d * 0.25], color: '#60a5fa' }))
    addRug(group, '#b9f6ca', 0, 0.1, 1.0, 0.7)
  }

  if (room.furniture === 'bath') {
    group.add(box({ size: [w * 0.52, 0.22, d * 0.34], position: [-w * 0.1, 0.17, -d * 0.12], color: '#e0f2fe' }))
    group.add(box({ size: [0.35, 0.45, 0.35], position: [w * 0.26, 0.28, d * 0.16], color: '#f8fafc' }))
    group.add(box({ size: [0.55, 0.06, 0.05], position: [-w * 0.2, 0.62, -d * 0.48], color: '#94a3b8', metalness: 0.45 }))
  }

  if (room.furniture === 'kitchen') {
    group.add(box({ size: [w * 0.78, 0.3, 0.34], position: [0, 0.2, -d * 0.32], color: '#d8c3a5' }))
    group.add(box({ size: [0.52, 0.12, 0.44], position: [w * 0.2, 0.44, -d * 0.32], color: '#dbeafe', metalness: 0.25 }))
    group.add(box({ size: [0.4, 0.28, 0.4], position: [-w * 0.25, 0.24, d * 0.18], color: '#111827', opacity: 0.9 }))
  }

  if (room.furniture === 'desk') {
    group.add(box({ size: [w * 0.62, 0.14, 0.42], position: [0, 0.32, -d * 0.22], color: wood }))
    group.add(box({ size: [0.5, 0.44, 0.06], position: [0, 0.62, -d * 0.32], color: '#0f172a', metalness: 0.2 }))
    group.add(box({ size: [0.42, 0.18, 0.42], position: [0.5, 0.16, d * 0.16], color: '#64748b' }))
    addPlant(group, -w * 0.34, d * 0.22)
  }

  if (room.furniture === 'bedroom') {
    group.add(box({ size: [w * 0.58, 0.24, d * 0.5], position: [-w * 0.05, 0.18, -d * 0.03], color: linen }))
    group.add(box({ size: [w * 0.58, 0.18, 0.16], position: [-w * 0.05, 0.4, -d * 0.31], color: '#f8fafc' }))
    group.add(box({ size: [w * 0.62, 0.18, 0.12], position: [-w * 0.05, 0.23, d * 0.27], color: wood }))
    addRug(group, '#f0cfe0', -w * 0.02, d * 0.24, 1.35, 0.7)
    addPlant(group, w * 0.35, d * 0.3)
  }
}

function addRoom(group, room, selectedRoom, floorMap) {
  const [w, d] = room.size
  const selected = selectedRoom === room.id
  const floorColor = room.floor === 'tile' ? '#dedbd4' : room.floor === 'stone' ? '#eadfcb' : '#e1c59a'
  const floor = box({ size: [w, 0.08, d], position: [0, 0, 0], color: floorColor, map: room.floor === 'wood' ? floorMap : undefined })
  floor.userData.roomId = room.id
  floor.userData.kind = 'floor'
  floor.userData.objectId = `${room.id}.floor`
  group.add(floor)

  if (room.floor !== 'wood') {
    const gridColor = room.floor === 'stone' ? '#d2c4ad' : '#b7bcc2'
    const lineMat = mat(gridColor, { opacity: 0.42, roughness: 0.9 })
    for (let x = -w / 2 + 0.34; x < w / 2; x += 0.34) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, d), lineMat.clone())
      line.position.set(x, 0.055, 0)
      line.userData.roomId = room.id
      line.userData.objectId = `${room.id}.floor`
      group.add(line)
    }
    for (let z = -d / 2 + 0.34; z < d / 2; z += 0.34) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, 0.012), lineMat.clone())
      line.position.set(0, 0.056, z)
      line.userData.roomId = room.id
      line.userData.objectId = `${room.id}.floor`
      group.add(line)
    }
  }

  addFurniture(group, room)

  const label = addLabel(room.name, room.color)
  label.position.set(0, 1.08, 0)
  label.userData.roomId = room.id
  label.userData.kind = 'roomLabel'
  group.add(label)

  if (selected) {
    const halo = box({ size: [w + 0.08, 0.03, d + 0.08], position: [0, 0.09, 0], color: room.color, opacity: 0.16 })
    halo.userData.roomId = room.id
    halo.userData.kind = 'halo'
    group.add(halo)
  }

  group.position.set(room.position[0], 0, room.position[2])
  group.userData.roomId = room.id
}

function addShowroom(scene) {
  scene.add(box({ size: [18, 0.1, 14], position: [0, -0.18, 0], color: '#111113', roughness: 0.92 }))
  for (let i = 0; i < 3; i += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2 + i * 0.9, 0.012, 8, 160), mat('#f2d6b0', { opacity: 0.18, roughness: 0.4, metalness: 0.2 }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = -0.1 + i * 0.005
    scene.add(ring)
  }
  for (let i = -3; i <= 3; i += 1) scene.add(box({ size: [0.08, 6.5, 0.18], position: [i * 1.6, 2.3, -6.2], color: '#191817', opacity: 0.62 }))
}

function addContinuousFloorBase(scene) {
  const slabs = [
    { size: [8.72, 0.035, 1.95], position: [-0.18, -0.09, -2.2], color: '#d8b889' },
    { size: [6.18, 0.035, 2.08], position: [-0.8, -0.088, -0.44], color: '#eadfcb' },
    { size: [5.28, 0.035, 2.34], position: [-0.62, -0.086, 1.78], color: '#eadfcb' },
    { size: [2.96, 0.035, 3.26], position: [-3.38, -0.084, 1.48], color: '#d8b889' },
    { size: [1.92, 0.035, 2.78], position: [3.12, -0.082, 2.14], color: '#d8d8d4' },
  ]
  slabs.forEach((slab) => {
    const mesh = box({ ...slab, roughness: 0.78 })
    mesh.receiveShadow = true
    scene.add(mesh)
  })
}

function cameraTargetFor(roomId) {
  if (!roomId) return { pos: new THREE.Vector3(-0.45, 15.8, 6.9), look: new THREE.Vector3(-0.25, 0.06, 0.22) }
  const room = ROOM_LAYOUT.find(item => item.id === roomId)
  if (!room) return { pos: new THREE.Vector3(-0.45, 15.8, 6.9), look: new THREE.Vector3(-0.25, 0.06, 0.22) }
  return { pos: new THREE.Vector3(room.position[0] + 0.42, 2.35, room.position[2] + 2.05), look: new THREE.Vector3(room.position[0], 0.34, room.position[2]) }
}

export { ROOM_EVENTS, ROOM_LAYOUT }

export default function Home3DScene({ selectedRoom, onRoomSelect, roomState }) {
  const mountRef = useRef(null)
  const onRoomSelectRef = useRef(onRoomSelect)
  const selectedRoomRef = useRef(selectedRoom)
  const roomStateRef = useRef(roomState)
  const viewPitchRef = useRef('mid')
  const interactionModeRef = useRef('orbit')
  const roomLabelsCollapsedRef = useRef(true)
  const controlsApiRef = useRef(null)
  const [hoverRoom, setHoverRoom] = useState(null)
  const [inspectedObject, setInspectedObject] = useState(null)
  const [viewPitch, setViewPitch] = useState('mid')
  const [interactionMode, setInteractionMode] = useState('orbit')
  const [collapsedPanels, setCollapsedPanels] = useState({ legend: false, guide: false, binding: false, roomLabels: true })

  useEffect(() => { onRoomSelectRef.current = onRoomSelect }, [onRoomSelect])
  useEffect(() => { selectedRoomRef.current = selectedRoom }, [selectedRoom])
  useEffect(() => { roomStateRef.current = roomState }, [roomState])
  useEffect(() => { viewPitchRef.current = viewPitch }, [viewPitch])
  useEffect(() => { interactionModeRef.current = interactionMode }, [interactionMode])
  useEffect(() => { roomLabelsCollapsedRef.current = collapsedPanels.roomLabels }, [collapsedPanels.roomLabels])

  const selected = useMemo(() => ROOM_LAYOUT.find(room => room.id === selectedRoom), [selectedRoom])
  const activeFloor3dBinding = useMemo(() => (
    floor3dBindingFor(inspectedObject?.objectId)
    || floor3dBindingFor(selected ? `${selected.id}.floor` : null)
  ), [inspectedObject, selected])
  const summary = useMemo(() => ({
    windows: uniqueOpeningCount('window'),
    area: totalFloorArea().toFixed(1),
    walls: totalWallLength().toFixed(1),
  }), [])
  const togglePanel = (panel) => {
    setCollapsedPanels(prev => ({ ...prev, [panel]: !prev[panel] }))
  }
  const resetCameraControls = () => controlsApiRef.current?.reset()
  const focusCurrentRoom = () => controlsApiRef.current?.focus()

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#090909')
    scene.fog = new THREE.Fog('#090909', 7, 18)
    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 0.1, 100)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight('#fff6e8', '#1f2937', 1.15))
    const keyLight = new THREE.DirectionalLight('#fff7ed', 3.1)
    keyLight.position.set(2.8, 7.2, 4.8)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(2048, 2048)
    keyLight.shadow.camera.left = -7
    keyLight.shadow.camera.right = 7
    keyLight.shadow.camera.top = 7
    keyLight.shadow.camera.bottom = -7
    keyLight.shadow.camera.near = 1
    keyLight.shadow.camera.far = 18
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight('#b8d9ff', 0.9)
    fillLight.position.set(-5.2, 4.8, -3.6)
    scene.add(fillLight)
    const rim = new THREE.PointLight('#77c7ff', 3.2, 10)
    rim.position.set(-4.5, 2.8, 4.2)
    scene.add(rim)

    addShowroom(scene)
    addContinuousFloorBase(scene)
    const floorMap = woodTexture()
    const roomMeshes = []
    const topologyMeshes = []
    ROOM_LAYOUT.forEach((room) => {
      const group = new THREE.Group()
      addRoom(group, room, selectedRoomRef.current, floorMap)
      scene.add(group)
      group.traverse((child) => {
        if (child.userData.roomId) roomMeshes.push(child)
      })
    })
    addGlobalTopology(scene, roomStateRef.current, topologyMeshes)
    roomMeshes.push(...topologyMeshes)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const cameraTarget = cameraTargetFor(selectedRoomRef.current)
    camera.position.copy(cameraTarget.pos)
    const look = cameraTarget.look.clone()
    const controls = {
      theta: 0,
      phi: 0,
      zoom: 1,
      pan: new THREE.Vector3(0, 0, 0),
      dragging: false,
      dragButton: 0,
      dragShift: false,
      moved: false,
      lastX: 0,
      lastY: 0,
    }

    const resetControls = () => {
      controls.theta = 0
      controls.phi = 0
      controls.zoom = 1
      controls.pan.set(0, 0, 0)
    }

    controlsApiRef.current = {
      reset: resetControls,
      focus: () => {
        resetControls()
        if (!selectedRoomRef.current) {
          const roomId = ROOM_LAYOUT[0]?.id
          if (roomId) onRoomSelectRef.current(roomId)
        }
      },
    }

    const setPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    }

    const applyDrag = (event) => {
      if (!controls.dragging) return
      const dx = event.clientX - controls.lastX
      const dy = event.clientY - controls.lastY
      controls.dragShift = event.shiftKey
      controls.lastX = event.clientX
      controls.lastY = event.clientY
      if (Math.abs(dx) + Math.abs(dy) > 2) controls.moved = true

      const panMode = controls.dragButton !== 0 || controls.dragShift || interactionModeRef.current === 'pan'
      if (!panMode) {
        controls.theta = Math.max(-0.72, Math.min(0.72, controls.theta - dx * 0.0027))
        controls.phi = Math.max(-0.46, Math.min(0.52, controls.phi + dy * 0.0023))
        return
      }

      const right = new THREE.Vector3().subVectors(camera.position, look).cross(camera.up).normalize()
      const forward = new THREE.Vector3().subVectors(look, camera.position)
      forward.y = 0
      forward.normalize()
      const scale = 0.0028 * controls.zoom * camera.position.distanceTo(look)
      controls.pan.addScaledVector(right, -dx * scale)
      controls.pan.addScaledVector(forward, dy * scale)
      controls.pan.x = Math.max(-2.1, Math.min(2.1, controls.pan.x))
      controls.pan.z = Math.max(-2.1, Math.min(2.1, controls.pan.z))
    }

    const handlePointerMove = (event) => {
      applyDrag(event)
      if (controls.dragging) {
        renderer.domElement.style.cursor = interactionModeRef.current === 'pan' || controls.dragButton !== 0 ? 'move' : 'grabbing'
        return
      }
      setPointer(event)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(roomMeshes, false)[0]
      setHoverRoom(hit?.object?.userData?.roomId || null)
      if (hit?.object?.userData?.objectId) {
        setInspectedObject({
          objectId: hit.object.userData.objectId,
          roomId: hit.object.userData.roomId,
        })
      }
      renderer.domElement.style.cursor = hit ? 'pointer' : interactionModeRef.current === 'pan' ? 'move' : 'grab'
    }

    const handlePointerDown = (event) => {
      controls.dragging = true
      controls.dragButton = event.button
      controls.dragShift = event.shiftKey
      controls.moved = false
      controls.lastX = event.clientX
      controls.lastY = event.clientY
      renderer.domElement.setPointerCapture(event.pointerId)
      renderer.domElement.style.cursor = event.button === 0 ? 'grabbing' : 'move'
      event.preventDefault()
    }

    const handlePointerUp = (event) => {
      applyDrag(event)
      controls.dragging = false
      renderer.domElement.releasePointerCapture?.(event.pointerId)
    }

    const handleWheel = (event) => {
      event.preventDefault()
      const delta = Math.sign(event.deltaY)
      controls.zoom = Math.max(0.62, Math.min(1.65, controls.zoom * (delta > 0 ? 1.045 : 0.956)))
    }

    const handleContextMenu = (event) => event.preventDefault()

    const handleClick = (event) => {
      if (controls.moved) return
      setPointer(event)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(roomMeshes, false)[0]
      const roomId = hit?.object?.userData?.roomId
      if (hit?.object?.userData?.objectId) {
        setInspectedObject({
          objectId: hit.object.userData.objectId,
          roomId,
        })
      }
      if (roomId && roomId !== selectedRoomRef.current) onRoomSelectRef.current(roomId)
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)
    renderer.domElement.addEventListener('pointercancel', handlePointerUp)
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false })
    renderer.domElement.addEventListener('click', handleClick)
    renderer.domElement.addEventListener('contextmenu', handleContextMenu)

    const resize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', resize)

    let frameId = 0
    let visualOpen = Math.max(0.02, Math.min(1, (roomStateRef.current?.windowOpenPct || 0) / 100))
    let visualScreen = Math.max(0.02, Math.min(1, (roomStateRef.current?.screenPct ?? 100) / 100))
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const target = cameraTargetFor(selectedRoomRef.current)
      const desiredLook = target.look.clone().add(controls.pan)
      const offset = target.pos.clone().sub(target.look)
      const spherical = new THREE.Spherical().setFromVector3(offset)
      spherical.theta += controls.theta
      const pitchPreset = viewPitchRef.current === 'top' ? -0.34 : viewPitchRef.current === 'low' ? 0.42 : 0
      spherical.phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.04, spherical.phi + controls.phi + pitchPreset))
      spherical.radius *= controls.zoom
      const desiredPosition = new THREE.Vector3().setFromSpherical(spherical).add(desiredLook)
      camera.position.lerp(desiredPosition, 0.08)
      look.lerp(desiredLook, 0.09)
      camera.lookAt(look)
      const liveRoom = selectedRoomRef.current
      const targetOpen = Math.max(0.02, Math.min(1, (roomStateRef.current?.windowOpenPct || 0) / 100))
      const targetScreen = Math.max(0.02, Math.min(1, (roomStateRef.current?.screenPct ?? 100) / 100))
      visualOpen += (targetOpen - visualOpen) * 0.085
      visualScreen += (targetScreen - visualScreen) * 0.085
      const liveOpen = visualOpen
      const liveScreen = visualScreen
      const wallSeeThrough = Math.max(0, Math.min(1, (0.94 - controls.zoom) / 0.28))
      const wallBodyOpacity = 1 - wallSeeThrough * 0.74
      const wallCapOpacity = 1 - wallSeeThrough * 0.55
      scene.traverse((object) => {
        if (object.userData.kind === 'roomLabel') {
          object.visible = !roomLabelsCollapsedRef.current
        }
        if (object.userData.kind === 'wallBody' || object.userData.kind === 'wallCap') {
          const opacity = object.userData.kind === 'wallBody' ? wallBodyOpacity : wallCapOpacity
          object.material.opacity = opacity
          object.material.depthWrite = opacity > 0.72
          object.material.needsUpdate = true
        }
        if (object.userData.kind === 'slidingSash') {
          object.position.copy(object.userData.base)
          if (object.userData.roomId === liveRoom) object.position.addScaledVector(object.userData.slideVector, liveOpen)
          if (object.material.transparent) object.material.opacity = object.userData.roomId === liveRoom ? 0.46 : 0.34
        }
        if (object.userData.kind === 'screen') {
          object.position.copy(object.userData.base)
          const activeScreen = object.userData.roomId === liveRoom ? liveScreen : object.userData.screen
          const screenScale = Math.max(0.05, activeScreen)
          object.scale.y = screenScale
          object.position.y = object.userData.topY - 0.24 * screenScale
          object.visible = activeScreen > 0.03
        }
        if (object.userData.kind === 'screenPullBar') {
          object.position.copy(object.userData.base)
          const activeScreen = object.userData.roomId === liveRoom ? liveScreen : object.userData.screen
          object.position.y = object.userData.topY - 0.48 * Math.max(0.05, activeScreen) + 0.012
          object.visible = activeScreen > 0.03
        }
        if (object.userData.kind === 'beam') object.material.opacity = object.userData.roomId === liveRoom ? 0.16 + liveOpen * 0.16 : 0.06
      })
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp)
      renderer.domElement.removeEventListener('wheel', handleWheel)
      renderer.domElement.removeEventListener('click', handleClick)
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu)
      controlsApiRef.current = null
      mount.removeChild(renderer.domElement)
      scene.traverse((object) => {
        object.geometry?.dispose?.()
        if (object.material) {
          if (Array.isArray(object.material)) object.material.forEach(item => item.dispose())
          else object.material.dispose()
        }
      })
      floorMap.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div className="home3d-shell">
      <div className="home3d-canvas" ref={mountRef} />
      <div className="home3d-vignette" />
      <div className="home3d-control-dock" aria-label="3D 交互控制">
        <button
          type="button"
          className={interactionMode === 'orbit' ? 'active' : ''}
          onClick={() => setInteractionMode('orbit')}
          title="左键拖拽：慢速环绕观察"
        >
          <RotateCcw size={15} />
          <span>环绕</span>
        </button>
        <button
          type="button"
          className={interactionMode === 'pan' ? 'active' : ''}
          onClick={() => setInteractionMode('pan')}
          title="左键拖拽：平移整体户型"
        >
          <Move size={15} />
          <span>平移</span>
        </button>
        <button type="button" onClick={resetCameraControls} title="复位当前 3D 视角">
          <Home size={15} />
          <span>复位</span>
        </button>
        <button type="button" onClick={focusCurrentRoom} title="聚焦当前或默认房间">
          <Crosshair size={15} />
          <span>聚焦</span>
        </button>
      </div>
      <div className="home3d-view-tilt" aria-label="上下视角切换">
        <button
          type="button"
          className={viewPitch === 'top' ? 'active' : ''}
          onClick={() => setViewPitch(viewPitch === 'top' ? 'mid' : 'top')}
          title="俯视角"
        >
          <ChevronUp size={15} />
        </button>
        <button
          type="button"
          className={viewPitch === 'low' ? 'active' : ''}
          onClick={() => setViewPitch(viewPitch === 'low' ? 'mid' : 'low')}
          title="低视角"
        >
          <ChevronDown size={15} />
        </button>
      </div>
      <button
        type="button"
        className={`home3d-label-toggle ${collapsedPanels.roomLabels ? '' : 'active'}`}
        onClick={() => togglePanel('roomLabels')}
      >
        {collapsedPanels.roomLabels ? '展开房间标签' : '收起房间标签'}
      </button>
      <div className="home3d-hud">
        <div>
          <span className="eyebrow">Scene View</span>
          <h2>{selected?.name || '全屋户型'}</h2>
          <p>{selected?.persona || '严格按当前户型图：次卧A、次卧B、厨房、客卫、主卫、主卧、餐厅、客厅、玄关、阳台'}</p>
        </div>
        <button type="button" onClick={() => onRoomSelect(null)} title="查看全屋">
          <Maximize2 size={16} />
        </button>
      </div>
      <div className="home3d-room-rail">
        {ROOM_LAYOUT.map((room) => (
          <button
            key={room.id}
            type="button"
            className={`${selectedRoom === room.id ? 'active' : ''} ${hoverRoom === room.id ? 'hover' : ''}`}
            onClick={() => onRoomSelect(room.id)}
            style={{ '--room-color': room.color }}
          >
            <span />
            <strong>{room.name}</strong>
            <small>{room.product}</small>
          </button>
        ))}
      </div>
      <aside className={`floorplan-legend ${collapsedPanels.legend ? 'is-collapsed' : ''}`} aria-label="户型构件图例">
        <button type="button" className="panel-collapse" onClick={() => togglePanel('legend')}>
          {collapsedPanels.legend ? '展开图例' : '收起'}
        </button>
        <section>
          <h3>图例</h3>
          <p><span className="legend-window">W</span> 窗户 / 智能纱窗器</p>
          <p><span className="legend-wall" /> 墙体 / 开洞边界</p>
        </section>
        <section>
          <h3>统计</h3>
          <p>窗户数量 <b>{summary.windows}</b> 扇</p>
          <p>房间数量 <b>{ROOM_LAYOUT.length}</b> 间</p>
          <p>室内面积 <b>{summary.area}</b> ㎡</p>
        </section>
        <div className="north-mark">
          <span>N</span>
          <i />
        </div>
      </aside>
      {activeFloor3dBinding && (
        <div className={`floor3d-binding-card floor3d-binding-card--${activeFloor3dBinding.domain} ${collapsedPanels.binding ? 'is-collapsed' : ''}`}>
          <button type="button" className="panel-collapse" onClick={() => togglePanel('binding')}>
            {collapsedPanels.binding ? '展开实体' : '收起'}
          </button>
          <span>FLOOR3D ENTITY</span>
          <strong>{activeFloor3dBinding.label}</strong>
          <code>{activeFloor3dBinding.objectId}</code>
          <small>{activeFloor3dBinding.entityId}</small>
        </div>
      )}
      <div className="plan-card">
        <span>PLAN VIEW</span>
        <div className="plan-map">
          {ROOM_LAYOUT.map(room => (
            <button
              key={room.id}
              type="button"
              className={selectedRoom === room.id ? 'active' : ''}
              onClick={() => onRoomSelect(room.id)}
              style={planStyle(room)}
              title={room.name}
            />
          ))}
        </div>
        <div className="plan-meta">
          <b>W1-W{summary.windows}</b>
          <b>无门扇</b>
          <b>10 间</b>
        </div>
      </div>
      <div className="zoom-area-strip">
        {FLOOR3D_ZOOM_AREAS.map(area => (
          <button
            key={area.id}
            type="button"
            className={selectedRoom === area.id ? 'active' : ''}
            onClick={() => onRoomSelect(area.id)}
            title={`${area.label} zoom area`}
          >
            {area.label}
          </button>
        ))}
      </div>
      <div className={`component-guide ${collapsedPanels.guide ? 'is-collapsed' : ''}`}>
        <button type="button" className="panel-collapse" onClick={() => togglePanel('guide')}>
          {collapsedPanels.guide ? '展开说明' : '收起'}
        </button>
        <article>
          <strong>窗户 Window</strong>
          <span>蓝色编号 W1-W{summary.windows}，窗户只保留两类核心视觉：蓝色玻璃窗体左右开关，浅灰网纹纱网上下升降。</span>
        </article>
        <article>
          <strong>墙体 Wall</strong>
          <span>厚墙按房间边界生成，滚轮放大到近景时自动剖透墙体，便于查看墙后的窗户与家具。</span>
        </article>
        <article>
          <strong>通道 Passage</strong>
          <span>门扇已移除，只保留门框、立套线和过门石收边，房间之间保持连续开口。</span>
        </article>
      </div>
      {selectedRoom && (
        <button type="button" className="home3d-back" onClick={() => onRoomSelect(null)}>
          <ChevronLeft size={16} />
          全屋视角
        </button>
      )}
    </div>
  )
}
