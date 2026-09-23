<template>
  <div class="flex h-screen">
    <!-- Sidebar -->
    <div class="w-72 bg-gray-900 p-4 flex flex-col gap-4 overflow-y-auto">
      <h1 class="text-xl font-bold text-blue-400">天文星图渲染器</h1>

      <!-- Search -->
      <div>
        <input v-model="store.searchQuery" placeholder="搜索天体..." class="w-full bg-gray-800 rounded px-3 py-2 text-sm" />
        <div v-if="store.filteredStars.length" class="mt-1">
          <div v-for="s in store.filteredStars" :key="s.name"
            @click="selectStar(s)"
            class="bg-gray-800 p-2 rounded mt-1 cursor-pointer hover:bg-gray-700 text-sm">
            {{ s.name }} <span class="text-gray-400">mag {{ s.mag }}</span>
          </div>
        </div>
      </div>

      <!-- Time Travel -->
      <div>
        <label class="text-gray-400 text-xs">时间旅行</label>
        <input type="datetime-local" v-model="dateStr" @input="updateDate"
          class="w-full bg-gray-800 rounded px-3 py-2 text-sm" />
      </div>

      <!-- Location -->
      <div>
        <label class="text-gray-400 text-xs">纬度: {{ store.latitude.toFixed(1) }}°</label>
        <input type="range" v-model.number="store.latitude" min="-90" max="90" step="0.1" class="w-full" />
      </div>

      <!-- Zoom -->
      <div>
        <label class="text-gray-400 text-xs">缩放: {{ store.zoom.toFixed(1) }}x</label>
        <input type="range" v-model.number="store.zoom" min="0.3" max="3" step="0.1" class="w-full" />
      </div>

      <!-- Toggles -->
      <div class="flex flex-col gap-2">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="store.showLabels" /> 星名标签
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="store.showConstLines" /> 星座连线
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="store.showGrid" /> 坐标网格
        </label>
      </div>

      <!-- Share / 可复原观测链接 -->
      <div class="bg-gray-800/70 rounded-xl p-3">
        <h4 class="text-blue-300 text-sm font-bold mb-2">分享观测</h4>
        <button @click="shareCurrent"
          class="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-3 py-2 text-sm font-medium">
          复制当前观测链接
        </button>
        <p class="text-[11px] mt-2 break-all text-gray-400 font-mono select-all">{{ shareUrl }}</p>
        <p v-if="copyState === 'copied'" class="text-[11px] mt-1 text-green-400">
          已复制！链接已与当前星空同步，他人打开可复看同一片星空。
        </p>
        <p v-else-if="copyState === 'failed'" class="text-[11px] mt-1 text-amber-400">
          浏览器未授权剪贴板，请手动选中上方链接复制。
        </p>
        <p v-else-if="stale" class="text-[11px] mt-1 text-amber-400">
          ⚠ 地址中的观测已被修改、链接失效；点上方按钮生成新链接。
        </p>
      </div>

      <!-- Star Info -->
      <div v-if="store.selectedStar" class="bg-gray-800 rounded-xl p-3">
        <h3 class="text-amber-400 font-bold">{{ store.selectedStar.name }}</h3>
        <div class="text-xs text-gray-300 mt-2 space-y-1">
          <p>赤经: {{ store.selectedStar.ra.toFixed(2) }}h</p>
          <p>赤纬: {{ store.selectedStar.dec.toFixed(2) }}°</p>
          <p>视星等: {{ store.selectedStar.mag }}</p>
          <p>光谱型: {{ store.selectedStar.spectral }}</p>
        </div>
      </div>

      <!-- Recent observations -->
      <div class="text-xs">
        <h4 class="text-gray-300 font-bold mb-1">最近观测</h4>
        <div v-if="records.length === 0" class="text-gray-500 italic py-2 leading-relaxed">
          暂无观测记录。调整好时间、纬度与缩放后点击「复制当前观测链接」，这里会留下记录，方便一键回到当时的星空。
        </div>
        <div v-for="r in records" :key="r.savedAt"
          class="group flex items-center gap-1 py-1.5 px-2 rounded hover:bg-gray-800 cursor-pointer"
          @click="restore(r.snapshot)">
          <div class="flex-1 min-w-0" :title="recordTitle(r.snapshot)">
            <div class="text-gray-200 truncate">{{ formatTime(r.snapshot.viewDate) }} · {{ r.snapshot.latitude.toFixed(1) }}°</div>
            <div class="text-gray-500 truncate">
              {{ r.snapshot.zoom.toFixed(1) }}x<template v-if="r.snapshot.star"> · {{ r.snapshot.star }}</template>
            </div>
          </div>
          <button @click.stop="removeOne(r.savedAt)"
            class="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 px-1"
            title="删除这条记录">✕</button>
        </div>
      </div>

      <!-- Constellation list -->
      <div class="text-xs">
        <h4 class="text-gray-400 mb-1">可见星座</h4>
        <div v-for="c in store.CONSTELLATIONS" :key="c.name" class="py-1 text-gray-300">
          {{ c.nameCn }} <span class="text-gray-500">({{ c.name }})</span>
        </div>
      </div>

      <div class="text-xs text-gray-500 mt-auto">
        LST: {{ store.localSiderealTime.toFixed(2) }}h
      </div>
    </div>

    <!-- Sky Canvas -->
    <div class="flex-1 relative flex flex-col min-w-0">
      <!-- 参数异常提示条 -->
      <div v-if="notices.length" class="z-10 m-3 mb-0 shrink-0 bg-amber-950/90 border border-amber-700/60 rounded-lg px-3 py-2 text-xs text-amber-200">
        <div class="flex items-start gap-2">
          <div class="flex-1 space-y-0.5">
            <p v-for="(n, i) in notices" :key="i">· {{ n }}</p>
          </div>
          <button @click="notices = []" class="text-amber-400/70 hover:text-amber-200" title="关闭提示">✕</button>
        </div>
      </div>
      <!-- 链接失效提示条：参数恢复同步前一直保留，不会悄悄换成另一片星空 -->
      <div v-if="stale" class="z-10 m-3 mb-0 shrink-0 bg-red-950/90 border border-red-700/60 rounded-lg px-3 py-2 text-xs text-red-200 leading-relaxed">
        ⚠ 当前星空已偏离地址中的观测，原链接已失效。点击侧栏「复制当前观测链接」可生成与当前星空一致的新链接，或从「最近观测」一键回到任一记录。
      </div>
      <div class="flex-1 relative mt-3">
        <StarCanvas />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSkyStore } from './store/sky'
import StarCanvas from './components/StarCanvas.vue'
import type { Star } from './types'
import {
  decodeSnapshot, buildObservationUrl, writeUrl, sameObservation,
  loadRecords, addRecord, removeRecord, findStar, formatTime,
  type ObservationSnapshot,
} from './utils/observation'

const store = useSkyStore()

// ---------- 快照与 store 的互转 ----------
function snapshotFromStore(): ObservationSnapshot {
  return {
    viewDate: store.viewDate,
    latitude: Math.round(store.latitude * 10) / 10,
    zoom: Math.round(store.zoom * 10) / 10,
    showLabels: store.showLabels,
    showConstLines: store.showConstLines,
    showGrid: store.showGrid,
    star: store.selectedStar ? store.selectedStar.name : null,
  }
}

function applySnapshot(snap: ObservationSnapshot) {
  store.viewDate = new Date(snap.viewDate)
  dateStr.value = toDatetimeLocal(store.viewDate)
  store.latitude = snap.latitude
  store.zoom = snap.zoom
  store.showLabels = snap.showLabels
  store.showConstLines = snap.showConstLines
  store.showGrid = snap.showGrid
  store.selectedStar = findStar(snap.star)
}

// ---------- 初始化：从地址还原观测 ----------
const notices = ref<string[]>([])
/** 地址当前声明的观测（null 表示全新打开、地址中没有观测参数） */
const urlSnapshot = ref<ObservationSnapshot | null>(null)
const stale = ref(false)

function initFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const { snapshot, warnings, hadParams } = decodeSnapshot(params)

  applySnapshot(snapshot)

  if (hadParams) {
    // 分享链接：即使参数全部合法，也让地址与「实际还原后」的快照严格一致
    writeUrl(snapshot, 'replace')
    urlSnapshot.value = snapshot
    stale.value = false
    if (warnings.length) {
      notices.value = ['链接中的部分参数有问题，已退回默认值：', ...warnings]
    }
  } else {
    // 全新打开：以当前观测初始化地址，重新进入本页时保持一致
    const fresh = snapshotFromStore()
    writeUrl(fresh, 'replace')
    urlSnapshot.value = fresh
  }
}

// 当前观测相对地址是否已偏离（watch 回调在初始化赋值之后才开始生效）
watch(
  () => snapshotFromStore(),
  (cur) => {
    if (urlSnapshot.value) stale.value = !sameObservation(cur, urlSnapshot.value)
  },
  { deep: true }
)

// ---------- 时间选择器 ----------
const dateStr = ref(toDatetimeLocal(store.viewDate))
function updateDate() {
  const d = new Date(dateStr.value)
  if (!isNaN(d.getTime())) store.viewDate = d
}
function toDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// ---------- 选中星（搜索点击也走这里，保证地址/失效检测一致） ----------
function selectStar(s: Star) {
  store.selectedStar = s
}

// ---------- 分享：复制链接 + 写入最近记录 ----------
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
const shareUrl = ref('')
let copyTimer: ReturnType<typeof setTimeout> | undefined

function shareCurrent() {
  const snap = snapshotFromStore()
  const url = buildObservationUrl(snap, window.location.href)
  shareUrl.value = url
  writeUrl(snap, 'replace')
  urlSnapshot.value = { ...snap, viewDate: new Date(snap.viewDate) }
  stale.value = false
  records.value = addRecord(snap)

  copyState.value = 'idle'
  clearTimeout(copyTimer)
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(
      () => { copyState.value = 'copied'; resetCopyState() },
      () => { copyState.value = 'failed'; resetCopyState() }
    )
  } else {
    const ta = document.createElement('textarea')
    ta.value = url
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    document.body.removeChild(ta)
    copyState.value = ok ? 'copied' : 'failed'
    resetCopyState()
  }
}

function resetCopyState() {
  copyTimer = setTimeout(() => { copyState.value = 'idle' }, 3000)
}

// ---------- 最近观测记录 ----------
const records = ref(loadRecords())

function restore(snap: ObservationSnapshot) {
  const copy: ObservationSnapshot = { ...snap, viewDate: new Date(snap.viewDate) }
  applySnapshot(copy)
  writeUrl(copy, 'replace')
  urlSnapshot.value = { ...copy, viewDate: new Date(copy.viewDate) }
  stale.value = false
  notices.value = []
}

function removeOne(savedAt: number) {
  records.value = removeRecord(savedAt)
}

function recordTitle(snap: ObservationSnapshot): string {
  const flags = [
    snap.showLabels ? '标签' : null,
    snap.showConstLines ? '连线' : null,
    snap.showGrid ? '网格' : null,
  ].filter(Boolean).join('/')
  return `${formatTime(snap.viewDate)} · 纬度 ${snap.latitude.toFixed(1)}° · ${snap.zoom.toFixed(1)}x · ${flags}${snap.star ? ' · ' + snap.star : ''}`
}

initFromUrl()
shareUrl.value = buildObservationUrl(snapshotFromStore(), window.location.href)
</script>
