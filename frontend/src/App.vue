<template>
  <div class="flex h-screen">
    <!-- Sidebar -->
    <div class="w-72 bg-gray-900 p-4 flex flex-col gap-4 overflow-y-auto">
      <h1 class="text-xl font-bold text-blue-400">天文星图渲染器</h1>

      <!-- Share / observation link -->
      <div class="bg-gray-800 rounded-xl p-3 flex flex-col gap-2">
        <label class="text-gray-400 text-xs">可复原的观测链路</label>
        <button @click="copyLink"
          class="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded px-3 py-2 text-sm font-medium transition-colors">
          复制观测链接
        </button>
        <p v-if="copyHint" class="text-xs" :class="copyOk ? 'text-green-400' : 'text-red-400'">{{ copyHint }}</p>
        <p class="text-[11px] text-gray-500 leading-relaxed">
          链接编码当前时间、纬度、缩放、三个显示开关与选中的星，同行打开即可还原同一片星空。
        </p>
      </div>

      <!-- Stale link warning -->
      <div v-if="stale" class="bg-amber-900/50 border border-amber-600 rounded-xl p-3 text-xs text-amber-200 flex flex-col gap-2">
        <p>⚠️ 观测参数已被修改，原链接对应的不是当前这片星空了。复制新链接后再发给同行。</p>
        <button @click="copyLink"
          class="self-start bg-amber-600 hover:bg-amber-500 rounded px-2 py-1 text-xs font-medium transition-colors">
          复制当前链接
        </button>
      </div>

      <!-- Parameter parse notices -->
      <div v-if="notices.length" class="flex flex-col gap-1">
        <p v-for="(n, i) in notices" :key="i"
          class="text-xs rounded px-2 py-1"
          :class="n.kind === 'warn' ? 'bg-red-950/60 text-red-300' : 'bg-gray-800 text-gray-300'">
          {{ n.text }}
        </p>
      </div>

      <!-- Search -->
      <div>
        <input v-model="store.searchQuery" placeholder="搜索天体..." class="w-full bg-gray-800 rounded px-3 py-2 text-sm" />
        <div v-if="store.filteredStars.length" class="mt-1">
          <div v-for="s in store.filteredStars" :key="s.name"
            @click="store.selectedStar = s"
            class="bg-gray-800 p-2 rounded mt-1 cursor-pointer hover:bg-gray-700 text-sm">
            {{ s.name }} <span class="text-gray-400">mag {{ s.mag }}</span>
          </div>
        </div>
      </div>

      <!-- Time Travel -->
      <div>
        <label class="text-gray-400 text-xs">时间旅行</label>
        <input type="datetime-local" step="1" v-model="dateStr" @input="updateDate"
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
      <div class="bg-gray-800/60 rounded-xl p-3">
        <h4 class="text-gray-300 text-sm font-medium mb-2">最近观测记录</h4>
        <p v-if="recentRecords.length === 0" class="text-xs text-gray-500 leading-relaxed">
          还没有观测记录。点击上方「复制观测链接」分享当前星空后，这里会保留记录，方便一键回到任意一次观测。
        </p>
        <ul v-else class="flex flex-col gap-1">
          <li v-for="rec in recentRecords" :key="rec.id"
            class="group flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-700 cursor-pointer"
            @click="restoreRecord(rec)">
            <div class="min-w-0 flex-1">
              <p class="text-xs text-gray-200 truncate">
                {{ rec.star ?? '未选中星' }}
              </p>
              <p class="text-[11px] text-gray-500">{{ formatTime(rec.time) }} · {{ rec.lat.toFixed(1) }}° · {{ rec.zoom.toFixed(1) }}x</p>
            </div>
            <button title="删除记录"
              class="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-xs px-1 transition-opacity"
              @click.stop="removeRecord(rec.id)">✕</button>
          </li>
        </ul>
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
    <div class="flex-1 relative">
      <StarCanvas />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSkyStore } from './store/sky'
import StarCanvas from './components/StarCanvas.vue'
import {
  parseState, buildSearch, findStar,
  loadRecords, saveRecord, deleteRecord,
  recordToState,
  type ObsState, type Notice, type ObsRecord,
} from './share'

const store = useSkyStore()

// ---------------- 状态 <-> 地址栏 的可复原链路 ----------------

function buildState(): ObsState {
  return {
    time: store.viewDate.getTime(),
    lat: Math.round(store.latitude * 10) / 10,
    zoom: Math.round(store.zoom * 10) / 10,
    labels: store.showLabels,
    lines: store.showConstLines,
    grid: store.showGrid,
    star: store.selectedStar ? store.selectedStar.name : null,
  }
}

function applyState(state: ObsState) {
  store.viewDate = new Date(state.time)
  dateStr.value = toLocalInput(state.time)
  store.latitude = state.lat
  store.zoom = state.zoom
  store.showLabels = state.labels
  store.showConstLines = state.lines
  store.showGrid = state.grid
  store.selectedStar = findStar(state.star)
}

/** 当前地址对应的规范链接（最近一次载入 / 复制 / 回退所确认的状态） */
const committedSearch = ref('')
const stale = ref(false)
const notices = ref<Notice[]>([])
const copyHint = ref('')
const copyOk = ref(true)
const recentRecords = ref<ObsRecord[]>(loadRecords())
const dateStr = ref(toLocalInput(Date.now()))

// 启动：从地址恢复同一片星空与同一个选中的星；缺失 / 越界参数逐项退回默认并说明
const initial = parseState(window.location.search)
notices.value = initial.notices
applyState(initial.state)
committedSearch.value = buildSearch(buildState())
syncAddressBar(committedSearch.value)

// 参数一旦偏离已确认的链接，立即标记原链接失效，并同步地址栏反映当前观测
watch(
  () => buildSearch(buildState()),
  (search) => {
    syncAddressBar(search)
    if (search !== committedSearch.value) {
      stale.value = true
      if (notices.value.length) notices.value = []
    }
  },
  { flush: 'post' },
)

function syncAddressBar(search: string) {
  const url = `${window.location.pathname}?${search}`
  window.history.replaceState(window.history.state, '', url)
}

function commit(state: ObsState) {
  const search = buildSearch(state)
  committedSearch.value = search
  syncAddressBar(search)
  stale.value = false
}

async function copyLink() {
  const state = buildState()
  const url = `${window.location.origin}${window.location.pathname}?${buildSearch(state)}`
  let ok = false
  try {
    await navigator.clipboard.writeText(url)
    ok = true
  } catch {
    // 非安全上下文 / 无剪贴板权限时的兜底
    const ta = document.createElement('textarea')
    ta.value = url
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { ok = document.execCommand('copy') } catch { ok = false }
    document.body.removeChild(ta)
  }
  copyOk.value = ok
  copyHint.value = ok
    ? `已复制：${state.star ? `选中「${state.star}」，` : ''}${formatTime(state.time)} 的观测链接`
    : '复制失败，请从地址栏手动复制链接'
  window.setTimeout(() => { copyHint.value = '' }, 3000)
  if (!ok) return
  commit(state)
  recentRecords.value = saveRecord(state) // 重新进入本页时地址与刚复制的链接一致
}

function restoreRecord(rec: ObsRecord) {
  const state = recordToState(rec)
  notices.value = []
  applyState(state) // watch 会同步地址栏并发现与 committed 不同；这里直接确认
  commit(state)
  recentRecords.value = saveRecord(state) // 回到的记录置顶
}

function removeRecord(id: string) {
  recentRecords.value = deleteRecord(id)
}

// ---------------- 时间选择器 ----------------

function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function updateDate() {
  const d = new Date(dateStr.value)
  if (!Number.isNaN(d.getTime())) store.viewDate = d
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}
</script>
