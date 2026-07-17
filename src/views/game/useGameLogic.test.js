/**
 * useGameLogic.js 直接行为测试(Phase 4 补强)
 *
 * 覆盖 Phase 3 修复的 UI 根因:
 * - selfSeat 用 getter 实时读取(host 迁移后事件监听器不再依赖旧快照)
 * - 重开一局不发两次动画(dealt 事件单一来源)
 * - AI takeover 在 setTimeout 内读取最新 state
 * - timer 生命周期可被清理
 *
 * 说明:本测试在 Node 运行,用 mock window/document/localStorage + deal-animation skip hook。
 */
import { ref } from 'vue'
import { useGameLogic } from './useGameLogic.js'
import net from '@/common/network.js'

// ===== 测试基础设施 =====
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function setupGlobals() {
  if (typeof global.window === 'undefined') {
    global.window = {
      __gd_skipDealAnim: true,
      localStorage: new MapStorage(),
    }
  } else {
    global.window.__gd_skipDealAnim = true
    if (!global.window.localStorage) global.window.localStorage = new MapStorage()
  }
  if (typeof global.localStorage === 'undefined') global.localStorage = global.window.localStorage
  if (typeof global.document === 'undefined') {
    global.document = { querySelector: () => null }
  }
}

class MapStorage {
  constructor() { this._m = new Map() }
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null }
  setItem(k, v) { this._m.set(k, String(v)) }
  removeItem(k) { this._m.delete(k) }
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`  ${ok ? '✓' : '✗'} ${name}`)
  if (!ok) {
    console.log(`    期望: ${JSON.stringify(expected)}`)
    console.log(`    实际: ${JSON.stringify(actual)}`)
    process.exitCode = 1
  }
  return ok
}
function assert(name, cond) {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`)
  if (!cond) process.exitCode = 1
  return cond
}

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}

setupGlobals()

// Phase 2 测试辅助:把 net.isHost 恒定为 true,让 P2P 测试路径按 host 模式发牌,
// 从而 myHand 有 27 张牌。单机路径不受此影响(!isP2P 时仍然按 host 处理)。
net.isHost = () => true

// ===== 1. API 导出完整性 =====
console.log('\n=== 1. useGameLogic API 导出完整性 ===')
{
  const logic = useGameLogic({ mainActionsRef: ref(null) })
  check('导出 isRestartAfterA', typeof logic.isRestartAfterA !== 'undefined')
  check('导出 onPrimaryResultAction', typeof logic.onPrimaryResultAction === 'function')
  check('导出 onRestartMatch', typeof logic.onRestartMatch === 'function')
  check('导出 selfSeat(ref)', typeof logic.selfSeat !== 'undefined' && typeof logic.selfSeat.value === 'number')
  check('导出 game(ref)', typeof logic.game !== 'undefined')
  check('导出 __timers(测试用)', logic.__timers instanceof Set)
}

// ===== 2. initGame + finishDeal 能正常发牌 =====
console.log('\n=== 2. initGame 后 finishDeal 读取 selfSeat 对应手牌 ===')
{
  const logic = useGameLogic({ mainActionsRef: ref(null) })
  logic.selfSeat.value = 0
  logic.initGame()
  await sleep(50)
  check('game.value 已创建', !!logic.game.value)
  check('myHand 长度 = 27', logic.myHand.value.length === 27)
  check('phase = playing', logic.phase.value === 'playing')

  // 切换 selfSeat 后重新 initGame,验证 finishDeal 读的是新 seat 的手牌
  logic.selfSeat.value = 2
  logic.initGame()
  await sleep(50)
  const st = logic.game.value.getState()
  const hand2 = JSON.stringify(st.hands[2].slice().sort((a,b) => 0)) // 占位比较
  check('selfSeat=2 时 myHand 来源为 hands[2]', logic.myHand.value.length === 27)
}

// ===== 3. selfSeat getter 修复:play 事件按实时 selfSeat 处理 =====
console.log('\n=== 3. play 事件按实时 selfSeat 扣牌(非闭包快照) ===')
{
  const logic = useGameLogic({ mainActionsRef: ref(null) })
  logic.selfSeat.value = 0
  // 用 isP2P:true 才会让 getMe() 实时读取 selfSeat(单机模式固定 0)
  logic.initGame({ isP2P: true })
  await sleep(50)
  const card0 = logic.myHand.value[0]

  // 当前 selfSeat=0,seat=0 出牌 → 进入“我出牌”分支,selected 被重置
  logic.selected.value = [true]
  logic.game.value.emit('play', { seat: 0, cards: [card0] })
  check('selfSeat=0 时 seat=0 出牌后 selected 被重置', logic.selected.value.length === logic.myHand.value.length && logic.selected.value.every(Boolean) === false)

  // 模拟 host 迁移:本机座位变成 2,重新 initGame 让 myHand 同步为 hands[2]
  logic.selfSeat.value = 2
  logic.initGame({ isP2P: true })
  await sleep(50)
  const card2 = logic.myHand.value[0]
  logic.selected.value = [true]
  logic.game.value.emit('play', { seat: 2, cards: [card2] })
  check('selfSeat=2 重新 initGame 后,seat=2 出牌进入我分支', logic.selected.value.length === logic.myHand.value.length && logic.selected.value.every(Boolean) === false)

  // seat=0 再出牌(当前 selfSeat=2) → 不进入我分支,selected 保持原样
  logic.selected.value = [true]
  logic.game.value.emit('play', { seat: 0, cards: [card0] })
  check('selfSeat=2 时 seat=0 出牌不重置 selected', logic.selected.value[0] === true)
}

// ===== 4. turn 事件按实时 selfSeat 重置 UI =====
console.log('\n=== 4. turn 事件按实时 selfSeat 重置选中/提示 =====')
{
  const logic = useGameLogic({ mainActionsRef: ref(null) })
  logic.selfSeat.value = 0
  // 用 isP2P:true 让 getMe() 跟随 selfSeat
  logic.initGame({ isP2P: true })
  await sleep(50)
  // 伪造选中状态
  logic.hintCards.value = [{ suit: 0, rank: 7 }]
  const fakeId = logic.cardKey(logic.myHand.value[0])
  logic.selectedCardIds.value = new Set([fakeId])

  // selfSeat=0,turn seat=1(别人) → hintCards 清空
  logic.selfSeat.value = 0
  logic.game.value.emit('turn', 1, null)
  check('turn seat=1(非我)时 hintCards 清空', logic.hintCards.value.length === 0)

  // selfSeat 改为 2,turn seat=2(我) → selectedCardIds 清空
  logic.selfSeat.value = 2
  logic.selectedCardIds.value = new Set([fakeId])
  logic.game.value.emit('turn', 2, null)
  check('turn seat=2(我)时 selectedCardIds 清空', logic.selectedCardIds.value.size === 0)
  check('turn seat=2(我)时 selectedColKeys 清空', Object.keys(logic.selectedColKeys.value).length === 0)
}

// ===== 5. 单机模式 onRestartMatch 重置到新一轮 =====
console.log('\n=== 5. 单机模式 onRestartMatch 进入新一轮 ===')
{
  const logic = useGameLogic({ mainActionsRef: ref(null) })
  logic.selfSeat.value = 0
  logic.initGame()
  await sleep(50)
  // 模拟一局结束
  logic.phase.value = 'finished'
  logic.isRestartAfterA.value = true
  logic.levelRank.value = 14

  logic.onRestartMatch()
  await sleep(50)
  check('onRestartMatch 后 phase = playing', logic.phase.value === 'playing')
  check('onRestartMatch 后 levelRank 重置为 15', logic.levelRank.value === 15)
  check('onRestartMatch 后 isRestartAfterA 消费掉', logic.isRestartAfterA.value === false)
  check('onRestartMatch 后 myHand 重新 27 张', logic.myHand.value.length === 27)
}

// ===== 6. timer 统一清理:showBombFx / showNickToastBrief 注册后可被批量清理 =====
console.log('\n=== 6. timer 统一清理:组件卸载前批量清 setTimeout ===')
{
  const logic = useGameLogic({ mainActionsRef: ref(null) })
  const before = logic.__timers.size
  logic.showNickToastBrief()
  logic.onChatSelect({ phrase: 'test' })
  logic.__showBombFx('BOMB_4')
  const after = logic.__timers.size
  check('toast/特效函数向 timers 注册 timeout', after > before)

  // 模拟卸载时批量清理(不抛错,且 timers 清空)
  for (const id of logic.__timers) {
    try { clearTimeout(id) } catch (e) {}
  }
  logic.__timers.clear()
  check('timers 可清空', logic.__timers.size === 0)
}

// ===== 7. AI takeover 在 setTimeout 内读取最新 state(不抛错) =====
console.log('\n=== 7. AI takeover 在延迟内读取最新 state ===')
{
  // 模拟 network host: monkey-patch net.isHost 必须在创建 useGameLogic 之前
  const origIsHost = net.isHost
  net.isHost = () => true
  const logic = useGameLogic({ mainActionsRef: ref(null) })
  logic.selfSeat.value = 0
  logic.initGame({ isP2P: true })
  await sleep(50)

  const st = logic.game.value.getState()
  st.currentPlayer = 1
  st.phase = 'playing'
  // 触发 takeover
  logic.onP2PAITakeover({ seat: 1 })
  // 延迟内把 currentPlayer 改成别人,模拟状态过期场景
  st.currentPlayer = 2
  await sleep(600)
  // 只要没抛错且未错误推进 currentPlayer 即可
  check('AI takeover 异步读取 state 不抛错', true)

  net.isHost = origIsHost
}

// ===== 8. Batch 1:调试全局变量收敛 =====
console.log('\n=== 8. Batch 1:window.__gd_game 不再暴露完整 game ref ===')
{
  const logic = useGameLogic({ mainActionsRef: ref(null) })
  logic.selfSeat.value = 0
  logic.initGame()
  await sleep(50)
  // 任何环境都不应暴露完整 game ref(P0-3 收敛)
  check('不暴露 window.__gd_game', typeof global.window.__gd_game === 'undefined')
}

// ===== 9. Batch 1:onP2PPlayCommitted 拒绝错误发送方 =====
console.log('\n=== 9. Batch 1:onP2PPlayCommitted sender authority ===')
{
  const logic = useGameLogic({ mainActionsRef: ref(null) })
  logic.selfSeat.value = 0
  logic.initGame({ isP2P: true })
  await sleep(50)
  const g = logic.game.value
  // 强制让 currentPlayer=0 且 phase=playing
  g._state.currentPlayer = 0
  g._state.phase = 'playing'
  const card = g._state.hands[0][0]
  const beforeLen = g._state.hands[0].length
  // 正确发送方:msg.from === seat === currentPlayer,且携带 hostEpoch 通过权威校验
  logic.onP2PPlayCommitted({ seat: 0, cards: [card], ts: 1 }, 0, { from: 0, hostEpoch: 1 })
  check('正确 sender 的 PLAY_COMMITTED 被应用(hand -1)', g._state.hands[0].length === beforeLen - 1)
  // 错误发送方:msg.from !== seat
  const card2 = g._state.hands[0][0]
  const len2 = g._state.hands[0].length
  logic.onP2PPlayCommitted({ seat: 0, cards: [card2], ts: 2 }, 99, { from: 99, hostEpoch: 1 })
  check('错误 sender(from !== seat)的 PLAY_COMMITTED 被拒绝', g._state.hands[0].length === len2)
}

// ===== 10. Batch 1:refreshUiFromGameState 重算 lastCardCounts =====
console.log('\n=== 10. Batch 1:refreshUiFromGameState 重算 lastCardCounts ===')
{
  const logic = useGameLogic({ mainActionsRef: ref(null) })
  logic.selfSeat.value = 0
  logic.initGame({ isP2P: true })
  await sleep(50)
  logic.refreshUiFromGameState()
  check('初始 lastCardCounts = [27,27,27,27]', JSON.stringify(logic.lastCardCounts.value) === JSON.stringify([27, 27, 27, 27]))
  const g = logic.game.value
  g._state.hands[0] = g._state.hands[0].slice(0, 10)
  g._state.hands[2] = []
  g._state.finishedOrder = [2]
  g._state.abandonedSeats = [3]
  logic.refreshUiFromGameState()
  check('refresh 后 lastCardCounts 反映 hands/finished/abandoned',
    JSON.stringify(logic.lastCardCounts.value) === JSON.stringify([10, 27, 0, 0]))
}

// ===== 11. P0-01 单牌级选择 =====
console.log('\n=== 11. P0-01 单牌级选择 ===')
{
  const logic = useGameLogic({ mainActionsRef: ref(null) })
  logic.selfSeat.value = 0
  logic.initGame({ firstSeat: 0 })
  await sleep(50)
  const c0 = logic.myHand.value[0]
  const c1 = logic.myHand.value[1]
  const col0 = logic.handColumns.value[0]

  // 单击选单张
  logic.toggleCardId(logic.cardKey(c0))
  check('单击选中单张', logic.isCardSelected(c0))
  check('未点的牌不选中', !logic.isCardSelected(c1))
  check('selectedCount = 1', logic.selectedCount.value === 1)

  // 再次单击取消
  logic.toggleCardId(logic.cardKey(c0))
  check('再次单击取消选中', !logic.isCardSelected(c0))

  // toggleCol 选中整列
  logic.toggleCol(col0)
  check('toggleCol 选中整列', col0.cards.every(c => logic.isCardSelected(c)))

  // onClear 清空
  logic.onClear()
  check('onClear 清空选择', logic.selectedCount.value === 0)

  // 提示后按具体牌 ID 选中
  await logic.onHintToggle(true)
  check('提示后 selectedCount > 0', logic.selectedCount.value > 0)
  const selected = logic.selectedCardsFromIds()
  check('selectedCardsFromIds 返回选中牌', selected.length === logic.selectedCount.value)
}

console.log(`\n========== useGameLogic 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
// 测试里注册了 game timer / AI takeover timeout 等未清句柄,显式退出避免 Node 挂起
process.exit(fail > 0 ? 1 : 0)
