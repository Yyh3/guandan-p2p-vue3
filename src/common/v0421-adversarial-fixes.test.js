/**
 * v0.4.21 对抗性复查修复测试 — V0421 真正的"对抗性审查"找出的 4 个 BUG 修复
 *
 * V0421 修复列表:
 *   - BUG-V0420-1(严重):smartReconnectToPeers 调 off('connect') 不传 fn → 清掉
 *     所有模块订阅的 connect 监听器(包括 useGameLogic.onConnectSnapshot)。
 *     后果:joiner smart reconnect 成功后,新 joiner 拿不到初始 snapshot。
 *     修法:保存 handler 引用,off 传具体 handler。
 *
 *   - BUG-V0420-2(内存泄漏):setTimeout 没 clearTimeout,每次循环泄漏 1 个 timer。
 *     修法:onConnect/onError 里 clearTimeout(timer) + timer=null。
 *
 *   - BUG-V0420-3(一致性):GameViewDesktop.onUnmounted 调 net.off('host:lost')
 *     不传 fn → 清掉所有 host:lost 监听器(可能清掉其它模块订阅)。
 *     修法:命名函数 onHostLost + 精确 off(event, handler)。
 *
 *   - BUG-AI-1(AI 边界):findMinStraightFlush 用 `r <= 13` 过滤掉 A(14),
 *     导致手牌有 ♠10JQKA 时 AI 找不到同花顺(guandan-engine.test.js L62 明确
 *     10JQKA 是合法顺子)。
 *     修法:filter 改为 `r >= 3 && r <= 14`(允许 A)。
 */

import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const networkPath = path.join(repoRoot, 'src/common/network.js')
const aiPath = path.join(repoRoot, 'src/common/guandan-ai.js')
const gameViewDesktopPath = path.join(repoRoot, 'src/views/game/GameViewDesktop.vue')
const packagePath = path.join(repoRoot, 'package.json')

const networkSrc = fs.readFileSync(networkPath, 'utf-8')
const aiSrc = fs.readFileSync(aiPath, 'utf-8')
const gameViewDesktopSrc = fs.readFileSync(gameViewDesktopPath, 'utf-8')
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}

// ============== 1. BUG-V0420-1 修复验证:smartReconnectToPeers 用精确 off ==============
console.log('\n=== 1. BUG-V0420-1 修复:smartReconnectToPeers 精确 off(不传 fn 不再清空所有 listener) ===')
{
  // 1.1 关键修复:off('connect') 旁边有 onConnect handler 引用
  //   修复前:`try { off('connect') } catch (_) {}` — 无 onConnect 引用
  //   修复后:`try { off('connect', onConnect) } catch (_) {}` — 用 onConnect 引用
  check('smartReconnectToPeers off(connect, onConnect) 传具体 handler',
    /off\(['"]connect['"],\s*onConnect\)/.test(networkSrc))
  check('smartReconnectToPeers off(error, onError) 传具体 handler',
    /off\(['"]error['"],\s*onError\)/.test(networkSrc))

  // 1.2 不能残留无 handler 的 off(connect) 或 off(error)
  //   检查是不是只用了有 handler 的版本,排除旧的"清空全部"模式
  const smartReconnectBlock = networkSrc.match(/async function smartReconnectToPeers[\s\S]*?^\}/m)
  if (smartReconnectBlock) {
    const body = smartReconnectBlock[0]
    check('smartReconnectToPeers 不再有裸 off(connect)(无 handler)',
      !/^\s*try\s*\{\s*off\(['"]connect['"]\)\s*\}/m.test(body))
    check('smartReconnectToPeers 不再有裸 off(error)(无 handler)',
      !/^\s*try\s*\{\s*off\(['"]error['"]\)\s*\}/m.test(body))
  }

  // 1.3 onConnect / onError 函数定义存在(被 off 引用说明它们是 named function)
  //   P1-06 重构后:handler 引用提升到 Promise 外,支持 cleanup() 统一清理。
  check('smartReconnectToPeers 内部有 onConnect 函数定义',
    /let onConnect|\bonConnect\s*=\s*\(\)\s*=>/.test(networkSrc) || /function onConnect\s*\(\)/.test(networkSrc))
  check('smartReconnectToPeers 内部有 onError 函数定义',
    /let onError|\bonError\s*=\s*\(\)\s*=>/.test(networkSrc) || /function onError\s*\(\)/.test(networkSrc))
}

// ============== 2. BUG-V0420-2 修复验证:setTimeout clearTimeout + timer=null ==============
console.log('\n=== 2. BUG-V0420-2 修复:setTimeout clearTimeout 避免泄漏 ===')
{
  // 2.1/2.2/2.3 P1-06 重构后 cleanup() 统一清理 timer + listeners
  const smartReconnectBlock = networkSrc.match(/async function smartReconnectToPeers[\s\S]*?^\}/m)
  const cleanupBlock = smartReconnectBlock ? smartReconnectBlock[0].match(/const cleanup\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\n\s{4,}\}/) : null
  check('smartReconnectToPeers 有 cleanup() 统一清理 timer/listeners',
    !!cleanupBlock)
  if (cleanupBlock) {
    check('cleanup() 内 clearTimeout(timer) + timer=null',
      /clearTimeout\(timer\)[\s\S]*?timer\s*=\s*null/.test(cleanupBlock[0]))
    check('cleanup() 内 off(connect, onConnect)',
      /off\(['"]connect['"],\s*onConnect\)/.test(cleanupBlock[0]))
    check('cleanup() 内 off(error, onError)',
      /off\(['"]error['"],\s*onError\)/.test(cleanupBlock[0]))
  }
  // setTimeout / onConnect / onError / catch 都调 cleanup()
  check('onConnect 内调用 cleanup()',
    /onConnect\s*=\s*\(\)\s*=>\s*\{[\s\S]*?cleanup\(\)/.test(networkSrc))
  check('onError 内调用 cleanup()',
    /onError\s*=\s*\(\)\s*=>\s*\{[\s\S]*?cleanup\(\)/.test(networkSrc))
  check('setTimeout callback 内调用 cleanup()',
    /setTimeout\(\(\)\s*=>\s*\{[\s\S]*?cleanup\(\)/.test(networkSrc))

  // 2.4 catch 路径也 cleanup
  if (smartReconnectBlock) {
    const body = smartReconnectBlock[0]
    check('joinRoom 抛错 catch 路径也 cleanup()',
      /catch\s*\(e\)\s*\{[\s\S]*?cleanup\(\)/.test(body))
  }
}

// ============== 3. BUG-V0420-3 修复验证:GameViewDesktop.onUnmounted 精确 off ==============
console.log('\n=== 3. BUG-V0420-3 修复:GameViewDesktop 精确 off(event, handler) ===')
{
  // 3.1 onMounted 内部用命名函数 onHostLost 注册
  check('GameViewDesktop onHostLost 是命名函数',
    /const onHostLost\s*=\s*async\s*\(\)\s*=>\s*\{/.test(gameViewDesktopSrc) || /function onHostLost\s*\(/.test(gameViewDesktopSrc))

  // 3.2 net.on 调用传 onHostLost 引用
  check('GameViewDesktop 注册监听用 onHostLost 引用',
    /net\.on\(['"]host:lost['"],\s*onHostLost\)/.test(gameViewDesktopSrc))

  // 3.3 onUnmounted 精确 off(event, handler) — 不再裸 off('host:lost')
  check('GameViewDesktop onUnmounted 用 net.off(host:lost, onHostLost) 精确 off',
    /net\.off\(['"]host:lost['"],\s*onHostLost\)/.test(gameViewDesktopSrc))

  // 3.4 不能再有裸 off('host:lost') 不传 handler
  //   全文搜:不能有"off('host:lost')" 或 'off("host:lost")'(不传 handler)
  //   注意:精确 off('host:lost', onHostLost) 后面会有 handler 参数,不匹配
  //   排除注释行:注释里写 `off('host:lost')` 不算代码里的调用
  //   用 negative regex: \.off\(['"]host:lost['"]\)(?!\s*,)  (后面不是逗号)
  //   然后逐行扫:跳过 `//` 开头和 `*` 开头(JSDoc 注释)的行
  const lines = gameViewDesktopSrc.split('\n')
  let hasBareOffInCode = false
  for (const line of lines) {
    const trimmed = line.trim()
    // 跳过注释行
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    // 检查是不是有 .off('host:lost')(不传 handler)
    if (/\.off\(\s*['"]host:lost['"]\s*\)(?!\s*,)/.test(line)) {
      hasBareOffInCode = true
      break
    }
  }
  check('GameViewDesktop 不再有裸 off(host:lost)(不带 handler)',
    !hasBareOffInCode)
}

// ============== 4. BUG-AI-1 修复验证:findMinStraightFlush 允许 A(14) ==============
console.log('\n=== 4. BUG-AI-1 修复:findMinStraightFlush 允许 A(14) ===')
{
  // 4.1 filter 条件必须包含 14(允许 A)
  const flushFnBody = aiSrc.match(/^function findMinStraightFlush[\s\S]*?^\}/m)
  if (flushFnBody) {
    const body = flushFnBody[0]
    // 修复前:`r <= 13` → 修复后:`r <= 14` 或 `r >= 3 && r <= 14`
    // 注意:不能用 `/filter\(r\s*=>\s*r\s*<=\s*13\)/` 因为注释里也提到了旧版字符串,
    //   改用 `\)\s*\.filter\([^)]*r\s*<=\s*13\)` 限定是 .filter() 调用
    check('findMinStraightFlush 不再有 .filter(r => r <= 13) 调用(A 同花顺可识别)',
      !/\.filter\([^)]*r\s*<=\s*13[^0-9][^)]*\)/.test(body))
    check('findMinStraightFlush filter 允许 r <= 14',
      /\.filter\([^)]*r\s*<=\s*14[^0-9][^)]*\)/.test(body) ||
      /\.filter\([^)]*r\s*>=\s*3\s*&&\s*r\s*<=\s*14[^0-9][^)]*\)/.test(body))
  } else {
    check('findMinStraightFlush 函数定义存在', false)
  }
}

// ============== 5. 版本号与 npm test 集成 ==============
console.log('\n=== 5. 版本号与 npm test 集成 ===')
{
  check('package.json version === 0.4.25', pkg.version === '0.4.25')
  const pkgSrc = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')
  const usesWrapper = /scripts\/run-all-tests\.js/.test(pkgSrc)
  const wrapperPath = path.join(repoRoot, 'scripts/run-all-tests.js')
  const wrapperSrc = usesWrapper && fs.existsSync(wrapperPath) ? fs.readFileSync(wrapperPath, 'utf-8') : ''
  check('npm test 命令含 v0421-adversarial-fixes.test.js 或其 wrapper 引用该文件',
    /v0421-adversarial-fixes\.test\.js/.test(pkgSrc) || /v0421-adversarial-fixes\.test\.js/.test(wrapperSrc))
}

// ============== 6. 关键回归验证(修复不应破坏既有功能) ==============
console.log('\n=== 6. 关键回归:不破坏既有 smartReconnectToPeers 行为 ===')
{
  // 6.1 smartReconnectToPeers 还是 async function
  check('smartReconnectToPeers 仍是 async function',
    /async function smartReconnectToPeers\(/.test(networkSrc))

  // 6.2 仍返回 Promise(返回 ok 对象)
  check('smartReconnectToPeers 仍返回 ok:true 含 hostAddress',
    /return\s*\{\s*ok:\s*true,\s*hostAddress:/.test(networkSrc))
  check('smartReconnectToPeers 仍返回 ok:false 含 tried',
    /return\s*\{\s*ok:\s*false,\s*reason:/.test(networkSrc))

  // 6.3 仍然用 getCachedPeerHostAddresses + parseHostAddress + joinRoom
  check('smartReconnectToPeers 仍用 getCachedPeerHostAddresses',
    /getCachedPeerHostAddresses\(roomNo\)/.test(networkSrc))
  check('smartReconnectToPeers 仍用 parseHostAddress',
    /parseHostAddress\(c\.hostAddress\)/.test(networkSrc))
  check('smartReconnectToPeers 仍调 joinRoom',
    /joinRoom\(roomNo,\s*self,\s*\{\s*hostIp:/.test(networkSrc))

  // 6.4 GameViewDesktop host:lost 监听器仍然调用 smartReconnectToPeers
  check('GameViewDesktop onHostLost 仍调 smartReconnectToPeers',
    /net\.smartReconnectToPeers\(routeRoomNo/.test(gameViewDesktopSrc))
}

console.log(`\n========== v0.4.22 对抗性复查修复测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)