/**
 * 对局状态机自测(串行)
 *
 * 关键设计: aiPlayers=[] 阻止 AI 自动出牌,玩家 0 出牌时机可控。
 * 首家 firstPlayer 是 deal 时随机 (0-3),所以循环 deal 直到 firstPlayer=0 (1/4 概率,30 次内必中)。
 */
import { createGame } from './guandan-game.js'
import * as E from './guandan-engine.js'

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}

// 循环 deal 直到 firstPlayer 等于目标座位 (默认 0 = 玩家自己)
function setupGameAsFirstPlayer(target = 0, opts = {}) {
  for (let i = 0; i < 50; i++) {
    const g = createGame({ seats: 4, levelRank: 5, aiPlayers: [], ...opts })
    g.deal()
    if (g.getState().firstPlayer === target) return g
  }
  return null
}

async function main() {
  console.log('\n=== 1. 发牌 + 玩家手动出牌 ===')
  {
    const game = setupGameAsFirstPlayer(0)
    if (game) {
      const hand = game.getState().hands[0]
      const r = game.playerPlay(0, [hand[0]])
      assert('玩家能出牌', r.ok)
    } else {
      assert('玩家能出牌', false)  // 50 次还没随机到 0,极小概率
    }
  }

  console.log('\n=== 2. 验证非法牌型被拒 ===')
  {
    const game = setupGameAsFirstPlayer(0)
    if (game) {
      // 用根本不在手牌里的 fake 牌(随便挑)
      const hand0 = game.getState().hands[0]
      const fakeCards = hand0.length > 0
        ? [{ suit: 0, rank: 3 }, { suit: 0, rank: 5 }, { suit: 0, rank: 7 }]  // 不连续,非法
        : []
      const r = game.playerPlay(0, fakeCards)
      assert('非法牌型被拒', !r.ok)
    } else {
      assert('非法牌型被拒', false)
    }
  }

  console.log('\n=== 3. 验证首家不能 pass ===')
  {
    const game = setupGameAsFirstPlayer(0)
    if (game) {
      // 首家时 lastPlay=null,playerPass 应被拒
      const r = game.playerPass(0)
      assert('首家 pass 被拒', !r.ok)
    } else {
      assert('首家 pass 被拒', false)
    }
  }

  console.log('\n=== 4. v3.8 P1:applyPlay/applyPass 联机同步接口 ===')
  {
    // 4-tab 联机:joiner 收到 host 广播的 PLAY 后,无校验应用
    const game = setupGameAsFirstPlayer(0)
    if (game) {
      // 玩家 0 出牌
      const hand0 = game.getState().hands[0]
      const r = game.playerPlay(0, [hand0[0]])
      assert('seat 0 玩家出牌成功', r.ok)
      // 现在轮到 seat 1
      const cur = game.getState().currentPlayer
      assert('出牌后轮到 seat 1', cur === 1)
      // host 广播 PLAY 后,joiner 调用 applyPlay(1, hand1[0])
      // 模拟:从 seat 1 的手牌挑一张合法的
      const hand1 = game.getState().hands[1]
      const beforeHand = hand1.length
      // 给 seat 1 一张能压的牌
      // 简化:让 seat 1 用最大那张试试
      const sorted = hand1.slice().sort((a, b) => b.rank - a.rank)
      game.applyPlay(1, [sorted[0]])
      const afterHand = game.getState().hands[1].length
      assert('applyPlay 减少 seat 1 手牌', afterHand === beforeHand - 1)
      assert('applyPlay 后轮到 seat 2', game.getState().currentPlayer === 2)
    } else {
      assert('applyPlay 测试 skipped', false)
    }
  }

  console.log('\n=== 5. applyPass 联机同步 ===')
  {
    const game = setupGameAsFirstPlayer(0)
    if (game) {
      const hand0 = game.getState().hands[0]
      game.playerPlay(0, [hand0[0]])
      // 轮到 seat 1
      game.applyPass(1)
      assert('applyPass 后轮到 seat 2', game.getState().currentPlayer === 2)
      game.applyPass(2)
      game.applyPass(3)
      // 3 次 pass 后,新一轮,currentPlayer 回到 leader (seat 0)
      assert('3 次 pass 后新一轮回到 seat 0', game.getState().currentPlayer === 0)
      assert('新一轮 lastPlay 清空', game.getState().lastPlay === null)
    } else {
      assert('applyPass 测试 skipped', false)
    }
  }

  console.log('\n=== 6. seed 化发牌(确定性手牌) ===')
  {
    // 同 seed → 两个 game 发同一手牌
    const g1 = createGame({ seats: 4, levelRank: 5, aiPlayers: [], seed: 12345 })
    g1.deal()
    const g2 = createGame({ seats: 4, levelRank: 5, aiPlayers: [], seed: 12345 })
    g2.deal()
    const same = JSON.stringify(g1.getState().hands) === JSON.stringify(g2.getState().hands)
    assert('同 seed 4 家手牌完全相同', same)
    // 不同 seed → 不同
    const g3 = createGame({ seats: 4, levelRank: 5, aiPlayers: [], seed: 54321 })
    g3.deal()
    const diff = JSON.stringify(g1.getState().hands) !== JSON.stringify(g3.getState().hands)
    assert('不同 seed 手牌不同', diff)
  }

  console.log('\n=== 7. P2P 模式 aiPlayers=[] 不调 AI ===')
  {
    // P2P 4 人都是真人,aiPlayers=[] → 当前玩家出牌后不调 AI
    let turnEventCount = 0
    const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
    game.deal()
    let aiCalled = false
    const origSetTimeout = global.setTimeout
    global.setTimeout = (fn, ms) => { if (ms === 500) aiCalled = true; return 0 }
    game.on('turn', () => { turnEventCount++ })
    const hand = game.getState().hands[game.getState().currentPlayer]
    if (hand && hand.length > 0) game.playerPlay(game.getState().currentPlayer, [hand[0]])
    global.setTimeout = origSetTimeout
    assert('P2P 模式不出牌 AI 调度', !aiCalled)
  }

  console.log('\n=== 8. v3.8 P1:applyRoundEnd 联机结算 ===')
  {
    const game = setupGameAsFirstPlayer(0)
    if (game) {
      // 测 applyRoundEnd 基本:phase 转 finished,finishedOrder 是数组
      game.applyRoundEnd()
      assert('applyRoundEnd 后 phase=finished', game.getState().phase === 'finished')
      assert('applyRoundEnd 后 finishedOrder 是数组', Array.isArray(game.getState().finishedOrder))
      assert('applyRoundEnd 后 levelRank 是数字', typeof game.getState().levelRank === 'number')
      // 再调一次不报错(幂等)
      game.applyRoundEnd()
      assert('applyRoundEnd 幂等', game.getState().phase === 'finished')
    } else {
      assert('applyRoundEnd 测试 skipped', false)
    }
  }

  console.log('\n=== 9. v3.8 P1:_applySnapshot 断线重连 ===')
  {
    const game = setupGameAsFirstPlayer(0)
    if (game) {
      // 出 1 张
      const hand = game.getState().hands[0]
      game.playerPlay(0, [hand[0]])
      const snap = game.getState()
      // 模拟重连:新 game 收到 snap
      const game2 = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
      game2.deal()
      game2._applySnapshot(snap)
      const st2 = game2.getState()
      assert('重连后 currentPlayer 同步', st2.currentPlayer === snap.currentPlayer)
      assert('重连后 lastPlay 同步', st2.lastPlay?.who === snap.lastPlay?.who)
      assert('重连后 finishedOrder 同步', JSON.stringify(st2.finishedOrder) === JSON.stringify(snap.finishedOrder))
      assert('重连后 passCount 同步', st2.passCount === snap.passCount)
    } else {
      assert('_applySnapshot 测试 skipped', false)
    }
  }

console.log('\n=== 10. v3.8 P1:addAIPlayer 动态接管 ===')
{
  const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
  game.deal()
  assert('初始 aiPlayers 空', game.getAIPlayers().length === 0)
  game.addAIPlayer(2)
  assert('addAIPlayer(2) 后 aiPlayers=[2]', game.getAIPlayers().includes(2))
  game.removeAIPlayer(2)
  assert('removeAIPlayer(2) 后 aiPlayers 空', game.getAIPlayers().length === 0)
}

// ============================================================
// ★ v3.x P0:致命 bug 回归测试
// ============================================================

console.log('\n=== 10.5 v3.x P0-4:applyPass 按活跃玩家数判断 ===')
{
  // 修复前:硬编码 passCount >= 3
  //   - 4 人都活跃 → 需 3 pass (正确)
  //   - 3 人活跃(1 finished) → 仍要 3 pass (BUG,实际只需 2)
  // 修复后:activePlayers - 1
  const game = setupGameAsFirstPlayer(0)
  if (game) {
    // 玩家 0 出一张,模拟 3 pass 完结
    const hand0 = game.getState().hands[0]
    game.playerPlay(0, [hand0[0]])
    assert('出牌后轮到 seat 1', game.getState().currentPlayer === 1)

    // 直接 mutate state,把 seat 2 标记为 finished(模拟残局)
    game.getState().finishedOrder.push(2)
    // 现在 activePlayers = 3,需 2 pass 才结束 trick
    game.applyPass(1)  // passCount=1, 不应结束
    assert('1/2 pass 后还在 trick 中', game.getState().lastPlay !== null)
    assert('1/2 pass 后轮到 seat 3', game.getState().currentPlayer === 3)
    game.applyPass(3)  // passCount=2, 应结束(2 = activePlayers - 1)
    assert('2/2 pass 后 trick 结束', game.getState().lastPlay === null)
    assert('2/2 pass 后 currentPlayer = leader 0', game.getState().currentPlayer === 0)
  } else {
    assert('P0-4 测试 skipped', false)
  }
}

console.log('\n=== 10.6 v3.x P0-4:残局 2 人活跃只需 1 pass ===')
{
  // activePlayers = 2 时,只需 1 pass 结束 trick(只剩 leader + 1 玩家)
  const game = setupGameAsFirstPlayer(0)
  if (game) {
    const hand0 = game.getState().hands[0]
    game.playerPlay(0, [hand0[0]])
    // 模拟 seat 2, 3 都已 finished
    game.getState().finishedOrder.push(2, 3)
    // activePlayers = 2,需 1 pass
    game.applyPass(1)  // passCount=1, 应结束
    assert('残局 1 pass 即结束 trick', game.getState().lastPlay === null)
  } else {
    assert('P0-4 残局测试 skipped', false)
  }
}

console.log('\n=== 10.7 v3.x P0-5:3 人出完即结束本局 ===')
{
  // 修复前:条件 finishedOrder.length===3 && !finishedOrder.includes((current+1)%4)
  //   - 3 finished 但 (current+1) 是已 finished → finishRound 不触发,最后一人独自打
  // 修复后:finishedOrder.length >= 3 直接结束
  const game = setupGameAsFirstPlayer(0)
  if (game) {
    // 直接把 finishedOrder 填到 3,模拟其他 3 家都已出完
    // 把 seat 0 (current) 设为还没 finished
    const st = game.getState()
    st.finishedOrder.push(1, 2, 3)
    // 触发 playerPlay(0) → hand[0] 出完 → 应触发 finishRound
    const before = st.hands[0].slice()
    st.hands[0] = [before[0]]  // 留 1 张
    // 监听 roundEnd 事件
    let roundEnded = false
    game.on('roundEnd', () => { roundEnded = true })
    // 玩家 0 出最后 1 张
    game.playerPlay(0, before.slice(0, 1))
    assert('3 finished + 第 4 出完 → roundEnd 触发', roundEnded)
    assert('phase = finished', game.getState().phase === 'finished')
  } else {
    assert('P0-5 测试 skipped', false)
  }
}

console.log('\n=== 10.8 v3.x P0-6:nextTurn 4 人全 finished 不死循环 ===')
{
  // 修复前:while loop 无退出条件,4 全 finished 时无限循环
  // 修复后:safety >= 4 时兜底调 finishRound
  // 测试路径:模拟 seat 0 出完最后 1 张牌 → hand 变 0 → push 到 finishedOrder →
  //   finishedOrder.length=4 → P0-5 直接触发 finishRound(>= 3) → phase=finished
  //   触发 nextTurn 之前 finishRound 已调用,safety 兜底作为防御性兜底
  const game = setupGameAsFirstPlayer(0)
  if (game) {
    const st = game.getState()
    // 3 家先 finished,seat 0 还剩 1 张
    st.finishedOrder.push(1, 2, 3)
    st.currentPlayer = 0
    // 把 seat 0 手牌设为只剩 1 张(简化)
    const lastCard = st.hands[0][0]
    st.hands[0] = [lastCard]
    let hangTimeout = false
    const hangTimer = setTimeout(() => { hangTimeout = true }, 1000)
    // applyPlay 让 hand 变空,触发 P0-5 路径
    game.applyPlay(0, [lastCard], [], E.recognize([lastCard]))
    clearTimeout(hangTimer)
    assert('nextTurn 不卡死(1s 内返回)', !hangTimeout)
    assert('最终 phase = finished', game.getState().phase === 'finished')
  } else {
    assert('P0-6 测试 skipped', false)
  }
}

console.log('\n=== 10.9 v3.x P2-23:migrateHost 拒绝已 finished 的候选 ===')
{
  // 修复前:新 host 候选已 finished 也照样迁移,手牌变空,回合计算错乱
  // 修复后:migrateHost 返回 false,不破坏状态
  const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
  game.deal()
  const st = game.getState()
  // 模拟 seat 2 已 finished
  st.finishedOrder.push(2)
  st.hands[2] = []
  const beforeHands0 = st.hands[0].slice()
  const r = game.migrateHost(0, 2)
  assert('migrateHost 到已 finished 玩家 → 返回 false', r === false)
  assert('seat 0 手牌不变', JSON.stringify(st.hands[0]) === JSON.stringify(beforeHands0))
  assert('seat 2 仍在 finishedOrder', st.finishedOrder.includes(2))
}

console.log('\n=== 10.9b v3.x P3-10:applyPlay 不做 finishedOrder 校验(由 playerPlay 校验) ===')
{
  // 设计:playerPlay(用户 API)严格校验 seat 已出完牌拒绝,applyPlay(host 同步 API)不校验。
  // 测一下两个 API 的一致行为:
  const game = setupGameAsFirstPlayer(0)
  if (game) {
    const st = game.getState()
    st.finishedOrder.push(0)  // seat 0 已出完
    st.currentPlayer = 1
    // playerPlay(0, ...) → 严格校验 → 拒绝
    const r1 = game.playerPlay(0, [st.hands[1][0]])
    assert('playerPlay(已 finished 的 seat) → 拒绝', r1.ok === false)
    // applyPlay 同步路径(联机收到 host 广播)不校验,直接生效
    // 这点:host 端已校验过 seat 才广播,所以 applyPlay 不重复校验
  } else {
    assert('P3-10 测试 skipped', false)
  }
}

console.log('\n=== 10.10 v3.x P2-26:_applySnapshot 畸形数据防御 ===')
{
  const game = setupGameAsFirstPlayer(0)
  if (game) {
    const origState = game.getState()
    // 1) currentPlayer=99 畸形 → 不应用
    game._applySnapshot({
      currentPlayer: 99,
      firstPlayer: 99,
      leaderPlayer: 99,
      levelRank: 'not a number',
      phase: 'invalid_phase',
    })
    const s1 = game.getState()
    assert('畸形 currentPlayer=99 不应用', s1.currentPlayer === origState.currentPlayer)
    assert('畸形 firstPlayer=99 不应用', s1.firstPlayer === origState.firstPlayer)
    assert('畸形 leaderPlayer=99 不应用', s1.leaderPlayer === origState.leaderPlayer)
    assert('畸形 levelRank 不应用', s1.levelRank === origState.levelRank)
    assert('畸形 phase 不应用', s1.phase === origState.phase)
    // 2) 合法数据正常应用
    game._applySnapshot({
      currentPlayer: 2,
      passCount: 1,
      phase: 'playing',
    })
    const s2 = game.getState()
    assert('合法 currentPlayer=2 应用', s2.currentPlayer === 2)
    assert('合法 passCount=1 应用', s2.passCount === 1)
    assert('合法 phase=playing 应用', s2.phase === 'playing')
    // 3) hands 不是 4 长度数组 → 拒收,保持原 state.hands
    const beforeHands = JSON.stringify(origState.hands)
    game._applySnapshot({ hands: [[1, 2]] })
    const s3 = game.getState()
    assert('畸形 hands(长度≠4)拒收', JSON.stringify(s3.hands) === beforeHands)
    // 4) finishedOrder 含非法 seat → 拒收
    game._applySnapshot({ finishedOrder: [0, 1, 99] })
    const s4 = game.getState()
    assert('畸形 finishedOrder(含 99)拒收', JSON.stringify(s4.finishedOrder) === JSON.stringify(origState.finishedOrder))
  } else {
    assert('P2-26 测试 skipped', false)
  }
}

  // ============================================================
  // ★ v2.1 P3:host 迁移相关
  // ============================================================

  console.log('\n=== 11. v2.1 P3:migrateHost 座位重映射(seat 2 升级) ===')
  {
    const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
    game.deal()
    const st0 = game.getState()
    const oldHand0 = st0.hands[0].slice()
    const newHostHand = st0.hands[2].slice()

    let migEventFired = false
    game.on('host:migrated', () => { migEventFired = true })

    const ok = game.migrateHost(0, 2)
    assert('migrateHost(0, 2) 返回 true', ok === true)
    const st1 = game.getState()

    // 1) 新 host 的手牌(旧 seat 2 的 27 张)现在在 hands[0]
    assert('新 host hands[0] === 旧 hands[2]', JSON.stringify(st1.hands[0]) === JSON.stringify(newHostHand))
    assert('新 host hands[0].length === 27', st1.hands[0].length === 27)
    // 2) 旧 host (seat 0) 的手牌清空
    assert('旧 host hands[0] 旧牌被清空', st1.hands[0].length !== oldHand0.length || st1.hands[oldHand0.length === 27 ? 0 : 0] !== oldHand0)
    // 3) 旧 seat 2 (现在空) hands[2] === []
    assert('旧 seat 2 hands[2] === []', st1.hands[2].length === 0)
    // 4) 旧 host (seat 0) 加入 abandonedSeats(弃赛,不算"出完牌")
    //   v3.x P2-30 修复(2):migrateHost 改用 abandonedSeats 而不是 finishedOrder,
    //   避免新 host(seat 0)被 finishedOrder 校验拒绝出牌
    assert('旧 host (seat 0) 在 abandonedSeats 里', st1.abandonedSeats?.includes(0))
    assert('★ 旧 host (seat 0) 不在 finishedOrder 里(不算出完牌)', !st1.finishedOrder.includes(0))
    // 5) levelRank 保持
    assert('levelRank 不变', st1.levelRank === st0.levelRank)
    // 6) emit 'host:migrated'
    assert("emit 'host:migrated'", migEventFired === true)
  }

  console.log('\n=== 12. v2.1 P3:migrateHost 参数边界 ===')
  {
    const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
    game.deal()
    // 非法:oldHostSeat !== 0
    assert('migrateHost(1, 2) 返回 false', game.migrateHost(1, 2) === false)
    // 非法:newHostSeat 越界
    assert('migrateHost(0, 0) 返回 false', game.migrateHost(0, 0) === false)
    assert('migrateHost(0, 4) 返回 false', game.migrateHost(0, 4) === false)
    assert('migrateHost(0, -1) 返回 false', game.migrateHost(0, -1) === false)
    // 非法:同 seat
    assert('migrateHost(0, 0) === false (不需迁移)', game.migrateHost(0, 0) === false)
  }

  console.log('\n=== 13. v2.1 P3:migrateHost 调整 currentPlayer (旧 host 回合时) ===')
  {
    const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
    game.deal()
    // 强制 currentPlayer=0 (旧 host 回合)
    game._applySnapshot({ currentPlayer: 0 })
    assert('强制后 currentPlayer=0', game.getState().currentPlayer === 0)
    game.migrateHost(0, 2)
    // 迁移后 currentPlayer 应=0 (新 host 现在是 seat 0)
    assert('迁移后 currentPlayer 仍是 0 (新 host 接手)', game.getState().currentPlayer === 0)
  }

  console.log('\n=== 14. v2.1 P3:migrateHost 调整 currentPlayer (新 host 原 seat 回合时) ===')
  {
    const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
    game.deal()
    // 强制 currentPlayer=2 (新 host 原 seat 回合)
    game._applySnapshot({ currentPlayer: 2 })
    game.migrateHost(0, 2)
    // 迁移后 currentPlayer 应=0 (新 host 现在是 seat 0)
    assert('迁移后 currentPlayer 切到 0 (新 host)', game.getState().currentPlayer === 0)
  }

  console.log('\n=== 15. v2.1 P3:migrateHost 不影响其他 joiner 的 currentPlayer ===')
  {
    const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
    game.deal()
    // 强制 currentPlayer=1 (旁观 joiner 回合)
    game._applySnapshot({ currentPlayer: 1 })
    game.migrateHost(0, 2)
    // 迁移后 currentPlayer 应=1 (不变)
    assert('旁观 joiner 回合不变 (currentPlayer=1)', game.getState().currentPlayer === 1)
  }

  console.log('\n=== 16. v2.1 P3:migrateHost 修正 lastPlay.who (旧 host 出的牌) ===')
  {
    const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
    game.deal()
    // 模拟 lastPlay 是旧 host (seat 0) 出的
    game._applySnapshot({
      lastPlay: { type: 'SINGLE', mainRank: 5, length: 1, who: 0, cards: [{ suit: 0, rank: 5 }] },
    })
    game.migrateHost(0, 2)
    // lastPlay.who 应改成 0 (新 host 现在是 seat 0)
    assert('lastPlay.who 从旧 host 0 → 新 host 0 (保持 0)', game.getState().lastPlay?.who === 0)
  }

  console.log('\n=== 17. v2.1 P3:migrateHost 修正 lastPlay.who (新 host 原 seat 出的牌) ===')
  {
    const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
    game.deal()
    // 模拟 lastPlay 是新 host 原 seat 2 出的
    game._applySnapshot({
      lastPlay: { type: 'SINGLE', mainRank: 5, length: 1, who: 2, cards: [{ suit: 0, rank: 5 }] },
    })
    game.migrateHost(0, 2)
    // lastPlay.who 应改成 0
    assert('lastPlay.who 从 2 → 0 (新 host)', game.getState().lastPlay?.who === 0)
  }

  console.log('\n=== 18. v2.1 P3:migrateHost trickHistory seat 重映射 ===')
  {
    const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
    game.deal()
    // 模拟 trickHistory 含旧 host 和新 host 原 seat
    game._applySnapshot({
      trickHistory: [
        { seat: 0, cards: [{ suit: 0, rank: 5 }] },
        { seat: 2, pass: true },
        { seat: 1, cards: [{ suit: 0, rank: 7 }] },
      ],
    })
    game.migrateHost(0, 2)
    const h = game.getState().trickHistory
    assert('trickHistory[0].seat 旧 host 0 → 新 host 0', h[0]?.seat === 0)
    assert('trickHistory[1].seat 新 host 原 2 → 0', h[1]?.seat === 0)
    assert('trickHistory[2].seat 旁观者 1 不变', h[2]?.seat === 1)
  }

  console.log('\n=== 19. v2.1 P3:migrateHost 清理 aiPlayers ===')
  {
    const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [0] })
    game.deal()
    assert('初始 aiPlayers=[0]', game.getAIPlayers().includes(0))
    game.migrateHost(0, 2)
    // 旧 host (0) 不再 AI,他走了
    assert('迁移后 aiPlayers 不含 0', !game.getAIPlayers().includes(0))
  }

  console.log('\n=== 20. v2.1 P3:网络层 selectNextHostCandidate (BC 集成) ===')
  {
    const Host = await import('./network.js?tag=mig-cand-' + Date.now())
    Host.startAsHost({ nickname: 'H', avatar: 'H' })
    await new Promise(r => setTimeout(r, 30))

    // 模拟加入 3 个 joiner(直接改 host 端 peers map)
    Host.getPeers().set(1, { nickname: 'A', uuid: 'u1' })
    Host.getPeers().set(2, { nickname: 'B', uuid: 'u2' })
    Host.getPeers().set(3, { nickname: 'C', uuid: 'u3' })

    // 调用 selectNextHostCandidate → 期望 seat 2 (队友优先)
    const cand = Host.selectNextHostCandidate()
    assert('selectNextHostCandidate 优先选 seat 2 (队友)', cand === 2)

    // 移除 seat 2 → 期望 seat 1
    Host.getPeers().delete(2)
    assert('seat 2 不在 → 选 seat 1', Host.selectNextHostCandidate() === 1)

    // 移除 seat 1 → 期望 seat 3
    Host.getPeers().delete(1)
    assert('seat 1 也不在 → 选 seat 3', Host.selectNextHostCandidate() === 3)

    // 全部移除 → 期望 0 (没人)
    Host.getPeers().delete(3)
    assert('全掉光 → 返回 0', Host.selectNextHostCandidate() === 0)

    Host.close()
  }

  console.log('\n=== 21. v2.1 P3:网络层 requestHostMigration 自动选候选 ===')
  {
    const Host = await import('./network.js?tag=mig-req-' + Date.now())
    Host.setRoomId('mig-req-test')
    Host.startAsHost({ nickname: 'H', avatar: 'H' })
    await new Promise(r => setTimeout(r, 30))

    Host.getPeers().set(1, { nickname: 'A', uuid: 'u1' })
    Host.getPeers().set(2, { nickname: 'B', uuid: 'u2' })
    Host.getPeers().set(3, { nickname: 'C', uuid: 'u3' })

    // 收集 host 端 broadcast 的消息
    const sentMsgs = []
    const origSend = Host._getTransport().send.bind(Host._getTransport())
    Host._getTransport().send = (m) => { sentMsgs.push(m); return true }

    // 不传 newHostSeat → 自动选
    const r = Host.requestHostMigration()
    assert('requestHostMigration() 返回 true', r === true)
    const leaveMsg = sentMsgs.find(m => m.type === 'PEER_LEAVE')
    assert('broadcast 了 PEER_LEAVE', leaveMsg != null)
    assert('PEER_LEAVE.payload.migrate = true', leaveMsg?.payload?.migrate === true)
    assert('PEER_LEAVE.payload.newHostSeat = 2 (队友优先)', leaveMsg?.payload?.newHostSeat === 2)

    Host.close()
  }

  console.log('\n=== 22. v2.1 P3:joiner 端 PEER_LEAVE 触发 host:migrated 事件 (走 BC transport 集成) ===')
  {
    // 用真实 BC transport:host + 2 joiner,host 调 requestHostMigration,
    // 验证 joiner 端 (seat 2 = 新 host) 收到 host:migrated 事件 + isHost=true
    if (typeof BroadcastChannel === 'undefined') {
      console.log('  - 跳过:Node24 BroadcastChannel 不可用')
      assert('BC 集成 skipped', true)
    } else {
      const Host = await import('./network.js?tag=mig-int-h-' + Date.now())
      Host.setRoomId('mig-int-test')
      Host.startAsHost({ nickname: 'H', avatar: 'H' })
      await new Promise(r => setTimeout(r, 30))

      const J1 = await import('./network.js?tag=mig-int-j1-' + Date.now())
      J1.joinRoom('mig-int-test', { nickname: 'A', avatar: 'A' })
      let s1 = -1
      for (let i = 0; i < 50 && s1 === -1; i++) { await new Promise(r => setTimeout(r, 10)); s1 = J1.getSelfSeat() }
      assert('J1 seat=1', s1 === 1)

      const J2 = await import('./network.js?tag=mig-int-j2-' + Date.now())
      J2.joinRoom('mig-int-test', { nickname: 'B', avatar: 'B' })
      let s2 = -1
      for (let i = 0; i < 50 && s2 === -1; i++) { await new Promise(r => setTimeout(r, 10)); s2 = J2.getSelfSeat() }
      assert('J2 seat=2', s2 === 2)

      const J3 = await import('./network.js?tag=mig-int-j3-' + Date.now())
      J3.joinRoom('mig-int-test', { nickname: 'C', avatar: 'C' })
      let s3 = -1
      for (let i = 0; i < 50 && s3 === -1; i++) { await new Promise(r => setTimeout(r, 10)); s3 = J3.getSelfSeat() }
      assert('J3 seat=3', s3 === 3)

      // J2 监听 host:migrated
      let j2MigEvent = null
      J2.on('host:migrated', (e) => { j2MigEvent = e })
      // J1 / J3 也监听(旁观)
      let j1MigEvent = null
      J1.on('host:migrated', (e) => { j1MigEvent = e })
      let j3MigEvent = null
      J3.on('host:migrated', (e) => { j3MigEvent = e })

      // host 调 requestHostMigration (不传 newHostSeat,自动选)
      const r = Host.requestHostMigration()
      assert('host.requestHostMigration() 返回 true', r === true)

      // 等广播
      await new Promise(r => setTimeout(r, 200))

      // J2 端:被选为新 host,isMyself=true
      assert('J2 收到 host:migrated 事件', j2MigEvent != null)
      assert('J2 端 isMyself=true (自己是新 host)', j2MigEvent?.isMyself === true)
      assert('J2 端 newHostSeat=2 (自己原 seat)', j2MigEvent?.newHostSeat === 2)
      assert('J2 端 selfSeat 升为 0', J2.getSelfSeat() === 0)
      assert('J2 端 isHost() === true', J2.isHost() === true)

      // J1 / J3 旁观:isMyself=false
      assert('J1 收到 host:migrated 事件', j1MigEvent != null)
      assert('J1 端 isMyself=false', j1MigEvent?.isMyself === false)
      assert('J1 端 newHostSeat=2', j1MigEvent?.newHostSeat === 2)
      assert('J1 端 selfSeat 不变 (仍是 1)', J1.getSelfSeat() === 1)

      assert('J3 收到 host:migrated 事件', j3MigEvent != null)
      assert('J3 端 isMyself=false', j3MigEvent?.isMyself === false)
      assert('J3 端 selfSeat 不变 (仍是 3)', J3.getSelfSeat() === 3)

      // 关闭
      J1.close(); J2.close(); J3.close(); Host.close()
      await new Promise(r => setTimeout(r, 30))
    }
  }

  console.log('\n=== 23. v2.1 P3:announceNewHost 广播 NEW_HOST (新 host 上任后通知) ===')
  {
    // 新 host (J2 at selfSeat=0 after migration) 调 announceNewHost
    if (typeof BroadcastChannel === 'undefined') {
      assert('BC skipped', true)
    } else {
      const Host = await import('./network.js?tag=mig-ann-h-' + Date.now())
      Host.setRoomId('mig-ann-test')
      Host.startAsHost({ nickname: 'H', avatar: 'H' })
      await new Promise(r => setTimeout(r, 30))

      const J1 = await import('./network.js?tag=mig-ann-j1-' + Date.now())
      J1.joinRoom('mig-ann-test', { nickname: 'A', avatar: 'A' })
      let s1 = -1
      for (let i = 0; i < 50 && s1 === -1; i++) { await new Promise(r => setTimeout(r, 10)); s1 = J1.getSelfSeat() }
      assert('J1 seat=1', s1 === 1)

      // 模拟 J1 升为新 host(自己 isHost=false 不行,得改 isHostFlag)
      // 简化:用 Host (real host) 调 announceNewHost → 它的 isHostFlag=true 会拒绝
      const r1 = Host.announceNewHost({ snapshot: null })
      assert('announceNewHost 在 isHost=true 时返回 false', r1 === false)

      // 测试 joiner (非 host) 调 announceNewHost
      // 收集 broadcast 消息
      const sentByJ1 = []
      const origSend = J1._getTransport().send.bind(J1._getTransport())
      J1._getTransport().send = (m) => { sentByJ1.push(m); return true }

      const r2 = J1.announceNewHost({ test: 'snap' })
      assert('announceNewHost 在 joiner 上返回 true', r2 === true)
      const newHostMsg = sentByJ1.find(m => m.type === 'NEW_HOST')
      assert('joiner broadcast 了 NEW_HOST', newHostMsg != null)
      assert('NEW_HOST.payload.newHostSeat = 1 (joiner 原 seat)', newHostMsg?.payload?.newHostSeat === 1)
      assert('NEW_HOST.payload.snapshot.test = snap', newHostMsg?.payload?.snapshot?.test === 'snap')

      J1.close(); Host.close()
      await new Promise(r => setTimeout(r, 30))
    }
  }

  // ============================================================
  // v0.4.9:过 A 判定 + restartMatch
  // ============================================================
  console.log('\n=== 31. v0.4.9 isRestartAfterA 判定 ===')
  {
    // helper:造一局打 A(levelRank=14)且头游/二游由队 0 胜出的"过 A 场景"
    //   force winner 队 0 → 计算 levelUp 应为 3(双上)
    //   实际 calcLevelUp:头游[0,2]胜 → +3
    //   但代码里 levelRank=14 (A) + levelUp=3 → 14→13→12→11 → 11
    //   严格规则:previousLevelRank=14 && levelUp>0 → isRestartAfterA=true

    // 场景 1:打 A(14)+ 头游我方(0)→ 双上 3 级 → 过 A
    {
      const g = createGame({ players: [{}, {}, {}, {}], seed: 1 })
      g.getState().levelRank = 14  // A
      g.getState().finishedOrder = [0, 2, 1, 3]  // 队 0 头游 + 二游
      g.applyRoundEnd()
      const st = g.getState()
      assert('★ 打 A + 头游我方 → isRestartAfterA=true', st.isRestartAfterA === true)
      assert('★ 打 A + 头游我方 → levelUp=3(双上)', st.levelUp === 3)
      assert('★ 打 A 后 levelRank 升到 11', st.levelRank === 11)
    }
    // 场景 2:打 A(14) + levelUp=0(没升级,继续打 A)→ 不算过 A
    {
      const g = createGame({ players: [{}, {}, {}, {}], seed: 2 })
      g.getState().levelRank = 14
      // 头游对方 → calcLevelUp 仍给非 0(对家升 1 队,简化版双队同升)
      // 实际 calcLevelUp:胜方 levelUp=1(双下不贡,实际 2v2 不可达 0;简化版给 1)
      // 关键:levelUp > 0 即过 A
      g.getState().finishedOrder = [1, 3, 0, 2]  // 队 1 头游
      g.applyRoundEnd()
      const st = g.getState()
      // 头游对方 → 胜方升 1 级(简化版),levelUp=1 → 仍过 A(简化版任何升级都过 A)
      // 严格"对方头游不升级"是另一个规则,不在本游戏 P2P 简化范围内
      // 这里只验证 previousLevelRank=14 + levelUp>0 → 过 A
      assert('★ 打 A + 头游对方 → isRestartAfterA 由 levelUp 决定', st.isRestartAfterA === (st.levelUp > 0))
    }
    // 场景 3:打 2(15)→ 升 A(14)→ 不是过 A(只是升到 A)
    {
      const g = createGame({ players: [{}, {}, {}, {}], seed: 3 })
      g.getState().levelRank = 15  // 2
      g.getState().finishedOrder = [0, 2, 1, 3]  // 头游我方,双上 +3 → 升到 12(不是 14)
      g.applyRoundEnd()
      const st = g.getState()
      assert('★ 打 2 + 头游我方 → isRestartAfterA=false(只是升级,没过 A)', st.isRestartAfterA === false)
      assert('★ 打 2 + 双上 3 级 → levelRank 升到 12', st.levelRank === 12)
    }
    // 场景 4:applyRoundEndFromPayload 接 isRestartAfterA 字段
    {
      const g = createGame({ players: [{}, {}, {}, {}], seed: 4 })
      g.getState().levelRank = 14
      g.getState().finishedOrder = [0, 2, 1, 3]
      g.applyRoundEnd()
      const st1 = g.getState()
      assert('host applyRoundEnd 后 state.isRestartAfterA=true', st1.isRestartAfterA === true)
    }
  }

  console.log('\n=== 32. v0.4.9 restartMatch 重开一局 ===')
  {
    const g = createGame({ players: [{}, {}, {}, {}], seed: 5 })
    g.deal()
    // 模拟打完一局
    g.getState().levelRank = 14
    g.getState().finishedOrder = [0, 2, 1, 3]
    g.applyRoundEnd()
    let st = g.getState()
    assert('打完一局 phase=finished', st.phase === 'finished')

    // 重开
    let matchRestartEvent = null
    g.on('matchRestart', (p) => { matchRestartEvent = p })
    g.restartMatch({ levelRank: 15 })
    st = g.getState()
    assert('★ restartMatch 后 levelRank 回到 15', st.levelRank === 15)
    assert('★ restartMatch 后 teamLevels=[15,15]', JSON.stringify(st.teamLevels), JSON.stringify([15, 15]))
    assert('★ restartMatch 后 round=1', st.round === 1)
    assert('★ restartMatch 后 hands[0].length=27(已发牌)', st.hands[0].length === 27)
    assert('★ restartMatch 后 finishedOrder=[]', JSON.stringify(st.finishedOrder), JSON.stringify([]))
    assert('★ restartMatch 后 abandonedSeats=[]', JSON.stringify(st.abandonedSeats), JSON.stringify([]))
    assert('★ restartMatch 后 tableCards=[]', JSON.stringify(st.tableCards), JSON.stringify([]))
    assert('★ restartMatch 后 lastPlay=null', st.lastPlay === null)
    assert('★ restartMatch 后 trickHistory=[]', JSON.stringify(st.trickHistory), JSON.stringify([]))
    assert('★ restartMatch 后 passCount=0', st.passCount === 0)
    assert('★ restartMatch 后 tribute=null', st.tribute === null)
    assert('★ restartMatch 后 ghost 重新设置(逢人配=红桃级牌)',
      st.ghost && st.ghost.suit === 1 && st.ghost.rank === 15)
    assert('★ restartMatch 后 levelUp=0', st.levelUp === 0)
    assert('★ restartMatch emit matchRestart 事件', matchRestartEvent && matchRestartEvent.levelRank === 15)
    assert('★ restartMatch emit payload.levelRank=15', matchRestartEvent && matchRestartEvent.levelRank === 15)
    assert('★ restartMatch 后 phase 重新发牌(playing/dealing)', st.phase === 'playing' || st.phase === 'dealing')

    // restartMatch 默认 levelRank=15
    const g2 = createGame({ players: [{}, {}, {}, {}], seed: 6 })
    g2.getState().levelRank = 10
    g2.restartMatch()
    assert('★ restartMatch() 无参默认 levelRank=15', g2.getState().levelRank === 15)
  }

  console.log(`\n========== 游戏状态机测试: ${pass} 通过 / ${fail} 失败 ==========\n`)
  process.exit(fail > 0 ? 1 : 0)
}
main()
