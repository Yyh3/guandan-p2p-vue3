<!--
  RoomView.vue — v4.x 房间大厅大改版

  设计目标（UI-P1 阶段）:
    - 顶部信息一行展示，不再拥挤
    - 二维码/邀请改为弹窗，不常驻右上角
    - 空座位仅保留头像轮廓 + "等待加入"
    - 队友/对手用边框色区分；房主只保留皇冠徽章
    - 非核心入口（切牌）压缩，花色选择器/详情按钮收起
    - 按钮统一使用 app-theme 的 .app-btn-* 层级

  保留的网络/状态逻辑与 v3.x 一致。
-->
<template>
  <div class="page">
    <!-- 背景 -->
    <div class="bg-stars" aria-hidden="true">
      <span
        v-for="(s, i) in stars"
        :key="i"
        class="star"
        :style="{ top: s.top, left: s.left, width: s.size, height: s.size, opacity: s.opacity, animationDelay: s.delay + 's' }"
      ></span>
    </div>
    <div class="bg-felt" aria-hidden="true"></div>

    <!-- 顶部栏 -->
    <header class="room-header">
      <button class="header-menu" @click="showMenu" title="菜单" aria-label="菜单" data-testid="menu-btn"><span aria-hidden="true">≡</span></button>
      <div class="header-title">
        <span class="header-label">房间</span>
        <span class="header-roomno">{{ roomNo }}</span>
      </div>
      <div class="header-meta">
        <span class="net-status" :class="netStatusClass">{{ netStatus }} {{ netStatusText }}</span>
        <button class="header-more" @click="onEditMyInfo" title="编辑昵称" aria-label="编辑昵称" data-testid="edit-info-btn"><span aria-hidden="true">⋯</span></button>
      </div>
    </header>

    <!-- 房间信息卡 -->
    <div class="info-card" data-testid="room-info-card">
      <div class="info-main">
        <div class="info-roomno">{{ roomNo }}</div>
        <div class="info-host-ip">
          <template v-if="isHost">
            <template v-if="canInviteCrossDevice">
              <span class="info-host-label">本机 IP</span>
              <code class="info-host-value">{{ formatHostAddr() }}</code>
            </template>
            <template v-else>
              <span class="info-host-label">联机模式</span>
              <code class="info-host-value info-host-value-disabled">浏览器仅本机多标签,跨手机请用 Android App</code>
            </template>
          </template>
          <template v-else>
            <span class="info-host-label">房间号</span>
            <code class="info-host-value">{{ roomNo }}</code>
          </template>
        </div>
      </div>
      <div class="info-side">
        <div class="info-count"><strong>{{ peers.size }}</strong>/4 人</div>
        <button
          v-if="isHost && canInviteCrossDevice"
          class="info-copy-btn"
          @click="onCopyIp"
          title="复制房主地址"
          aria-label="复制房主地址"
          data-testid="copy-ip-btn"
        >📋</button>
      </div>
    </div>

    <!-- 4 座位 -->
    <div
      v-for="s in [0, 1, 2, 3]"
      :key="s"
      class="seat"
      :class="[['seat-top', 'seat-left', 'seat-bottom', 'seat-right'][s], seatClass(s)]"
      :data-testid="['seat-top', 'seat-left', 'seat-bottom', 'seat-right'][s]"
    >
      <div v-if="isHostSeat(s)" class="seat-badge seat-badge-crown" aria-label="房主">👑</div>
      <div class="seat-avatar-wrap">
        <div class="seat-avatar">
          <span class="avatar-icon" aria-hidden="true">{{ getPeer(s)?.avatar || '🀄' }}</span>
          <div v-if="getPeer(s)?.ready" class="ready-mark" aria-label="已准备">✓</div>
        </div>
      </div>
      <div class="seat-name">{{ getPeer(s)?.nickname || '等待加入' }}</div>
      <button v-if="isSelfSeat(s) && !isHost" class="seat-ready-btn" @click="onToggleReady" :data-testid="`seat-ready-btn-${s}`">
        {{ myReady ? '取消准备' : '准备' }}
      </button>
      <div v-else-if="isSelfSeat(s) && isHost" class="seat-host-label">房主</div>
      <button v-if="isHost && canKick(s)" class="seat-kick" @click="onKickPlayer(s)" title="踢出房间" aria-label="踢出该玩家" :data-testid="`kick-seat-${s}`"><span aria-hidden="true">✕</span></button>
      <button v-if="isHost && isTeammateSeat(s) && getPeer(s)" class="seat-swap" @click="onSwapWithTeammate" data-testid="swap-btn">换队友</button>
    </div>

    <!-- 底部操作 -->
    <div class="actions-row" data-testid="actions-row">
      <button class="app-btn app-btn-primary" :disabled="primaryBtnDisabled" @click="isHost ? tryStartGame() : onToggleReady()" data-testid="btn-start">
        <IconPlay class="btn-icon" :size="18" aria-hidden="true" />
        <span class="btn-text">{{ primaryBtnText }}</span>
      </button>
      <button class="app-btn app-btn-secondary" @click="openInvite" data-testid="btn-invite">
        <IconLink class="btn-icon" :size="18" aria-hidden="true" />
        <span class="btn-text">邀请好友</span>
      </button>
    </div>

    <!-- 切牌（保留但弱化） -->
    <div class="cut-card" @click="onCut" data-testid="cut-card" role="img" aria-label="切牌"><span aria-hidden="true">♠♦♣♥</span><br/><span class="cut-card-text">切牌</span></div>

    <!-- 同步切牌覆盖层 -->
    <div v-if="isCutting" class="cut-overlay" role="dialog" aria-modal="true" aria-label="切牌定首家">
      <div class="cut-panel">
        <h3 class="cut-title">切牌定首家</h3>
        <div class="cut-deck">
          <div
            v-for="i in 4"
            :key="i"
            class="cut-card-back"
            :class="{ 'cut-revealed': cutRevealed && cutFirstSeat === i - 1 }"
          >
            <span v-if="cutRevealed && cutFirstSeat === i - 1" class="cut-result">首家</span>
          </div>
        </div>
        <p v-if="cutRevealed" class="cut-status">座位 {{ cutFirstSeat }} 先出</p>
        <p v-else class="cut-status">切牌中…</p>
      </div>
    </div>

    <NicknameEditor
      v-if="showNickEditor"
      @close="showNickEditor = false"
      @confirm="onNickConfirm"
    />

    <InviteDialog
      v-if="showInvite"
      :is-host="isHost"
      :room-no="roomNo"
      :host-ip="hostIp"
      :host-port="hostPort"
      :qr-data-url="qrDataUrl"
      @copied="onCopied"
      @close="showInvite = false"
    />

    <!-- 唯一 position: fixed 浮层 -->
    <div v-if="copyToast" class="copy-toast" role="status" data-testid="copy-toast">{{ copyToast }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import storage from '@/common/storage.js'
import net from '@/common/network.js'
import WsServer, { isNativeCapacitor } from '@/common/ws-server.js'
import { buildRoomJoinUrl } from '@/common/qr-fallback.js'
import NicknameEditor from '@/components/NicknameEditor.vue'
import InviteDialog from '@/components/InviteDialog.vue'
import { showConfirm, showToast } from '@/common/dialog-bus.js'
import * as haptics from '@/common/haptics.js'
import IconPlay from '@/components/icons/IconPlay.vue'
import IconLink from '@/components/icons/IconLink.vue'

const route = useRoute()
const router = useRouter()
// ★ v0.4.25 P0-05 修复:进入房间页时若已有活跃 session,角色必须以 network 为准 —
//   joiner 在牌局中被迁移为新 host(net.isHost()=true)后点「返回房间」,
//   若仍信旧路由 role=joiner,initNetwork 的 session 复用判断会拿 isHost.value=false
//   去比对 net.isHost()=true → 误判不匹配,关闭刚启动的 server 并按旧 host 地址重加。
//   路由 query 只能作为首次初始化参数,不能覆盖活跃网络权威。
const sessionActiveAtEntry = typeof net.isConnected === 'function' && net.isConnected()
const isHost = ref(sessionActiveAtEntry ? net.isHost() : route.query.role !== 'joiner')
const isNative = ref(false)
const hostIp = ref('')
const hostPort = ref(8848)
const qrDataUrl = ref('')
const qrLibOk = ref(true)

// ★ P1-07 修复:生产环境不暴露调试接口,避免用户通过开发者工具伪造消息/踢人/换座。
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.__gd_net = net
}

// ★ P0-06/P1-06 修复:判断当前 host 是否具备真正的跨设备邀请能力。
//   普通浏览器 host 默认使用 BroadcastChannel,只能同源多标签联机,不能跨手机;
//   只有 Android App(native WebSocket server)才显示可访问的 IP / 二维码。
function isLoopback(host) {
  if (!host) return true
  return ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())
}
const canInviteCrossDevice = computed(() => {
  return isNative.value && !!hostIp.value && !isLoopback(hostIp.value)
})

const disposers = []
function onNet(event, handler) {
  net.on(event, handler)
  disposers.push(() => {
    try { net.off(event, handler) } catch (e) { /* swallow */ }
  })
}
function cleanupRoomListeners() {
  while (disposers.length) {
    try { disposers.pop()() } catch (e) { /* swallow */ }
  }
  clearCutTimers()
  clearJoinTimeout()
}

function genStars() {
  const positions = [
    [8, 12, 2, 0.7, 0],
    [22, 38, 1.5, 0.55, 1.2],
    [5, 55, 2.5, 0.85, 2.4],
    [15, 78, 1.8, 0.6, 0.6],
    [28, 92, 2, 0.75, 1.8],
    [10, 18, 1.2, 0.5, 2.7],
    [25, 26, 2.2, 0.8, 3.5],
    [18, 62, 1.6, 0.6, 1.5],
    [30, 48, 2, 0.7, 0.3],
    [12, 85, 1.4, 0.55, 2.0],
    [6, 30, 1.8, 0.65, 3.0],
    [20, 70, 2.2, 0.85, 1.0],
    [3, 65, 1.5, 0.55, 2.2],
    [27, 8, 1.8, 0.7, 0.9],
  ]
  return positions.map(([top, left, size, opacity, delay]) => ({
    top: top + '%',
    left: left + '%',
    size: size + 'px',
    opacity,
    delay,
  }))
}
const stars = ref(genStars())

let QRCodeLib = null
async function ensureQrcodeLib() {
  if (QRCodeLib !== null) return QRCodeLib
  try {
    const mod = await import('qrcode')
    QRCodeLib = (mod && mod.default) || mod
    if (typeof QRCodeLib?.toDataURL !== 'function') {
      QRCodeLib = null
      qrLibOk.value = false
    }
  } catch (e) {
    QRCodeLib = null
    qrLibOk.value = false
  }
  return QRCodeLib
}

function pickRoomNo() {
  if (route.query.roomNo) return String(route.query.roomNo)
  if (isHost.value) {
    const saved = sessionStorage.getItem('guandan_host_room')
    if (saved) return saved
    const fresh = String(Math.floor(100000 + Math.random() * 900000))
    sessionStorage.setItem('guandan_host_room', fresh)
    return fresh
  }
  return String(Math.floor(100000 + Math.random() * 900000))
}
const roomNo = ref(pickRoomNo())
const myName = ref('')
const myAvatar = ref('🀄')
const myReady = ref(false)
const mySuit = ref(0)
const mySeat = ref(isHost.value ? 0 : null)
const hostSeat = ref(0)
const showNickEditor = ref(false)
const showInvite = ref(false)
const netStatus = ref('⏺')
const peers = reactive(new Map())

// ★ Phase3 同步切牌状态
const isCutting = ref(false)
const cutFirstSeat = ref(0)
const cutRevealed = ref(false)
let cutTimer = null
let cutInterval = null

// ★ v0.4.24 修复:joiner 加入超时 — joinRoom 同步返回 ok 只代表本地 channel 开好,
//   BC 模式输入不存在的房间号也显示绿灯。8s 内没收到 SYNC/ROOM_FULL 就给用户明确反馈。
let joinTimeoutId = null
function clearJoinTimeout() {
  if (joinTimeoutId) { clearTimeout(joinTimeoutId); joinTimeoutId = null }
}
function armJoinTimeout() {
  clearJoinTimeout()
  joinTimeoutId = setTimeout(() => {
    joinTimeoutId = null
    netStatus.value = '🔴'
    showToast('未找到房间,请确认房间号或房主 IP 后重试')
  }, 8000)
}

// ★ P1-04 修复:房主座位不显示准备按钮;★ P1-14 修复:主按钮根据状态显示具体提示。
const primaryBtnText = computed(() => {
  if (!isHost.value) return myReady.value ? '取消准备' : '准备'
  if (peers.size < 4) {
    return `还差 ${4 - peers.size} 人`
  }
  const notReady = Array.from(peers.entries())
    .filter(([seat, p]) => seat !== hostSeat.value && !p.ready).length
  if (notReady > 0) {
    return `等待 ${notReady} 人准备`
  }
  return '开始游戏'
})
const primaryBtnDisabled = computed(() => {
  if (!isHost.value) return false
  if (peers.size < 4) return true
  return !Array.from(peers.entries()).every(([seat, p]) => seat === hostSeat.value || p.ready)
})
const netStatusClass = computed(() => {
  if (netStatus.value === '🟢') return 'net-ok'
  if (netStatus.value === '🔴') return 'net-bad'
  return 'net-pending'
})
// ★ v0.4.24:圆点旁加文字,色弱用户/新用户不再看不懂状态
const netStatusText = computed(() => {
  if (netStatus.value === '🟢') return '已连接'
  if (netStatus.value === '🔴') return '未连接'
  return '连接中'
})

async function generateQr() {
  if (!hostIp.value) return
  const lib = await ensureQrcodeLib()
  if (!lib) return
  // ★ P1-15:二维码编码可打开的 http join URL,普通扫码器也能识别。
  const text = buildRoomJoinUrl(hostIp.value, hostPort.value, roomNo.value)
  if (!text) return
  try {
    qrDataUrl.value = await lib.toDataURL(text, { width: 320, margin: 1 })
  } catch (e) {
    qrLibOk.value = false
  }
}

function getPeer(seat) { return peers.get(seat) }
function seatClass(idx) {
  const filled = peers.has(idx) ? 'filled' : 'empty'
  const team = (idx % 2) === (mySeat.value % 2) ? 'team-mate' : 'team-opp'
  return `${filled} ${team}`
}
function isSelfSeat(idx) { return idx === mySeat.value }
function isHostSeat(idx) { return idx === hostSeat.value }
function isTeammateSeat(idx) { return idx === (hostSeat.value + 2) % 4 }
function canKick(idx) { return !isHostSeat(idx) && !isTeammateSeat(idx) && peers.has(idx) }
function formatHostAddr() {
  if (!hostIp.value) return '获取中...'
  return `${hostIp.value}:${hostPort.value}`
}

// ★ P1-13:把 RoomView 的网络监听与网络初始化拆开,支持从 GameView 返回房间时复用已有 session。
function attachRoomListeners() {
  onNet('connect', ({ seat, info }) => {
    netStatus.value = '🟢'
    clearJoinTimeout()  // v0.4.24:连上即取消加入超时
    if (seat != null && info) {
      peers.set(seat, { ...info, ready: false })
    }
    try {
      const ns = net.getSelfSeat ? net.getSelfSeat() : null
      if (ns != null && ns >= 0 && ns <= 3) mySeat.value = ns
      const nh = net.getHostSeat ? net.getHostSeat() : null
      if (nh != null && nh >= 0 && nh <= 3) hostSeat.value = nh
    } catch (e) { /* swallow */ }
  })
  onNet('error', (e) => {
    netStatus.value = '🔴'
    console.error('network error:', e)
    // ★ v0.4.24:连接失败不再只有红点,给用户可读反馈
    clearJoinTimeout()
    showToast('连接失败,请检查网络或房主地址')
  })
  // ★ v0.4.24 修复:房间页感知 host 掉线 — joiner 等房期间 host 杀 App/断电,
  //   旧版界面无任何变化、假绿灯干等。
  onNet('host:lost', () => {
    if (isHost.value) return
    cleanupRoomListeners()
    try { net.close() } catch (e) { /* swallow */ }
    showToast('房主已断开,已返回首页')
    router.push('/?force_disconnected=1&reason=' + encodeURIComponent('房主已断开'))
  })
  // ★ v0.4.24:满房反馈 — host 拒绝第 5 人时明确告知,不再空等
  onNet('message:ROOM_FULL', () => {
    clearJoinTimeout()
    netStatus.value = '🔴'
    showToast('房间已满(4/4),请让房主先踢出空位')
  })
  onNet('peer:leave', ({ seat, reason, migrate }) => {
    if (seat == null) return
    peers.delete(seat)
    if (migrate === true) return
    if (seat !== hostSeat.value) return
    const isMyself = (() => { try { return net.getSelfSeat && net.getSelfSeat() === seat } catch { return false } })()
    if (isMyself) return
    cleanupRoomListeners()
    try { net.close() } catch (e) { /* swallow */ }
    router.push('/?force_disconnected=1&reason=' + encodeURIComponent('房主已退出,房间解散'))
  })
  onNet('self:kicked', ({ reason }) => {
    cleanupRoomListeners()
    try { net.close() } catch (e) { /* swallow */ }
    router.push('/?force_disconnected=1' + (reason ? '&reason=' + encodeURIComponent(reason) : ''))
  })
  onNet('message:NICK_UPDATE', (payload, from) => {
    if (peers.has(from)) {
      const old = peers.get(from)
      peers.set(from, { ...old, ...payload })
    }
  })
  onNet('message:READY', (payload, from) => {
    // ★ LOGIC-14 修复:READY 消息必须来自已知 peer 且 payload 合法
    if (typeof payload?.ready !== 'boolean') return
    const hs = hostSeat.value ?? (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    if (from !== hs && !isHost.value) return
    if (peers.has(from)) {
      peers.set(from, { ...peers.get(from), ready: payload.ready })
      tryStartGame()
    }
  })
  onNet('message:READY_COMMITTED', (payload, from) => {
    // ★ P1-05 修复:只接受 host 权威的 ready 提交,同步所有客户端的 ready 状态。
    if (typeof payload?.ready !== 'boolean') return
    const seat = payload.seat
    if (typeof seat !== 'number') return
    const hs = hostSeat.value ?? (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    if (from !== hs) return
    if (peers.has(seat)) {
      peers.set(seat, { ...peers.get(seat), ready: payload.ready })
      tryStartGame()
    }
  })
  onNet('message:SYNC', (payload, from) => {
    // ★ LOGIC-14 修复:SYNC 只能由 host 权威发出
    const hs = hostSeat.value ?? (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    if (from !== hs) return
    clearJoinTimeout()  // v0.4.24:收到权威 SYNC = 已进房,取消加入超时
    // ★ v0.4.26 BUG-05:joiner 从 host 权威 SYNC 同步真实房间号,
    //   修复直连(仅输 IP,URL 无 roomNo)时两端显示不同房间号
    if (!isHost.value && payload && payload.roomNo != null && String(payload.roomNo)) {
      const rn = String(payload.roomNo)
      if (rn && rn !== roomNo.value) {
        roomNo.value = rn
        try { net.setRoomId(rn) } catch (e) { /* swallow */ }
      }
    }
    if (payload && payload.peers) {
      peers.clear()
      for (const [s, info] of payload.peers) peers.set(s, info)
      tryStartGame()
    }
  })
  onNet('message:GAME_START', (payload, from) => {
    // ★ LOGIC-14 修复:GAME_START 只能由 host 权威发出
    const hs = hostSeat.value ?? (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    if (from !== hs) return
    if (!isHost.value) {
      const firstSeat = payload && typeof payload.firstSeat === 'number' ? payload.firstSeat : undefined
      const qs = firstSeat != null ? '&firstSeat=' + firstSeat : ''
      // ★ v0.4.24 修复:跨设备 WS joiner 跳转对局必须带 host 参数 —
      //   否则打完一局「返回房间」时 host 丢失,session 复用判断失败,joiner 掉进空房间
      const hostQ = route.query.host ? '&host=' + encodeURIComponent(String(route.query.host)) : ''
      router.push('/game?roomNo=' + roomNo.value + '&role=joiner' + qs + hostQ)
    }
  })
  onNet('peer:seat_swap', (payload) => {
    if (!payload) return
    const a = payload.a
    const b = payload.b
    if (typeof a !== 'number' || typeof b !== 'number') return
    try {
      const fresh = net.getPeers ? net.getPeers() : null
      if (fresh && fresh.get) {
        const infoA = fresh.get(a)
        const infoB = fresh.get(b)
        if (infoA) peers.set(b, infoA)
        else peers.delete(b)
        if (infoB) peers.set(a, infoB)
        else peers.delete(a)
      }
    } catch (e) { /* swallow */ }
    try {
      const netSelfSeat = net.getSelfSeat ? net.getSelfSeat() : null
      if (netSelfSeat != null && netSelfSeat >= 0 && netSelfSeat <= 3) {
        mySeat.value = netSelfSeat
        const me = peers.get(netSelfSeat)
        if (me) {
          if (me.name) myName.value = me.name
          if (me.avatar) myAvatar.value = me.avatar
          myReady.value = !!me.ready
        }
      }
      const netHostSeat = net.getHostSeat ? net.getHostSeat() : null
      if (netHostSeat != null && netHostSeat >= 0 && netHostSeat <= 3) hostSeat.value = netHostSeat
    } catch (e) { /* swallow */ }
  })
}

async function syncRoomStateFromNetwork() {
  try {
    const ns = net.getSelfSeat ? net.getSelfSeat() : null
    if (ns != null && ns >= 0 && ns <= 3) mySeat.value = ns
    const nh = net.getHostSeat ? net.getHostSeat() : null
    if (nh != null && nh >= 0 && nh <= 3) hostSeat.value = nh
  } catch (e) { /* swallow */ }
  peers.clear()
  try {
    const netPeers = net.getPeers ? net.getPeers() : null
    if (netPeers) {
      for (const [s, info] of netPeers.entries()) {
        peers.set(s, { ...info })
      }
    }
  } catch (e) { /* swallow */ }
  const me = mySeat.value != null ? peers.get(mySeat.value) : null
  if (me) {
    if (me.nickname) myName.value = me.nickname
    if (me.avatar) myAvatar.value = me.avatar
    myReady.value = !!me.ready
  }
  netStatus.value = net.isConnected && net.isConnected() ? '🟢' : '🔴'
  if (isHost.value && isNative.value) {
    try {
      const ipRes = await WsServer.getLocalIp()
      hostIp.value = ipRes?.ip || ''
      const t = net._getTransport && net._getTransport()
      if (t && typeof t.getBoundPort === 'function') hostPort.value = t.getBoundPort() || 8848
      await generateQr()
    } catch (e) {
      hostIp.value = '(获取失败)'
    }
  }
}

async function initNetwork() {
  // ★ P1-13:若已有活跃 session 且房间号/角色匹配,直接复用,避免重复 startAsHost/joinRoom。
  const hasSession = typeof net.isConnected === 'function' && net.isConnected()
  if (hasSession) {
    const sameRoom = net.getRoomId() === roomNo.value
    const sameRole = net.isHost() === isHost.value
    if (sameRoom && sameRole) {
      attachRoomListeners()
      await syncRoomStateFromNetwork()
      return
    }
    // session 不匹配(房间号或角色变了),关闭后重新初始化
    try { net.close() } catch (e) { /* swallow */ }
  }

  attachRoomListeners()
  if (isHost.value) {
    net.setRoomId(roomNo.value)
    const r = net.startAsHost({ nickname: myName.value, avatar: myAvatar.value })
    netStatus.value = r.ok ? '🟢' : '🔴'
    peers.set(0, { nickname: myName.value, avatar: myAvatar.value, ready: myReady.value })
    if (isNative.value) {
      try {
        const ipRes = await WsServer.getLocalIp()
        hostIp.value = ipRes?.ip || ''
        const t = net._getTransport && net._getTransport()
        if (t && typeof t.getBoundPort === 'function') hostPort.value = t.getBoundPort() || 8848
        await generateQr()
      } catch (e) {
        hostIp.value = '(获取失败)'
      }
    } else {
      // ★ P0-06 修复:浏览器 BroadcastChannel 模式不能跨设备,不显示可用 IP/二维码,
      //   避免用户把 127.0.0.1 或局域网 IP 发给朋友后始终连不上。
      hostIp.value = ''
      qrDataUrl.value = ''
    }
  } else {
    const hostParam = route.query.host ? String(route.query.host) : null
    if (hostParam) {
      // ★ v0.4.24:把房间号传给 joinRemoteRoom,覆盖 WS 路径写死的 roomId='ws',
      //   返回房间时 session 复用判断(getRoomId() === roomNo)才能命中
      const r = net.joinRemoteRoom(hostParam, { nickname: myName.value, avatar: myAvatar.value }, roomNo.value)
      netStatus.value = r.ok ? '🟢' : '🔴'
      armJoinTimeout()
    } else {
      const r = net.joinRoom(route.query.roomNo || 'default', { nickname: myName.value, avatar: myAvatar.value })
      netStatus.value = r.ok ? '🟢' : '🔴'
      armJoinTimeout()
    }
  }
  try {
    const ns = net.getSelfSeat ? net.getSelfSeat() : null
    if (ns != null && ns >= 0 && ns <= 3) mySeat.value = ns
    const nh = net.getHostSeat ? net.getHostSeat() : null
    if (nh != null && nh >= 0 && nh <= 3) hostSeat.value = nh
  } catch (e) { /* swallow */ }
}

onMounted(() => {
  myName.value = route.query.nick ? String(route.query.nick) : storage.getNickname()
  myAvatar.value = route.query.avatar ? String(route.query.avatar) : storage.getAvatar()
  isNative.value = isNativeCapacitor()
  initNetwork()
  // ★ v0.4.25:息屏唤醒自动重连 — 息屏时 WebView/浏览器冻结 JS 定时器并可能断开
  //   WebSocket,心跳(2s)停发 6s 后被 host 释放座位(局域网没断,是客户端"睡着"了)。
  //   唤醒时在此发现断线则自动重进:JOIN 携带 uuid + resumeToken,
  //   心跳窗口内恢复原 seat;已释放则作为新玩家重新分配。
  document.addEventListener('visibilitychange', onVisibilityResume)
})
onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityResume)
  cleanupRoomListeners()
  if (_copyToastTimer) clearTimeout(_copyToastTimer)
})

// ★ v0.4.25:息屏唤醒重连(见 onMounted 注释)
async function onVisibilityResume() {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
  if (typeof net.isConnected === 'function' && net.isConnected()) return
  const self = { nickname: myName.value, avatar: myAvatar.value }
  try {
    const hostParam = route.query.host ? String(route.query.host) : null
    if (hostParam && typeof net.joinRemoteRoom === 'function') {
      net.joinRemoteRoom(hostParam, self, roomNo.value)
      return
    }
    if (typeof net.smartReconnectToPeers === 'function') {
      await net.smartReconnectToPeers(roomNo.value, { self })
    }
  } catch (e) { /* 静默失败,走 host:lost / 心跳兜底 */ }
}

function showMenu() {
  haptics.click()
  showConfirm({
    title: '退出房间',
    message: '确定要退出房间吗？',
    confirmText: '退出',
    cancelText: '取消',
    onConfirm: () => {
      cleanupRoomListeners()
      try {
        if (isHost.value) net.close({ broadcast: true })
        else net.leaveRoom()
      } catch (e) { /* swallow */ }
      router.push('/')
    },
  })
}
function onEditMyInfo() { haptics.click(); showNickEditor.value = true }
function onNickConfirm({ nickname, avatar }) {
  myName.value = nickname
  myAvatar.value = avatar
  showNickEditor.value = false
  // ★ v0.4.25 修复:本地座位同步更新 — 旧版只改 myName/myAvatar ref + 广播,
  //   peers 里的自己没更新,本机座位卡看不到新昵称/头像(其他手机却能收到广播看到)
  const seat = (typeof net.getSelfSeat === 'function') ? net.getSelfSeat() : 0
  const prev = peers.get(seat) || {}
  peers.set(seat, { ...prev, nickname, avatar })
  // ★ v0.4.25 修复:持久化到 storage(旧版没写,下次进 App 又变回旧昵称)
  storage.setNickname(nickname)
  storage.setAvatar(avatar)
  // ★ v0.4.26 BUG-01 修复:改走 net.updateSelfInfo — 旧版只 broadcast NICK_UPDATE,
  //   network 内部 selfInfo / peers[selfSeat] 没同步,进对局页读 net.getPeers() 拿旧名
  //   → 本人信息“局中不变、局后才变”。updateSelfInfo 同步内部状态 + 广播 + host 重广播 SYNC。
  if (typeof net.updateSelfInfo === 'function') {
    net.updateSelfInfo({ nickname, avatar })
  } else {
    net.broadcast({ type: 'NICK_UPDATE', payload: { nickname, avatar } })
  }
}
async function copyTextFallback(text) {
  // ★ UX 改进:navigator.clipboard 在 HTTP/旧浏览器/某些 WebView 中不可用,
  //   先尝试现代 API,失败则退回到 document.execCommand。
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (_) { /* fallback */ }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch (_) {
    return false
  }
}
async function onCopyIp() {
  haptics.click()
  if (isHost.value && !canInviteCrossDevice.value) {
    // ★ P0-06 兜底:即使按钮已隐藏,也防止键盘/辅助技术触发复制 loopback IP
    showToast('当前模式仅支持本机多标签联机,跨手机请用 Android App 开房')
    return
  }
  if (isHost.value && hostIp.value) {
    const text = `${hostIp.value}:${hostPort.value}`
    const ok = await copyTextFallback(text)
    showCopyToast(ok ? `已复制 ${text}` : `请手动复制 IP: ${text}`)
  } else {
    const ok = await copyTextFallback(roomNo.value)
    showCopyToast(ok ? `已复制房间号: ${roomNo.value}` : `房间号: ${roomNo.value}`)
  }
}
function openInvite() {
  haptics.click()
  if (isHost.value && !canInviteCrossDevice.value) {
    // ★ P0-06 修复:浏览器 BC 模式明确提示不能跨设备邀请。
    showToast('当前模式仅支持本机多标签联机,跨手机请用 Android App 开房')
    return
  }
  if (isHost.value && !hostIp.value) {
    showToast('本机 IP 暂未获取，已改用房间号邀请')
  }
  showInvite.value = true
}

const copyToast = ref('')
let _copyToastTimer = null
async function onCopied(text) {
  if (!text) return
  const ok = await copyTextFallback(text)
  showCopyToast(ok ? `已复制 ${text}` : `请手动复制: ${text}`)
}
function showCopyToast(msg) {
  copyToast.value = msg
  if (_copyToastTimer) clearTimeout(_copyToastTimer)
  _copyToastTimer = setTimeout(() => { copyToast.value = '' }, 1800)
}
function onToggleReady() {
  haptics.click()
  // ★ Phase 3:房主不显示准备/取消准备,点击自己座位的准备按钮无操作
  if (isHost.value) return
  myReady.value = !myReady.value
  const myCurrentSeat = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })()
  if (myCurrentSeat != null && peers.has(myCurrentSeat)) {
    peers.set(myCurrentSeat, { ...peers.get(myCurrentSeat), ready: myReady.value })
  }
  net.broadcast({ type: 'READY', payload: { ready: myReady.value } })
  tryStartGame()
}
function tryStartGame() {
  haptics.action()
  if (!isHost.value) return
  if (peers.size < 4) return
  // ★ Phase 3:除房主外的 3 个 peer 都准备后才能开始
  const allReady = Array.from(peers.entries()).every(([seat, p]) => seat === hostSeat.value || p.ready)
  if (allReady) {
    performCutAndStart()
  }
}
function canStartGame() {
  if (!isHost.value) return false
  if (peers.size < 4) return false
  return Array.from(peers.entries()).every(([seat, p]) => seat === hostSeat.value || p.ready)
}
function clearCutTimers() {
  if (cutTimer) { clearTimeout(cutTimer); cutTimer = null }
  if (cutInterval) { clearInterval(cutInterval); cutInterval = null }
}
function performCutAndStart() {
  if (isCutting.value) return
  isCutting.value = true
  cutRevealed.value = false
  clearCutTimers()
  let steps = 0
  cutInterval = setInterval(() => {
    cutFirstSeat.value = (cutFirstSeat.value + 1) % 4
    steps++
    if (steps >= 12) {
      clearInterval(cutInterval)
      cutInterval = null
      const finalSeat = Math.floor(Math.random() * 4)
      cutFirstSeat.value = finalSeat
      cutRevealed.value = true
      cutTimer = setTimeout(() => {
        clearCutTimers()
        isCutting.value = false
        net.broadcast({ type: 'GAME_START', payload: { roomNo: roomNo.value, firstSeat: finalSeat } })
        router.push('/game?roomNo=' + roomNo.value + '&role=host' + '&firstSeat=' + finalSeat)
      }, 1200)
    }
  }, 120)
}
function onCut() {
  haptics.click()
  if (!isHost.value) {
    showToast('等待房主切牌')
    return
  }
  if (!canStartGame()) {
    showToast('满员且全部准备后即可切牌开局')
    return
  }
  performCutAndStart()
}
function onSwapWithTeammate() {
  haptics.click()
  const teammateSeat = (hostSeat.value + 2) % 4
  if (!peers.has(teammateSeat)) return
  showConfirm({
    title: '换座位',
    message: '确定要和队友换座吗？',
    confirmText: '换座',
    cancelText: '取消',
    onConfirm: () => {
      const r = net.swapSeats(hostSeat.value, teammateSeat)
      if (!r.ok) {
        console.warn('swapSeats 失败:', r.error)
        return
      }
      net.broadcast({ type: 'NICK_UPDATE', payload: { nickname: myName.value, avatar: myAvatar.value } })
    },
  })
}
function onKickPlayer(seat) {
  haptics.click()
  if (!isHost.value) return
  // ★ Phase 3:只能踢对手(非房主、非队友)
  if (!canKick(seat)) return
  const target = peers.get(seat)
  if (!target) return
  const nickname = target.nickname || `座位 ${seat}`
  showConfirm({
    title: '踢出玩家',
    message: `确定要踢出 ${nickname} 吗？\n\n该玩家将立即断开连接。`,
    confirmText: '踢出',
    cancelText: '取消',
    onConfirm: () => {
      const r = net.kickPlayer(seat, 'kicked')
      if (!r || !r.ok) {
        console.warn('kickPlayer 失败:', r && r.error)
        return
      }
      peers.delete(seat)
    },
  })
}
</script>

<style scoped>
.page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: var(--bg-page, #071426);
  color: var(--text-primary, #fff);
  font: var(--font-body);
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
}

/* 背景层 — 更克制的深蓝 + 底部 felt */
.bg-stars {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
.star {
  position: absolute;
  background: var(--room-star);
  border-radius: 50%;
  animation: star-twinkle 3.5s ease-in-out infinite;
}
@keyframes star-twinkle {
  0%, 100% { transform: scale(1); opacity: var(--tw-opacity, 0.7); }
  50%      { transform: scale(1.25); opacity: 1; }
}
.bg-felt {
  position: absolute;
  left: 50%;
  top: -78vh;
  width: 120vw;
  height: 140vh;
  min-width: 720px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: var(--felt-base);
  background-image:
    radial-gradient(ellipse at 50% 38%, rgba(156, 184, 255, 0.36), transparent 28%),
    repeating-radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px),
    radial-gradient(ellipse at 50% 42%, #7387ce 0%, #435690 44%, #2f3768 74%, #202548 100%);
  box-shadow:
    0 24px 0 18px rgba(110, 64, 36, 0.55),
    inset 0 -34px 72px rgba(0,0,0,0.42),
    inset 0 4px 16px rgba(255,255,255,0.12);
  z-index: 0;
  pointer-events: none;
}

/* 顶部栏 */
.room-header {
  position: absolute;
  top: max(16px, env(safe-area-inset-top, 0px) + 12px);
  left: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  z-index: 12;
}
.header-menu,
.header-more {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.header-menu:hover,
.header-more:hover { background: rgba(255,255,255,0.14); }
.header-menu:active,
.header-more:active { transform: scale(0.95); }
.header-title {
  flex: 1;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
}
.header-label {
  font-size: 14px;
  color: rgba(255,255,255,0.6);
}
.header-roomno {
  font: var(--font-display);
  color: var(--gold-bright);
  letter-spacing: 3px;
}
.header-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.net-status {
  font-size: 13px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.8);
}
.net-status.net-ok    { color: #6fdb6f; }
.net-status.net-bad   { color: #ff7e7e; }
.net-status.net-pending { color: #ffd56b; }

/* 房间信息卡 */
.info-card {
  position: absolute;
  left: 16px;
  right: 16px;
  top: max(72px, env(safe-area-inset-top, 0px) + 64px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: 14px 18px;
  box-shadow: var(--glass-shadow);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  z-index: 8;
  max-height: 80vh;
  overflow-y: auto;
}
.info-main { min-width: 0; }
.info-roomno {
  font: var(--font-display);
  color: var(--gold-bright);
  background: var(--gold-metallic);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.info-host-ip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 13px;
}
.info-host-label { color: rgba(255,255,255,0.55); font-size: 12px; }
.info-host-value {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 13px;
  background: rgba(255,255,255,0.1);
  padding: 3px 8px;
  border-radius: 6px;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.info-host-value-disabled {
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.5);
  font-family: inherit;
}
.info-side {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.info-count {
  font-size: 13px;
  color: rgba(255,255,255,0.8);
}
.info-count strong {
  color: var(--gold-bright);
  font-weight: 800;
}
.info-copy-btn {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.info-copy-btn:hover { background: rgba(255,255,255,0.2); }

/* 4 座位 */
.seat {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 5;
  padding: 14px 16px 12px;
  background: rgba(3, 7, 20, 0.45);
  border: 1.5px solid rgba(255,255,255,0.12);
  border-radius: var(--radius-lg);
  min-width: 120px;
  transition: border-color 0.2s ease-out;
}
.seat.filled { border-color: rgba(255,255,255,0.22); }
.seat.empty {
  border-style: dashed;
  border-color: rgba(255,255,255,0.18);
}
.seat-top.filled { border-color: rgba(244, 196, 94, 0.45); }
.seat-bottom.filled { border-color: rgba(94, 156, 244, 0.55); }
.seat-left.filled,
.seat-right.filled { border-color: rgba(180, 94, 244, 0.55); }

.seat-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
}
.seat-badge-crown {
  font-size: 26px;
  filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.7));
}
.seat-avatar-wrap { position: relative; margin-top: 4px; }
.seat-avatar {
  position: relative;
  width: 68px;
  height: 68px;
  background: linear-gradient(135deg, #2a3a5e, #1a2a4e);
  border: 3px solid rgba(255,255,255,0.25);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease-out;
}
.seat.empty .seat-avatar {
  border-style: dashed;
  background: transparent;
  opacity: 0.55;
}
.seat-top.filled .seat-avatar {
  border-color: var(--gold-bright);
  box-shadow: 0 0 0 3px rgba(244, 196, 94, 0.25), 0 0 18px rgba(244, 196, 94, 0.25);
}
.seat-bottom.filled .seat-avatar {
  border-color: #5e9cf4;
  box-shadow: 0 0 0 3px rgba(94, 156, 244, 0.22);
}
.seat-left.filled .seat-avatar,
.seat-right.filled .seat-avatar {
  border-color: #b45ef4;
  box-shadow: 0 0 0 3px rgba(180, 94, 244, 0.22);
}
/* ★ Phase 3:按“我”的座位区分队友/对手,高特异度覆盖默认位置色 */
.seat.team-mate.filled .seat-avatar {
  border-color: var(--gold-bright);
  box-shadow: 0 0 0 3px rgba(244, 196, 94, 0.25), 0 0 18px rgba(244, 196, 94, 0.25);
}
.seat.team-opp.filled .seat-avatar {
  border-color: #b45ef4;
  box-shadow: 0 0 0 3px rgba(180, 94, 244, 0.22);
}
.seat.team-mate.filled { border-color: rgba(244, 196, 94, 0.45); }
.seat.team-opp.filled { border-color: rgba(180, 94, 244, 0.55); }
.seat-avatar .avatar-icon { font-size: 34px; line-height: 1; }
.seat.empty .seat-avatar .avatar-icon { font-size: 28px; opacity: 0.6; }
.seat-name {
  font-size: 14px;
  font-weight: 600;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  color: rgba(255,255,255,0.9);
}
.seat.empty .seat-name { color: rgba(255,255,255,0.55); }

.ready-mark {
  position: absolute;
  right: -2px;
  top: -2px;
  width: 22px;
  height: 22px;
  background: linear-gradient(135deg, #4caf50, #2e7d32);
  color: #fff;
  border-radius: 50%;
  font-size: 13px;
  font-weight: bold;
  border: 2px solid var(--bg-page, #071426);
  display: flex;
  align-items: center;
  justify-content: center;
}

.seat-ready-btn {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.25);
  background: rgba(255,255,255,0.1);
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease-out;
}
.seat-ready-btn:hover { background: rgba(255,255,255,0.18); }

.seat-kick {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 24px;
  height: 24px;
  background: linear-gradient(180deg, #ff7e7e, #d4404a);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  border: 2px solid #fff;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  z-index: 6;
  padding: 0;
}
.seat-kick:hover { transform: scale(1.1); }

.seat-swap {
  background: var(--gold-metallic);
  color: #1a1a00;
  font-size: 11px;
  font-weight: bold;
  padding: 4px 10px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
}
.seat-swap:hover { filter: brightness(1.1); }

/* 座位定位 — portrait 菱形 */
.seat-top {
  left: 50%;
  top: 210px;
  transform: translateX(-50%);
}
.seat-left {
  left: 16px;
  top: 350px;
}
.seat-right {
  right: 16px;
  top: 350px;
}
.seat-bottom {
  left: 50%;
  bottom: max(150px, calc(140px + env(safe-area-inset-bottom, 0px)));
  transform: translateX(-50%);
}

/* 底部操作 */
.actions-row {
  position: absolute;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom, 0px) + 12px);
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  width: calc(100% - 32px);
  max-width: 440px;
  z-index: 10;
}
.actions-row .app-btn {
  flex: 1;
  height: 52px;
  border-radius: var(--radius-pill);
  font: var(--font-button);
}

/* 切牌（弱化） */
.cut-card {
  position: absolute;
  right: 16px;
  bottom: max(86px, calc(76px + env(safe-area-inset-bottom, 0px)));
  width: 56px;
  height: 56px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 50%;
  color: rgba(255,255,255,0.7);
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  line-height: 1.1;
  text-align: center;
}
.cut-card:hover { border-color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.1); }
.cut-card:active { transform: scale(0.94); }
.cut-card-text {
  font-size: 9px;
  margin-top: 2px;
}

/* 同步切牌覆盖层 */
.cut-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 24px;
}
.cut-panel {
  background: linear-gradient(180deg, rgba(30,30,46,0.96), rgba(18,18,32,0.98));
  border: 1px solid rgba(255,215,120,0.25);
  border-radius: 24px;
  padding: 28px 32px;
  width: min(420px, 100%);
  text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.cut-title {
  margin: 0 0 22px;
  font-size: 20px;
  font-weight: 800;
  color: var(--gold-text, #ffeab6);
}
.cut-deck {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 22px;
}
.cut-card-back {
  width: 56px;
  height: 78px;
  border-radius: 10px;
  background: linear-gradient(135deg, #3b4d7a, #1f2b4d);
  border: 2px solid rgba(255,255,255,0.12);
  box-shadow: 0 4px 10px rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
}
.cut-card-back.cut-revealed {
  border-color: var(--gold-metallic, #ffd166);
  box-shadow: 0 0 18px rgba(255,209,102,0.45);
  transform: translateY(-8px) scale(1.05);
  background: linear-gradient(135deg, #5c4a1e, #3a2d0b);
}
.cut-result {
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
}
.cut-status {
  margin: 0;
  font-size: 15px;
  color: rgba(255,255,255,0.85);
  font-weight: 600;
}

/* copy toast — 全局唯一 position: fixed */
.copy-toast {
  position: fixed;
  left: 50%;
  bottom: 110px;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.78);
  color: #fff;
  font-size: 13px;
  font-weight: bold;
  padding: 8px 16px;
  border-radius: 18px;
  z-index: 100;
  pointer-events: none;
  white-space: nowrap;
  animation: copy-toast-fade 1.8s ease-in-out forwards;
}
@keyframes copy-toast-fade {
  0% { opacity: 0; transform: translateX(-50%) translateY(8px); }
  10% { opacity: 1; transform: translateX(-50%) translateY(0); }
  85% { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
}

/* 小屏切牌压缩 */
@media (max-width: 360px) {
  .cut-card {
    width: 60px;
    height: 60px;
    font-size: 14px;
    right: 8px;
    bottom: max(86px, calc(76px + env(safe-area-inset-bottom, 0px)));
  }
  .seat-avatar { width: 60px; height: 60px; }
  .seat-avatar .avatar-icon { font-size: 30px; }
  .seat { min-width: 110px; padding: 12px 14px 10px; }
  .info-card { padding: 12px 14px; }
  .info-roomno { font-size: 28px !important; }
}

/* landscape 横屏(手机横屏 h≤500px 优先) */
@media (orientation: landscape) {
  .room-header {
    left: calc(16px + env(safe-area-inset-left, 0px));
    right: calc(16px + env(safe-area-inset-right, 0px));
  }
  .seat-top {
    left: 50%;
    top: 56px;
    transform: translateX(-50%) scale(0.85);
  }
  .seat-bottom {
    left: 50%;
    bottom: 80px;
    transform: translateX(-50%) scale(0.85);
  }
  .seat-left {
    left: calc(8px + env(safe-area-inset-left, 0px));
    top: 50%;
    transform: translateY(-50%) scale(0.85);
  }
  .seat-right {
    right: calc(8px + env(safe-area-inset-right, 0px));
    top: 50%;
    transform: translateY(-50%) scale(0.85);
  }
}

@media (orientation: landscape) {
  .info-card {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    max-width: min(320px, 42vw);
    width: min(320px, 42vw);
    padding: 14px 16px;
  }
}

@media (orientation: landscape) {
  .cut-card {
    right: calc(16px + env(safe-area-inset-right, 0px));
    bottom: 80px;
  }
}
</style>
