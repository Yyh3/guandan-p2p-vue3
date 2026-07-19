/**
 * v0.4.24 GameView 修复回归测试
 *
 * 覆盖本次修复的 P0/P1/P2(源码字符串断言为主,行为类不易在 Node 侧模拟):
 * - P0-1:GameViewDesktop 补 haptics 导入(之前 ReferenceError,退出/菜单全灭)
 * - P0-2:两端 showMenu 迁移 — getSnapshot() 完整字段 + close 传 newHostSeat/newHostAddress
 * - P1-3:返回房间透传 host 参数(两端已有,锁定防回归)
 * - P1-4:移动端长按误触发 — longPressFired 吞掉合成 click
 * - P1-5:HudTop clockText 不再硬编码 '25s'
 * - P1-6:HudTop 删 🏆/📊/⋯ 死按钮,⚙ 改 emit 'menu'
 * - P1-7:GameViewDesktop Escape 监听与清理
 * - P1-8:GameViewDesktop 金币/等级置 null(seatDataDisplay)
 * - P2-9:桌面聊天按钮常显(chat-fab)
 * - P2-10:ChatQuickPanel 过时文案更新
 * - P2-11:移动端发牌进度条 role/aria-live
 * - P2-12:NicknameEditor 头像格子键盘可达(去 aria-hidden,改 button)
 */
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const desktopPath = path.join(repoRoot, 'src/views/game/GameViewDesktop.vue')
const mobilePath = path.join(repoRoot, 'src/views/game/GameViewMobile.vue')
const hudPath = path.join(repoRoot, 'src/components/HudTop.vue')
const chatPath = path.join(repoRoot, 'src/components/ChatQuickPanel.vue')
const nickPath = path.join(repoRoot, 'src/components/NicknameEditor.vue')

const desktopSrc = fs.readFileSync(desktopPath, 'utf-8')
const mobileSrc = fs.readFileSync(mobilePath, 'utf-8')
const hudSrc = fs.readFileSync(hudPath, 'utf-8')
const chatSrc = fs.readFileSync(chatPath, 'utf-8')
const nickSrc = fs.readFileSync(nickPath, 'utf-8')

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}

// ============== 1. P0-1:GameViewDesktop 补 haptics 导入 ==============
console.log('\n=== 1. P0-1:GameViewDesktop import haptics ===')
{
  check('GameViewDesktop 顶部导入 haptics',
    desktopSrc.includes("import * as haptics from '@/common/haptics.js'"))
  check('exitGame 内 haptics.click() 有导入支撑',
    /function exitGame\([\s\S]*?haptics\.click\(\)/.test(desktopSrc))
}

// ============== 2. P0-2:两端 showMenu 用 getSnapshot + close 传 newHostSeat ==============
console.log('\n=== 2. P0-2:host 退出迁移(snapshot 完整 + close 带迁移字段) ===')
{
  check('Desktop showMenu 用 game.value.getSnapshot()',
    desktopSrc.includes('game.value.getSnapshot()'))
  check('Desktop 不再手写 snapshot 字段列表',
    !desktopSrc.includes('hands: st.hands, tableCards: st.tableCards'))
  check('Desktop net.close 传 newHostSeat',
    desktopSrc.includes('newHostSeat: migration?.newHostSeat'))
  check('Desktop net.close 传 newHostAddress',
    desktopSrc.includes('newHostAddress: migration?.newHostAddress'))
  check('Desktop 仍调 requestHostMigration(newHostSeat, snapshot)',
    desktopSrc.includes('net.requestHostMigration(newHostSeat, snapshot)'))
  check('Mobile showMenu 用 game.value.getSnapshot()',
    mobileSrc.includes('game.value.getSnapshot()'))
  check('Mobile 不再手写 snapshot 字段列表',
    !mobileSrc.includes('hands: st.hands, tableCards: st.tableCards'))
  check('Mobile net.close 传 newHostSeat',
    mobileSrc.includes('newHostSeat: migration?.newHostSeat'))
  check('Mobile net.close 传 newHostAddress',
    mobileSrc.includes('newHostAddress: migration?.newHostAddress'))
  check('Mobile showMenu 不再用裸 isP2PMode.value(脚本作用域未定义)',
    !mobileSrc.includes('if (isP2PMode.value && isNetworkHost.value'))
  check('Mobile showMenu 改用 props.isP2PMode',
    mobileSrc.includes('props.isP2PMode && isNetworkHost.value'))
}

// ============== 3. P1-3:返回房间透传 host 参数 ==============
console.log('\n=== 3. P1-3:onBackToRoom 透传 host 参数 ===')
{
  check('Desktop onBackToRoom query 含 host: route.query.host',
    desktopSrc.includes('host: route.query.host'))
  check('Mobile onBackToRoom query 含 host: route.query.host',
    mobileSrc.includes('host: route.query.host'))
}

// ============== 4. P1-4:移动端长按误触发(longPressFired 吞合成 click) ==============
console.log('\n=== 4. P1-4:移动端长按后合成 click 被吞掉 ===')
{
  check('Mobile 声明 longPressFired 标志',
    mobileSrc.includes('const longPressFired = ref(false)'))
  check('长按触发 toggleCol 前置位 longPressFired',
    /longPressFired\.value = true[\s\S]{0,60}toggleCol\(col\)/.test(mobileSrc))
  check('Mobile 有 onCardClick 处理器',
    mobileSrc.includes('function onCardClick('))
  check('onCardClick 吞掉长按后的合成 click 并复位',
    /if \(longPressFired\.value\) \{\s*longPressFired\.value = false\s*return/.test(mobileSrc))
  check('手牌模板 click 改绑 onCardClick',
    mobileSrc.includes('@click="onCardClick(c)"'))
  check('手牌模板补 @touchcancel 复位',
    mobileSrc.includes('@touchcancel="onCardTouchEnd"'))
}

// ============== 5. P1-5:HudTop clockText 无硬编码 '25s' ==============
console.log('\n=== 5. P1-5:HudTop 假倒计时修复 ===')
{
  check("HudTop 不再有 return '25s'",
    !hudSrc.includes("return '25s'"))
  check("HudTop 非计时时显示 '--'",
    hudSrc.includes("return '--'"))
}

// ============== 6. P1-6:HudTop 删死按钮,⚙ 接 menu ==============
console.log('\n=== 6. P1-6:HudTop 右上死按钮清理 ===')
{
  check('HudTop 不再有 🏆 按钮', !hudSrc.includes('🏆'))
  check('HudTop 不再有 📊 按钮', !hudSrc.includes('📊'))
  check('HudTop 不再有 ⋯ 按钮', !hudSrc.includes('⋯'))
  check("HudTop 不再 emit icon 'fight'/'pattern'/'more'",
    !hudSrc.includes("$emit('icon', 'fight')")
    && !hudSrc.includes("$emit('icon', 'pattern')")
    && !hudSrc.includes("$emit('icon', 'more')"))
  check('HudTop 保留 ⚙ 设置按钮', hudSrc.includes('⚙'))
  check("⚙ icon-btn 点击 emit 'menu'",
    /class="icon-btn"[\s\S]{0,200}\$emit\('menu'\)/.test(hudSrc))
}

// ============== 7. P1-7:GameViewDesktop Escape 监听与清理 ==============
console.log('\n=== 7. P1-7:Esc 打开退出菜单 ===')
{
  check('Desktop 注册 keydown 监听(onEsc)',
    desktopSrc.includes("window.addEventListener('keydown', onEsc)"))
  check('Desktop 卸载时移除 keydown 监听',
    desktopSrc.includes("window.removeEventListener('keydown', onEsc)"))
  check('onEsc 判定 Escape 键并调 showMenu',
    /e\.key === 'Escape'\)\s*showMenu\(\)/.test(desktopSrc))
}

// ============== 8. P1-8:桌面端金币/等级置 null ==============
console.log('\n=== 8. P1-8:seatDataDisplay 置 null 金币/等级 ===')
{
  check('Desktop 定义 seatDataDisplay computed',
    desktopSrc.includes('const seatDataDisplay = computed('))
  check('seatDataDisplay 把 coins/level 置 null',
    desktopSrc.includes('coins: null, level: null'))
  check('HudTop 绑定 :seats="seatDataDisplay"',
    desktopSrc.includes(':seats="seatDataDisplay"'))
}

// ============== 9. P2-9:桌面聊天按钮常显 ==============
console.log('\n=== 9. P2-9:桌面聊天入口常显 ===')
{
  check('Desktop 有独立 chat-fab 聊天按钮',
    desktopSrc.includes('class="chat-fab"'))
  check('chat-fab 不受 myTurn 限制(与 QuickActions 互斥)',
    desktopSrc.includes('v-if="!myTurn || isDealing"'))
}

// ============== 10. P2-10:ChatQuickPanel 过时文案 ==============
console.log('\n=== 10. P2-10:聊天提示文案更新 ===')
{
  check('ChatQuickPanel 去掉「v2.0 接入,目前仅本地显示」',
    !chatSrc.includes('v2.0 接入,目前仅本地显示'))
  check('ChatQuickPanel 改中性提示「快捷短语会发送给同桌玩家」',
    chatSrc.includes('快捷短语会发送给同桌玩家'))
}

// ============== 11. P2-11:移动端发牌进度条无障碍 ==============
console.log('\n=== 11. P2-11:移动端发牌进度 role/aria-live ===')
{
  check('Mobile 发牌进度 span 带 role="status" aria-live="polite"',
    mobileSrc.includes('<span role="status" aria-live="polite">🃏 发牌中'))
}

// ============== 12. P2-12:NicknameEditor 头像键盘可达 ==============
console.log('\n=== 12. P2-12:头像格子去 aria-hidden + button 化 ===')
{
  check('NicknameEditor 不再有 aria-hidden="true"',
    !nickSrc.includes('aria-hidden="true"'))
  check('头像格子改为 <button type="button">',
    /<button[\s\S]{0,200}type="button"[\s\S]{0,200}class="avatar-cell"/.test(nickSrc))
  check('头像格子保留 aria-label',
    nickSrc.includes(':aria-label="`头像 ${a}`"'))
  check('头像格子带 aria-pressed 选中态',
    nickSrc.includes(':aria-pressed="picked === a"'))
  check('头像格子不再有 role="img"',
    !nickSrc.includes('role="img"'))
}

console.log(`\n========== 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
