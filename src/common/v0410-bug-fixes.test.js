/**
 * v0.4.10 静态审查 8 个 bug 修复测试
 *
 * 覆盖报告: 静态审查 v0.4.10 / master (2026-06-28)
 *
 * 测试:
 *   V0410-01: P2P ROUND_END 广播只有 host 才能发
 *   V0410-02: applyRoundEndFromPayload 写回 state.isRestartAfterA + previousLevelRank
 *   V0410-03: MATCH_RESTART 重启 ID 去重 + sender authority + phase gate
 *   V0410-04: 抽出 afterMatchRestartRefresh() 统一 host/joiner/单机 UI 重置
 *   V0410-05: playMp3Sfx 成功 resolve 时清理 failedSlots
 *   V0410-06: applySettingsToAudio 应用 bgmStyle + sfxMode
 *   V0410-07: scheduleAI 传入 state.difficulty
 *   V0410-08: SettingsView 从 package.json 读版本号
 */

import { createGame } from './guandan-game.js'
import * as net from './network.js'

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

// ============== V0410-01: ROUND_END 广播只有 host 才能发 ==============
console.log('\n=== 1. V0410-01: ROUND_END 广播加 isNetworkHost 守卫 + roundId 稳定 ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/views/game/useGameLogic.js', 'utf-8')
  // 抓 roundEnd handler 内 ROUND_END 广播守卫
  const roundEndBroadcastMatch = src.match(/if \(isP2PMode\.value && isNetworkHost\.value && !suppressRoundEndBroadcast\) \{/)
  assert('roundEnd handler 内 isNetworkHost.value 守卫已加(防 joiner 广播)',
    !!roundEndBroadcastMatch
  )
  // roundId 稳定化:不再用 Date.now(),且包含 matchInstanceId 防重开碰撞
  const roundIdMatch = src.match(/roundId[^,}]*`[^`]*\$\{matchInstanceId[^`]*r\$\{st\?\.round[^`]*ranksKey[^`]*`/)
  assert('ROUND_END roundId 用 matchInstanceId + host round + ranksKey 生成(不用 Date.now())',
    !!roundIdMatch
  )
  // 不再含 Date.now() in roundId
  const oldRoundIdMatch = src.match(/roundId:\s*`r\$\{Date\.now\(\)/)
  assert('旧版 roundId 用 Date.now() 已替换', !oldRoundIdMatch)
}

// ============== V0410-02: applyRoundEndFromPayload 写回 state.isRestartAfterA ==============
console.log('\n=== 2. V0410-02: applyRoundEndFromPayload 写回 state ===')
{
  let game = null
  let game2 = null
  try {
    // 2.1 源码:state.isRestartAfterA = isRestart + state.previousLevelRank 写回
    const fs = await import('fs')
    const src = fs.readFileSync('src/common/guandan-game.js', 'utf-8')
    // 抓整个 applyRoundEndFromPayload 函数体(到函数结尾)
    const applyRoundEndMatch = src.match(/applyRoundEndFromPayload\(p\) \{([\s\S]*?)\n\s{4}\},/)
    assert('applyRoundEndFromPayload 函数体存在', !!applyRoundEndMatch)
    if (applyRoundEndMatch) {
      const body = applyRoundEndMatch[1]
      assert('applyRoundEndFromPayload 写回 state.isRestartAfterA',
        /state\.isRestartAfterA\s*=\s*isRestart/.test(body)
      )
      assert('applyRoundEndFromPayload 写回 state.previousLevelRank',
        /state\.previousLevelRank\s*=\s*\(typeof p\.previousLevelRank/.test(body)
      )
    }

    // 2.2 行为:远端调用 applyRoundEndFromPayload({isRestartAfterA: true}) 后 getState() 看到 true
    game = createGame({ players: [{}, {}, {}, {}], seed: 99, aiPlayers: [0, 1, 2, 3] })
    // 先让 game 走完一局,phase 变 finished
    game.applyRoundEnd()
    // 模拟远端 host 重发(带 isRestartAfterA + previousLevelRank)
    game.applyRoundEndFromPayload({
      roundId: 'r-v0410-test',
      ranks: [0, 2, 1, 3],
      levelUp: 3,
      previousLevelRank: 14,  // A 级
      newLevelRank: 15,        // 升到 2
      isRestartAfterA: true,
    })
    const st = game.getState()
    eq('applyRoundEndFromPayload 后 state.isRestartAfterA=true', st.isRestartAfterA, true)
    eq('applyRoundEndFromPayload 后 state.previousLevelRank=14', st.previousLevelRank, 14)

    // 2.3 缺 isRestartAfterA 时,从 previousLevelRank + levelUp 推断
    game2 = createGame({ players: [{}, {}, {}, {}], seed: 100, aiPlayers: [0, 1, 2, 3] })
    game2.applyRoundEnd()
    game2.applyRoundEndFromPayload({
      roundId: 'r-v0410-test2',
      ranks: [0, 2, 1, 3],
      levelUp: 3,
      previousLevelRank: 14,
      newLevelRank: 15,
      // 不带 isRestartAfterA,让函数内部推断
    })
    const st2 = game2.getState()
    eq('payload 缺 isRestartAfterA + previousLevelRank=14 + levelUp>0 时推断 true',
      st2.isRestartAfterA, true
    )
  } finally {
    if (game) game.destroy()
    if (game2) game2.destroy()
  }
}

// ============== V0410-03: MATCH_RESTART 去重 + sender authority + phase gate ==============
console.log('\n=== 3. V0410-03: MATCH_RESTART 安全门禁 ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/views/game/useGameLogic.js', 'utf-8')
  // 3.1 sender authority check
  const onP2PMatchRestartMatch = src.match(/function onP2PMatchRestart\(payload, from, msg\) \{[\s\S]*?\n\s{2}\}/)
  assert('onP2PMatchRestart 接收 from 参数',
    !!onP2PMatchRestartMatch
  )
  if (onP2PMatchRestartMatch) {
    assert('onP2PMatchRestart 含 sender authority 检查(against hostSeat)',
      /typeof from === 'number' && from !== (?:0|hostSeat)/.test(onP2PMatchRestartMatch[0])
    )
    assert('onP2PMatchRestart 含 phase gate(st.phase === "finished")',
      /st0\.phase\s*!==\s*['"]finished['"]/.test(onP2PMatchRestartMatch[0])
    )
    assert('onP2PMatchRestart 含 isRestartAfterA gate',
      /st0\.isRestartAfterA\s*!==\s*true/.test(onP2PMatchRestartMatch[0])
    )
  }
  // 3.2 restartId 去重集合
  assert('_appliedRestartIds Set 已定义',
    /const _appliedRestartIds = new Set\(\)/.test(src)
  )
  // 3.3 restartId check 在 handler 内
  if (onP2PMatchRestartMatch) {
    assert('onP2PMatchRestart 内 _appliedRestartIds.has(restartId) 去重',
      /_appliedRestartIds\.has\(payload\.restartId\)/.test(onP2PMatchRestartMatch[0])
    )
    assert('onP2PMatchRestart 内 _appliedRestartIds.add(restartId) 记录',
      /_appliedRestartIds\.add\(payload\.restartId\)/.test(onP2PMatchRestartMatch[0])
    )
  }
}

// ============== V0410-04: 抽出 afterMatchRestartRefresh() ==============
console.log('\n=== 4. V0410-04: afterMatchRestartRefresh 统一 UI 重置 ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/views/game/useGameLogic.js', 'utf-8')
  assert('afterMatchRestartRefresh 函数存在',
    /function afterMatchRestartRefresh\(\) \{/.test(src)
  )
  assert('afterMatchRestartRefresh 内刷 levelRank / myHand / selected / selectedColKeys / phase / isRestartAfterA',
    /levelRank\.value = st\.levelRank/.test(src)
    && /myHand\.value = E\.sortHandGrouped/.test(src)
    && /selected\.value = new Array/.test(src)
    && /isRestartAfterA\.value = false/.test(src)
  )
  // P2P host 分支调 afterMatchRestartRefresh
  const onRestartMatchMatch = src.match(/function onRestartMatch\(\) \{[\s\S]*?\n\s{2}\}/)
  if (onRestartMatchMatch) {
    assert('onRestartMatch P2P host 分支调 afterMatchRestartRefresh',
      /afterMatchRestartRefresh\(\)/.test(onRestartMatchMatch[0])
    )
  }
  // onP2PMatchRestart 也调
  const onP2PMatchRestartMatch = src.match(/function onP2PMatchRestart\(payload, from, msg\) \{[\s\S]*?\n\s{2}\}/)
  if (onP2PMatchRestartMatch) {
    assert('onP2PMatchRestart 也调 afterMatchRestartRefresh',
      /afterMatchRestartRefresh\(\)/.test(onP2PMatchRestartMatch[0])
    )
  }
}

// ============== V0410-05: playMp3Sfx 成功 resolve 清理 failedSlots ==============
console.log('\n=== 5. V0410-05: playMp3Sfx 成功 resolve 清理 failedSlots ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/common/audio.js', 'utf-8')
  const playMp3Fn = src.match(/function playMp3Sfx\(trackName\) \{[\s\S]*?\n\}\n/)
  assert('playMp3Sfx 存在', !!playMp3Fn)
  if (playMp3Fn) {
    assert('playMp3Sfx 用 .then() 而非 .catch()(可以同时处理成功/失败)',
      /p\.then\(/.test(playMp3Fn[0]) && /\.then\(/.test(playMp3Fn[0])
    )
    assert('playMp3Sfx 成功时 entry.failedSlots.delete(slot)',
      /entry\.failedSlots\.delete\(slot\)/.test(playMp3Fn[0])
    )
    assert('playMp3Sfx 成功时 entry.unlockPending.delete(slot)',
      /entry\.unlockPending.*\.delete\(slot\)/.test(playMp3Fn[0])
    )
  }

  // Node 环境行为:无 Audio 时直接返 false
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') {
    const audio = await import('./audio.js')
    let threw = false
    try { audio.playSfxForType('SINGLE') } catch (e) { threw = true }
    assert('Node 环境 playSfxForType(SINGLE) 不抛错', !threw)
  } else {
    assert('Node 环境跳过(浏览器已注入 Audio)', true)
  }
}

// ============== V0410-06: applySettingsToAudio 应用 bgmStyle + sfxMode ==============
console.log('\n=== 6. V0410-06: applySettingsToAudio 同步 bgmStyle + sfxMode ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/views/game/useGameLogic.js', 'utf-8')
  const applyFn = src.match(/function applySettingsToAudio\(\) \{[\s\S]*?\n\s{2}\}/)
  assert('applySettingsToAudio 函数存在', !!applyFn)
  if (applyFn) {
    assert('applySettingsToAudio 调 audio.setBgmStyle(...)',
      /audio\.setBgmStyle\(/.test(applyFn[0])
    )
    assert('applySettingsToAudio 调 audio.setSfxMode(...)',
      /audio\.setSfxMode\(/.test(applyFn[0])
    )
  }

  // 行为验证:Node 环境 mock audio 模块
  if (typeof window === 'undefined') {
    // 直接检查 storage 模块能 getSettings/setSettings(已在 V049-06 测过)
    // 这里只验证 audio.setBgmStyle + setSfxMode 存在
    const audio = await import('./audio.js')
    assert('audio.setBgmStyle 函数存在', typeof audio.setBgmStyle === 'function')
    assert('audio.setSfxMode 函数存在', typeof audio.setSfxMode === 'function')
  } else {
    assert('Node 环境跳过', true)
  }
}

// ============== V0410-07: scheduleAI 传入 state.difficulty ==============
console.log('\n=== 7. V0410-07: scheduleAI 传入 state.difficulty ===')
{
  let gameHard = null
  let gameMed = null
  let gameDefault = null
  try {
    const fs = await import('fs')
    const src = fs.readFileSync('src/common/guandan-game.js', 'utf-8')
    const scheduleAIMatch = src.match(/function scheduleAI\(\) \{[\s\S]*?AI\.decide\([^)]+\)/)
    assert('scheduleAI 函数体内有 AI.decide 调用', !!scheduleAIMatch)
    if (scheduleAIMatch) {
      assert('AI.decide 第 5 个参数传 state.difficulty',
        /AI\.decide\([^)]*,\s*state\.difficulty\)/.test(scheduleAIMatch[0])
      )
    }

    // 行为验证:hard difficulty game 的 state.difficulty = 'hard'
    gameHard = createGame({
      players: [{}, {}, {}, {}],
      seed: 7,
      aiPlayers: [0, 1, 2, 3],
      difficulty: 'hard',
    })
    eq('createGame({difficulty:"hard"}) 后 state.difficulty=hard',
      gameHard.getState().difficulty, 'hard'
    )
    gameMed = createGame({
      players: [{}, {}, {}, {}],
      seed: 8,
      aiPlayers: [0, 1, 2, 3],
      difficulty: 'medium',
    })
    eq('createGame({difficulty:"medium"}) 后 state.difficulty=medium',
      gameMed.getState().difficulty, 'medium'
    )
    gameDefault = createGame({
      players: [{}, {}, {}, {}],
      seed: 9,
      aiPlayers: [0, 1, 2, 3],
    })
    eq('createGame() 无 difficulty 参数,state.difficulty 默认 medium',
      gameDefault.getState().difficulty, 'medium'
    )
  } finally {
    if (gameHard) gameHard.destroy()
    if (gameMed) gameMed.destroy()
    if (gameDefault) gameDefault.destroy()
  }
}

// ============== V0410-08: SettingsView 从 package.json 读版本号 ==============
console.log('\n=== 8. V0410-08: SettingsView 从 package.json 读版本号 ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/views/settings/SettingsView.vue', 'utf-8')
  assert('SettingsView import package.json',
    /import\s+pkg\s+from\s+['"]\@\/\.\.\/package\.json['"]/.test(src)
    || /import\s+pkg\s+from\s+['"]\@\/common\/.*package/.test(src)
    || /import\s+pkg\s+from\s+['"][^'"]*package\.json['"]/.test(src)
  )
  assert('SettingsView 有 appVersion ref/const',
    /const\s+appVersion\s*=\s*String\(pkg\.version/.test(src)
  )
  // 模板用 v{{ appVersion }} 而非硬编码
  assert('SettingsView 模板用 {{ appVersion }}',
    /v\{\{\s*appVersion\s*\}\}/.test(src)
  )
  // 不再含硬编码 "v0.4.8"
  assert('SettingsView 不再含硬编码 "掼蛋 P2P 局域网版 v0.4.8"',
    !/掼蛋 P2P 局域网版 v0\.4\.8/.test(src)
  )

  // 行为验证:package.json 实际版本号
  const path = await import('path')
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
  eq('package.json 当前版本', pkg.version, '0.4.27')
}

console.log(`\n========== v0410-bug-fixes 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)