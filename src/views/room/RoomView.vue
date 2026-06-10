<template>
  <div class="page">
    <div class="bg-table"></div>

    <div class="top-bar">
      <button class="menu-btn" @click="showMenu">≡</button>
      <div class="level-box">
        <div class="level-tag">过A</div>
        <div class="level-num">第 1 / 1 轮</div>
      </div>
      <div class="mult-box">
        <span class="mult-label">倍</span>
        <span class="mult-num">1</span>
      </div>
      <div class="spectate">
        <span class="spec-icon">+</span>
        <span class="spec-text">当前 {{ peers.size - 1 }} 人加入</span>
      </div>
      <div class="invite-spectate">本版本局域网内最多 4 人</div>
      <div class="top-right">
        <button class="dot-btn" @click="onEditMyInfo">⋯</button>
        <button class="dot-btn">{{ netStatus }}</button>
      </div>
    </div>

    <div class="seat seat-left" :class="seatClass(1)">
      <div class="seat-role">对手</div>
      <div class="seat-avatar">
        <span class="avatar-icon" v-if="!getPeer(1)">?</span>
        <span class="avatar-icon" v-else>{{ getPeer(1).avatar }}</span>
        <div v-if="getPeer(1) && getPeer(1).ready" class="ready-mark">✓</div>
      </div>
      <div class="seat-name">{{ getPeer(1)?.nickname || '等待加入' }}</div>
      <div class="seat-score">{{ getPeer(1) ? '0 分' : '— 分' }}</div>
    </div>

    <div class="seat seat-top" :class="seatClass(2)">
      <div class="seat-role">队友</div>
      <div class="seat-avatar">
        <span class="avatar-icon" v-if="!getPeer(2)">?</span>
        <span class="avatar-icon" v-else>{{ getPeer(2).avatar }}</span>
        <div v-if="getPeer(2) && getPeer(2).ready" class="ready-mark">✓</div>
      </div>
      <div class="seat-name">{{ getPeer(2)?.nickname || '等待加入' }}</div>
      <div class="seat-score">{{ getPeer(2) ? '0 分' : '— 分' }}</div>
      <button v-if="getPeer(2)" class="seat-swap" @click="onSwapWithTeammate">换队友</button>
    </div>

    <div class="seat seat-right" :class="seatClass(3)">
      <div class="seat-role">对手</div>
      <div class="seat-avatar">
        <span class="avatar-icon" v-if="!getPeer(3)">?</span>
        <span class="avatar-icon" v-else>{{ getPeer(3).avatar }}</span>
        <div v-if="getPeer(3) && getPeer(3).ready" class="ready-mark">✓</div>
      </div>
      <div class="seat-name">{{ getPeer(3)?.nickname || '等待加入' }}</div>
      <div class="seat-score">{{ getPeer(3) ? '0 分' : '— 分' }}</div>
    </div>

    <div class="seat seat-bottom">
      <div class="seat-role">{{ isHost ? '房主' : '玩家' }}</div>
      <div class="seat-avatar me" @click="onEditMyInfo">
        <span class="avatar-icon">{{ myAvatar }}</span>
        <div v-if="myReady" class="ready-mark">✓</div>
      </div>
      <div class="seat-name">{{ myName }}</div>
      <div class="seat-score">0 分</div>
    </div>

    <div class="info-card">
      <div class="info-header">
        <span class="info-title">房间信息</span>
        <button class="info-detail" @click="onDetail">🔍 查看详情</button>
      </div>
      <div class="info-roomno">
        <span class="info-room-label">房间号：</span>
        <span class="info-room-num">{{ roomNo }}</span>
      </div>
      <div class="info-row">
        <div class="info-cell">
          <span class="info-cell-label">过几：</span>
          <span class="info-cell-value">2</span>
        </div>
        <div class="info-cell">
          <span class="info-cell-label">出牌时间：</span>
          <span class="info-cell-value">30秒</span>
        </div>
        <div class="info-cell">
          <span class="info-cell-label">人数：</span>
          <span class="info-cell-value">{{ peers.size }}/4</span>
        </div>
      </div>
      <div class="info-actions">
        <button class="btn btn-blue" @click="onInvite">复制房间号</button>
        <button class="btn btn-orange" @click="onToggleReady">
          {{ myReady ? '取消准备' : (isHost && peers.size === 4 ? '开局' : '准备') }}
        </button>
      </div>
      <div class="info-footer">
        <span class="green-game">绿色游戏  远离赌博</span>
      </div>
    </div>

    <div class="cut-card" @click="onCut">♠♦♣<br/><span class="cut-card-text">切牌</span></div>
    <div class="ready-status" v-if="myReady"><span>已准备</span></div>
    <div class="suit-picker">
      <span class="suit" :class="{active: mySuit===0}" @click="mySuit=0">♣</span>
      <span class="suit" :class="{active: mySuit===1}" @click="mySuit=1">♦</span>
      <span class="suit" :class="{active: mySuit===2}" @click="mySuit=2">♠</span>
      <span class="suit" :class="{active: mySuit===3}" @click="mySuit=3">♥</span>
    </div>

    <NicknameEditor
      v-if="showNickEditor"
      @close="showNickEditor = false"
      @confirm="onNickConfirm"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import storage from '@/common/storage.js'
import net from '@/common/network.js'
import NicknameEditor from '@/components/NicknameEditor.vue'

const route = useRoute()
const router = useRouter()
const isHost = ref(route.query.role !== 'joiner')
// 房主房间号生成与持久化:首次生成后存 sessionStorage(per-tab 隔离,4-tab 演示不会撞房号)
// 真实设备 1v1 场景:刷新页面仍能用同一个房间号继续开局
// joiner 必须沿用 URL 里的 roomNo(房主的房间号),不能自己随机生成新的
// 否则 joiner 调 joinRoom(909682) 成功了,但本地 roomNo 显示 921514,
// 用户复制 921514 给朋友会找不到房主 → 4-tab 演示死锁
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
const showNickEditor = ref(false)
const netStatus = ref('⏺')
const peers = reactive(new Map())

function getPeer(seat) { return peers.get(seat) }
function seatClass(idx) { return peers.has(idx) ? 'filled' : 'empty' }

function initNetwork() {
  net.on('connect', ({ seat, info }) => {
    netStatus.value = '🟢'
    // ★ v3.8 P1 修复：用 connect 事件拿正确的 assignedSeat(不是 from)
    // joiner 第一次发 JOIN 时 selfSeat=-1,RoomView 之前用 peers.set(from, ...) 会写到 -1
    if (seat != null && seat !== 0 && info) {
      peers.set(seat, { ...info, ready: false })
    }
  })
  net.on('error', (e) => {
    netStatus.value = '🔴'
    console.error('network error:', e)
  })
  net.on('message:NICK_UPDATE', (payload, from) => {
    if (peers.has(from)) {
      const old = peers.get(from)
      peers.set(from, { ...old, ...payload })
    }
  })
  net.on('message:READY', (payload, from) => {
    if (peers.has(from)) {
      peers.set(from, { ...peers.get(from), ready: payload.ready })
      tryStartGame()
    }
  })
  net.on('message:SYNC', (payload) => {
    if (payload && payload.peers) {
      peers.clear()
      for (const [s, info] of payload.peers) peers.set(s, info)
      tryStartGame()
    }
  })
  // ★ v3.8 P1 修复:joiner 收到 host 的 GAME_START 也跳到 /game(否则 host 单方面跳转,joiner 卡在 /room)
  net.on('message:GAME_START', () => {
    if (!isHost.value) {
      router.push('/game?roomNo=' + roomNo.value)
    }
  })
  // ★ v3.8 P1 修复:joiner 收到 host 的 SEAT_SWAP 也本地交换(否则 joiner 还看到旧的 seat 名字)
  net.on('message:SEAT_SWAP', (payload) => {
    if (!payload || !Array.isArray(payload.between) || payload.between.length !== 2) return
    const [a, b] = payload.between
    if (a == null || b == null) return
    const infoA = peers.get(a)
    const infoB = peers.get(b)
    if (infoA) peers.set(b, infoA)
    if (infoB) peers.set(a, infoB)
  })

  if (isHost.value) {
    // ★ v3.8 P0 修复：必须先 setRoomId 再 startAsHost
    // 否则 startAsHost 内部会用空 roomId 创建 channel，channel name 永远 = 'default'，
    // joiner 用 6 位数字 roomNo 永远对不上 → 4-tab 联机死锁
    net.setRoomId(roomNo.value)
    const r = net.startAsHost({ nickname: myName.value, avatar: myAvatar.value })
    netStatus.value = r.ok ? '🟢' : '🔴'
    // ★ v3.8 P1 修复：host 自己也算 seat 0（之前漏掉,导致 peers.size 永远 < 4,开局按钮不显示）
    peers.set(0, { nickname: myName.value, avatar: myAvatar.value, ready: myReady.value })
  } else {
    const r = net.joinRoom(route.query.roomNo || 'default', { nickname: myName.value, avatar: myAvatar.value })
    netStatus.value = r.ok ? '🟢' : '🔴'
  }
}

onMounted(() => {
  // URL ?nick=玩家-A&avatar=♠ 优先于 localStorage(扫码加入时传参 / 测试脚本控制)
  myName.value = route.query.nick ? String(route.query.nick) : storage.getNickname()
  myAvatar.value = route.query.avatar ? String(route.query.avatar) : storage.getAvatar()
  initNetwork()
})
// ★ v3.8 P1 修复:不在这里关 network!
// 之前 unmount 关 network,joiner 收到 GAME_START 跳 /game 时 channel 就关了,
// 后续 host 广播的 DEAL/PLAY/PASS 全部丢失,4-tab 联机出牌同步失效
// network 在以下时机关:用户点"退出"返回 /、手动点"断开连接"、应用关闭
onUnmounted(() => {})

function showMenu() {
  if (confirm('退出房间?')) router.push('/')
}
function onEditMyInfo() { showNickEditor.value = true }
function onNickConfirm({ nickname, avatar }) {
  myName.value = nickname
  myAvatar.value = avatar
  showNickEditor.value = false
  net.broadcast({ type: 'NICK_UPDATE', payload: { nickname, avatar } })
}
function onDetail() {
  alert(`房间号: ${roomNo.value}\n人数: ${peers.size}/4\n网络: ${netStatus.value === '🟢' ? '正常' : '异常'}\n模式: 局域网 P2P(浏览器版用 BroadcastChannel)`)
}
function onInvite() {
  navigator.clipboard.writeText(roomNo.value).then(
    () => alert(`已复制房间号: ${roomNo.value}\n\n让朋友打开 https://你的IP:8848 选"连热点加入",输入此房间号`),
    () => alert(`房间号: ${roomNo.value}`)
  )
}
function onToggleReady() {
  myReady.value = !myReady.value
  // ★ v3.8 P1 修复:同步自己到 peers(房主自己点"开局"时 ready 也要进 allReady 检查)
  // 否则 every(p => p.ready) 会因为 peers[0].ready=undefined 永远 false
  if (isHost.value && peers.has(0)) {
    peers.set(0, { ...peers.get(0), ready: myReady.value })
  }
  net.broadcast({ type: 'READY', payload: { ready: myReady.value } })
  tryStartGame()
}

// ★ v3.8 P1 修复:host 点开局时 joiner 的 READY 可能还没传到 host,
// 改成持续监听:每次 peers 变化都重试 allReady 检查
function tryStartGame() {
  if (!isHost.value) return
  if (peers.size < 4) return
  const allReady = Array.from(peers.values()).every(p => p.ready)
  if (allReady) {
    // ★ v3.8 P1 修复:广播 GAME_START 让 joiner 也跳到 /game
    net.broadcast({ type: 'GAME_START', payload: { roomNo: roomNo.value } })
    router.push('/game?roomNo=' + roomNo.value)
  }
}
function onSwapWithTeammate() {
  if (!peers.has(2)) return
  if (!confirm('和队友换座?')) return
  const me = { nickname: myName.value, avatar: myAvatar.value, ready: myReady.value }
  const mate = { ...peers.get(2) }
  myName.value = mate.nickname
  myAvatar.value = mate.avatar
  myReady.value = mate.ready
  peers.set(2, me)
  storage.setNickname(myName.value)
  storage.setAvatar(myAvatar.value)
  // ★ v3.8 P1 修复:swap 后广播 SEAT_SWAP(joiner 调本机 listener 互换 peers),
  // 同时广播 NICK_UPDATE 让 joiner 更新 seat 0 的新昵称(SEAT_SWAP 互换 entries
  // 也能更新,但 NICK_UPDATE 是更直接的"自己改了自己名"信号,防 NICK_UPDATE
  // 监听器依赖 from 字段的逻辑漏掉)
  net.broadcast({ type: 'SEAT_SWAP', payload: { between: [0, 2] } })
  net.broadcast({ type: 'NICK_UPDATE', payload: { nickname: myName.value, avatar: myAvatar.value } })
}
function onCut() { alert('切牌完成') }
</script>

<style scoped>
.page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: #2a3464;
  color: #fff;
}
.bg-table {
  position: absolute;
  left: 50%; top: 55%;
  transform: translate(-50%, -50%);
  width: 240vw; height: 240vw;
  border-radius: 50%;
  background: radial-gradient(circle at center, #2f8a4f 0%, #1f5a35 40%, #0f3520 70%, #061a10 100%);
  box-shadow: inset 0 0 120px rgba(0,0,0,0.5);
  z-index: 0;
}
.top-bar {
  position: absolute;
  top: 30px; left: 20px; right: 20px;
  display: flex; align-items: center; gap: 10px;
  z-index: 10;
}
.menu-btn {
  width: 50px; height: 50px;
  background: rgba(255,255,255,0.15);
  border: none; border-radius: 50%;
  color: #fff; font-size: 28px;
  cursor: pointer;
}
.level-box {
  background: linear-gradient(180deg, #6cc3f5, #2a85d0);
  border-radius: 10px;
  padding: 4px 12px;
  text-align: center;
}
.level-tag { font-size: 16px; font-weight: bold; }
.level-num { font-size: 12px; opacity: 0.9; }
.mult-box { display: flex; align-items: center; gap: 4px; }
.mult-label { background: #ff7e3d; padding: 2px 6px; border-radius: 50%; font-size: 12px; }
.mult-num { font-size: 20px; font-weight: bold; }
.spectate {
  margin-left: auto;
  background: rgba(0,0,0,0.35);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
}
.spec-icon { color: #4a7eff; margin-right: 4px; }
.invite-spectate {
  position: absolute; right: 80px; top: 90px;
  background: #fff; color: #333;
  padding: 4px 10px; border-radius: 12px;
  font-size: 11px;
}
.top-right { position: absolute; right: 20px; top: 100px; display: flex; gap: 8px; }
.dot-btn {
  width: 40px; height: 40px;
  background: rgba(0,0,0,0.4);
  border: none; border-radius: 50%;
  color: #fff; font-size: 18px;
  cursor: pointer;
}
.seat {
  position: absolute;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  z-index: 5;
}
.seat-role { font-size: 12px; padding: 2px 10px; background: #4a7eff; border-radius: 6px; }
.seat-left .seat-role, .seat-right .seat-role { background: #e94560; }
.seat-bottom .seat-role { background: #ff7e3d; }
.seat-avatar {
  position: relative;
  width: 70px; height: 70px;
  background: rgba(0,0,0,0.5);
  border: 3px solid #4a7eff;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}
.seat-avatar .avatar-icon { font-size: 36px; }
.seat-avatar.me { border-color: #ff7e3d; background: #ffd9b8; }
.seat-avatar.me .avatar-icon { color: #ff7e3d; }
.seat-left .seat-avatar, .seat-right .seat-avatar { border-color: #e94560; }
.seat-name { font-size: 14px; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seat-score { font-size: 12px; opacity: 0.8; }
.seat-swap {
  background: linear-gradient(180deg, #ffd56b, #f2a93b);
  color: #6e3f00;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
}
.ready-mark {
  position: absolute; right: -6px; top: -6px;
  width: 22px; height: 22px;
  background: #4caf50; color: #fff;
  border-radius: 50%;
  font-size: 14px;
  display: flex; align-items: center; justify-content: center;
}
.seat-left { left: 20px; top: 280px; }
.seat-top { left: 50%; top: 180px; transform: translateX(-50%); }
.seat-right { right: 20px; top: 280px; }
.seat-bottom { left: 50%; bottom: 40px; transform: translateX(-50%); }
.info-card {
  position: absolute;
  left: 50%; top: 420px;
  transform: translateX(-50%);
  width: 90%;
  max-width: 440px;
  background: linear-gradient(180deg, rgba(232,238,255,0.96), rgba(212,222,255,0.96));
  border-radius: 16px;
  padding: 18px 22px;
  box-shadow: 0 8px 20px rgba(0,0,0,0.3);
  z-index: 8;
  color: #2a3464;
}
.info-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.info-title { font-size: 20px; font-weight: bold; letter-spacing: 2px; }
.info-detail {
  background: linear-gradient(180deg, #5aa0ff, #2c6fd9);
  color: #fff; font-size: 12px;
  padding: 4px 10px; border-radius: 14px;
  border: none; cursor: pointer;
}
.info-roomno { text-align: center; font-size: 22px; margin: 16px 0 18px; }
.info-room-num { font-weight: bold; color: #2c6fd9; font-size: 30px; margin-left: 6px; }
.info-row { display: flex; justify-content: space-between; margin-bottom: 18px; font-size: 14px; }
.info-cell-value { color: #ff7e3d; font-weight: bold; }
.info-actions { display: flex; gap: 12px; }
.btn {
  flex: 1; height: 50px; border-radius: 10px;
  border: none;
  font-size: 15px; font-weight: bold;
  cursor: pointer;
  color: #fff;
}
.btn-blue { background: linear-gradient(180deg, #6cc3f5, #2a85d0); }
.btn-orange { background: linear-gradient(180deg, #ffd56b, #f2a93b); color: #6e3f00; }
.info-footer { text-align: right; margin-top: 10px; }
.green-game { font-size: 11px; color: #4caf50; }
.cut-card {
  position: absolute; right: 30px; bottom: 200px;
  width: 80px; height: 80px;
  background: rgba(255,255,255,0.9);
  border: none; border-radius: 50%;
  color: #2a3464;
  font-size: 18px;
  cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.cut-card-text { font-size: 11px; color: #ff7e3d; margin-top: 2px; }
.ready-status {
  position: absolute; left: 20px; bottom: 180px;
  background: linear-gradient(180deg, #ffd56b, #f2a93b);
  color: #6e3f00;
  padding: 6px 14px; border-radius: 10px;
  font-size: 16px; font-weight: bold;
  transform: rotate(-8deg);
}
.suit-picker {
  position: absolute; left: 50%; bottom: 50px;
  transform: translateX(-50%);
  display: flex; gap: 36px;
  z-index: 9;
}
.suit { font-size: 36px; color: rgba(255,255,255,0.7); cursor: pointer; }
.suit.active { color: #ffeb3b; transform: scale(1.3); }
</style>
