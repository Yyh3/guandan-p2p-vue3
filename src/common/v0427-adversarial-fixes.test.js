/**
 * v0.4.27 对抗性审查修复回归测试
 *
 * 覆盖本轮全项目对抗性审查发现的 bug:
 * - P0-1:换座后心跳检查器误杀 host 自己的座位 → 房间在 ~6-23s 内必然解散
 *     修复:心跳检查器(真实 + _tickHeartbeatChecker 测试版)跳过 hostSeat;
 *     swapSeats 同步互换 lastHeartbeat/seatResumeTokens/seatConnAlive 账目。
 * - P1-1:换座不更新 transport 层 ws↔seat 绑定 → 最长 15s 消息错位
 *     修复:joiner 收到涉及自身的 SEAT_SWAP_COMMITTED 后立即 scheduleJoinRetry 重绑。
 * - P1-2:第二次换座(换回)resumeToken 不匹配 → 玩家被当新玩家重新分配
 *     修复:swapSeats 互换 token/connAlive(随 P0-1 账目互换一并解决)。
 * - P2-1:relayFromClient 硬编码跳过 seat 0 → 换座后 seat 0 玩家聊天双向中断
 *     修复:三处 `<= 0` 改为跳过 hostSeat。
 * - P2-2:局域网扫描无提前终止 → 最坏盲扫 ~50s
 *     修复:_scanHttpWsRooms 支持 opts.stopOnFirst;JoinView 输房间号走"找到即停"快扫。
 * - 视图一致性:web 邀请弹窗不再被拦死;web 输房间号自动扫描匹配(对齐安卓);
 *     joiner 未分座改名不再写幽灵座位 peers.set(-1)。
 *
 * P0-1 用真 WS host + _forceExpireHeartbeat/_tickHeartbeatChecker 行为验证;
 * 其余用源码字符串断言锁定。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const networkSrc = fs.readFileSync(path.join(repoRoot, 'src/common/network.js'), 'utf-8')
const roomViewSrc = fs.readFileSync(path.join(repoRoot, 'src/views/room/RoomView.vue'), 'utf-8')
const joinViewSrc = fs.readFileSync(path.join(repoRoot, 'src/views/join/JoinView.vue'), 'utf-8')

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++ }
}

// ============== WS harness(network.test.js 同款) ==============
async function makeInstance(tag) {
  const mod = await import('./network.js?tag=' + tag + '&t=' + Date.now() + '_' + Math.random())
  mod.__installFakeTimers({
    setInterval: (fn, ms) => 1,
    clearInterval: () => {},
    setTimeout: (fn, ms) => 1,
    clearTimeout: () => {},
  })
  return { mod }
}

async function makeHost(tag) {
  const { mod } = await makeInstance(tag)
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=' + tag + '&t=' + Date.now())
  mod._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  mod.setRoomId('test-' + tag)
  mod.startAsHost({ nickname: 'H', avatar: 'H' })
  let bound = null
  const start = Date.now()
  while (Date.now() - start < 2000) {
    const t = mod._getTransport()
    if (t && t.getBoundPort && t.getBoundPort() !== null) { bound = t.getBoundPort(); break }
    await new Promise(r => setTimeout(r, 5))
  }
  if (bound == null) throw new Error('host not ready after 2s')
  return { mod, port: bound }
}

// ============== 1. P0-1:host 自己的座位永不被心跳收割 ==============
console.log('\n=== 1. P0-1:心跳检查器跳过 hostSeat(host 单端) ===')
{
  const { mod: Host } = await makeHost('s1')
  assert('host 初始 peers[0] 存在', Host.getPeers().has(0))
  assert('hostSeat 为 0', Host.getHostSeat() === 0)
  let leftSeat = null
  Host.on('peer:leave', (e) => { leftSeat = e?.seat })
  // 模拟 host 座位上出现过期心跳条目(换座后残留 / 异常写入)
  Host._forceExpireHeartbeat(0)
  Host._tickHeartbeatChecker()
  assert('host 座位 0 未被收割(peers[0] 仍在)', Host.getPeers().has(0))
  assert('未对 host 座位触发 peer:leave', leftSeat !== 0)
  Host.close()
}

// ============== 2. P0-1:换座后 host 新座位不被误杀 ==============
console.log('\n=== 2. P0-1:swapSeats(0,2) 后 host 新座位 2 不被心跳收割 ===')
{
  const { mod: Host } = await makeHost('s2')
  const r = Host.swapSeats(0, 2)
  assert('swapSeats(0,2) 成功', r.ok === true)
  assert('hostSeat 切到 2', Host.getHostSeat() === 2)
  assert('peers[2] 是 host 自己', Host.getPeers().has(2))
  assert('peers[0] 已空出', !Host.getPeers().has(0))
  let leftSeat = null
  Host.on('peer:leave', (e) => { leftSeat = e?.seat })
  // 模拟 host 新座位 2 上残留换座前玩家的过期心跳
  Host._forceExpireHeartbeat(2)
  Host._tickHeartbeatChecker()
  assert('host 新座位 2 未被收割(peers[2] 仍在)', Host.getPeers().has(2))
  assert('未对座位 2 触发 peer:leave', leftSeat !== 2)
  Host.close()
}

// ============== 3. P0-1/P1-2 源码断言:swapSeats 账目互换 + 检查器跳过 ==============
console.log('\n=== 3. P0-1/P1-2 源码断言 ===')
{
  assert('心跳检查器跳过 hostSeat(真实+测试版各一处)',
    (networkSrc.match(/if \(seat === hostSeat\) \{/g) || []).length >= 2)
  assert('swapSeats 互换 lastHeartbeat', /_swapAux\(lastHeartbeat\)/.test(networkSrc))
  assert('swapSeats 互换 seatResumeTokens(P1-2)', /_swapAux\(seatResumeTokens\)/.test(networkSrc))
  assert('swapSeats 互换 seatConnAlive', /_swapAux\(seatConnAlive\)/.test(networkSrc))
  assert('真实心跳检查器收割时清理 token/connAlive',
    /seatResumeTokens\.delete\(seat\)\s*\n\s*seatConnAlive\.delete\(seat\)/.test(networkSrc))
}

// ============== 4. P1-1 源码断言:joiner 换座后立即重绑 ==============
console.log('\n=== 4. P1-1 源码断言:SEAT_SWAP_COMMITTED 后重绑 ===')
{
  assert('joiner 换座涉及自己 → scheduleJoinRetry',
    /if \(selfSeat === a \|\| selfSeat === b\) scheduleJoinRetry\(\)/.test(networkSrc))
}

// ============== 5. P2-1 源码断言:relay 跳过 hostSeat 而非写死 seat 0 ==============
console.log('\n=== 5. P2-1 源码断言:relayFromClient ===')
{
  assert('relay from 判断用 hostSeat', /msg\.from == null \|\| msg\.from < 0 \|\| msg\.from === hostSeat/.test(networkSrc))
  assert('relay to 判断用 hostSeat', /msg\.to < 0 \|\| msg\.to === hostSeat/.test(networkSrc))
  assert('relay 循环跳过 hostSeat', /if \(seat === hostSeat \|\| seat === msg\.from\) continue/.test(networkSrc))
  assert('不再有 msg.from <= 0 硬编码', !/msg\.from <= 0/.test(networkSrc))
  assert('不再有 seat <= 0 硬编码', !/seat <= 0/.test(networkSrc))
}

// ============== 6. P2-2 源码断言:扫描提前终止 ==============
console.log('\n=== 6. P2-2 源码断言:stopOnFirst ===')
{
  assert('_scanHttpWsRooms 支持 stopOnFirst', /opts\?\.stopOnFirst && found\.length > 0/.test(networkSrc))
  assert('JoinView 输房间号走快扫', /stopOnFirst: true/.test(joinViewSrc))
}

// ============== 7. 视图一致性源码断言 ==============
console.log('\n=== 7. 视图一致性源码断言 ===')
{
  // web 邀请弹窗不再被拦死
  assert('openInvite 不再 return 拦死(引导文案)',
    /浏览器模式：让好友在同一设备新标签页输入下方房间号加入/.test(roomViewSrc))
  assert('openInvite 末尾仍打开弹窗', /showInvite\.value = true/.test(roomViewSrc))
  // joiner 未分座改名守卫
  assert('onNickConfirm 有座位守卫(防 peers.set(-1))', /if \(seat >= 0 && seat <= 3\) \{/.test(roomViewSrc))
  // web 输房间号自动扫描(对齐安卓)
  assert('web onJoin 只输房间号先自动扫描', /if \(roomNo\.value\.length >= 4\) await scanRooms\(\)/.test(joinViewSrc))
  // 文案对齐
  assert('web 房间号文案改为引导式', /不知道 IP？输房间号后点「加入房间」会自动匹配同网房主/.test(joinViewSrc))
  assert('旧误导文案已移除', !/房间号仅用于本机多标签模拟/.test(joinViewSrc))
}

console.log(`\n========== 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
