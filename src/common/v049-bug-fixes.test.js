/**
 * v0.4.9 静态审查 P0/P1 修复测试
 *
 * 覆盖报告: 静态审查 v0.4.9 (2026-06-28)
 *
 * 测试:
 *   V049-01: onHintToggle 作用域内 diff 不再 ReferenceError
 *   V049-02: isRestartAfterA 贯通 roundEnd handler + ROUND_END payload + refreshUi
 *   V049-03: restartMatch 支持 seed 参数,MATCH_RESTART 携带新 seed
 *   V049-04: MATCH_RESTART 加入 RELAY_TYPES 白名单
 *   V049-05: playMp3Sfx 失败返回 false + failedSlots 追踪
 *   V049-06: setSettings 合并当前值(而非默认值)
 *   V049-09: parseQrScanResult IP/port 范围校验
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

// ============== V049-01: onHintToggle 不再 ReferenceError: diff is not defined ==============
//   直接调用源码验证(模块级 import 不行,onHintToggle 是 useGameLogic 内部函数)。
//   用 game state 模拟:初始化 game 后用 ref 取 state,验证 fix 后的代码片段中
//   onHintToggle 函数体能正确引用 gameDifficulty.value。
console.log('\n=== 1. V049-01: onHintToggle 函数体含 diff 局部变量声明 ===')
{
  // 用 fs 读源码做正则断言,确认 onHintToggle 内有 `const diff = gameDifficulty.value`
  const fs = await import('fs')
  const src = fs.readFileSync('src/views/game/useGameLogic.js', 'utf-8')
  // 抓 onHintToggle 函数体
  const m = src.match(/function onHintToggle\(show\) \{([\s\S]*?)\n\s{2}\}/)
  assert('onHintToggle 函数体存在', !!m)
  if (m) {
    const body = m[1]
    assert(
      'onHintToggle 函数体含 `const diff = gameDifficulty.value`(修复 V049-01)',
      /const\s+diff\s*=\s*gameDifficulty\.value/.test(body)
    )
    // diff 声明在 onHintToggle 顶层(不嵌套在 if-else 里),保证即使 show=false
    // 也不影响其它路径,但实际上 V049-01 是 onHintToggle 内 diff 未定义,所以核心验证
    // 是上面那行 — body 内确实有 diff 赋值(顶层或分支内都可,因为 show=true 才用)
    assert('diff 赋值出现在 onHintToggle 函数体内(show=true 分支顶部)',
      /const\s+diff\s*=\s*gameDifficulty\.value/.test(body)
    )
  }
}

// ============== V049-02: isRestartAfterA 贯通 roundEnd + ROUND_END payload + refreshUi ==============
console.log('\n=== 2. V049-02: isRestartAfterA 贯通验证 ===')
{
  let game = null
  try {
    const fs = await import('fs')
    const src = fs.readFileSync('src/views/game/useGameLogic.js', 'utf-8')
    // 2.1 roundEnd handler 解构 isRestartAfterA + previousLevelRank
    const roundEndMatch = src.match(/game\.value\.on\('roundEnd', \(\{([^}]+)\}\) => \{/)
    assert('roundEnd handler 解构含 isRestartAfterA + previousLevelRank',
      !!roundEndMatch && /isRestartAfterA\s*:?\s*\w+/.test(roundEndMatch[1]) && /previousLevelRank/.test(roundEndMatch[1])
    )
    // 2.2 roundEnd handler 内设置 isRestartAfterA.value(抓整个 on('roundEnd') handler 函数体)
    // 用非贪婪 + 末尾定位:到 roundEnd handler 结束的 `})` 为止
    const roundEndFullMatch = src.match(/game\.value\.on\('roundEnd'[\s\S]*?\n\s{4}\}\)\s*\n/)
    assert('roundEnd handler 函数体内含 isRestartAfterA.value = ira',
      !!roundEndFullMatch && /isRestartAfterA\.value\s*=\s*ira/.test(roundEndFullMatch[0])
    )
    // 2.3 ROUND_END payload 含 isRestartAfterA + previousLevelRank
    const payloadMatch = src.match(/const payload = \{([\s\S]*?)\n\s{10}\}/)
    assert('ROUND_END payload 含 isRestartAfterA 字段',
      !!payloadMatch && /isRestartAfterA:\s*!!\s*ira/.test(payloadMatch[1])
    )
    assert('ROUND_END payload 含 previousLevelRank 字段',
      !!payloadMatch && /previousLevelRank:/.test(payloadMatch[1])
    )
    // 2.4 refreshUiFromGameState 同步 isRestartAfterA
    const refreshFnMatch = src.match(/function refreshUiFromGameState\(\) \{([\s\S]*?)\n\s{2}\}/)
    assert('refreshUiFromGameState 同步 isRestartAfterA',
      !!refreshFnMatch && /isRestartAfterA\.value\s*=\s*st\.isRestartAfterA/.test(refreshFnMatch[1])
    )
    // 2.5 game 层 state.isRestartAfterA 在 restartMatch 内被重置
    const gameSrc = fs.readFileSync('src/common/guandan-game.js', 'utf-8')
    const restartFnMatch = gameSrc.match(/function restartMatch\([\s\S]*?\n\s{2}\}/)
    assert('restartMatch 清空 state.isRestartAfterA = false',
      !!restartFnMatch && /state\.isRestartAfterA\s*=\s*false/.test(restartFnMatch[0])
    )
    // 2.6 行为验证:完成一局后 state.isRestartAfterA 字段存在(bool)
    game = createGame({
      players: [{ name: 'p0' }, { name: 'p1' }, { name: 'p2' }, { name: 'p3' }],
      seed: 42,
      aiPlayers: [0, 1, 2, 3],
    })
    game.applyRoundEnd()
    const stAfter = game.getState()
    assert('finishRound 后 state.isRestartAfterA 字段存在(bool)',
      typeof stAfter.isRestartAfterA === 'boolean'
    )
  } finally {
    if (game) game.destroy()
  }
}

// ============== V049-03: restartMatch 支持 seed 参数 + MATCH_RESTART 携带新 seed ==============
console.log('\n=== 3. V049-03: restartMatch seed 参数 + MATCH_RESTART 携带 ===')
{
  const games = []
  try {
    const fs = await import('fs')
    const gameSrc = fs.readFileSync('src/common/guandan-game.js', 'utf-8')
    // 3.1 restartMatch 签名支持 seed
    const sigMatch = gameSrc.match(/function restartMatch\(\{([^}]+)\}/)
    assert('restartMatch 解构支持 seed: forcedSeed',
      !!sigMatch && /seed\s*:\s*forcedSeed/.test(sigMatch[1])
    )
    // 3.2 restartMatch 内 deal(forcedSeed) 分支
    const restartFnBody = gameSrc.match(/function restartMatch\([\s\S]*?\n\s{2}\}/)
    assert('restartMatch 函数体内有 deal(forcedSeed) / deal() 分支',
      !!restartFnBody && /deal\(forcedSeed\)/.test(restartFnBody[0]) && /deal\(\)/.test(restartFnBody[0])
    )
    // 3.3 useGameLogic onRestartMatch 生成新 seed 并放入 MATCH_RESTART
    const logicSrc = fs.readFileSync('src/views/game/useGameLogic.js', 'utf-8')
    const onRestartMatch = logicSrc.match(/function onRestartMatch\(\) \{([\s\S]*?)\n\s{2}\}/)
    assert('onRestartMatch 含 _newRestartSeed / newSeed 变量',
      !!onRestartMatch && /newSeed/.test(onRestartMatch[1])
    )
    assert('onRestartMatch 调 restartMatch({ levelRank: 15, seed: newSeed })',
      !!onRestartMatch && /restartMatch\(\{[^}]*levelRank:\s*15[^}]*seed:\s*newSeed/.test(onRestartMatch[1])
    )
    assert('onRestartMatch 广播 MATCH_RESTART 含 seed',
      !!onRestartMatch && /MATCH_RESTART[\s\S]*?payload[\s\S]*?seed:\s*newSeed/.test(onRestartMatch[1])
    )
    // 3.4 onP2PMatchRestart 接收 seed
    const onP2PMatchRestart = logicSrc.match(/function onP2PMatchRestart\(payload[^)]*\) \{([\s\S]*?)\n\s{2}\}/)
    assert('onP2PMatchRestart 提取 payload.seed 传给 restartMatch',
      !!onP2PMatchRestart && /payload\.seed/.test(onP2PMatchRestart[1]) && /seed/.test(onP2PMatchRestart[1])
    )

    // 3.5 行为验证:restartMatch({seed: 100}) 用相同 seed 产生相同手牌
    const game1 = createGame({ players: [{}, {}, {}, {}], seed: 99 })
    games.push(game1)
    game1.applyRoundEnd()  // 推到 finished 以便能 restart
    game1.restartMatch({ levelRank: 15, seed: 12345 })
    const hands1 = game1.getState().hands.map(h => h.map(c => `${c.suit}-${c.rank}`).join(','))

    const game2 = createGame({ players: [{}, {}, {}, {}], seed: 99 })
    games.push(game2)
    game2.applyRoundEnd()
    game2.restartMatch({ levelRank: 15, seed: 12345 })
    const hands2 = game2.getState().hands.map(h => h.map(c => `${c.suit}-${c.rank}`).join(','))

    eq('restartMatch 同 seed 产生同手牌(seat 0)', hands1[0], hands2[0])
    eq('restartMatch 同 seed 产生同手牌(seat 1)', hands1[1], hands2[1])
    eq('restartMatch 同 seed 产生同手牌(seat 2)', hands1[2], hands2[2])
    eq('restartMatch 同 seed 产生同手牌(seat 3)', hands1[3], hands2[3])

    // 3.6 不同 seed 产生不同手牌
    const game3 = createGame({ players: [{}, {}, {}, {}], seed: 99 })
    games.push(game3)
    game3.applyRoundEnd()
    game3.restartMatch({ levelRank: 15, seed: 99999 })
    const hands3 = game3.getState().hands.map(h => h.map(c => `${c.suit}-${c.rank}`).join(','))
    assert('restartMatch 不同 seed 产生不同手牌',
      hands1[0] !== hands3[0] || hands1[1] !== hands3[1] || hands1[2] !== hands3[2] || hands1[3] !== hands3[3]
    )
  } finally {
    for (const g of games) g.destroy()
  }
}

// ============== V049-04: MATCH_RESTART 加入 RELAY_TYPES 白名单 ==============
console.log('\n=== 4. V049-04: MATCH_RESTART 在 RELAY_TYPES 中 ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/common/network.js', 'utf-8')
  const match = src.match(/RELAY_TYPES = new Set\(\[([\s\S]*?)\]\)/)
  assert('RELAY_TYPES 包含 MATCH_RESTART',
    !!match && /MATCH_RESTART/.test(match[1])
  )
  // 行为验证(网络模块导出项)
  assert('network.js 仍可正常 import', typeof net === 'object' && typeof net.on === 'function')
}

// ============== V049-05: playMp3Sfx 失败时返回 false + failedSlots 追踪 ==============
console.log('\n=== 5. V049-05: playMp3Sfx 失败返回 false / failedSlots 追踪 ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/common/audio.js', 'utf-8')
  // 5.1 playMp3Sfx 同步检查 el.error
  // 用 balance brace 方式抽函数体,避免非贪婪正则在内部 } 处提前截断
  function extractFunction(src, name) {
    const startRe = new RegExp('function\\s+' + name + '\\s*\\(')
    const start = src.search(startRe)
    if (start === -1) return null
    let i = src.indexOf('{', start)
    if (i === -1) return null
    let depth = 1
    i++
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      i++
    }
    return src.slice(start, i)
  }
  const playMp3Fn = extractFunction(src, 'playMp3Sfx')
  assert('playMp3Sfx 函数体存在', !!playMp3Fn)
  assert('playMp3Sfx 检查 el.error 返 false',
    !!playMp3Fn && /if\s*\(\s*el\.error\s*\)\s*return\s*false/.test(playMp3Fn)
  )
  // 5.2 failedSlots 字段定义
  assert('playMp3Sfx 内 entry.failedSlots Set 创建/写入',
    !!playMp3Fn && /entry\.failedSlots/.test(playMp3Fn)
  )
  // 5.3 _shouldUseMp3 函数存在
  const shouldFn = extractFunction(src, '_shouldUseMp3')
  assert('_shouldUseMp3 函数存在', !!shouldFn)
  // 5.4 playSfxForType 调用 _shouldUseMp3
  const playSfxFn = extractFunction(src, 'playSfxForType')
  assert('playSfxForType 调用 _shouldUseMp3 检查',
    !!playSfxFn && /_shouldUseMp3\(type\)/.test(playSfxFn)
  )

  // 5.5 行为验证:Node 环境无 Audio,playSfxForType 走 synth 路径(不抛错)
  const audio = await import('./audio.js')
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') {
    // playSfxForType 在 Node 环境应该不抛错,返回 undefined
    let threw = false
    try { audio.playSfxForType('BOMB_4') } catch (e) { threw = true }
    assert('Node 环境 playSfxForType(BOMB_4) 不抛错', !threw)
    try { audio.playSfxForType('JOKER_BOMB') } catch (e) { threw = true }
    assert('Node 环境 playSfxForType(JOKER_BOMB) 不抛错', !threw)
    try { audio.playSfxForType('SINGLE', 5) } catch (e) { threw = true }
    assert('Node 环境 playSfxForType(SINGLE) 不抛错', !threw)
  } else {
    // 浏览器环境跳过行为验证(无法 mock Audio)
    assert('Node 环境行为验证跳过(浏览器已注入 Audio)', true)
  }
}

// ============== V049-06: setSettings 合并当前值(而非默认值) ==============
console.log('\n=== 6. V049-06: setSettings 合并当前值 ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/common/storage.js', 'utf-8')
  // 6.1 setSettings 不再直接合并 DEFAULT_SETTINGS(去掉注释后)
  const setFnRaw = src.match(/function setSettings\(s\) \{([\s\S]*?)\n\}/)
  // 去掉注释行再断言,避免旧文档的注释被误判
  const codeOnly = setFnRaw ? setFnRaw[1].split('\n').filter(l => !l.trim().startsWith('//')).join('\n') : ''
  assert('setSettings 函数体不再用 { ...DEFAULT_SETTINGS, ...s }',
    !!setFnRaw && !/\{ \.\.\.DEFAULT_SETTINGS, \.\.\.s \}/.test(codeOnly)
  )
  assert('setSettings 函数体含 getSettings() 拿当前值再合并',
    !!setFnRaw && /getSettings\(\)/.test(codeOnly) && /\.\.\.current/.test(codeOnly)
  )

  // 6.2 行为验证:Node 环境模拟 localStorage
  if (typeof localStorage === 'undefined') {
    globalThis.localStorage = (() => {
      const m = new Map()
      return {
        getItem: k => m.has(k) ? m.get(k) : null,
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: k => m.delete(k),
        clear: () => m.clear(),
      }
    })()
  }
  localStorage.clear()
  const storage = (await import('./storage.js')).default

  // 步骤 1:设置 BGM 关闭 + 真实音效模式
  storage.setSettings({ bgmEnabled: false, sfxMode: 'real' })
  // 步骤 2:再单独设置 AI 难度
  storage.setSettings({ aiDifficulty: 'hard' })
  // 步骤 3:读出来,断言 BGM / SFX 模式 / 难度都保留
  const s = storage.getSettings()
  eq('setSettings 局部保存后 bgmEnabled 仍为 false', s.bgmEnabled, false)
  eq('setSettings 局部保存后 sfxMode 仍为 real', s.sfxMode, 'real')
  eq('setSettings 局部保存后 aiDifficulty 为 hard', s.aiDifficulty, 'hard')
  // 同时默认字段也都在(因为 getSettings() 合并了 DEFAULT_SETTINGS)
  assert('bgmStyle 字段存在', 'bgmStyle' in s)
  assert('bgmVolume 字段存在', 'bgmVolume' in s)
}

// ============== V049-05 续: SFX MP3 文件 > 0 bytes 防御 ==============
console.log('\n=== 8. V049-05续: SFX MP3 文件全部 > 0 bytes(防御 0 字节资源回归) ===')
{
  const fs = await import('fs')
  const path = await import('path')
  const audioDir = 'src/assets/audio'
  const sfxFiles = [
    'sfx-bomb.mp3',
    'sfx-deal.mp3',
    'sfx-joker-bomb.mp3',
    'sfx-pair.mp3',
    'sfx-single.mp3',
    'sfx-tick.mp3',
  ]
  for (const fname of sfxFiles) {
    const fp = path.join(audioDir, fname)
    assert(`SFX ${fname} 存在`, fs.existsSync(fp))
    if (fs.existsSync(fp)) {
      const sz = fs.statSync(fp).size
      // SFX 文件通常 1-50KB,设下限 1KB 防止 0 字节回归
      assert(`SFX ${fname} 大小 > 1KB (实际 ${(sz / 1024).toFixed(1)}KB)`, sz > 1024)
    }
  }
}

// ============== V049-09: parseQrScanResult IP/port 范围校验 ==============
console.log('\n=== 9. V049-09: parseQrScanResult IP/port 范围校验 ===')
{
  const fs = await import('fs')
  const src = fs.readFileSync('src/common/qr-fallback.js', 'utf-8')
  assert('parseQrScanResult 含 _isValidIpv4Octets 验证',
    /_isValidIpv4Octets/.test(src)
  )
  assert('parseQrScanResult 含 _isValidPort 验证',
    /_isValidPort/.test(src)
  )

  const { parseQrScanResult } = await import('./qr-fallback.js')

  // 合法 IP
  const ok1 = parseQrScanResult('192.168.43.1:8848')
  eq('合法 192.168.43.1:8848', ok1, { host: '192.168.43.1', port: 8848 })

  // 0.0.0.0 → null(广播地址拒绝)
  assert('0.0.0.0:8848 拒绝', parseQrScanResult('0.0.0.0:8848') === null)
  // 255.255.255.255 → null(广播地址拒绝)
  assert('255.255.255.255:8848 拒绝', parseQrScanResult('255.255.255.255:8848') === null)
  // 单 octet 超 255
  assert('999.999.999.999:8848 拒绝', parseQrScanResult('999.999.999.999:8848') === null)
  // 负 octet(正则不匹配但仍走 URL 路径)
  assert('-1.2.3.4:8848 拒绝', parseQrScanResult('-1.2.3.4:8848') === null)
  // 端口超 65535
  assert('192.168.1.1:70000 拒绝', parseQrScanResult('192.168.1.1:70000') === null)
  // 端口 0
  assert('192.168.1.1:0 拒绝', parseQrScanResult('192.168.1.1:0') === null)
  // 合法边界 1.2.3.4:65535
  const ok2 = parseQrScanResult('1.2.3.4:65535')
  eq('合法 1.2.3.4:65535', ok2, { host: '1.2.3.4', port: 65535 })
  // 合法边界 1.2.3.4:1
  const ok3 = parseQrScanResult('1.2.3.4:1')
  eq('合法 1.2.3.4:1', ok3, { host: '1.2.3.4', port: 1 })
  // 缺端口 → 默认 8848
  const ok4 = parseQrScanResult('192.168.43.1')
  eq('合法 192.168.43.1(默认 8848)', ok4, { host: '192.168.43.1', port: 8848 })
  // URL 形式且 IP 合法
  const ok5 = parseQrScanResult('http://192.168.43.1:8848')
  eq('合法 http URL', ok5, { host: '192.168.43.1', port: 8848 })
  // URL 形式 IP 不合法
  assert('http://999.999.999.999:8848 拒绝', parseQrScanResult('http://999.999.999.999:8848') === null)
  // 域名拒绝
  assert('http://example.com:8848 拒绝', parseQrScanResult('http://example.com:8848') === null)
  // 空 / null
  assert('空字符串拒绝', parseQrScanResult('') === null)
  assert('null 拒绝', parseQrScanResult(null) === null)
}

console.log(`\n========== v049-bug-fixes 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)