# 扩展指南 (How to Extend)

> 给新工程师的「常见改动怎么动手」速查表。每个案例都按 **目标 → 改什么 → 测试 → 验证** 4 步走。

---

## 一、加一种新牌型

### 例:加「飞机带翅膀」(三顺 + 附件)

掼蛋里「飞机带翅膀」是连续 2+ 组三张 + 相同数量的单/对附件。

#### Step 1:加 `TYPE` 枚举

`src/common/guandan-engine.js`:

```js
const TYPE = {
  // ... 现有
  AIRPLANE: 15,  // 飞机(2+ 组三张,可选带单/对)
}
```

#### Step 2:加 `TYPE_ORDER`

```js
const TYPE_ORDER = {
  // ... 现有
  [TYPE.AIRPLANE]: 0,  // 普通牌优先级
}
```

#### Step 3:扩展 `recognize()`

在 `recognize()` 的 `THREE_STRAIGHT` 分支后加:

```js
// 飞机带翅膀(连续 2+ 组三张 + 相同数量的单/对附件)
if (jokerCnt === 0 && counts.length >= 3 && len >= 8) {
  // 找所有 rank=3 的(三张)
  const triples = Object.entries(cnt).filter(([k, v]) => v === 3).map(([k]) => Number(k)).sort((a, b) => a - b)
  // 找连续段
  let bestStart = -1, bestLen = 0
  let curStart = triples[0], curLen = 1
  for (let i = 1; i < triples.length; i++) {
    if (triples[i] === triples[i - 1] + 1) curLen++
    else { if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }; curStart = triples[i]; curLen = 1 }
  }
  if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }

  if (bestLen >= 2) {
    // 附件数量 = 三张组数 * 1(单) 或 2(对)
    const wingCount = bestLen * 2
    // 检查附件 rank 是否与三张组冲突
    const tripleRanks = new Set(triples)
    const wingCards = cards.filter(c => !tripleRanks.has(c.rank))
    const wingCnt = E.countByRank(wingCards)
    // 必须是相同数量(全单 或 全对)
    const wingCounts = Object.values(wingCnt)
    if (wingCounts.length === wingCount && wingCounts.every(c => c === 1)) {
      // 带单张
      const mainRank = bestStart + bestLen - 1
      return { type: TYPE.AIRPLANE, mainRank, length: cards.length, wingType: 'single' }
    }
  }
}
```

#### Step 4:加 `canBeat()` 分支

```js
// 飞机之间:同长度 + 同 wingType → 比 mainRank
if (playA.type === TYPE.AIRPLANE && playB.type === TYPE.AIRPLANE) {
  if (playA.length === playB.length && playA.wingType === playB.wingType) {
    return playA.mainRank > playB.mainRank
  }
}
```

#### Step 5:加测试

`src/common/guandan-engine.test.js`:

```js
console.log('\n=== 8. 飞机 ===')
// 333444 + 56(单张翅膀)
eq('333444+56 飞机', Engine.recognize([
  { suit: 0, rank: 3 }, { suit: 1, rank: 3 }, { suit: 2, rank: 3 },
  { suit: 0, rank: 4 }, { suit: 1, rank: 4 }, { suit: 2, rank: 4 },
  { suit: 0, rank: 5 }, { suit: 1, rank: 6 },
]), { type: TYPE.AIRPLANE, mainRank: 4, length: 8, wingType: 'single' })

// 压制
assert('555666+78 > 333444+56', Engine.canBeat(
  { type: TYPE.AIRPLANE, mainRank: 6, length: 8, wingType: 'single' },
  { type: TYPE.AIRPLANE, mainRank: 4, length: 8, wingType: 'single' }
))
```

#### Step 6:加 AI 支持

`src/common/guandan-ai.js` 的 `autoPlayGrouped()`:

```js
// 6.5 飞机(在钢板之后、顺子之前)
const airplane = findBestAirplane(concrete, ghostAvail, ghosts)
if (airplane) return { type: 'play', cards: airplane }
```

实现 `findBestAirplane` 找最大飞机(参考 `findBestSteelPlate`)。

#### Step 7:验证

```bash
npm run test:engine  # 必须全过
npm run test:ai      # 必须全过
npm run build        # 0 错
```

---

## 二、加一种新 SFX(音效)

### 例:加「出完牌」胜利音效

#### Step 1:在 `audio.js` 加函数

`src/common/audio.js`:

```js
/**
 * 出完牌胜利音效(Web Audio 合成)
 * 上行三和弦 C5-E5-G5,衰减 600ms
 */
function sfxVictory() {
  if (!isSfxEnabled() || !ctx) return
  const now = ctx.currentTime
  const notes = [523.25, 659.25, 783.99]  // C5 E5 G5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, now + i * 0.1)
    gain.gain.linearRampToValueAtTime(0.4, now + i * 0.1 + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.6)
    osc.connect(gain)
    gain.connect(masterGain)
    osc.start(now + i * 0.1)
    osc.stop(now + i * 0.1 + 0.7)
  })
}
```

#### Step 2:导出

```js
export { sfxVictory, ... }
```

#### Step 3:在合适的位置调用

`src/views/game/GameView.vue`:

```js
function onPlayerFinished({ seat, order }) {
  // ... 现有
  if (order === 1) {  // 头游
    audio.sfxVictory()
  }
}
```

#### Step 4:加测试

`src/common/audio.test.js`:

```js
console.log('\n=== 25. sfxVictory ===')
assert('sfxVictory 不抛错', runWithoutThrow(() => audio.sfxVictory()))
```

#### Step 5:验证

```bash
npm run test:anim  # audio 测试
npm run build
# 浏览器实测:对局出完牌听音效
```

---

## 三、加一种新视觉特效

### 例:加「同花顺」特效(全屏流光)

#### Step 1:在 `effects.js` 加工厂函数

`src/common/effects.js`:

```js
/**
 * 同花顺特效
 * @returns {{ type: 'flush', suit: number, duration: number }}
 */
export function createFlushEffect(suit) {
  return {
    type: 'flush',
    suit,  // 0-3 (花色)
    duration: 1500,
  }
}
```

#### Step 2:`EffectLayer.vue` 加分支

```vue
<template>
  <div v-if="flushFx" class="flush-effect" :class="`suit-${flushFx.suit}`">
    <!-- 5 条彩色横条,流光动画 -->
  </div>
</template>

<script setup>
const props = defineProps({
  // ... 现有
  flushFx: { type: Object, default: null },
})
</script>

<style scoped>
.flush-effect {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg,
    transparent 0%,
    var(--flush-color, rgba(231,76,60,0.3)) 50%,
    transparent 100%);
  animation: flushFlow var(--t-bomb) ease-out;
}
.suit-0 { --flush-color: rgba(50,50,50,0.5); }  /* ♠ 黑 */
.suit-1 { --flush-color: rgba(231,76,60,0.5); }  /* ♥ 红 */
.suit-2 { --flush-color: rgba(50,50,50,0.5); }  /* ♣ 黑 */
.suit-3 { --flush-color: rgba(231,76,60,0.5); }  /* ♦ 红 */

@keyframes flushFlow {
  0% { transform: translateY(-100%); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: translateY(100%); opacity: 0; }
}
</style>
```

#### Step 3:在 GameView 触发

```js
import { createFlushEffect } from '@/common/effects.js'

function onPlay({ seat, cards, type }) {
  // ... 现有
  if (type === Engine.TYPE.STRAIGHT_FLUSH) {
    flushFx.value = createFlushEffect(cards[0].suit)
    setTimeout(() => { flushFx.value = null }, 1500)
  }
}
```

#### Step 4:验证

```bash
npm run build
# 浏览器实测:出同花顺看特效
# Playwright 截图记录
```

---

## 四、加一种新页面

### 例:加「商店」页(预留扩展)

#### Step 1:建 view 文件

`src/views/shop/ShopView.vue`:

```vue
<template>
  <div class="page">
    <h1>商店(预留)</h1>
    <p>暂未开放</p>
    <button @click="goHome">返回</button>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
function goHome() { router.push('/') }
</script>

<style scoped>
.page { padding: 60px 20px; }
</style>
```

#### Step 2:注册路由

`src/main.js`:

```js
import ShopView from './views/shop/ShopView.vue'

const routes = [
  // ... 现有
  { path: '/shop', component: ShopView },
]
```

#### Step 3:加首页入口

`src/views/index/HomeView.vue`:

```vue
<button class="action-btn ghost" @click="onShop">商店</button>

<script setup>
function onShop() { router.push('/shop') }
</script>
```

#### Step 4:验证

```bash
npm run dev
# 浏览器实测:首页点商店 → 跳到 /shop
```

---

## 五、改 AI 决策

### 例:加「剩余牌推断」(v2.0 候选)

#### Step 1:加推断模块

`src/common/guandan-card-trace.js`(新文件):

```js
/**
 * 剩余牌推断:基于已出牌历史,推断每位玩家可能剩余的牌
 */
function inferRemainingHands(playedHistory, selfHand) {
  // 1. 收集所有已出牌
  // 2. 从 108 张全集移除
  // 3. 移除自己手牌
  // 4. 推断对手剩余牌分布
  return {
    inferredHands: [[...], [...], [...], [...]],
    confidence: 0.8,
  }
}

export { inferRemainingHands }
```

#### Step 2:`decide()` 接收推断结果

`src/common/guandan-ai.js`:

```js
function decide(hand, currentPlay, levelRank, ctx = {}) {
  // 加 ctx.opponentInferred (可选)
  if (ctx.opponentInferred) {
    // 用对手推断剩余做更精准的压制
  }
  // ... 原逻辑
}
```

#### Step 3:GameView 传推断结果

```js
// GameView 维护 playedHistory
const playedHistory = ref([])

function onPlay({ seat, cards, type }) {
  playedHistory.value.push({ seat, cards })
  // ...
}

// 调 AI 时传推断
const inferred = inferRemainingHands(playedHistory.value, myHand.value)
const r = AI.decide(hand, lastPlay, levelRank, {
  isTeammateLast,
  opponentInferred: inferred,
})
```

#### Step 4:加测试

```js
// 测试推断函数
console.log('\n=== 5. 剩余牌推断 ===')
const history = [
  { seat: 1, cards: [{ suit: 0, rank: 5 }] },
]
const inferred = inferRemainingHands(history, [{ suit: 1, rank: 5 }])
eq('座位 1 没有 5♠', inferred.inferredHands[1].find(c => c.suit === 0 && c.rank === 5), undefined)
```

#### Step 5:验证

```bash
npm run test:ai  # 必须全过
```

---

## 六、改网络层

### 例:加「心跳检测 + 断线重连」

#### Step 1:`network.js` 加心跳

```js
let heartbeatTimer = null
const HEARTBEAT_INTERVAL = 3000
const HEARTBEAT_TIMEOUT = 10000
const lastHeartbeat = new Map()  // seat → timestamp

function startHeartbeat() {
  heartbeatTimer = setInterval(() => {
    const now = Date.now()
    // 检查每个 peer
    for (const [seat, peer] of peers) {
      if (seat === selfSeat) continue
      const last = lastHeartbeat.get(seat) || 0
      if (now - last > HEARTBEAT_TIMEOUT) {
        emit('peer:timeout', { seat })
        peers.delete(seat)
      }
    }
    // 发送自己的心跳
    sendMessage({ type: 'HEARTBEAT', payload: { ts: now } })
  }, HEARTBEAT_INTERVAL)
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
}
```

#### Step 2:在 `onmessage` 处理心跳

```js
if (msg.type === 'HEARTBEAT') {
  lastHeartbeat.set(msg.from, Date.now())
}
```

#### Step 3:在 `startAsHost / joinRoom` 启停心跳

```js
function startAsHost(self) {
  // ... 现有
  startHeartbeat()
}

function close() {
  // ... 现有
  stopHeartbeat()
}
```

#### Step 4:加测试

模拟心跳超时,验证 `peer:timeout` 事件触发。

#### Step 5:验证

4 标签联机测:关掉一标签,看其他 3 个是不是 10s 内收到 `peer:timeout`。

---

## 七、改设计 token

### 例:把主题色从蓝绿改成红紫

#### Step 1:改 token

`src/styles/tokens.css`:

```css
:root {
  --color-self: #66bb6a;       /* 改成 */
  --color-self: #ab47bc;       /* 紫色 */
  --color-teammate: #42a5f5;   /* 改成 */
  --color-teammate: #ec407a;   /* 粉色 */
  --color-opponent: #ef5350;   /* 改成 */
  --color-opponent: #ffa726;   /* 橙色 */
}
```

#### Step 2:验证

```bash
npm run build
npm run dev
# 浏览器实测 4 view 看配色
```

**注意**:玩家身份色改完,GameView / PlayerSeat / HudTop 自动响应(都用 token)。**不要在组件里写裸色值**。

---

## 八、改规则

### 例:加「过 A」特殊规则

掼蛋里打 A 时,本队获头游才算过 A,否则退回打 K。

#### Step 1:在状态机加判断

`src/common/guandan-game.js`:

```js
function finishRound() {
  // ... 现有
  const levelUp = E.calcLevelUp(ranks, teams)
  let actualLevelUp = levelUp

  // v2.0 规则:打 A 时过 A 检测
  if (state.levelRank === 14) {  // A
    const headTeam = teams.findIndex(t => t.includes(ranks[0]))
    const myTeam = teams.findIndex(t => t.includes(0))  // 自己(简化)
    if (headTeam !== myTeam) {
      // 没拿到头游,退回打 K
      actualLevelUp = -1  // 退级
    }
  }

  state.levelUp = actualLevelUp
  state.levelRank = E.getLevelRank(state.levelRank, actualLevelUp)
  // ... 现有
}
```

#### Step 2:测试

```js
console.log('\n=== 5. 过 A 规则 ===')
const ranks = [1, 0, 2, 3]  // 自己(0)没拿头游
const g = createGame({ levelRank: 14, ... })
// ... 玩到一局结束
eq('打 A 时未拿头游 → 退回 K', g.getState().levelRank, 13)
```

#### Step 3:验证

```bash
npm run test:game
```

---

## 九、加新网络事件

### 例:加「玩家求援 / 投降」消息

#### Step 1:`network.js` 加事件

不用改 `network.js`,新事件走通用 `message:XXX`:

```js
// 在 GameView 里订阅
net.on('message:SURRENDER', (payload, from) => {
  if (confirm(`玩家 ${from} 投降,接受吗?`)) {
    // 触发对局结束
  }
})

// 发送
net.broadcast({ type: 'SURRENDER', payload: { reason: '牌太差' } })
```

#### Step 2:文档化

`docs/NETWORK.md` 表格加一行:

| `SURRENDER` | 玩家投降 | GameView |

#### Step 3:验证

4 标签联机测:投降事件广播 + 接收。

---

## 十、加新 storage 项

### 例:存「上次登录时间」

#### Step 1:`storage.js` 加函数

```js
function getLastLogin() {
  try {
    return localStorage.getItem(KEY_LAST_LOGIN) || null
  } catch (e) { return null }
}
function setLastLogin(ts) {
  try { localStorage.setItem(KEY_LAST_LOGIN, ts); return true } catch (e) { return false }
}
```

#### Step 2:导出

```js
export { getLastLogin, setLastLogin, ... }
const storage = { getLastLogin, setLastLogin, ... }
export default storage
```

#### Step 3:在 HomeView 调用

```js
import storage from '@/common/storage.js'

onMounted(() => {
  storage.setLastLogin(new Date().toISOString())
})
```

#### Step 4:测试

不需要单测,但手动在 F12 验证 localStorage。

---

## 十一、修改 checklist(总)

| 改动 | 必改文件 | 必加测试 | 验证 |
|------|----------|----------|------|
| 加牌型 | `guandan-engine.js` + `AI.js` | `guandan-engine.test.js` + `ai.test.js` | `npm test` |
| 加 SFX | `audio.js` | `audio.test.js` | 浏览器实测 |
| 加特效 | `effects.js` + `EffectLayer.vue` | (Playwright 截图) | 浏览器实测 |
| 加页面 | 新 `View.vue` + `main.js` | (Playwright 截图) | 浏览器实测 |
| 改 AI | `ai.js` | `ai.test.js` | `npm test` |
| 改网络 | `network.js` + View | (手动测) | 4 标签联机 |
| 改 token | `tokens.css` | (Playwright 截图) | 全页面肉眼对比 |
| 改规则 | `engine.js` / `game.js` | 对应 `.test.js` | `npm test` |
| 改 storage | `storage.js` | (手动) | F12 查 localStorage |

---

**最重要的规则**:
1. 改 `common/` 必须有测试
2. 改 View 用 Playwright 截图回归
3. 改 token 跑全页面肉眼对比
4. 提交前 `npm test` + `npm run build` 双绿

---

**下一步**:
- 看完 `docs/ARCHITECTURE.md` 理解全局
- 看 `docs/ENGINE.md` 理解核心算法
- 看完再动手,别上来就改
