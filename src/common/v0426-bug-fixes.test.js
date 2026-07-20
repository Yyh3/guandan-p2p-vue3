/**
 * v0.4.26 真机 P2P 对抗性审查修复回归测试
 *
 * 覆盖用户真机反馈的 5 个 bug:
 * - BUG-01:对局中改本人昵称/头像,本人信息局中不刷新(只局后变)
 *     根因:RoomView.onNickConfirm 只改本地 reactive peers + 广播 NICK_UPDATE,
 *     network 内部 selfInfo/peers[selfSeat] 未同步 → 对局页 net.getPeers() 读到旧值;
 *     且 host 收到 NICK_UPDATE 不重广播 SYNC。
 *     修复:network.updateSelfInfo 统一更新 selfInfo+peers+广播,host 重广播 SYNC。
 * - BUG-02:安卓扫描局域网发现不了房间(只能输 IP)+ 希望输房间号加入
 *     修复:buildScanCandidates 按本机 IP 推导本子网(网关优先),COMMON_SUBNETS
 *     补 192.168.137(Windows 热点);JoinView 扫到后按房间号匹配自动进房。
 * - BUG-03:打开 App 不自动播放 BGM(Android WebView autoplay 策略)
 *     修复:MainActivity setMediaPlaybackRequiresUserGesture(false)。
 * - BUG-04:网页端加入页无 IP 输入框,输房间号也进不去
 *     修复:JoinView 浏览器分支补 IP:端口输入,onJoin 支持浏览器直连。
 * - BUG-05:两台手机进同一房间显示不同房间号
 *     根因:SYNC 不带 roomNo + joiner 直连(仅输 IP)时随机生成房号。
 *     修复:SYNC payload 带 roomNo;RoomView 收到后 joiner 同步 host 真实房号。
 *
 * 行为可测的(updateSelfInfo/SYNC roomNo/buildScanCandidates)走真 WS 链路 + 纯函数;
 * UI/原生修复用源码字符串断言锁定。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import { buildScanCandidates } from './network.js'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const networkSrc = fs.readFileSync(path.join(repoRoot, 'src/common/network.js'), 'utf-8')
const roomViewSrc = fs.readFileSync(path.join(repoRoot, 'src/views/room/RoomView.vue'), 'utf-8')
const joinViewSrc = fs.readFileSync(path.join(repoRoot, 'src/views/join/JoinView.vue'), 'utf-8')
const mainActivitySrc = fs.readFileSync(
  path.join(repoRoot, 'android/app/src/main/java/com/guandan/p2p/MainActivity.java'), 'utf-8')

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++ }
}

// ============== WS harness(network.test.js 同款) ==============
async function makeInstance(tag) {
  const mod = await import('./network.js?tag=' + tag + '&t=' + Date.now() + '_' + Math.random())
  const captured = { intervals: [], timeouts: [] }
  mod.__installFakeTimers({
    setInterval: (fn, ms) => { captured.intervals.push({ fn, ms }); return captured.intervals.length },
    clearInterval: () => {},
    setTimeout: (fn, ms) => { captured.timeouts.push({ fn, ms }); return captured.timeouts.length },
    clearTimeout: () => {},
  })
  return { mod, captured }
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

function mockSession(store) {
  globalThis.sessionStorage = {
    _store: store,
    getItem(k) { return this._store[k] || null },
    setItem(k, v) { this._store[k] = v },
  }
}

async function makeJoiner(tag, hostPort, store, nickname = 'J', avatar = 'J', onSync = null) {
  mockSession(store)
  const { mod } = await makeInstance(tag)
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=' + tag + '&t=' + Date.now())
  mod._setTransportFactory(() => new WebSocketTransport())
  if (typeof onSync === 'function') mod.on('message:SYNC', onSync)
  mod.joinRoom('test-' + tag, { nickname, avatar }, { hostIp: '127.0.0.1', hostPort })
  const start = Date.now()
  let seat = -1
  while (Date.now() - start < 2500) {
    seat = mod.getSelfSeat()
    if (seat >= 1 && seat <= 3) break
    await new Promise(r => setTimeout(r, 5))
  }
  return { mod, seat }
}

async function settle(ms = 120) { await new Promise(r => setTimeout(r, ms)) }

// ============== 1. BUG-01:host updateSelfInfo 同步内部 selfInfo + peers[0] ==============
console.log('\n=== 1. BUG-01:host.updateSelfInfo 立即同步 selfInfo + getPeers()[0] ===')
{
  const { mod: Host, port } = await makeHost('b1')
  assert('host 初始 peers[0].nickname=H', Host.getPeers().get(0)?.nickname === 'H')
  const ok = Host.updateSelfInfo({ nickname: '新房主', avatar: 'AVAX' })
  assert('updateSelfInfo 返回 true', ok === true)
  assert('getSelfInfo().nickname 已更新', Host.getSelfInfo()?.nickname === '新房主')
  assert('getPeers()[0].nickname 已更新(对局页读得到)', Host.getPeers().get(0)?.nickname === '新房主')
  assert('getPeers()[0].avatar 已更新', Host.getPeers().get(0)?.avatar === 'AVAX')
  assert('无 patch 返回 false', Host.updateSelfInfo(null) === false)
  Host.close()
}

// ============== 2. BUG-01:joiner updateSelfInfo → host peers[joinerSeat] 立即同步 ==============
console.log('\n=== 2. BUG-01:joiner.updateSelfInfo → host 端 peers[seat] 立即更新 ===')
{
  const { mod: Host, port } = await makeHost('b2')
  const { mod: J, seat } = await makeJoiner('b2a', port, { 'guandan_session_uuid': 'u-b2' }, '小明', 'M')
  assert('joiner 拿到 seat', seat >= 1 && seat <= 3)
  await settle(100)
  assert('host 端初始昵称=小明', Host.getPeers().get(seat)?.nickname === '小明')
  J.updateSelfInfo({ nickname: '小明改名', avatar: 'M2' })
  await settle(150)
  assert('host 端 peers[seat].nickname 已更新', Host.getPeers().get(seat)?.nickname === '小明改名')
  assert('host 端 peers[seat].avatar 已更新', Host.getPeers().get(seat)?.avatar === 'M2')
  assert('joiner 本地 selfInfo 已更新', J.getSelfInfo()?.nickname === '小明改名')
  Host.close(); J.close()
}

// ============== 3. BUG-05:joiner 经 SYNC 收到 host 真实房间号 ==============
console.log('\n=== 3. BUG-05:joiner 直连时经 SYNC 收到 host 真实 roomNo ===')
{
  const { mod: Host, port } = await makeHost('b5')
  const syncs = []
  const { mod: J, seat } = await makeJoiner(
    'b5a', port, { 'guandan_session_uuid': 'u-b5' }, 'J5', 'J', (payload) => syncs.push(payload))
  assert('joiner 拿到 seat', seat >= 1 && seat <= 3)
  await settle(120)
  assert('joiner 收到至少一次 SYNC', syncs.length >= 1)
  const withRoom = syncs.find(p => p && p.roomNo != null)
  assert('SYNC payload 带 roomNo', !!withRoom)
  assert('roomNo 为 host 真实房号 test-b5', withRoom?.roomNo === 'test-b5')
  Host.close(); J.close()
}

// ============== 4. BUG-02:buildScanCandidates 按本机 IP 推导本子网 ==============
console.log('\n=== 4. BUG-02:buildScanCandidates 网关优先 + 跳过自己 ===')
{
  const list = buildScanCandidates('192.168.137.45', 8848)
  assert('返回非空', Array.isArray(list) && list.length > 0)
  assert('网关 .1 排最前', list[0] === '192.168.137.1:8848')
  assert('包含同网段其它设备 .2', list.includes('192.168.137.2:8848'))
  assert('包含 .60 边界', list.includes('192.168.137.60:8848'))
  assert('跳过自己 .45', !list.includes('192.168.137.45:8848'))
  assert('无重复', new Set(list).size === list.length)

  const custom = buildScanCandidates('10.0.0.5', 9000)
  assert('自定义端口生效', custom[0] === '10.0.0.1:9000')

  const bad = buildScanCandidates('not-an-ip')
  assert('非法 IP 不抛错(返回数组)', Array.isArray(bad))
  const empty = buildScanCandidates(null)
  assert('null 不抛错(返回数组)', Array.isArray(empty))
}

// ============== 5. BUG-01 源码断言:network + RoomView ==============
console.log('\n=== 5. BUG-01 源码断言 ===')
{
  assert('network.js 定义 updateSelfInfo', /function updateSelfInfo\(patch\)/.test(networkSrc))
  assert('updateSelfInfo 在 named export', /export\s*\{[\s\S]*updateSelfInfo[\s\S]*\}/.test(networkSrc))
  assert('updateSelfInfo 在 default net 对象',
    (networkSrc.match(/updateSelfInfo,/g) || []).length >= 2)
  assert('NICK_UPDATE 处理后重广播 SYNC',
    /NICK_UPDATE'[\s\S]{0,220}sendMessage\(\{\s*type:\s*'SYNC'/.test(networkSrc))
  assert('RoomView.onNickConfirm 调用 net.updateSelfInfo',
    /net\.updateSelfInfo\(\{\s*nickname,\s*avatar\s*\}\)/.test(roomViewSrc))
  assert('RoomView 保留 broadcast 兜底', /typeof net\.updateSelfInfo === 'function'/.test(roomViewSrc))
}

// ============== 6. BUG-02 源码断言:COMMON_SUBNETS + JoinView 扫描 ==============
console.log('\n=== 6. BUG-02 源码断言 ===')
{
  assert('COMMON_SUBNETS 含 Windows 热点 192.168.137', /'192\.168\.137'/.test(networkSrc))
  assert('network.js 定义 buildScanCandidates', /function buildScanCandidates\(localIp/.test(networkSrc))
  assert('buildScanCandidates 在 default net 对象', /buildScanCandidates,/.test(networkSrc))
  assert('JoinView 扫描用 net.buildScanCandidates', /net\.buildScanCandidates\(localIp\)/.test(joinViewSrc))
  assert('JoinView 扫到后按房间号匹配', /discovered\.value\.find\(r => String\(r\.roomNo\)/.test(joinViewSrc))
  assert('JoinView native 房间号-only 时先扫描', /await scanRooms\(\)/.test(joinViewSrc))
  assert('JoinView 127.0.0.1 fallback 守卫', /localIp !== '127\.0\.0\.1'/.test(joinViewSrc))
}

// ============== 7. BUG-03 源码断言:MainActivity autoplay ==============
console.log('\n=== 7. BUG-03 源码断言:WebView autoplay ===')
{
  assert('MainActivity 关闭 MediaPlaybackRequiresUserGesture',
    /setMediaPlaybackRequiresUserGesture\(false\)/.test(mainActivitySrc))
  assert('取 bridge.getWebView()', /this\.bridge\.getWebView\(\)/.test(mainActivitySrc))
  assert('try/catch 兜底', /catch\s*\(Exception/.test(mainActivitySrc))
}

// ============== 8. BUG-04 源码断言:网页端 IP 输入 ==============
console.log('\n=== 8. BUG-04 源码断言:网页端 IP 输入 + 直连 ===')
{
  assert('JoinView onJoin 为 async', /async function onJoin\(\)/.test(joinViewSrc))
  assert('浏览器分支支持手动输 IP 直连(hostAddress)',
    (joinViewSrc.match(/v-model="hostAddress"/g) || []).length >= 2)
  assert('浏览器 hostAddress 走 WS 跨设备加入',
    /BUG-04[\s\S]{0,160}role=joiner&host=/.test(joinViewSrc))
  assert('WsServer 合并导入(含 isNativeCapacitor)',
    /import WsServer, \{ isNativeCapacitor \} from '@\/common\/ws-server\.js'/.test(joinViewSrc))
}

// ============== 9. BUG-05 源码断言:SYNC 带 roomNo + RoomView 应用 ==============
console.log('\n=== 9. BUG-05 源码断言:SYNC roomNo ===')
{
  assert('network SYNC payload 带 roomNo',
    (networkSrc.match(/roomNo:\s*roomId/g) || []).length >= 4)
  assert('RoomView SYNC 处理读取 payload.roomNo', /payload\.roomNo != null/.test(roomViewSrc))
  assert('RoomView joiner 同步 roomNo + setRoomId',
    /roomNo\.value = rn[\s\S]{0,80}net\.setRoomId\(rn\)/.test(roomViewSrc))
}

console.log(`\n========== 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
