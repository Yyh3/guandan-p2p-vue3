/**
 * v0.4.24 房间/加入/网络层修复回归测试
 *
 * 覆盖(行为测试 + 源码断言):
 * - C-1:JoinView parseHostAddress 解构 hostIp/hostPort(真机加房不再 TypeError)
 * - C-2:network.js host 迁移路径 parsed.hostIp(不再 rebuildAsClient(undefined))
 * - C-3:WS joiner GAME_START 跳转带 host + joinRemoteRoom 传房间号(返回房间不掉房)
 * - C-4:RoomView 监听 host:lost + error toast(不再假绿灯干等)
 * - C-5:joiner 加入 8s 超时反馈(armJoinTimeout + SYNC/ROOM_FULL/connect 清除)
 * - C-6:ROOM_FULL 优先 sendToConnection 定向(满房第 5 人有反馈)
 * - C-7:smartReconnect — joiner SYNC 缓存 hostAddress / teardown 旧 transport /
 *        检查 joinRoom 返回值 / 注入 WS factory
 * - C-8:WS transport open client 回写实际 host/port(重连不再拨错端口)
 * - C-9:_DISCONNECT 读 payload.seat(断线快路径不再是死代码)
 * - C-10:SEAT_SWAP_REQUEST 先广播 COMMITTED 再本地应用(joiner 不再拒绝)
 * - C-11:computeSummary 逐条按 rec.mySeat 统计(联机座位不同不再算错胜率)
 * - C-12:HistoryChart barGroupLabelX 按 gi 定义(柱状图渲染不再抛错)
 * - C-13:InviteDialog 复制按钮 clipboard fallback(LAN http 源不再同步抛错)
 * - C-14:GuideView 文案对齐现 UI + 三页面补返回按钮
 * - C-15:SettingsView aria-expanded 改动态绑定
 * - C-16:RELAY_TYPES 加 CHAT_QUICK(快捷聊天跨端可达)
 * - C-17:JoinView 扫描重入守卫 + 空态文案 + 结果 button 化 + 扫码句柄泄漏修复
 * - C-18:RoomView netStatus 圆点旁加文字
 */
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import net from './network.js'
import { computeSummary } from './history.js'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const netSrc = fs.readFileSync(path.join(repoRoot, 'src/common/network.js'), 'utf-8')
const wsSrc = fs.readFileSync(path.join(repoRoot, 'src/common/network-transport-ws.js'), 'utf-8')
const joinSrc = fs.readFileSync(path.join(repoRoot, 'src/views/join/JoinView.vue'), 'utf-8')
const roomSrc = fs.readFileSync(path.join(repoRoot, 'src/views/room/RoomView.vue'), 'utf-8')
const chartSrc = fs.readFileSync(path.join(repoRoot, 'src/components/HistoryChart.vue'), 'utf-8')
const inviteSrc = fs.readFileSync(path.join(repoRoot, 'src/components/InviteDialog.vue'), 'utf-8')
const settingsSrc = fs.readFileSync(path.join(repoRoot, 'src/views/settings/SettingsView.vue'), 'utf-8')
const guideSrc = fs.readFileSync(path.join(repoRoot, 'src/views/guide/GuideView.vue'), 'utf-8')
const aiViewSrc = fs.readFileSync(path.join(repoRoot, 'src/views/ai/AIView.vue'), 'utf-8')
const historyViewSrc = fs.readFileSync(path.join(repoRoot, 'src/views/history/HistoryView.vue'), 'utf-8')

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}

// ============== 1. C-1:parseHostAddress 默认导出 + JoinView 解构 ==============
console.log('\n=== 1. C-1:parseHostAddress 默认可用 + JoinView 正确解构 ===')
{
  check('net 默认导出含 parseHostAddress', typeof net.parseHostAddress === 'function')
  check('net 默认导出含 _getTransport', typeof net._getTransport === 'function')
  check('parseHostAddress 行为正常', (() => {
    const p = net.parseHostAddress('192.168.43.1:8848')
    return p.hostIp === '192.168.43.1' && p.hostPort === 8848
  })())
  check('JoinView 解构 { hostIp, hostPort }', joinSrc.includes('const { hostIp, hostPort } = net.parseHostAddress'))
  check('JoinView 不再解构 { host, port }', !joinSrc.includes('const { host, port } = net.parseHostAddress'))
  check('JoinView 错误提示不暴露原始 e.message', joinSrc.includes('地址格式不正确,示例'))
}

// ============== 2. C-2:迁移路径 hostIp 解构 ==============
console.log('\n=== 2. C-2:host 迁移 rebuild 用 parsed.hostIp ===')
{
  check('network.js 迁移路径用 parsed.hostIp', netSrc.includes('parsed.hostIp'))
  check('不再用 parsed.host / parsed.port 调用 rebuild',
    !/rebuildAsClient\(\s*parsed\.host\b/.test(netSrc))
}

// ============== 3. C-3:WS joiner 返回房间不掉房 ==============
console.log('\n=== 3. C-3:GAME_START 带 host + joinRemoteRoom 传房间号 ===')
{
  check('GAME_START 跳转拼 host query', roomSrc.includes("'&host=' + encodeURIComponent(String(route.query.host))"))
  check('joinRemoteRoom 传 roomNo.value', roomSrc.includes('net.joinRemoteRoom(hostParam, { nickname: myName.value, avatar: myAvatar.value }, roomNo.value)'))
}

// ============== 4. C-4:RoomView host:lost + error toast ==============
console.log('\n=== 4. C-4:房间页掉线/错误反馈 ===')
{
  check('RoomView 监听 host:lost', roomSrc.includes("onNet('host:lost'"))
  check('host:lost 跳首页带 reason', /host:lost[\s\S]{0,400}force_disconnected=1/.test(roomSrc))
  check('error 事件 toast 提示', roomSrc.includes("showToast('连接失败,请检查网络或房主地址')"))
}

// ============== 5. C-5:加入超时反馈 ==============
console.log('\n=== 5. C-5:joiner 加入 8s 超时 ===')
{
  check('armJoinTimeout 函数存在', roomSrc.includes('function armJoinTimeout'))
  check('超时文案', roomSrc.includes('未找到房间,请确认房间号或房主 IP 后重试'))
  check('joinRoom 分支 armJoinTimeout', /joinRoom\(route\.query\.roomNo[\s\S]{0,150}armJoinTimeout\(\)/.test(roomSrc))
  check('SYNC 清除加入超时', /message:SYNC[\s\S]{0,400}clearJoinTimeout\(\)/.test(roomSrc))
  check('connect 清除加入超时', /onNet\('connect'[\s\S]{0,120}clearJoinTimeout\(\)/.test(roomSrc))
  check('ROOM_FULL 监听 + 满房文案', roomSrc.includes("onNet('message:ROOM_FULL'") && roomSrc.includes('房间已满(4/4)'))
  check('cleanupRoomListeners 清 join 超时', /function cleanupRoomListeners[\s\S]{0,250}clearJoinTimeout\(\)/.test(roomSrc))
}

// ============== 6. C-6:ROOM_FULL 定向发送 ==============
console.log('\n=== 6. C-6:ROOM_FULL 优先 sendToConnection ===')
{
  check('ROOM_FULL 构造存在', netSrc.includes("type: 'ROOM_FULL'"))
  check('ROOM_FULL 走 sendToConnection',
    /ROOM_FULL[\s\S]{0,300}transport\.sendToConnection\(msg\.trustedConnectionId/.test(netSrc))
}

// ============== 7. C-7:smartReconnect 三修复 ==============
console.log('\n=== 7. C-7:smartReconnect 可用化 ===')
{
  check('joiner SYNC 也缓存 hostAddress(注释锚点)', netSrc.includes('joiner 端收到 SYNC 也逐条缓存'))
  check('重连前拆旧 transport(注释锚点)', netSrc.includes('重连前拆掉旧 transport'))
  check('joinRoom 同步失败立即视候选失败(注释锚点)', netSrc.includes('joinRoom 同步失败'))
  check('浏览器端注入 WS factory(注释锚点)', netSrc.includes('浏览器端默认 factory 是 BroadcastChannelTransport'))
}

// ============== 8. C-8:WS 重连端口回写 ==============
console.log('\n=== 8. C-8:open client 回写实际 host/port ===')
{
  check('network-transport-ws 回写注释锚点', wsSrc.includes('把实际连接的 host/port 回写到实例字段'))
}

// ============== 9. C-9:_DISCONNECT 快路径 ==============
console.log('\n=== 9. C-9:_DISCONNECT 读 payload.seat ===')
{
  check('_DISCONNECT payload.seat(注释锚点)', netSrc.includes('transport emit 的座位在 payload.seat'))
}

// ============== 10. C-10:SEAT_SWAP 顺序 ==============
console.log('\n=== 10. C-10:SEAT_SWAP_REQUEST 先广播后应用 ===')
{
  check('swap 顺序注释锚点', netSrc.includes('必须先广播 COMMITTED 再应用本地 swap'))
}

// ============== 11. C-11:computeSummary 逐条 mySeat ==============
console.log('\n=== 11. C-11:战绩统计按每局实际座位 ===')
{
  // 两局:第 1 局我 seat 2(team0)头游赢;第 2 局我 seat 3(team1),头游 seat 1(team1)赢
  // 旧口径(统一套一个座位)第 2 局会算成输;新口径两局都赢
  const records = [
    { ranks: [2, 1, 0, 3], mySeat: 2, levelUp: 2 },
    { ranks: [1, 0, 3, 2], mySeat: 3, levelUp: 1 },
  ]
  const s = computeSummary(records, 0)
  check('两局都按各自 mySeat 算赢(wins=2)', s.wins === 2)
  check('winRate=1', s.winRate === 1)
  // 缺 mySeat 的旧记录回退到参数座位
  const legacy = [{ ranks: [1, 0, 3, 2], levelUp: 1 }]
  const s2 = computeSummary(legacy, 0)
  check('缺 mySeat 回退参数座位(team0 输)', s2.wins === 0)
  const s3 = computeSummary(legacy, 1)
  check('回退座位 1(team1 赢)', s3.wins === 1)
}

// ============== 12. C-12:HistoryChart 局号标签 ==============
console.log('\n=== 12. C-12:barGroupLabelX 定义且按 gi ===')
{
  check('barGroupLabelX 函数已定义', /function barGroupLabelX\(gi\)/.test(chartSrc))
  check('x 按 gi 计算', /barGroupLabelX\(gi\)[\s\S]{0,120}gi \* barGeom/.test(chartSrc))
  check('不再有常量 groupCenter: 0', !chartSrc.includes('groupCenter: 0'))
}

// ============== 13. C-13:InviteDialog 复制兜底 ==============
console.log('\n=== 13. C-13:InviteDialog clipboard fallback ===')
{
  check('clipboard 可选链(防 undefined 同步抛错)', inviteSrc.includes('navigator.clipboard?.writeText'))
  check('execCommand 兜底', inviteSrc.includes("execCommand('copy')"))
  check('不再 then 双分支都 emit copied', !inviteSrc.includes('() => emit(\'copied\', props.roomNo),\n    () => emit(\'copied\', props.roomNo)'))
}

// ============== 14. C-14:GuideView 文案 + 返回按钮 ==============
console.log('\n=== 14. C-14:GuideView 对齐现 UI ===')
{
  check('步骤含现按钮名「开始游戏」', guideSrc.includes('首页点"开始游戏"'))
  check('步骤含「加入房间」扫码/IP', guideSrc.includes('扫码,或手动输入房主 IP:端口'))
  check('不再有「开热点建房」旧文案', !guideSrc.includes('开热点建房'))
  check('不再有「连热点加入」旧文案', !guideSrc.includes('连热点加入'))
  check('GuideView 有返回按钮', guideSrc.includes('back-btn-top'))
  check('AIView 有返回按钮', aiViewSrc.includes('back-btn-top'))
  check('HistoryView 有返回按钮', historyViewSrc.includes('back-btn-top'))
}

// ============== 15. C-15:SettingsView aria-expanded 动态绑定 ==============
console.log('\n=== 15. C-15:aria-expanded 改动态 ===')
{
  check('不再有静态 aria-expanded 字符串', !settingsSrc.includes(' aria-expanded="!collapsedSections.'))
  check('动态 :aria-expanded 存在', settingsSrc.includes(':aria-expanded="!collapsedSections.'))
}

// ============== 16. C-16:CHAT_QUICK 白名单 ==============
console.log('\n=== 16. C-16:RELAY_TYPES 含 CHAT_QUICK ===')
{
  check("network.js 白名单含 'CHAT_QUICK'", netSrc.includes("'CHAT_QUICK'"))
}

// ============== 17. C-17:JoinView 扫描体验 ==============
console.log('\n=== 17. C-17:扫描重入守卫 + 空态 + button + 句柄 ===')
{
  check('scanRooms 重入守卫', /async function scanRooms\(\) \{\s*\/\/[^\n]*\n?\s*if \(scanning\.value\) return/.test(joinSrc))
  check('scanDone 空态 ref', joinSrc.includes('const scanDone = ref(false)'))
  check('空态文案', joinSrc.includes('未发现局域网房间'))
  check('扫描结果 button 化', joinSrc.includes('class="discovered-item"'))
  check('扫码 start 后复查 showScanner(防句柄泄漏)',
    /await inst\.start\([\s\S]{0,900}if \(!showScanner\.value\)/.test(joinSrc))
}

// ============== 18. C-18:RoomView netStatus 文字 ==============
console.log('\n=== 18. C-18:netStatus 圆点旁加文字 ===')
{
  check('netStatusText computed', roomSrc.includes('const netStatusText = computed'))
  check('模板渲染 netStatusText', roomSrc.includes('{{ netStatus }} {{ netStatusText }}'))
}

console.log(`\n========== v0.4.24 房间/加入/网络层修复测试: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
