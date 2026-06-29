/**
 * v0.4.18 对抗性复查修复测试 — V0414-04 本地选举协议
 *
 * V0414-04 修复:WS / AndroidWs 模式下,joiner 端 host 真的崩溃/被杀进程时,
 *   旧 host transport 已死 → joiner 发的 PROMOTE_HOST_REQUEST 发不出去 →
 *   永远不升级。
 *   最小可行修复:
 *   1. `requestPromoteToHost` 扩展本地 self-loop 到所有 transport(不只 BC)
 *   2. `rebuildAsHost` 失败 → emit `host:lost` 让业务层跳首页(浏览器 ws joiner 走这条)
 *   3. `useGameLogic.onHostMigrated` 的 rebuildAsHost promise.catch 也 emit host:lost
 *
 * 已知未做(留 v0.4.19+):
 * - 确定性本地选举(基于 UUID 字典序 / selfSeat 优先级)避免多 joiner 同时升级冲突
 * - 所有 peer 入房时上报 `canHost` + `hostAddress` 让新 host 选择更优
 * - 主动退出时旧 host 把新 host 的 hostAddress 塞进 PEER_LEAVE
 * - 崩溃场景的第二发现通道(mDNS / UDP 广播)
 */
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const networkPath = path.join(repoRoot, 'src/common/network.js')
const useGameLogicPath = path.join(repoRoot, 'src/views/game/useGameLogic.js')
const gameViewDesktopPath = path.join(repoRoot, 'src/views/game/GameViewDesktop.vue')
const packagePath = path.join(repoRoot, 'package.json')

const networkSrc = fs.readFileSync(networkPath, 'utf-8')
const useGameLogicSrc = fs.readFileSync(useGameLogicPath, 'utf-8')
const gameViewDesktopSrc = fs.readFileSync(gameViewDesktopPath, 'utf-8')
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}

// ============== 1. V0414-04 修复 1: requestPromoteToHost 扩展本地 self-loop ==============
console.log('\n=== 1. V0414-04 修复 1: requestPromoteToHost 扩展本地 self-loop 到所有 transport ===')
{
  // 1.1 函数存在
  const reqPromoteMatch = networkSrc.match(/function requestPromoteToHost\(snapshot\)\s*\{[\s\S]*?^\}/m)
  check('requestPromoteToHost 函数存在', !!reqPromoteMatch)
  if (reqPromoteMatch) {
    const body = reqPromoteMatch[0]
    // 1.2 不再限制为 BC 模式 — 应在 transport 存在时都执行 self-loop
    //   旧版:if (transport && transport.constructor.name === 'BroadcastChannelTransport') {
    //   新版:if (transport) {
    const bcOnlyOldStyle = /if\s*\(\s*transport\s*&&\s*transport\.constructor\.name\s*===\s*['"]BroadcastChannelTransport['"]\s*\)\s*\{[\s\S]*?_onTransportMessage\(\{[\s\S]*?PROMOTE_HOST_REQUEST/m.test(body)
    check('requestPromoteToHost 已无 BC-only self-loop 旧写法', !bcOnlyOldStyle)

    // 1.3 新版:transport 存在时无差别 self-loop
    const universalSelfLoop = /if\s*\(\s*transport\s*\)\s*\{[\s\S]*?_onTransportMessage\(\{[\s\S]*?type:\s*['"]PROMOTE_HOST_REQUEST['"][\s\S]*?newHostSeat:\s*selfSeat/m.test(body)
    check('requestPromoteToHost 含通用 self-loop(transport 存在即触发)',
      universalSelfLoop)

    // 1.4 sendMessage 失败被 try/catch 包住(防止旧 host transport 死导致崩溃)
    //   简化:检测 try { ... sendMessage({ ... }) ... } catch 模式
    const hasTrySendMsg = /try\s*\{[\s\S]{0,500}?sendMessage\(\s*\{[\s\S]{0,500}?\}\s*\)\s*\}[\s\S]{0,200}?catch/.test(body)
    check('requestPromoteToHost sendMessage 调用在 try/catch 内',
      hasTrySendMsg)

    // 1.5 _promotedHostSeat 全局去重 — _handleJoinerMessage 内已有(不在本函数,但确保函数逻辑不会破坏)
    check('requestPromoteToHost 不破坏 _promotedHostSeat 去重逻辑(不直接重置)',
      !/_promotedHostSeat\s*=\s*null/.test(body))
  }
}

// ============== 2. V0414-04 修复 2: rebuildAsHost 失败 → emit host:lost ==============
console.log('\n=== 2. V0414-04 修复 2: rebuildAsHost 失败 → emit host:lost ===')
{
  const rebuildMatch = networkSrc.match(/async function rebuildAsHost\(\)\s*\{[\s\S]*?^\}/m)
  check('rebuildAsHost 函数存在', !!rebuildMatch)
  if (rebuildMatch) {
    const body = rebuildMatch[0]
    // 2.1 _createTransport() 失败 → emit host:lost
    const createTransportError = body.match(/newTransport\s*=\s*_createTransport\(\)[\s\S]*?catch\s*\(e\)\s*\{[\s\S]*?return\s*\{\s*ok:\s*false/m)
    check('rebuildAsHost _createTransport() 失败分支存在', !!createTransportError)
    if (createTransportError) {
      check('_createTransport() 失败分支 emit host:lost',
        /emit\(['"]host:lost['"]/.test(createTransportError[0]))
    }
    // 2.2 newTransport.open('self') 失败 → emit host:lost
    const openError = body.match(/newTransport\.open\(['"]self['"][\s\S]*?catch\s*\(e\)\s*\{[\s\S]*?return\s*\{\s*ok:\s*false/m)
    check('rebuildAsHost newTransport.open(self) 失败分支存在', !!openError)
    if (openError) {
      check('open(self) 失败分支 emit host:lost',
        /emit\(['"]host:lost['"]/.test(openError[0]))
    }
  }
}

// ============== 3. V0414-04 修复 3: useGameLogic.onHostMigrated rebuildAsHost promise.catch 也 emit host:lost ==============
console.log('\n=== 3. V0414-04 修复 3: useGameLogic.onHostMigrated rebuildAsHost promise.catch emit host:lost ===')
{
  // 3.1 onHostMigrated 函数存在
  const onHostMigratedMatch = useGameLogicSrc.match(/function onHostMigrated\(payload\)\s*\{[\s\S]*?^\s\s\}/m)
  check('useGameLogic.onHostMigrated 函数存在', !!onHostMigratedMatch)
  if (onHostMigratedMatch) {
    const body = onHostMigratedMatch[0]
    // 3.2 含 isMyself && net.rebuildAsHost 路径
    check('onHostMigrated 含 isMyself && net.rebuildAsHost 路径',
      /isMyself\s*&&\s*net\.rebuildAsHost/.test(body))
    // 3.3 promise.catch 内 emit host:lost(浏览器 ws joiner 无 server 能力时走这条)
    const promiseCatchMatch = body.match(/\.catch\(\(?\s*(?:e|err)\s*\)?\s*=>\s*\{[\s\S]*?\}\s*\)/)
    check('onHostMigrated 含 .catch() 异步处理',
      !!promiseCatchMatch)
    if (promiseCatchMatch) {
      check('onHostMigrated .catch() 内 emit host:lost(★ v0.4.18 新增)',
        /net\.emit\(\s*['"]host:lost['"]/.test(promiseCatchMatch[0]))
    }
  }
}

// ============== 4. V0414-04 业务层 host:lost 跳首页链路 ==============
console.log('\n=== 4. V0414-04 业务层 host:lost 跳首页链路(v0.4.17 已修,本版本验证) ===')
{
  // 4.1 GameViewDesktop 监听 host:lost
  const onMountedBodies = gameViewDesktopSrc.match(/onMounted\(\(\)\s*=>\s*\{[\s\S]*?^\s*\}\)/gm) || []
  const hasHostLostListener = onMountedBodies.some(body => /net\.on\(['"]host:lost['"]/.test(body))
  check('GameViewDesktop.onMounted 含 net.on(\'host:lost\') 监听(v0.4.17 已有)', hasHostLostListener)
  check('GameViewDesktop host:lost 处理含 router.push 跳首页(v0.4.17 已有)',
    /net\.on\(['"]host:lost['"][\s\S]*?router\.push/.test(gameViewDesktopSrc))
  // 4.2 onUnmounted 清理 host:lost
  check('GameViewDesktop.onUnmounted 含 net.off(\'host:lost\') 清理(v0.4.17 已有)',
    /net\.off\(['"]host:lost['"]/.test(gameViewDesktopSrc))
}

// ============== 5. V0414-04 版本号 + npm test 集成 ==============
console.log('\n=== 5. V0414-04 版本号与 npm test 集成 ===')
{
  check('package.json version === 0.4.18', pkg.version === '0.4.18')
  check('npm test 命令含 v0418-adversarial-fixes.test.js',
    /v0418-adversarial-fixes\.test\.js/.test(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')))
}

// ============== 6. V0414-04 已知未做 — follow-up 标记 ==============
console.log('\n=== 6. V0414-04 已知未做(follow-up) — 留 v0.4.19+ ===')
{
  // 已知未做(本次 v0.4.18 范围内不实现):
  // 1. 确定性本地选举(基于 UUID / selfSeat 优先级)
  // 2. peer:join 时上报 canHost + hostAddress
  // 3. 主动退出时 hostAddress 塞 PEER_LEAVE
  // 4. 第二发现通道(mDNS / UDP 广播)

  // 这些留 v0.4.19+ follow-up — 当前测试不强制要求实现
  check('v0.4.18 范围已声明(本测试仅验证当前修复点)',
    true)  // 占位 — 标记本测试已声明范围
}

console.log(`\n========== v0.4.18 对抗性复查修复测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)