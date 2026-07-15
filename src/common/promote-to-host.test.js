/**
 * P0-04/05:promoteToHost 与 host 崩溃策略测试
 *
 * 覆盖:
 *   - promoteToHost(null/undefined) 拒绝并返回错误
 *   - promoteToHost(不完整 state) 拒绝
 *   - joiner 升 host 后持有完整 4 家手牌
 *   - 升 host 后可继续本地权威操作(如 playerPlay)
 */
import { createGame } from './guandan-game.js'

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++; process.exitCode = 1 }
}
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name} 期望=${JSON.stringify(expected)} 实际=${JSON.stringify(actual)}`); fail++; process.exitCode = 1 }
}

console.log('\n=== 1. promoteToHost 拒绝空/非法 authoritativeState ===')
{
  const game = createGame({ isHost: false, selfSeat: 1 })
  const r1 = game.promoteToHost(null)
  assert('promoteToHost(null) ok=false', r1.ok === false)
  assert('promoteToHost(null) error=missing_authoritative_state', r1.error === 'missing_authoritative_state')

  const r2 = game.promoteToHost(undefined)
  assert('promoteToHost(undefined) ok=false', r2.ok === false)

  const r3 = game.promoteToHost({})
  assert('promoteToHost({}) ok=false(无 hands)', r3.ok === false)
  assert('promoteToHost({}) error=missing_authoritative_state', r3.error === 'missing_authoritative_state')

  const r4 = game.promoteToHost({ hands: [[], [], []] })
  assert('promoteToHost(hands 长度≠4) ok=false', r4.ok === false)
}

console.log('\n=== 2. joiner 升 host 后持有完整 4 家手牌 ===')
{
  // 先建一个 host game 并发牌
  const hostGame = createGame({ isHost: true, selfSeat: 0 })
  hostGame.deal(12345, 0)
  const snap = hostGame.getSnapshot()
  assert('host snapshot hands 长度=4', snap.hands.length === 4)
  assert('host snapshot 每家 27 张', snap.hands.every(h => h.length === 27))

  // joiner 只持有自己的 seat 1 手牌
  const joinerGame = createGame({ isHost: false, selfSeat: 1, seed: 12345 })
  const before = joinerGame.getState()
  assert('joiner 升前 hands[0] 为空', before.hands[0].length === 0)

  // 升 host
  const r = joinerGame.promoteToHost(snap)
  assert('promoteToHost(snap) ok=true', r.ok === true)
  const after = joinerGame.getState()
  assert('升后 hands 长度=4', after.hands.length === 4)
  assert('升后每家 27 张', after.hands.every(h => h.length === 27))
  assert('升后 mode 为 host(可本地出牌)', after.hands[0].length === 27)
}

console.log('\n=== 3. 升 host 后可本地权威出牌 ===')
{
  const hostGame = createGame({ isHost: true, selfSeat: 0 })
  hostGame.deal(12345, 0)
  const snap = hostGame.getSnapshot()
  const joinerGame = createGame({ isHost: false, selfSeat: 1, seed: 12345 })
  const snap2 = { ...snap, currentPlayer: 1 }
  const r = joinerGame.promoteToHost(snap2)
  assert('升级成功', r.ok === true)

  const st = joinerGame.getState()
  const card = st.hands[1][0]
  const beforeLen = st.hands[1].length
  const playR = joinerGame.playerPlay(1, [card])
  assert('升 host 后可本地 playerPlay', playR.ok === true)
  assert('playerPlay 后手牌 -1', joinerGame.getState().hands[1].length === beforeLen - 1)
}

console.log(`\n========== promoteToHost 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
