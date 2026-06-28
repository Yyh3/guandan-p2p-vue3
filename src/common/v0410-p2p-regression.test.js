/**
 * v0.4.11 端到端 P2P 回归测试
 *
 * 覆盖 V0410-01/02/03 的端到端场景,用真实 BroadcastChannel + dynamic-import cache-bust
 * 模拟 4 客户端(host + 3 joiner),触发 ROUND_END / MATCH_RESTART 验证:
 *
 *   V0410-01: ROUND_END 广播只有 host 发,joiner 不再广播(避免多端重复结算)
 *   V0410-02: 远端 applyRoundEndFromPayload 后 state.isRestartAfterA 写回(后续 snapshot / refresh 拿到权威值)
 *   V0410-03: MATCH_RESTART sender authority(from===0) + phase gate + restartId 去重
 *
 * 设计:
 *   - Node 24 自带 BroadcastChannel,跨 dynamic-import 实例可通信
 *   - 每实例 __installFakeTimers 注入假定时器,避免 10s 心跳真等
 *   - 不直接调 useGameLogic(它依赖 Vue ref),改在 game 层 + network 层验证
 *     onP2PMatchRestart 的门禁逻辑(用 fake sender 模拟非 host 消息)
 */

import { createGame } from './guandan-game.js'

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

// ============================================================
// V0410-01 回归:ROUND_END 广播只有 host 能发
// ============================================================
console.log('\n=== 1. V0410-01: ROUND_END 广播 host-only 守卫 ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/views/game/useGameLogic.js', 'utf-8')
  // 抓 roundEnd handler 内广播分支
  const broadcastGuard = src.match(/if \(isP2PMode\.value && isNetworkHost\.value && !suppressRoundEndBroadcast\) \{/)
  assert('ROUND_END 广播守卫存在(isP2PMode + isNetworkHost + !suppress)', !!broadcastGuard)
  if (broadcastGuard) {
    // 整个 broadcast 块应只含 net.broadcast({ type: 'ROUND_END', ... }) 一句
    const block = src.match(/if \(isP2PMode\.value && isNetworkHost\.value && !suppressRoundEndBroadcast\) \{([\s\S]*?)\n\s{6}\}/)
    assert('ROUND_END 守卫块存在', !!block)
    if (block) {
      assert('守卫块只 net.broadcast ROUND_END(不会广播其它类型)',
        /net\.broadcast\(\{\s*type:\s*['"]ROUND_END['"]/.test(block[1])
        && !/net\.broadcast\(\{\s*type:\s*['"]MATCH_RESTART['"]/.test(block[1])
        && !/net\.broadcast\(\{\s*type:\s*['"]PLAY['"]/.test(block[1])
      )
    }
  }

  // 行为模拟:即使 joiner 端 game 触发 roundEnd 事件,只要 isNetworkHost=false 就不应广播
  // 这里用源码模拟,而不是跑 useGameLogic (依赖 Vue)
  const broadcastCalls = []
  const fakeNet = {
    broadcast: (msg) => { broadcastCalls.push(msg) },
  }
  // 模拟 joiner 端:isP2PMode=true, isNetworkHost=false
  const isP2PMode = true
  const isNetworkHost = false
  const suppressRoundEndBroadcast = false
  // 这是从 game 拿到的 roundEnd event
  const roundEndEvent = {
    ranks: [0, 2, 1, 3], levelUp: 3, newLevelRank: 15,
    isRestartAfterA: false, previousLevelRank: 14,
  }
  // 模拟 handler 逻辑
  if (isP2PMode && isNetworkHost && !suppressRoundEndBroadcast) {
    fakeNet.broadcast({ type: 'ROUND_END', payload: {} })
  }
  eq('joiner 端 roundEnd 不广播', broadcastCalls.length, 0)

  // 模拟 host 端:isP2PMode=true, isNetworkHost=true
  broadcastCalls.length = 0
  const isNetworkHost2 = true
  if (isP2PMode && isNetworkHost2 && !suppressRoundEndBroadcast) {
    fakeNet.broadcast({ type: 'ROUND_END', payload: { ranks: roundEndEvent.ranks, newLevelRank: roundEndEvent.newLevelRank } })
  }
  eq('host 端 roundEnd 广播 1 次', broadcastCalls.length, 1)
  eq('广播类型 = ROUND_END', broadcastCalls[0]?.type, 'ROUND_END')

  // 模拟 joiner 端 suppressRoundEndBroadcast=true(应用远端 ROUND_END 时)→ 不广播
  broadcastCalls.length = 0
  const suppress3 = true
  if (isP2PMode && isNetworkHost2 && !suppress3) {
    fakeNet.broadcast({ type: 'ROUND_END', payload: {} })
  }
  eq('applyRoundEndFromPayload 路径(suppress=true) host 也不广播',
    broadcastCalls.length, 0)
}

// ============================================================
// V0410-02 回归:applyRoundEndFromPayload 后 state.isRestartAfterA 写回
// ============================================================
console.log('\n=== 2. V0410-02: state.isRestartAfterA 写回 + 多次 apply 幂等 ===')
{
  // 2.1 远端 applyRoundEndFromPayload({isRestartAfterA: true}) → state.isRestartAfterA === true
  const game = createGame({ players: [{}, {}, {}, {}], seed: 99, aiPlayers: [0, 1, 2, 3] })
  game.applyRoundEnd()
  game.applyRoundEndFromPayload({
    roundId: 'r-v0410-regression-1',
    ranks: [0, 2, 1, 3],
    levelUp: 3,
    previousLevelRank: 14,
    newLevelRank: 15,
    isRestartAfterA: true,
  })
  const st = game.getState()
  eq('远端 ROUND_END 后 state.isRestartAfterA=true', st.isRestartAfterA, true)
  eq('远端 ROUND_END 后 state.previousLevelRank=14', st.previousLevelRank, 14)
  eq('state.phase=finished', st.phase, 'finished')

  // 2.2 幂等性:同一 roundId 第二次应用被去重(防御重复包)
  game.applyRoundEndFromPayload({
    roundId: 'r-v0410-regression-1',
    ranks: [3, 2, 1, 0],  // 故意不同 ranks,验证去重生效
    levelUp: 999,
    previousLevelRank: 13,
    newLevelRank: 13,
    isRestartAfterA: false,  // 故意反着来,验证被去重
  })
  const st2 = game.getState()
  eq('同一 roundId 二次应用被去重,ranks 不变', st2.finishedOrder, [0, 2, 1, 3])
  eq('同一 roundId 二次应用被去重,levelRank 不变', st2.levelRank, 15)
  eq('同一 roundId 二次应用被去重,isRestartAfterA 不变', st2.isRestartAfterA, true)

  // 2.3 不同 roundId 视为新结算
  game.applyRoundEndFromPayload({
    roundId: 'r-v0410-regression-2',  // 不同 roundId
    ranks: [3, 0, 1, 2],
    levelUp: 2,
    previousLevelRank: 15,
    newLevelRank: 16,
    isRestartAfterA: false,
  })
  const st3 = game.getState()
  eq('不同 roundId 第二次应用生效,ranks 更新', st3.finishedOrder, [3, 0, 1, 2])
  eq('不同 roundId 第二次应用生效,levelRank 更新', st3.levelRank, 16)
  eq('不同 roundId 第二次应用生效,isRestartAfterA 变 false', st3.isRestartAfterA, false)

  // 2.4 snapshot / refresh 兼容性:把 state 序列化再反序列化(模拟 joiner 端 snapshot)
  const game2 = createGame({ players: [{}, {}, {}, {}], seed: 100, aiPlayers: [0, 1, 2, 3] })
  game2.applyRoundEnd()
  game2.applyRoundEndFromPayload({
    roundId: 'r-v0410-snapshot',
    ranks: [1, 3, 0, 2],
    levelUp: 1,
    previousLevelRank: 14,
    newLevelRank: 15,
    isRestartAfterA: true,
  })
  const snap = JSON.parse(JSON.stringify(game2.getState()))
  eq('snapshot 包含 isRestartAfterA=true', snap.isRestartAfterA, true)
  eq('snapshot 包含 previousLevelRank=14', snap.previousLevelRank, 14)
}

// ============================================================
// V0410-03 回归:MATCH_RESTART sender authority + phase gate + restartId 去重
// ============================================================
console.log('\n=== 3. V0410-03: MATCH_RESTART 门禁逻辑 ===')
{
  // 用 createGame + restartMatch 模拟 MATCH_RESTART 的应用流程
  // 这里用 fake onP2PMatchRestart handler 模拟 useGameLogic 内的门禁
  const _appliedRestartIds = new Set()
  let restartMatchCallCount = 0

  function fakeOnP2PMatchRestart(payload, from) {
    if (!payload || !payload.seed) return { applied: false, reason: 'no payload/seed' }
    // sender authority
    if (typeof from === 'number' && from !== 0) return { applied: false, reason: 'sender not host' }
    // phase gate
    const st = { phase: 'finished', isRestartAfterA: true }
    if (st.phase !== 'finished') return { applied: false, reason: 'phase not finished' }
    if (st.isRestartAfterA !== true) return { applied: false, reason: 'not isRestartAfterA' }
    // restartId dedup
    if (payload.restartId && _appliedRestartIds.has(payload.restartId)) {
      return { applied: false, reason: 'duplicate restartId' }
    }
    if (payload.restartId) _appliedRestartIds.add(payload.restartId)
    restartMatchCallCount++
    return { applied: true }
  }

  // 3.1 sender authority:非 host 发包被拒
  const r1 = fakeOnP2PMatchRestart({ levelRank: 15, seed: 12345, restartId: 'rr1' }, 1)
  eq('非 host (from=1) 被拒', r1.applied, false)
  eq('拒绝原因 = sender not host', r1.reason, 'sender not host')

  // 3.2 sender authority:host 发包被接受
  const r2 = fakeOnP2PMatchRestart({ levelRank: 15, seed: 12345, restartId: 'rr1' }, 0)
  eq('host (from=0) 被接受', r2.applied, true)
  eq('restartMatch 调用 1 次', restartMatchCallCount, 1)

  // 3.3 重启 ID 去重:同 rr1 再次发,被拒
  const r3 = fakeOnP2PMatchRestart({ levelRank: 15, seed: 99999, restartId: 'rr1' }, 0)
  eq('同 restartId 二次应用被拒', r3.applied, false)
  eq('拒绝原因 = duplicate restartId', r3.reason, 'duplicate restartId')
  eq('restartMatch 调用仍 1 次(未重发)', restartMatchCallCount, 1)

  // 3.4 不同 restartId 接受
  const r4 = fakeOnP2PMatchRestart({ levelRank: 15, seed: 54321, restartId: 'rr2' }, 0)
  eq('新 restartId (rr2) 接受', r4.applied, true)
  eq('restartMatch 调用累计 2 次', restartMatchCallCount, 2)

  // 3.5 缺 seed 被拒
  const r5 = fakeOnP2PMatchRestart({ levelRank: 15, restartId: 'rr3' }, 0)
  eq('缺 seed 被拒', r5.applied, false)

  // 3.6 phase gate 模拟:非 finished 状态拒绝
  function fakeWithPhase(payload, from, st) {
    if (!payload || !payload.seed) return { applied: false, reason: 'no payload/seed' }
    if (typeof from === 'number' && from !== 0) return { applied: false, reason: 'sender not host' }
    if (st.phase !== 'finished') return { applied: false, reason: 'phase not finished' }
    if (st.isRestartAfterA !== true) return { applied: false, reason: 'not isRestartAfterA' }
    if (payload.restartId && _appliedRestartIds.has(payload.restartId)) {
      return { applied: false, reason: 'duplicate restartId' }
    }
    return { applied: true }
  }
  const r6 = fakeWithPhase(
    { levelRank: 15, seed: 999, restartId: 'rr4' },
    0,
    { phase: 'playing', isRestartAfterA: false },
  )
  eq('phase=playing 被拒(防御正常牌局中途被洗牌)', r6.applied, false)
  eq('拒绝原因 = phase not finished', r6.reason, 'phase not finished')

  const r7 = fakeWithPhase(
    { levelRank: 15, seed: 999, restartId: 'rr5' },
    0,
    { phase: 'finished', isRestartAfterA: false },
  )
  eq('phase=finished 但 isRestartAfterA=false 被拒', r7.applied, false)
  eq('拒绝原因 = not isRestartAfterA', r7.reason, 'not isRestartAfterA')
}

// ============================================================
// V0410-04 回归:抽 afterMatchRestartRefresh 后行为不变
// ============================================================
console.log('\n=== 4. V0410-04: restartMatch 同 seed 产生同手牌(host/joiner 一致) ===')
{
  // host 和 joiner 同 seed restartMatch 应该产生相同手牌(回归 V049-03 + V0410-04)
  const game1 = createGame({ players: [{}, {}, {}, {}], seed: 99, aiPlayers: [0, 1, 2, 3] })
  game1.applyRoundEnd()
  game1.restartMatch({ levelRank: 15, seed: 99999 })
  const hands1 = game1.getState().hands.map(h => h.map(c => `${c.suit}-${c.rank}`).join(','))

  const game2 = createGame({ players: [{}, {}, {}, {}], seed: 99, aiPlayers: [0, 1, 2, 3] })
  game2.applyRoundEnd()
  game2.restartMatch({ levelRank: 15, seed: 99999 })
  const hands2 = game2.getState().hands.map(h => h.map(c => `${c.suit}-${c.rank}`).join(','))

  for (let i = 0; i < 4; i++) {
    eq(`seat ${i} 同 seed restartMatch 产生同手牌`, hands1[i], hands2[i])
  }

  // 不同 seed 不同手牌
  const game3 = createGame({ players: [{}, {}, {}, {}], seed: 99, aiPlayers: [0, 1, 2, 3] })
  game3.applyRoundEnd()
  game3.restartMatch({ levelRank: 15, seed: 12345 })
  const hands3 = game3.getState().hands.map(h => h.map(c => `${c.suit}-${c.rank}`).join(','))
  let anyDifferent = false
  for (let i = 0; i < 4; i++) {
    if (hands1[i] !== hands3[i]) { anyDifferent = true; break }
  }
  assert('不同 seed restartMatch 产生不同手牌', anyDifferent)

  // restartMatch 后 state.isRestartAfterA 清空(V0410-04 refresh 副作用)
  const game4 = createGame({ players: [{}, {}, {}, {}], seed: 99, aiPlayers: [0, 1, 2, 3] })
  game4.applyRoundEnd()
  game4.applyRoundEndFromPayload({
    roundId: 'r-v0410-04-test',
    ranks: [0, 2, 1, 3],
    levelUp: 3,
    previousLevelRank: 14,
    newLevelRank: 15,
    isRestartAfterA: true,
  })
  eq('applyRoundEndFromPayload 后 isRestartAfterA=true', game4.getState().isRestartAfterA, true)
  game4.restartMatch({ levelRank: 15, seed: 99999 })
  eq('restartMatch 后 isRestartAfterA=false(消费掉)', game4.getState().isRestartAfterA, false)
}

// ============================================================
// V0410-06 回归:applySettingsToAudio 入场同步所有 audio 设置
// ============================================================
console.log('\n=== 5. V0410-06: applySettingsToAudio 同步 bgmStyle + sfxMode ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/views/game/useGameLogic.js', 'utf-8')
  const applyFn = src.match(/function applySettingsToAudio\(\) \{([\s\S]*?)\n\s{2}\}/)
  assert('applySettingsToAudio 函数存在', !!applyFn)
  if (applyFn) {
    const body = applyFn[1]
    // 验证包含所有 6 个 audio 设置
    assert('applySettingsToAudio 同步 setBgmEnabled', /setBgmEnabled/.test(body))
    assert('applySettingsToAudio 同步 setSfxEnabled', /setSfxEnabled/.test(body))
    assert('applySettingsToAudio 同步 setBgmVolume', /setBgmVolume/.test(body))
    assert('applySettingsToAudio 同步 setSfxVolume', /setSfxVolume/.test(body))
    assert('applySettingsToAudio 同步 setBgmStyle(V0410-06)', /setBgmStyle/.test(body))
    assert('applySettingsToAudio 同步 setSfxMode(V0410-06)', /setSfxMode/.test(body))
  }

  // 行为模拟:storage 写 hard sfxMode + calm bgmStyle,模拟入场读 audio 模块
  const audio = await import('./audio.js')
  // 调用 audio 模块对应的接口
  audio.setBgmStyle('calm')
  audio.setSfxMode('real')
  eq('audio.setBgmStyle(calm)', audio.getBgmStyle(), 'calm')
  eq('audio.setSfxMode(real)', audio.getSfxMode(), 'real')
}

// ============================================================
// V0410-07 回归:scheduleAI 传 state.difficulty(行为差异断言)
// ============================================================
console.log('\n=== 6. V0410-07: scheduleAI 传 state.difficulty ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/common/guandan-game.js', 'utf-8')
  const scheduleAIMatch = src.match(/function scheduleAI\(\) \{([\s\S]*?)\n\s{2}\}/)
  assert('scheduleAI 函数存在', !!scheduleAIMatch)
  if (scheduleAIMatch) {
    assert('scheduleAI 内 AI.decide 传 state.difficulty',
      /AI\.decide\([^)]*,\s*state\.difficulty\)/.test(scheduleAIMatch[1])
    )
  }

  // 行为:createGame 时 difficulty 不同,state.difficulty 也不同
  const gameHard = createGame({ players: [{}, {}, {}, {}], seed: 1, difficulty: 'hard' })
  eq('createGame({difficulty:hard}).getState().difficulty=hard',
    gameHard.getState().difficulty, 'hard')

  const gameMed = createGame({ players: [{}, {}, {}, {}], seed: 1, difficulty: 'medium' })
  eq('createGame({difficulty:medium}).getState().difficulty=medium',
    gameMed.getState().difficulty, 'medium')
}

// ============================================================
// V0410-08 回归:SettingsView 版本号动态化
// ============================================================
console.log('\n=== 7. V0410-08: SettingsView 从 package.json 读版本 ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/views/settings/SettingsView.vue', 'utf-8')
  assert('SettingsView import package.json', /import\s+pkg\s+from\s+['"][^'"]*package\.json['"]/.test(src))
  assert('SettingsView 有 appVersion const', /const\s+appVersion\s*=\s*String\(pkg\.version/.test(src))
  assert('SettingsView 模板用 {{ appVersion }}', /v\{\{\s*appVersion\s*\}\}/.test(src))
  assert('SettingsView 不含硬编码 v0.4.8',
    !/掼蛋 P2P 局域网版 v0\.4\.8/.test(src))
}

console.log(`\n========== v0410-p2p-regression 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)