import { STARS } from '../data/stars'
import type { Star } from '../types'

/** 一次可复原的观测快照：时间、纬度、缩放、三个显示开关、选中星 */
export interface ObservationSnapshot {
  viewDate: Date
  latitude: number
  zoom: number
  showLabels: boolean
  showConstLines: boolean
  showGrid: boolean
  star: string | null
}

export function defaultSnapshot(now = new Date()): ObservationSnapshot {
  return {
    viewDate: now,
    latitude: 39.9, // 北京
    zoom: 1.0,
    showLabels: true,
    showConstLines: true,
    showGrid: true,
    star: null,
  }
}

/** 最近观测记录（带存档时刻，便于列表展示） */
export interface ObservationRecord {
  savedAt: number
  snapshot: ObservationSnapshot
}

const HISTORY_KEY = 'sky-observation-history'
const HISTORY_LIMIT = 10

/**
 * 地址参数键名：
 * t 观测时间(ISO)、lat 纬度、zoom 缩放、labels/const/grid 开关、star 选中星名
 */
export const PARAM_KEYS = {
  time: 't',
  lat: 'lat',
  zoom: 'zoom',
  labels: 'labels',
  constLines: 'const',
  grid: 'grid',
  star: 'star',
} as const

const LAT_MIN = -90, LAT_MAX = 90
const ZOOM_MIN = 0.3, ZOOM_MAX = 3

export interface DecodeResult {
  snapshot: ObservationSnapshot
  /** 地址中存在但缺失/非法/越界、已退回默认的参数说明 */
  warnings: string[]
  /** 地址中是否带过任何观测参数（用于区分全新打开与分享链接） */
  hadParams: boolean
}

/**
 * 开关参数：缺失时静默退回默认（允许只带部分参数的链接）；
 * 只有“给了但不是 0/1”才说明原因。
 */
function decodeBool(raw: string | null, paramName: string, label: string, warnings: string[]): boolean {
  if (raw === null) return true
  if (raw !== '1' && raw !== '0') {
    warnings.push(`参数「${label}」(${paramName}=${raw})不是 0/1，已按默认开启处理`)
    return true
  }
  return raw === '1'
}

/** 解析地址栏参数；缺失/非法/越界的参数退回默认并记录原因 */
export function decodeSnapshot(params: URLSearchParams, now = new Date()): DecodeResult {
  const warnings: string[] = []
  const snap = defaultSnapshot(now)

  const raw: Record<string, string | null> = {}
  let hadParams = false
  for (const key of Object.values(PARAM_KEYS)) {
    raw[key] = params.get(key)
    if (raw[key] !== null) hadParams = true
  }

  // 时间：必须是可被 Date 解析的 ISO 字符串
  if (raw[PARAM_KEYS.time] !== null) {
    const d = new Date(raw[PARAM_KEYS.time] as string)
    if (isNaN(d.getTime())) {
      warnings.push(`观测时间(t=${raw[PARAM_KEYS.time]})无法解析，已使用当前时间`)
    } else {
      snap.viewDate = d
    }
  }

  // 纬度：数值且在 [-90, 90]
  if (raw[PARAM_KEYS.lat] !== null) {
    const v = Number(raw[PARAM_KEYS.lat])
    if (raw[PARAM_KEYS.lat]!.trim() === '' || Number.isNaN(v) || v < LAT_MIN || v > LAT_MAX) {
      warnings.push(`纬度(lat=${raw[PARAM_KEYS.lat]})超出范围或不是数字，已退回默认 39.9°`)
    } else {
      snap.latitude = Math.round(v * 10) / 10
    }
  }

  // 缩放：数值且在 [0.3, 3]
  if (raw[PARAM_KEYS.zoom] !== null) {
    const v = Number(raw[PARAM_KEYS.zoom])
    if (raw[PARAM_KEYS.zoom]!.trim() === '' || Number.isNaN(v) || v < ZOOM_MIN || v > ZOOM_MAX) {
      warnings.push(`缩放(zoom=${raw[PARAM_KEYS.zoom]})超出范围或不是数字，已退回默认 1.0x`)
    } else {
      snap.zoom = Math.round(v * 10) / 10
    }
  }

  snap.showLabels = decodeBool(raw[PARAM_KEYS.labels], PARAM_KEYS.labels, '星名标签', warnings)
  snap.showConstLines = decodeBool(raw[PARAM_KEYS.constLines], PARAM_KEYS.constLines, '星座连线', warnings)
  snap.showGrid = decodeBool(raw[PARAM_KEYS.grid], PARAM_KEYS.grid, '坐标网格', warnings)

  // 选中星：缺失 = 未选星（正常）；给出但在星表中找不到才算异常
  if (raw[PARAM_KEYS.star] !== null) {
    const name = raw[PARAM_KEYS.star] as string
    if (STARS.some(s => s.name === name)) {
      snap.star = name
    } else {
      warnings.push(`选中星(star=${name})不在星表中，已取消选中`)
    }
  }

  return { snapshot: snap, warnings, hadParams }
}

/** 把观测快照编码进地址（用 replaceState，不产生多余历史栈） */
export function buildObservationUrl(snap: ObservationSnapshot, base?: string): string {
  const p = new URLSearchParams()
  p.set(PARAM_KEYS.time, snap.viewDate.toISOString())
  p.set(PARAM_KEYS.lat, String(snap.latitude))
  p.set(PARAM_KEYS.zoom, String(snap.zoom))
  p.set(PARAM_KEYS.labels, snap.showLabels ? '1' : '0')
  p.set(PARAM_KEYS.constLines, snap.showConstLines ? '1' : '0')
  p.set(PARAM_KEYS.grid, snap.showGrid ? '1' : '0')
  if (snap.star) p.set(PARAM_KEYS.star, snap.star)
  const origin = base ?? (typeof window !== 'undefined' ? window.location.href : '')
  const url = new URL(origin)
  url.search = p.toString()
  return url.toString()
}

export function writeUrl(snap: ObservationSnapshot, mode: 'replace' | 'push' = 'replace') {
  const url = buildObservationUrl(snap)
  if (mode === 'push') {
    window.history.pushState(window.history.state, '', url)
  } else {
    window.history.replaceState(window.history.state, '', url)
  }
}

/** 两个快照是否指向同一片星空与同一颗选中星（数值已按地址精度取整） */
export function sameObservation(a: ObservationSnapshot, b: ObservationSnapshot): boolean {
  return a.viewDate.getTime() === b.viewDate.getTime()
    && a.latitude === b.latitude
    && a.zoom === b.zoom
    && a.showLabels === b.showLabels
    && a.showConstLines === b.showConstLines
    && a.showGrid === b.showGrid
    && a.star === b.star
}

/** 从地址栏读取当前声明的观测快照（无参数时返回 null） */
export function readUrlSnapshot(): ObservationSnapshot | null {
  const params = new URLSearchParams(window.location.search)
  const { hadParams, snapshot } = decodeSnapshot(params)
  return hadParams ? snapshot : null
}

// ---- 最近观测记录（localStorage）----

export function loadRecords(): ObservationRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as Array<{ savedAt: number; snapshot: SerializedSnapshot }>
    if (!Array.isArray(list)) return []
    return list
      .filter(r => r && typeof r.savedAt === 'number' && r.snapshot && !isNaN(new Date(r.snapshot.viewDate).getTime()))
      .map(r => ({ savedAt: r.savedAt, snapshot: hydrate(r.snapshot) }))
  } catch {
    return []
  }
}

interface SerializedSnapshot extends Omit<ObservationSnapshot, 'viewDate'> {
  viewDate: string
}

function hydrate(s: SerializedSnapshot): ObservationSnapshot {
  return { ...s, viewDate: new Date(s.viewDate) }
}

function serialize(snap: ObservationSnapshot): SerializedSnapshot {
  return { ...snap, viewDate: snap.viewDate.toISOString() }
}

function persist(records: ObservationRecord[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records.map(r => ({
      savedAt: r.savedAt,
      snapshot: serialize(r.snapshot),
    }))))
  } catch {
    // localStorage 不可用（隐私模式等）：记录功能静默降级
  }
}

/** 存入一条最近观测；同一快照去重、新的在前、最多保留 HISTORY_LIMIT 条 */
export function addRecord(snap: ObservationSnapshot, savedAt = Date.now()): ObservationRecord[] {
  const records = loadRecords().filter(r => !sameObservation(r.snapshot, snap))
  records.unshift({ savedAt, snapshot: snap })
  persist(records.slice(0, HISTORY_LIMIT))
  return loadRecords()
}

export function removeRecord(savedAt: number): ObservationRecord[] {
  const records = loadRecords().filter(r => r.savedAt !== savedAt)
  persist(records)
  return records
}

export function formatTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function findStar(name: string | null): Star | null {
  if (!name) return null
  return STARS.find(s => s.name === name) ?? null
}
