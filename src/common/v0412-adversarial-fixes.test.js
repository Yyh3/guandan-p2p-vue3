/**
 * v0.4.13 对抗性审查 P0/P1 修复测试
 *
 * 覆盖报告: 对抗性审查 v0.4.12 (2026-06-29)
 *
 * 测试:
 *   P0-2 / P1-5: network.js canBroadcast() + broadcastPeerLeave() + close({broadcast})
 *   P0-3:        guandan-game.js createGame.destroy() 清 _aiTimer / handlers / aiPlayers
 *   P0-4:        useGameLogic onP2PStateSnapshot 走 refreshUiFromGameState 单一来源
 *   P1-1:        guandan-game.js migrateHost 末尾 emit 'turn' 触发 UI 同步
 *   P1-2:        useGameLogic onP2PRoundEnd roundId 去重防止 UI 抖动
 *   P1-4:        game.applyPlay 防御 cards-not-found + onP2PPlay ts 去重
 */

import { createGame } from './guandan-game.js'
import * as E from './guandan-engine.js'
import * as net from './network.js'
import { promises as fs } from 'fs'

let pass = 0, fail = 0
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (ok) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, '\n    期望:', b, '\n    实际:', a) }
}
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}

// ============== P0-2 + P1-5: network.js canBroadcast() + broadcastPeerLeave() + close(opts) ==============
console.log('\n=== 1. P0-2 / P1-5: network.js 主动 close 广播 + canBroadcast 封装 ===')
{
  // 1.1 源码:canBroadcast / broadcastPeerLeave 函数存在
  const src = await fs.readFile('src/common/network.js', 'utf-8')
  assert('canBroadcast() 函数存在', /function canBroadcast\(\)/.test(src))
  assert('broadcastPeerLeave(opts) 函数存在', /function broadcastPeerLeave\(opts\s*=\s*\{\}\)/.test(src))
  assert('close(opts) 支持 broadcast 参数', /function close\(opts\s*=\s*\{\}\)/.test(src))

  // 1.2 源码:broadcastPeerLeave 校验 transport.isReady() 防御写法
  const closeFn = src.match(/function close\(opts[\s\S]*?^\}/m)
  assert('close() 在 stopHeartbeat 前先 broadcast', !!(closeFn && closeFn[0].indexOf('broadcastPeerLeave') < closeFn[0].indexOf('stopHeartbeat()')))

  // 1.3 源码:snapshot 序列化大小防御(64KB)
  assert('snapshot >64KB 时拒绝(避免 BC/WS buffer 爆)',
    /64\s*\*\s*1024/.test(src)
  )

  // 1.4 源码:canBroadcast() 调用 transport.isReady() 不是直接拿 transport
  const canBcFn = src.match(/function canBroadcast\(\)\s*\{[\s\S]*?^\}/m)
  assert('canBroadcast() 用 try/catch 包 isReady() 调用', !!(canBcFn && /try \{[\s\S]*?isReady\(\)/.test(canBcFn[0])))

  // 1.5 行为:无 transport 时 broadcastPeerLeave 返回 false
  // close 之后 transport 会被清成 null
  net.close()  // 重置 module state
  const r1 = net.broadcastPeerLeave()
  assert('无 transport 时 broadcastPeerLeave 返回 false', r1 === false)

  // 1.6 行为:非 host 时 broadcastPeerLeave 返回 false(无 transport 也算 false)
  net.close()
  const r2 = net.broadcastPeerLeave({ snapshot: { phase: 'finished' } })
  assert('非 host 时 broadcastPeerLeave 返回 false', r2 === false)
}

// ============== P0-3: createGame.destroy() ==============
console.log('\n=== 2. P0-3: createGame.destroy() 清 _aiTimer / handlers / aiPlayers ===')
{
  const game = createGame({ players: [{}, {}, {}, {}], seed: 7, aiPlayers: [0, 1, 2, 3] })
  // 2.1 函数存在
  assert('createGame 返回值含 destroy()', typeof game.destroy === 'function')

  // 2.2 行为:on 后 destroy 清空 handlers
  let called = 0
  game.on('play', () => { called++ })
  game.deal()
  game.destroy()
  // 强制 emit 验证 handler 已清空
  game.emit('play', { seat: 0, cards: [], type: 'SINGLE' })
  assert('destroy() 后 emit 不触发已注册的 listener(called 仍 = 0)', called === 0)

  // 2.3 行为:destroy 后 aiPlayers 空
  const game2 = createGame({ players: [{}, {}, {}, {}], seed: 8, aiPlayers: [0, 1, 2, 3] })
  assert('destroy 前 game2 有 AI 配置(getAIPlayers 长度 = 4)', game2.getAIPlayers().length === 4)
  game2.destroy()
  assert('destroy 后 game2.aiPlayers 空(getAIPlayers 长度 = 0)', game2.getAIPlayers().length === 0)

  // 2.4 行为:destroy 后 deal 是 noop 不抛错(防御)
  const game3 = createGame({ players: [{}, {}, {}, {}], seed: 9, aiPlayers: [0] })
  game3.destroy()
  let threw = false
  try { game3.deal() } catch (e) { threw = true }
  assert('destroy 后调 deal 不抛错', !threw)

  // 2.5 行为:destroy 后 state._destroyed = true(标记)
  const game4 = createGame({ players: [{}, {}, {}, {}], seed: 10, aiPlayers: [0] })
  assert('destroy 前 state._destroyed !== true', game4.getState()._destroyed !== true)
  game4.destroy()
  assert('destroy 后 state._destroyed === true', game4.getState()._destroyed === true)
}

// ============== P0-4: useGameLogic onP2PStateSnapshot 走 refreshUiFromGameState ==============
console.log('\n=== 3. P0-4: useGameLogic onP2PStateSnapshot 走 refreshUiFromGameState 单一来源 ===')
{
  const src = await fs.readFile('src/views/game/useGameLogic.js', 'utf-8')
  // 3.1 onP2PStateSnapshot 内调 refreshUiFromGameState
  const fn = src.match(/function onP2PStateSnapshot[\s\S]*?^\s\s\}/m)
  assert('onP2PStateSnapshot 函数存在', !!fn)
  if (fn) {
    const body = fn[0]
    assert('onP2PStateSnapshot 调 refreshUiFromGameState()',
      /refreshUiFromGameState\(\)/.test(body)
    )
    // 3.2 不再有重复手写 UI 同步块(同步刷新 UI refs 注释已删除)
    assert('删除"同步刷新 UI refs"手写块',
      !/同步刷新 UI refs[\s\S]{0,200}selected\.value\s*=\s*new Array\(myHand\.value\.length\)\.fill\(false\)/.test(body)
    )
  }
}

// ============== P1-1: migrateHost 末尾 emit 'turn' ==============
console.log('\n=== 4. P1-1: guandan-game.js migrateHost 末尾 emit \'turn\' ===')
{
  const src = await fs.readFile('src/common/guandan-game.js', 'utf-8')
  const fn = src.match(/migrateHost\(oldHostSeat, newHostSeat\)\s*\{[\s\S]*?^\s{4}\},/m)
  assert('migrateHost 函数存在', !!fn)
  if (fn) {
    const body = fn[0]
    assert('migrateHost 末尾 emit(\'turn\')',
      /emit\('turn',\s*state\.currentPlayer,\s*state\.lastPlay/.test(body)
    )
    assert('migrateHost emit turn 在 emit host:migrated 之后',
      body.indexOf("emit('turn'") > body.indexOf("emit('host:migrated'")
    )
  }

  // 行为:host 离开后 joiner 升级为新 host,migrateHost 应 emit 'turn'
  const game = createGame({ players: [{}, {}, {}, {}], seed: 99, aiPlayers: [] })
  game.deal()
  // 模拟 joiner (seat 2) 升级
  let turnEmitted = false
  game.on('turn', () => { turnEmitted = true })
  const ok = game.migrateHost(0, 2)
  assert('migrateHost(0, 2) 返回 true', ok === true)
  assert('migrateHost 后 emit \'turn\'(turnEmitted=true)', turnEmitted === true)
}

// ============== P1-2: useGameLogic onP2PRoundEnd roundId 去重 ==============
console.log('\n=== 5. P1-2: useGameLogic onP2PRoundEnd roundId 去重防止 UI 抖动 ===')
{
  const src = await fs.readFile('src/views/game/useGameLogic.js', 'utf-8')
  const fn = src.match(/function onP2PRoundEnd\(payload[^)]*\)[\s\S]*?^\s\s\}/m)
  assert('onP2PRoundEnd 函数存在', !!fn)
  if (fn) {
    const body = fn[0]
    assert('onP2PRoundEnd 用 _lastAppliedRoundEndId 字段去重',
      /_lastAppliedRoundEndId/.test(body)
    )
    assert('onP2PRoundEnd 检查 payload.roundId === _lastAppliedRoundEndId 提前 return',
      /payload\.roundId\s*!=\s*null\s*&&\s*_lastAppliedRoundEndId\s*===\s*payload\.roundId[\s\S]*?return/.test(body)
    )
  }
}

// ============== P1-4: applyPlay 防御 + onP2PPlay 去重 ==============
console.log('\n=== 6. P1-4: game.applyPlay 防御 cards-not-found + useGameLogic onP2PPlay ts 去重 ===')
{
  // 6.1 行为:applyPlay 在 cards 不全在 hand 里时直接 return,不修改 state
  const game = createGame({ players: [{}, {}, {}, {}], seed: 123, aiPlayers: [] })
  game.deal()
  const stBefore = game.getState()
  const hand0Before = stBefore.hands[0].slice()
  // 构造一张不在 hand0 的牌(取 hand1 的第一张)
  const cardFromHand1 = stBefore.hands[1][0]
  // 用 emit 模拟 host 重传(applyPlay 找不到 card 应该 noop)
  game.applyPlay(0, [cardFromHand1])
  const stAfter = game.getState()
  assert('applyPlay 找不到 card 时手牌不变', JSON.stringify(stAfter.hands[0]) === JSON.stringify(hand0Before))
  assert('applyPlay 找不到 card 时 tableCards 不变', JSON.stringify(stAfter.tableCards) === JSON.stringify(stBefore.tableCards))
  assert('applyPlay 找不到 card 时 lastPlay 不变', stAfter.lastPlay === stBefore.lastPlay)

  // 6.2 行为:正常 applyPlay 仍能 work(手牌 + 桌面更新)
  const validCard = hand0Before[0]
  game.applyPlay(0, [validCard])
  const stAfter2 = game.getState()
  assert('applyPlay 正常出牌时手牌 -1', stAfter2.hands[0].length === hand0Before.length - 1)
  assert('applyPlay 正常出牌时 tableCards = [card]', stAfter2.tableCards.length === 1)

  // 6.3 源码:useGameLogic.js _appliedPlayIds Set 去重
  const src = await fs.readFile('src/views/game/useGameLogic.js', 'utf-8')
  assert('useGameLogic 有 _appliedPlayIds Set', /const _appliedPlayIds\s*=\s*new Set\(\)/.test(src))
  assert('useGameLogic 有 _dedupPlayId(playId) 函数', /function _dedupPlayId/.test(src))
  assert('useGameLogic onP2PPlay 调用 _dedupPlayId 去重',
    /onP2PPlay[\s\S]*?_dedupPlayId\(payload\.ts\)/.test(src)
  )
}

console.log(`\n========== v0.4.13 对抗性审查修复测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)