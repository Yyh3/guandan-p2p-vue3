/**
 * v0.4.19 对抗性复查修复测试 — V0419 follow-up 4 项
 *
 * V0414-04 报告里留 v0.4.20+ 的 follow-up,本版本集中修:
 * - V0419-01: 确定性本地选举函数(selectNextHostCandidate — UUID 字典序 + canHost 过滤)
 * - V0419-02: peer:join / peer:update payload 加 canHost + hostAddress 字段
 * - V0419-03: broadcastPeerLeave payload 加 newHostAddress(自动从 peers 提取)
 * - V0419-04: close({broadcast:true}) 关闭前广播完整新 host 信息(简化 TOMBSTONE)
 * + requestPromoteToHost 集成 selectNextHostCandidate + canHostAsNewHost 守卫
 *
 * V0419-04 真正的"第二发现通道"(mDNS / UDP 广播 / 固定服务)需要 native 层,
 *   留 v0.4.20+(架构性变更,scope 大)。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const networkPath = path.join(repoRoot, 'src/common/network.js')
const packagePath = path.join(repoRoot, 'package.json')

const networkSrc = fs.readFileSync(networkPath, 'utf-8')
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}

// ============== 1. V0419-01: selectNextHostCandidate 确定性选举 ==============
console.log('\n=== 1. V0419-01: selectNextHostCandidate 确定性选举(UUID 字典序 + canHost) ===')
{
  // 1.1 函数存在(line 146, V0419-01 新加)
  const newSelectMatch = networkSrc.match(/^function selectNextHostCandidate\([^)]*\)\s*\{[\s\S]*?^\}/m)
  check('selectNextHostCandidate (V0419-01 新版) 函数存在', !!newSelectMatch)
  if (newSelectMatch) {
    const body = newSelectMatch[0]
    // 1.2 优先 canHost=true 过滤
    check('selectNextHostCandidate 优先选 canHost=true 候选',
      /canHostList\.length\s*>\s*0/.test(body) ||
      /filter\(c\s*=>\s*c\.canHost\)/.test(body))
    // 1.3 UUID 字典序排序
    check('selectNextHostCandidate 按 UUID 字典序排序',
      /\.sort\(\(a,\s*b\)\s*=>\s*\(a\.uuid/.test(body))
    // 1.4 返回 seat 或 null
    check('selectNextHostCandidate 返回 seat 或 null',
      /return pool\[0\]\.seat/.test(body))
  }

  // 1.5 v2.1 旧版 selectNextHostBySeat 函数仍存在(向后兼容)
  const oldSelectMatch = networkSrc.match(/^function selectNextHostBySeat\(\)\s*\{[\s\S]*?^\}/m)
  check('selectNextHostBySeat (v2.1 旧版) 保留作向后兼容', !!oldSelectMatch)

  // 1.6 导出
  //   network.js 用 `export { ... }` named export 块 + `export default net`
  //   named export 块(line ~1595) 包含 selectNextHostCandidate / selectNextHostBySeat
  const namedExportBlockMatch = networkSrc.match(/export\s*\{[\s\S]*?^\}\s*$/m)
  check('selectNextHostCandidate 在 named export 块',
    !!namedExportBlockMatch && namedExportBlockMatch[0].includes('selectNextHostCandidate'))
  check('selectNextHostBySeat 在 named export 块',
    !!namedExportBlockMatch && namedExportBlockMatch[0].includes('selectNextHostBySeat'))
}

// ============== 2. V0419-02: selfInfo 加 canHost + hostAddress ==============
console.log('\n=== 2. V0419-02: selfInfo 加 canHost + hostAddress 字段 ===')
{
  // 2.1 startAsHost 内 selfInfo 加 canHost + hostAddress
  const startAsHostMatch = networkSrc.match(/function startAsHost\(self\)\s*\{[\s\S]*?^\}/m)
  check('startAsHost 函数存在', !!startAsHostMatch)
  if (startAsHostMatch) {
    const body = startAsHostMatch[0]
    check('startAsHost 内 selfInfo 含 canHost: canHostAsNewHost()',
      /selfInfo\s*=\s*\{[\s\S]*?canHost:\s*canHostAsNewHost\(\)/.test(body))
    check('startAsHost 内 selfInfo 含 hostAddress: getSelfHostAddress()',
      /hostAddress:\s*getSelfHostAddress\(\)/.test(body))
  }

  // 2.2 joinRoom 内 selfInfo 同样加字段
  const joinRoomMatch = networkSrc.match(/function joinRoom\(hostRoomId,\s*self,\s*opts\)\s*\{[\s\S]*?^\}/m)
  check('joinRoom 函数存在', !!joinRoomMatch)
  if (joinRoomMatch) {
    const body = joinRoomMatch[0]
    check('joinRoom 内 selfInfo 含 canHost + hostAddress',
      /selfInfo\s*=\s*\{[\s\S]*?canHost:\s*canHostAsNewHost\(\),\s*hostAddress:\s*getSelfHostAddress\(\)/.test(body))
  }

  // 2.3 canHostAsNewHost 函数存在 + 内部逻辑
  const canHostFnMatch = networkSrc.match(/^function canHostAsNewHost\(\)\s*\{[\s\S]*?^\}/m)
  check('canHostAsNewHost 函数存在', !!canHostFnMatch)
  if (canHostFnMatch) {
    const body = canHostFnMatch[0]
    check('canHostAsNewHost 用稳定 type 检测 bc',
      /===\s*['"]bc['"]/.test(body))
    check('canHostAsNewHost 用稳定 type 检测 android-ws',
      /===\s*['"]android-ws['"]/.test(body))
    check('canHostAsNewHost 用稳定 type 检测 ws + process.versions.node',
      /===\s*['"]ws['"]/.test(body) && /process\.versions/.test(body))
  }

  // 2.4 getSelfHostAddress 函数存在 + 内部逻辑
  const getHostAddrMatch = networkSrc.match(/^function getSelfHostAddress\(\)\s*\{[\s\S]*?^\}/m)
  check('getSelfHostAddress 函数存在', !!getHostAddrMatch)
  if (getHostAddrMatch) {
    const body = getHostAddrMatch[0]
    check('getSelfHostAddress 用 transport.getHostIp() + getBoundPort()',
      /transport\.getHostIp\(\)/.test(body) && /transport\.getBoundPort\(\)/.test(body))
    check('getSelfHostAddress 返回 ${ip}:${port} 格式',
      /\$\{ip\}:\$/.test(body) || /\$\{ip\}:\$\{port\}/.test(body))
  }

  // 2.5 导出 canHostAsNewHost + getSelfHostAddress
  //   复用 named export 块检测(同 §1.6)
  const exportBlock2 = networkSrc.match(/export\s*\{[\s\S]*?^\}\s*$/m)
  check('canHostAsNewHost 在 named export 块',
    !!exportBlock2 && exportBlock2[0].includes('canHostAsNewHost'))
  check('getSelfHostAddress 在 named export 块',
    !!exportBlock2 && exportBlock2[0].includes('getSelfHostAddress'))
}

// ============== 3. V0419-03: broadcastPeerLeave payload 加 newHostAddress ==============
console.log('\n=== 3. V0419-03: broadcastPeerLeave payload 加 newHostAddress ===')
{
  const broadcastFnMatch = networkSrc.match(/^function broadcastPeerLeave\(opts\s*=\s*\{\}\)\s*\{[\s\S]*?^\}/m)
  check('broadcastPeerLeave 函数存在', !!broadcastFnMatch)
  if (broadcastFnMatch) {
    const body = broadcastFnMatch[0]
    // 3.1 payload 含 newHostAddress 字段
    check('broadcastPeerLeave payload 含 newHostAddress',
      /payload\.newHostAddress\s*=/.test(body))
    // 3.2 自动从 peers[newHostSeat].hostAddress 提取
    check('broadcastPeerLeave 自动从 peers[newHostSeat].hostAddress 提取 newHostAddress',
      /peers\.get\(opts\.newHostSeat\)/.test(body) && /\.hostAddress/.test(body))
    // 3.3 显式 opts.newHostAddress 也接受
    check('broadcastPeerLeave 接受显式 opts.newHostAddress',
      /opts\.newHostAddress\s*&&\s*typeof\s*opts\.newHostAddress\s*===\s*['"]string['"]/.test(body))
    // 3.4 minimal fallback 也保留 newHostAddress
    check('broadcastPeerLeave snapshot 超 64KB minimal fallback 也保留 newHostAddress',
      /minimal\.newHostAddress\s*=\s*payload\.newHostAddress/.test(body) ||
      /if\s*\(payload\.newHostAddress\s*!==\s*undefined\)\s*minimal\.newHostAddress/.test(body))
  }
}

// ============== 4. V0419-04: close({broadcast:true}) 关闭前广播完整新 host ==============
console.log('\n=== 4. V0419-04: close({broadcast:true}) 关闭前广播完整新 host ===')
{
  const closeFnMatch = networkSrc.match(/^function close\(opts\s*=\s*\{\}\)\s*\{[\s\S]*?^\}/m)
  check('close 函数存在', !!closeFnMatch)
  if (closeFnMatch) {
    const body = closeFnMatch[0]
    // 4.1 close({broadcast:true}) 调用 broadcastPeerLeave
    check('close({broadcast:true}) 调用 broadcastPeerLeave',
      /opts\.broadcast\s*===\s*true[\s\S]*?broadcastPeerLeave/.test(body))
    // 4.2 close 传 newHostSeat + newHostAddress 给 broadcastPeerLeave
    check('close 传 newHostSeat + newHostAddress 给 broadcastPeerLeave',
      /broadcastPeerLeave\(\{[\s\S]*?newHostSeat:\s*opts\.newHostSeat[\s\S]*?newHostAddress:\s*opts\.newHostAddress/.test(body))
  }
}

// ============== 5. requestPromoteToHost 集成新选举 + canHost 守卫 ==============
console.log('\n=== 5. requestPromoteToHost 集成 selectNextHostCandidate + canHostAsNewHost 守卫 ===')
{
  const reqFnMatch = networkSrc.match(/^function requestPromoteToHost\(snapshot\)\s*\{[\s\S]*?^\}/m)
  check('requestPromoteToHost 函数存在', !!reqFnMatch)
  if (reqFnMatch) {
    const body = reqFnMatch[0]
    // 5.1 调用 selectNextHostCandidate 算 candidate
    check('requestPromoteToHost 调用 selectNextHostCandidate',
      /selectNextHostCandidate\(\)/.test(body))
    // 5.2 candidate !== selfSeat 时旁观分支(self-loop 但 from: candidate)
    check('candidate !== selfSeat 时旁观分支(self-loop from: candidate)',
      /candidate\s*!==\s*selfSeat/.test(body) && /from:\s*candidate/.test(body))
    // 5.3 canHostAsNewHost 守卫:浏览器 ws joiner 不能升级
    check('requestPromoteToHost 含 canHostAsNewHost() 守卫',
      /canHostAsNewHost\(\)/.test(body))
    // 5.4 canHost=false 走 host:lost 路径
    check('canHost=false 时 emit host:lost',
      /emit\(['"]host:lost['"][\s\S]*?no_server_capability/.test(body))
  }
}

// ============== 6. 版本号 + npm test 集成 ==============
console.log('\n=== 6. v0.4.20 版本号与 npm test 集成 ===')
{
  check('package.json version === 0.4.28', pkg.version === '0.4.28')
  const pkgSrc = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')
  const usesWrapper = /scripts\/run-all-tests\.js/.test(pkgSrc)
  const wrapperPath = path.join(repoRoot, 'scripts/run-all-tests.js')
  const wrapperSrc = usesWrapper && fs.existsSync(wrapperPath) ? fs.readFileSync(wrapperPath, 'utf-8') : ''
  check('npm test 命令含 v0419-adversarial-fixes.test.js 或其 wrapper 引用该文件',
    /v0419-adversarial-fixes\.test\.js/.test(pkgSrc) || /v0419-adversarial-fixes\.test\.js/.test(wrapperSrc))
}

console.log(`\n========== v0.4.19 对抗性复查修复测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)