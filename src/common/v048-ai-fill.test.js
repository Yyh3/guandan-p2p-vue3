/**
 * v0.4.8 N-2:AI 补位测试
 *
 * 覆盖:
 *   1. game.js fillEmptySeatsWithAI 纯函数:扫 peers,空 seat 自动入 aiPlayers
 *   2. hostSeat 排除:host 自己的 seat 不被填 AI
 *   3. hasPeer 函数为 false 的 seat 都补
 *   4. 已经 AI 的不重复加
 *   5. 4 人齐(没人需要 AI)→ 返回 []
 *   6. 1-3 人开局:多种空座组合都正确补
 *   7. addAIPlayer + removeAIPlayer 反向操作
 *   8. 集成:createGame + addAIPlayer 后,scheduleAI 会触发(走 fake timer)
 */

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++ }
}
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (ok) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}\n    期望: ${JSON.stringify(b)}\n    实际: ${JSON.stringify(a)}`); fail++ }
}

const engineUrl = './guandan-engine.js?t=' + Date.now()
const gameUrl = './guandan-game.js?t=' + Date.now() + '_' + Math.random()

const E = await import(engineUrl)
const G = await import(gameUrl)

console.log('\n=== 1. game.fillEmptySeatsWithAI API 存在 ===')
{
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [] })
  assert('game.fillEmptySeatsWithAI 是函数', typeof g.fillEmptySeatsWithAI === 'function')
  // Function.length 不含 default param,所以 (hasPeer, hostSeat=0) 实际 length 是 1
  assert('fillEmptySeatsWithAI.length >= 1 (hasPeer 必填)', g.fillEmptySeatsWithAI.length >= 1)
}

console.log('\n=== 2. host 自己不被填 AI ===')
{
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [] })
  // 4 个空 seat(host 自己是 seat 0),其他 seat 都没人
  const peersMap = new Map()  // 全空
  const filled = g.fillEmptySeatsWithAI((seat) => peersMap.has(seat), 0)
  // hostSeat=0 跳过,seat 1/2/3 都补 AI
  eq('空房填 [1,2,3]', filled.sort(), [1, 2, 3])
  eq('game.aiPlayers = [1,2,3]', g.getAIPlayers().sort(), [1, 2, 3])
}

console.log('\n=== 3. 部分有真人:只填空 seat ===')
{
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [] })
  const peersMap = new Map([[2, { nickname: 'J2' }]])  // 只有 seat 2 真人
  const filled = g.fillEmptySeatsWithAI((seat) => peersMap.has(seat), 0)
  eq('seat 2 真人,补 [1,3]', filled.sort(), [1, 3])
  eq('game.aiPlayers = [1,3]', g.getAIPlayers().sort(), [1, 3])
}

console.log('\n=== 4. 4 人齐:没人需要 AI ===')
{
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [] })
  const peersMap = new Map([
    [1, { nickname: 'J1' }],
    [2, { nickname: 'J2' }],
    [3, { nickname: 'J3' }],
  ])
  const filled = g.fillEmptySeatsWithAI((seat) => peersMap.has(seat), 0)
  eq('4 人齐返回 []', filled, [])
  eq('game.aiPlayers = []', g.getAIPlayers(), [])
}

console.log('\n=== 5. 1 人开局(host only):补 [1,2,3] ===')
{
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [] })
  const peersMap = new Map()
  const filled = g.fillEmptySeatsWithAI((seat) => peersMap.has(seat), 0)
  eq('1 人开局填 [1,2,3]', filled.sort(), [1, 2, 3])
}

console.log('\n=== 6. 2 人开局:补 2 个 ===')
{
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [] })
  const peersMap = new Map([[1, { nickname: 'J1' }]])
  const filled = g.fillEmptySeatsWithAI((seat) => peersMap.has(seat), 0)
  eq('2 人开局填 [2,3]', filled.sort(), [2, 3])
}

console.log('\n=== 7. 已经 AI 的不重复加 ===')
{
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [1, 3] })
  const peersMap = new Map()
  const filled = g.fillEmptySeatsWithAI((seat) => peersMap.has(seat), 0)
  eq('已 AI 的 [1,3] 不重复,补 [2]', filled, [2])
  eq('最终 aiPlayers = [1,2,3]', g.getAIPlayers().sort(), [1, 2, 3])
}

console.log('\n=== 8. addAIPlayer / removeAIPlayer 反向 ===')
{
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [] })
  g.addAIPlayer(2)
  assert('addAIPlayer(2) 后 aiPlayers 含 2', g.getAIPlayers().includes(2))
  g.addAIPlayer(2)  // 重复加
  assert('addAIPlayer(2) 重复不增加', g.getAIPlayers().filter(s => s === 2).length === 1)
  g.removeAIPlayer(2)
  assert('removeAIPlayer(2) 后 aiPlayers 不含 2', !g.getAIPlayers().includes(2))
  g.removeAIPlayer(2)  // 移除不在的
  assert('removeAIPlayer 不存在 seat 不报错', g.getAIPlayers().length === 0)
}

console.log('\n=== 9. 集成:fillEmptySeatsWithAI 后发牌 → scheduleAI 出牌 ===')
{
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [] })
  // 1) 填 AI
  const peersMap = new Map()
  g.fillEmptySeatsWithAI((seat) => peersMap.has(seat), 0)
  eq('fillEmptySeatsWithAI 后 aiPlayers = [1,2,3]', g.getAIPlayers().sort(), [1, 2, 3])
  // 2) 注入 aiBroadcast mock(模拟 useGameLogic 的 setAIBroadcast)
  const broadcasts = []
  g.setAIBroadcast((seat, cards, type) => {
    broadcasts.push({ seat, cards: cards.length, type })
  })
  // 3) 发牌(deal() 没返回值,看 state.hands)
  g.deal(42)  // 固定种子保证可复现
  const stAfterDeal = g.getState()
  eq('发牌后 state.hands.length=4', stAfterDeal.hands.length, 4)
  eq('发牌后每家 27 张', stAfterDeal.hands.every(h => h.length === 27), true)
  // 4) 等 scheduleAI setTimeout 触发(500-1000ms)
  await new Promise(r => setTimeout(r, 1200))
  // 5) firstPlayer 是谁谁就出牌,肯定轮到 AI(因为 host seat 0 不是 AI)
  //    如果 firstPlayer === 0 那不会 AI 出,但 scheduleAI 已调,只看是否广播
  const st = g.getState()
  // 6) 如果 firstPlayer 是 AI seat(1/2/3),应该有一次 broadcast
  const fp = st.firstPlayer
  if ([1, 2, 3].includes(fp)) {
    assert('firstPlayer=' + fp + ' 是 AI,有 aiBroadcast', broadcasts.length >= 1)
    assert('broadcast 是 PLAY 类型', broadcasts[0]?.type === 'PLAY')
    assert('broadcast seat=firstPlayer', broadcasts[0]?.seat === fp)
  } else {
    assert('firstPlayer=' + fp + ' 是 host(seat 0),scheduleAI 不广播', broadcasts.length === 0)
  }
}

console.log('\n=== 10. 集成:joiner 进入后 removeAIPlayer ===')
{
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [] })
  // 1) 填 [1,2,3] AI
  g.fillEmptySeatsWithAI(() => false, 0)
  eq('初始 aiPlayers = [1,2,3]', g.getAIPlayers().sort(), [1, 2, 3])
  // 2) joiner 进入 seat 2(host 端调 removeAIPlayer)
  g.removeAIPlayer(2)
  eq('joiner 进 seat 2 后 aiPlayers = [1,3]', g.getAIPlayers().sort(), [1, 3])
  // 3) 再 fillEmptySeatsWithAI,hasPeer 表示 seat 2 真人 → seat 2 不补(已不是 AI),
  //    seat 1/3 已 AI 也不补 → 返回 []
  const peersMap = new Map([[2, { nickname: 'J2' }]])
  const filled = g.fillEmptySeatsWithAI((seat) => peersMap.has(seat), 0)
  eq('再 fillEmptySeatsWithAI 返回 [] (seat 2 真人不补,1/3 已 AI)', filled, [])
  eq('aiPlayers 仍 = [1,3]', g.getAIPlayers().sort(), [1, 3])
}

console.log('\n=== 11. hasPeer 为 null/undefined:全填 AI (无数据默认空房) ===')
{
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [] })
  // 不传 hasPeer,语义:hasPeer 失效 = 没有 peers 数据 → 默认全空 → 全填 AI
  //   生产中不会发生(peers 一定有),但单测 / 边界值要明确
  const filled = g.fillEmptySeatsWithAI(undefined, 0)
  eq('hasPeer=undefined 全填 [1,2,3]', filled.sort(), [1, 2, 3])
  eq('aiPlayers = [1,2,3]', g.getAIPlayers().sort(), [1, 2, 3])
}

console.log('\n=== 12. hostSeat 不等于 0 时正确跳过 ===')
{
  // host 迁移后,hostSeat 可能是 2(队友升为 host)
  const g = G.createGame({ players: [{}, {}, {}, {}], aiPlayers: [] })
  const peersMap = new Map()  // 全空
  const filled = g.fillEmptySeatsWithAI((seat) => peersMap.has(seat), 2)
  eq('hostSeat=2 时跳过 seat 2,补 [0,1,3]', filled.sort(), [0, 1, 3])
}

console.log(`\n========== v0.4.8 N-2 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
process.exit(fail > 0 ? 1 : 0)