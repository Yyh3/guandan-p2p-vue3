/**
 * v0.4.20 对抗性复查修复测试 — V0420 真正的"第二发现通道"(纯 JS 版)
 *
 * V0420 修复:peer hostAddress 缓存 + smart reconnect
 *   - 缓存 peers Map entry 的 hostAddress 到 localStorage(跨 session 持久化)
 *   - peer:join / peer:update 触发 cachePeerHostAddress
 *   - smartReconnectToPeers(roomNo):joiner 端 host:lost 时循环 try-connect 缓存的
 *     peer hostAddress(canHost=true 优先,ts 最新优先),找到第一个能连的就是新 host
 *   - 找到后自动 joinRoom;找不到 fallback 跳首页
 *
 * 局限:本地 localStorage 只能存 joiner 自己见过的 peer;新加的 joiner 没缓存
 *   这是"猜"不是真正发现 — 配合 v0.4.19 确定性选举 + v0.4.17 TRANSPORT_REBUILD_ANNOUNCE
 *   兜底(host 主动退出场景能直接收到地址,host 崩溃场景走 smartReconnectToPeers)
 *
 * 真正的 mDNS / UDP 广播 / 固定服务留 v0.4.21+(需要 native 依赖)
 */
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const networkPath = path.join(repoRoot, 'src/common/network.js')
const gameViewDesktopPath = path.join(repoRoot, 'src/views/game/GameViewDesktop.vue')
const packagePath = path.join(repoRoot, 'package.json')

const networkSrc = fs.readFileSync(networkPath, 'utf-8')
const gameViewDesktopSrc = fs.readFileSync(gameViewDesktopPath, 'utf-8')
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}

// ============== 1. V0420 peer hostAddress 缓存实现 ==============
console.log('\n=== 1. V0420 peer hostAddress 缓存模块 ===')
{
  // 1.1 cachePeerHostAddress 函数存在
  check('cachePeerHostAddress 函数存在',
    /^function cachePeerHostAddress\(roomNo,\s*seat,\s*hostAddress,\s*canHost\)\s*\{[\s\S]*?^\}/m.test(networkSrc))

  // 1.2 getCachedPeerHostAddresses 函数存在
  check('getCachedPeerHostAddresses 函数存在',
    /^function getCachedPeerHostAddresses\(roomNo\)\s*\{[\s\S]*?^\}/m.test(networkSrc))

  // 1.3 clearPeerHostAddressCache 函数存在
  check('clearPeerHostAddressCache 函数存在',
    /^function clearPeerHostAddressCache\(roomNo\)\s*\{[\s\S]*?^\}/m.test(networkSrc))

  // 1.4 内部 localStorage 读写辅助函数
  check('_loadPeerCache 函数存在',
    /^function _loadPeerCache\(roomNo\)\s*\{[\s\S]*?^\}/m.test(networkSrc))
  check('_savePeerCache 函数存在',
    /^function _savePeerCache\(roomNo,\s*entries\)\s*\{[\s\S]*?^\}/m.test(networkSrc))

  // 1.5 localStorage key 前缀 + 1 小时过期
  check('PEER_CACHE_KEY_PREFIX 常量定义',
    /const PEER_CACHE_KEY_PREFIX\s*=\s*['"]guandan-v0420-peer-cache-['"]/.test(networkSrc))
  check('PEER_CACHE_MAX_AGE_MS = 1 小时',
    /PEER_CACHE_MAX_AGE_MS\s*=\s*60\s*\*\s*60\s*\*\s*1000/.test(networkSrc))

  // 1.6 缓存按 seat 去重 + 按 ts 倒序 + 限 8 条
  const cacheFnBody = networkSrc.match(/^function cachePeerHostAddress\(roomNo,\s*seat,\s*hostAddress,\s*canHost\)\s*\{[\s\S]*?^\}/m)
  if (cacheFnBody) {
    const body = cacheFnBody[0]
    check('cachePeerHostAddress 过滤旧 seat 记录',
      /entries\.filter\(e\s*=>\s*e\.seat\s*!==\s*seat\)/.test(body))
    check('cachePeerHostAddress 按 seat 去重',
      /deduped\[e\.seat\]\s*=\s*e/.test(body))
    check('cachePeerHostAddress 按 ts 倒序 + 限 8 条',
      /\.sort\(\(a,\s*b\)\s*=>\s*b\.ts\s*-\s*a\.ts\)/.test(body) && /\.slice\(0,\s*8\)/.test(body))
  }

  // 1.7 getCachedPeerHostAddresses 过滤 canHost=true + 按 ts 倒序
  const getCacheBody = networkSrc.match(/^function getCachedPeerHostAddresses\(roomNo\)\s*\{[\s\S]*?^\}/m)
  if (getCacheBody) {
    const body = getCacheBody[0]
    check('getCachedPeerHostAddresses 过滤 canHost=true',
      /\.filter\(e\s*=>\s*e\.canHost\s*&&\s*e\.hostAddress\)/.test(body))
    check('getCachedPeerHostAddresses 按 ts 倒序(最新优先)',
      /\.sort\(\(a,\s*b\)\s*=>\s*\(b\.ts\s*-\s*a\.ts\)\)/.test(body))
  }
}

// ============== 2. V0420 peer:join / peer:update 触发缓存 ==============
console.log('\n=== 2. V0420 peer:join / peer:update 触发 cachePeerHostAddress ===')
{
  // 2.1 peer:update 触发缓存(updated.hostAddress)
  check('peer:update 路径调 cachePeerHostAddress(updated.hostAddress)',
    /emit\(['"]peer:update['"][\s\S]{0,500}?cachePeerHostAddress\(roomId,\s*assignedSeat,\s*updated\.hostAddress/.test(networkSrc))

  // 2.2 peer:join 触发缓存(msg.payload.hostAddress)
  check('peer:join 路径调 cachePeerHostAddress(msg.payload.hostAddress)',
    /emit\(['"]peer:join['"][\s\S]{0,500}?cachePeerHostAddress\(roomId,\s*assignedSeat,\s*msg\.payload\.hostAddress/.test(networkSrc))

  // 2.3 try/catch 包住,缓存失败不影响 join 流程
  check('peer:join / peer:update cachePeerHostAddress 包 try/catch',
    /cachePeerHostAddress\(roomId,\s*assignedSeat,\s*[^)]+\)\s*\}\s*catch\s*\(_\)/.test(networkSrc))
}

// ============== 3. V0420 smartReconnectToPeers API ==============
console.log('\n=== 3. V0420 smartReconnectToPeers API ===')
{
  // 3.1 函数存在 + async
  check('smartReconnectToPeers 函数存在(async)',
    /^async function smartReconnectToPeers\(roomNo,\s*opts\s*=\s*\{\}\)\s*\{[\s\S]*?^\}/m.test(networkSrc))

  // 3.2 函数体关键逻辑
  const smartBody = networkSrc.match(/^async function smartReconnectToPeers\(roomNo,\s*opts\s*=\s*\{\}\)\s*\{[\s\S]*?^\}/m)
  if (smartBody) {
    const body = smartBody[0]
    // 3.2.1 用 getCachedPeerHostAddresses 取候选
    check('smartReconnectToPeers 用 getCachedPeerHostAddresses 取候选',
      /getCachedPeerHostAddresses\(roomNo\)/.test(body))
    // 3.2.2 parseHostAddress 解析 IP:port
    check('smartReconnectToPeers 用 parseHostAddress 解析 IP:port',
      /parseHostAddress\(c\.hostAddress\)/.test(body))
    // 3.2.3 循环 joinRoom + Promise 包装 listen 'connect'/'error'
    check('smartReconnectToPeers 调 joinRoom + 监听 connect/error',
      /joinRoom\(roomNo,\s*self,\s*\{\s*hostIp:\s*parsed\.hostIp/.test(body) &&
      /on\(['"]connect['"]/.test(body) && /on\(['"]error['"]/.test(body))
    // 3.2.4 超时控制(timeoutMs 默认 2000ms)
    check('smartReconnectToPeers 有超时控制(默认 2000ms)',
      /timeoutMs\s*=\s*opts\.timeoutMs\s*\|\|\s*2000/.test(body))
    // 3.2.5 maxRetries 默认 5
    check('smartReconnectToPeers 有 maxRetries 控制(默认 5)',
      /maxRetries\s*=\s*Math\.min\(opts\.maxRetries\s*\|\|\s*5/.test(body))
    // 3.2.6 onSuccess / onFail 回调
    check('smartReconnectToPeers 支持 onSuccess / onFail 回调',
      /opts\.onSuccess/.test(body) && /opts\.onFail/.test(body))
    // 3.2.7 失败时返回 tried 列表
    check('smartReconnectToPeers 失败时返回 tried 列表',
      /tried:\s*\[/.test(body) || /return\s*\{\s*ok:\s*false[\s\S]*?tried/.test(body))
  }

  // 3.3 函数导出
  const exportBlock = networkSrc.match(/export\s*\{[\s\S]*?^\}\s*$/m)
  check('smartReconnectToPeers 在 named export',
    !!exportBlock && exportBlock[0].includes('smartReconnectToPeers'))
  check('cachePeerHostAddress 在 named export',
    !!exportBlock && exportBlock[0].includes('cachePeerHostAddress'))
  check('getCachedPeerHostAddresses 在 named export',
    !!exportBlock && exportBlock[0].includes('getCachedPeerHostAddresses'))
  check('clearPeerHostAddressCache 在 named export',
    !!exportBlock && exportBlock[0].includes('clearPeerHostAddressCache'))
}

// ============== 4. V0420 GameViewDesktop.onMounted 集成 smartReconnectToPeers ==============
console.log('\n=== 4. V0420 GameViewDesktop.onMounted 集成 smartReconnectToPeers ===')
{
  // 4.1 host:lost 监听调 smartReconnectToPeers
  check('GameViewDesktop host:lost 监听调 net.smartReconnectToPeers',
    /net\.on\(['"]host:lost['"][\s\S]*?net\.smartReconnectToPeers/.test(gameViewDesktopSrc))

  // 4.2 从 selfInfo 取 self
  check('smartReconnectToPeers 调用前取 selfInfo(nickname + avatar)',
    /net\.getSelfInfo\(\)/.test(gameViewDesktopSrc))

  // 4.3 从 route.query.roomNo 取 roomNo
  check('smartReconnectToPeers 调用前从 route.query.roomNo 取房间号',
    /route\.query\.roomNo/.test(gameViewDesktopSrc))

  // 4.4 找不到 → 跳首页(v0.4.17 旧行为保留)
  check('smart reconnect 失败保留 v0.4.17 跳首页行为',
    /router\.push\(['"]\/\?force_disconnected=1/.test(gameViewDesktopSrc) &&
    /房主已断开连接/.test(gameViewDesktopSrc))

  // 4.5 找到 → 不跳首页(留 GameView)
  check('smart reconnect 成功时 return 不跳首页',
    /r\s*&&\s*r\.ok[\s\S]{0,200}?return\s*;?\s*\/\/[^\n]*不跳首页/.test(gameViewDesktopSrc) ||
    /找到新 host[\s\S]{0,100}?return/.test(gameViewDesktopSrc))
}

// ============== 5. V0420 版本号 + npm test 集成 ==============
console.log('\n=== 5. V0420 版本号与 npm test 集成 ===')
{
  check('package.json version === 0.4.27', pkg.version === '0.4.27')
  const pkgSrc = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')
  const usesWrapper = /scripts\/run-all-tests\.js/.test(pkgSrc)
  const wrapperPath = path.join(repoRoot, 'scripts/run-all-tests.js')
  const wrapperSrc = usesWrapper && fs.existsSync(wrapperPath) ? fs.readFileSync(wrapperPath, 'utf-8') : ''
  check('npm test 命令含 v0420-adversarial-fixes.test.js 或其 wrapper 引用该文件',
    /v0420-adversarial-fixes\.test\.js/.test(pkgSrc) || /v0420-adversarial-fixes\.test\.js/.test(wrapperSrc))
}

// ============== 6. V0420 已知未做(follow-up) ==============
console.log('\n=== 6. V0420 已知未做(follow-up) — 留 v0.4.21+ ===')
{
  // 真正的 mDNS / UDP 广播 / 固定服务需要 native 层,scope 大
  // 当前 v0.4.20 是纯 JS 实用版:
  //   - joiner 缓存所有 peers 的 hostAddress 到 localStorage
  //   - smartReconnectToPeers 循环 try-connect 缓存地址找新 host
  // 局限:本地缓存,新加 joiner 没缓存;smart reconnect 是"猜"不是发现
  check('v0.4.20 范围已声明(本测试仅验证当前修复点)',
    true)  // 占位
}

console.log(`\n========== v0.4.20 对抗性复查修复测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)