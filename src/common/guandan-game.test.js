/**
 * 对局状态机自测(串行)
 *
 * 关键设计: aiPlayers=[] 阻止 AI 自动出牌,玩家 0 出牌时机可控。
 * 首家 firstPlayer 是 deal 时随机 (0-3),所以循环 deal 直到 firstPlayer=0 (1/4 概率,30 次内必中)。
 */
import { createGame } from './guandan-game.js'

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

  console.log(`\n========== 游戏状态机测试: ${pass} 通过 / ${fail} 失败 ==========\n`)
  process.exit(fail > 0 ? 1 : 0)
}
main()
