import { STARS } from './data/stars'
import type { Star } from './types'

/** 一次可复原观测的完整状态：时间、纬度、缩放、三个显示开关、选中星 */
export interface ObsState {
  time: number // epoch 毫秒
  lat: number // 纬度，°，[-90, 90]
  zoom: number // 缩放，[0.3, 3]
  labels: boolean // 星名标签
  lines: boolean // 星座连线
  grid: boolean // 坐标网格
  star: string | null // 选中星名
}

export interface Notice {
  kind: 'warn' | 'info'
  text: string
}

export interface ObsRecord extends ObsState {
  id: string
  savedAt: number // 入表时间 epoch 毫秒
}

export const DEFAULT_LAT = 39.9 // 北京
export const DEFAULT_ZOOM = 1.0
export const LAT_MIN = -90
export const LAT_MAX = 90
export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 3
const MAX_DATE_MS = 8640000000000 // JS Date 合法范围 ±1e8 天

const TOGGLE_LABEL: Record<'labels' | 'lines' | 'grid', string> = {
  labels: '星名标签',
  lines: '星座连线',
  grid: '坐标网格',
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function findStar(name: string | null): Star | null {
  if (!name) return null
  return STARS.find(s => s.name === name) ?? null
}

/**
 * 解析地址栏参数。参数缺失或非法（不可解析 / 超出范围）时逐项退回默认值，
 * 并返回说明原因的 notices；完全无参数的全新打开不产生提示。
 */
export function parseState(search: string): { state: ObsState; notices: Notice[] } {
  const params = new URLSearchParams(search)
  const present = new Set(Array.from(params.keys()))
  const isSharedLink = ['t', 'lat', 'z', 'labels', 'lines', 'grid', 'star'].some(k => present.has(k))
  const notices: Notice[] = []

  // ---- 时间 ----
  let time = Date.now()
  if (present.has('t')) {
    const n = Number(params.get('t'))
    if (!Number.isFinite(n) || !Number.isInteger(n) || Math.abs(n) > MAX_DATE_MS) {
      notices.push({ kind: 'warn', text: '观测时间参数无法解析或超出范围，已退回当前时间。' })
    } else {
      time = n
    }
  } else if (isSharedLink) {
    notices.push({ kind: 'warn', text: '链接缺少观测时间参数，已使用当前时间。' })
  }

  // ---- 纬度 ----
  let lat = DEFAULT_LAT
  if (present.has('lat')) {
    const n = Number(params.get('lat'))
    if (!Number.isFinite(n) || n < LAT_MIN || n > LAT_MAX) {
      notices.push({
        kind: 'warn',
        text: `纬度参数缺失或超出范围（${LAT_MIN}° ~ ${LAT_MAX}°），已恢复默认值 ${DEFAULT_LAT}°。`,
      })
    } else {
      lat = round1(n)
    }
  } else if (isSharedLink) {
    notices.push({ kind: 'warn', text: `链接缺少纬度参数，已使用默认值 ${DEFAULT_LAT}°。` })
  }

  // ---- 缩放 ----
  let zoom = DEFAULT_ZOOM
  if (present.has('z')) {
    const n = Number(params.get('z'))
    if (!Number.isFinite(n) || n < ZOOM_MIN || n > ZOOM_MAX) {
      notices.push({
        kind: 'warn',
        text: `缩放参数缺失或超出范围（${ZOOM_MIN} ~ ${ZOOM_MAX}），已恢复默认值 ${DEFAULT_ZOOM}。`,
      })
    } else {
      zoom = round1(n)
    }
  } else if (isSharedLink) {
    notices.push({ kind: 'warn', text: `链接缺少缩放参数，已使用默认值 ${DEFAULT_ZOOM}。` })
  }

  // ---- 三个显示开关 ----
  const parseToggle = (key: 'labels' | 'lines' | 'grid'): boolean => {
    if (!present.has(key)) {
      if (isSharedLink) notices.push({ kind: 'warn', text: `链接缺少「${TOGGLE_LABEL[key]}」开关参数，已按默认开启处理。` })
      return true
    }
    const v = params.get(key)
    if (v !== '0' && v !== '1') {
      notices.push({ kind: 'warn', text: `「${TOGGLE_LABEL[key]}」开关参数无效（只接受 0/1），已按默认开启处理。` })
      return true
    }
    return v === '1'
  }
  const labels = parseToggle('labels')
  const lines = parseToggle('lines')
  const grid = parseToggle('grid')

  // ---- 选中星 ----
  let star: string | null = null
  if (present.has('star')) {
    const name = params.get('star')
    if (name) {
      if (findStar(name)) {
        star = name
      } else {
        notices.push({ kind: 'warn', text: `链接中选中的星「${name}」在星表中不存在，已取消选中。` })
      }
    }
  }

  return { state: { time, lat, zoom, labels, lines, grid, star }, notices }
}

/** 按固定键序序列化，保证同一状态永远得到同一条链接 */
export function buildSearch(state: ObsState): string {
  const params = new URLSearchParams()
  params.set('t', String(Math.trunc(state.time)))
  params.set('lat', round1(state.lat).toFixed(1))
  params.set('z', round1(state.zoom).toFixed(1))
  params.set('labels', state.labels ? '1' : '0')
  params.set('lines', state.lines ? '1' : '0')
  params.set('grid', state.grid ? '1' : '0')
  if (state.star) params.set('star', state.star)
  return params.toString()
}

export function recordToState(rec: ObsRecord): ObsState {
  return {
    time: rec.time,
    lat: rec.lat,
    zoom: rec.zoom,
    labels: rec.labels,
    lines: rec.lines,
    grid: rec.grid,
    star: rec.star,
  }
}

// ---------------- 最近观测记录（localStorage） ----------------

const RECENT_KEY = 'sky-recent-observations-v1'
const MAX_RECENT = 8

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function isRecord(v: unknown): v is ObsRecord {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.savedAt === 'number' &&
    typeof o.time === 'number' &&
    typeof o.lat === 'number' &&
    typeof o.zoom === 'number' &&
    typeof o.labels === 'boolean' &&
    typeof o.lines === 'boolean' &&
    typeof o.grid === 'boolean' &&
    (typeof o.star === 'string' || o.star === null)
  )
}

export function loadRecords(): ObsRecord[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const arr: unknown = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(isRecord)
  } catch {
    return []
  }
}

function persist(records: ObsRecord[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(records))
  } catch {
    // 隐私模式 / 存储已满：记录功能静默降级
  }
}

/** 写入一条观测记录；与已有记录状态完全相同的去重置顶，最多保留 MAX_RECENT 条 */
export function saveRecord(state: ObsState): ObsRecord[] {
  const search = buildSearch(state)
  const rest = loadRecords().filter(r => buildSearch(recordToState(r)) !== search)
  const record: ObsRecord = { ...state, id: genId(), savedAt: Date.now() }
  const next = [record, ...rest].slice(0, MAX_RECENT)
  persist(next)
  return next
}

export function deleteRecord(id: string): ObsRecord[] {
  const next = loadRecords().filter(r => r.id !== id)
  persist(next)
  return next
}
