/**
 * v0.4.25 大小王牌面重做 + 出牌归属标签回归测试(源码字符串断言)
 *
 * 背景(用户反馈):
 * - 大小王卡通小丑 PNG(kawaii 风格)与传统奶油白 + 金边牌面风格冲突,观感丑陋
 * - 每次有玩家出牌时,难以感知是谁出的(首家胶囊只显示首家,不随出牌者变化)
 *
 * 覆盖:
 * - A:CardPlay.vue 大小王改经典扑克设计(竖排 JOKER + 皇冠 SVG + 竖排王字,红/黑双色)
 * - B:TableCenter.vue 出牌归属标签(last-play-tag,牌堆上方标注刚出牌玩家)
 * - C:useGameLogic.js 导出 lastPlayerName / lastPlayerEmoji(lastPlay.who → name/avatar)
 * - D:GameViewDesktop.vue / GameViewMobile.vue 接线 :last-player-name/:last-player-emoji
 * - E:GameViewDesktop.vue 手牌列布局收紧(列宽 78→64,gap 4→2,牌 60px 不缩)
 * - F:特殊牌型特效(顺子/连对/钢板/三带二 弹跳大字 + 仅炸弹级震屏)
 * - G:主流掼蛋手游 UX 改进(选中牌型预览 / 拖动连选 / 记牌器 / 飞牌轨迹 / 简洁模式 / 级牌进度轨 / P1-16 触控区)
 */
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import { bombFxForType } from './effects.js'
import { groupHandCombo } from './guandan-engine.js'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const cardPath = path.join(repoRoot, 'src/components/CardPlay.vue')
const tablePath = path.join(repoRoot, 'src/components/TableCenter.vue')
const logicPath = path.join(repoRoot, 'src/views/game/useGameLogic.js')
const desktopPath = path.join(repoRoot, 'src/views/game/GameViewDesktop.vue')
const mobilePath = path.join(repoRoot, 'src/views/game/GameViewMobile.vue')
const effectPath = path.join(repoRoot, 'src/components/EffectLayer.vue')
const aiPath = path.join(repoRoot, 'src/common/guandan-ai.js')

const cardSrc = fs.readFileSync(cardPath, 'utf-8')
const tableSrc = fs.readFileSync(tablePath, 'utf-8')
const logicSrc = fs.readFileSync(logicPath, 'utf-8')
const desktopSrc = fs.readFileSync(desktopPath, 'utf-8')
const mobileSrc = fs.readFileSync(mobilePath, 'utf-8')
const effectSrc = fs.readFileSync(effectPath, 'utf-8')
const aiSrc = fs.readFileSync(aiPath, 'utf-8')

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}

// ============== 1. A:CardPlay 大小王经典扑克设计 ==============
console.log('\n=== 1. A:CardPlay 大小王经典设计(去卡通 PNG) ===')
{
  check('不再导入 big-joker.png', !cardSrc.includes("big-joker.png"))
  check('不再导入 small-joker.png', !cardSrc.includes("small-joker.png"))
  check('不再有 joker-face <img> 引用', !/<img[^>]*joker-face/.test(cardSrc))
  check('竖排 JOKER 字母(v-for 遍历 JOKER)', cardSrc.includes("v-for=\"ch in 'JOKER'\""))
  check('对角双 JOKER(tl + br)', cardSrc.includes('joker-word-tl') && cardSrc.includes('joker-word-br'))
  check('卡通小丑 SVG(joker-jester)', cardSrc.includes('joker-jester') && cardSrc.includes('jst-hat'))
  check('小丑铃铛帽(帽角 + 圆球)', cardSrc.includes('jst-horn') && cardSrc.includes('jst-ball'))
  check('小丑笑脸(脸 + 笑眼 + 鼻 + 嘴)', cardSrc.includes('jst-face') && cardSrc.includes('jst-eye') && cardSrc.includes('jst-nose'))
  check('小丑拉夫领(jst-ruff)', cardSrc.includes('jst-ruff'))
  check('不再用皇冠(crown-body)', !cardSrc.includes('crown-body'))
  check('王字 joker-cn', cardSrc.includes('joker-cn') && cardSrc.includes('jokerLabel[0]'))
  check('王牌可访问性 role=img + aria-label', cardSrc.includes("isJoker ? 'img' : undefined"))
  check('大王经典红 #c62f2f', cardSrc.includes('.is-big-joker   { color: #c62f2f'))
  check('小王墨黑 #2f2f3a', cardSrc.includes('.is-small-joker { color: #2f2f3a'))
  check('不再使用金属渐变背景(--big-joker-bg)', !cardSrc.includes('--big-joker-bg'))
  check('不再使用金属渐变背景(--small-joker-bg)', !cardSrc.includes('--small-joker-bg'))
  check('王牌中央区铺满整牌(center-area.joker-face)', cardSrc.includes('.center-area.joker-face'))
  check('小尺寸 sm 隐藏 JOKER 字母', /\.size-sm \.joker-word \{ display: none/.test(cardSrc))
}

// ============== 2. B:TableCenter 出牌归属标签 ==============
console.log('\n=== 2. B:TableCenter 出牌归属标签 ===')
{
  check('props 声明 lastPlayerName', tableSrc.includes('lastPlayerName: { type: String'))
  check('props 声明 lastPlayerEmoji', tableSrc.includes('lastPlayerEmoji: { type: String'))
  check('模板渲染 last-play-tag', tableSrc.includes('class="last-play-tag"'))
  check('标签含头像 + 名字 + 出的牌', tableSrc.includes('lp-emoji') && tableSrc.includes('lp-name') && tableSrc.includes('出的牌'))
  check('仅在有牌且有出牌人时显示', tableSrc.includes('v-if="tableCards.length > 0 && lastPlayerName"'))
  check('key 随出牌人 + 牌数变化(触发重播动画)', tableSrc.includes(':key="lastPlayerName + \'-\' + tableCards.length"'))
  check('last-pop 过渡动画', tableSrc.includes('name="last-pop"') && tableSrc.includes('.last-pop-enter-active'))
  check('标签浮在牌堆正上方(top calc)', tableSrc.includes('top: calc(50% - 112px)'))
}

// ============== 3. C:useGameLogic 导出 lastPlayerName/lastPlayerEmoji ==============
console.log('\n=== 3. C:useGameLogic 出牌人 computed ===')
{
  check('定义 lastPlayerName(lastPlay.who → name)',
    /const lastPlayerName = computed\(\(\) =>[\s\S]*?lastPlay\.value\.who/.test(logicSrc))
  check('定义 lastPlayerEmoji(lastPlay.who → avatar)',
    /const lastPlayerEmoji = computed\(\(\) =>[\s\S]*?lastPlay\.value\.who/.test(logicSrc))
  check('lastPlay 为空时名字为空串', logicSrc.includes(") : ''"))
  check('return 导出 lastPlayerName/lastPlayerEmoji',
    /return \{[\s\S]*?firstPlayerEmoji, lastPlayerName, lastPlayerEmoji/.test(logicSrc))
}

// ============== 4. D:两端 GameView 接线 ==============
console.log('\n=== 4. D:GameViewDesktop / GameViewMobile 接线 ===')
{
  check('Desktop TableCenter 传 :last-player-name', desktopSrc.includes(':last-player-name="lastPlayerName"'))
  check('Desktop TableCenter 传 :last-player-emoji', desktopSrc.includes(':last-player-emoji="lastPlayerEmoji"'))
  check('Desktop 解构 lastPlayerName', desktopSrc.includes('firstPlayerEmoji, lastPlayerName, lastPlayerEmoji'))
  check('Mobile TableCenter 传 :last-player-name', mobileSrc.includes(':last-player-name="lastPlayerName"'))
  check('Mobile TableCenter 传 :last-player-emoji', mobileSrc.includes(':last-player-emoji="lastPlayerEmoji"'))
  check('Mobile 解构 lastPlayerName', mobileSrc.includes('firstPlayerEmoji, lastPlayerName, lastPlayerEmoji'))
}

// ============== 5. E:GameViewDesktop 手牌列布局收紧 ==============
console.log('\n=== 5. E:桌面手牌列收紧(78→64,gap 4→2) ===')
{
  check('Desktop 列宽收紧到 64px', /\.hand-column \{[\s\S]*?width: 64px/.test(desktopSrc))
  check('Desktop 列间 gap 收紧到 2px', desktopSrc.includes('gap: 2px;'))
  check('Desktop 手牌仍 60px 不缩', /\.hand-card \{[\s\S]*?width: 60px/.test(desktopSrc))
  check('Desktop 手牌居中 left: 2px', desktopSrc.includes('left: 2px;'))
  check('Desktop 不再用 78px 列宽', !/\.hand-column \{[\s\S]*?width: 78px/.test(desktopSrc))
}

// ============== 6. F:特殊牌型特效(顺子/连对/钢板/三带二) ==============
console.log('\n=== 6. F:特殊牌型特效 ===')
{
  check('STRAIGHT → 顺子(不震屏)', bombFxForType('STRAIGHT')?.kind === 'straight' && bombFxForType('STRAIGHT')?.text === '顺子' && bombFxForType('STRAIGHT')?.shake === false)
  check('STRAIGHT_PAIR → 连对(不震屏)', bombFxForType('STRAIGHT_PAIR')?.kind === 'pairseq' && bombFxForType('STRAIGHT_PAIR')?.text === '连对' && bombFxForType('STRAIGHT_PAIR')?.shake === false)
  check('STRAIGHT_TRIPLE → 钢板(不震屏)', bombFxForType('STRAIGHT_TRIPLE')?.kind === 'plate' && bombFxForType('STRAIGHT_TRIPLE')?.text === '钢板' && bombFxForType('STRAIGHT_TRIPLE')?.shake === false)
  check('TRIPLE_PAIR → 三带二(不震屏)', bombFxForType('TRIPLE_PAIR')?.kind === 'triplepair' && bombFxForType('TRIPLE_PAIR')?.text === '三带二' && bombFxForType('TRIPLE_PAIR')?.shake === false)
  check('数字 type 5(顺子)也命中', bombFxForType(5)?.kind === 'straight')
  check('炸弹级保留 shake=true', bombFxForType('BOMB_4')?.shake === true && bombFxForType('JOKER_BOMB')?.shake === true && bombFxForType('STRAIGHT_FLUSH')?.shake === true)
  check('SINGLE/PAIR/TRIPLE 仍无特效', bombFxForType('SINGLE') === null && bombFxForType('PAIR') === null && bombFxForType('TRIPLE') === null)
  check('EffectLayer 四种新 kind 样式', effectSrc.includes('.kind-straight .bomb-text') && effectSrc.includes('.kind-pairseq .bomb-text') && effectSrc.includes('.kind-plate .bomb-text') && effectSrc.includes('.kind-triplepair .bomb-text'))
  check('EffectLayer combo-pop 弹跳动画', effectSrc.includes('@keyframes combo-pop') && effectSrc.includes('animation: combo-pop'))
  check('组合特效字号小于炸弹(0.72)', effectSrc.includes('calc(var(--fs-bomb) * 0.72)'))
  check('useGameLogic 震屏按 fx.shake 门控', /if \(fx\.shake\) \{\s*isShaking\.value = true/.test(logicSrc))
}

// ============== 7. G:主流掼蛋手游 UX 改进 ==============
console.log('\n=== 7. G:UX 改进(预览/连选/记牌器/飞牌/简洁模式/进度轨/触控区) ===')
{
  // G-1 选中牌型实时预览
  check('useGameLogic 定义 selectedPreview', /const selectedPreview = computed/.test(logicSrc))
  check('selectedPreview 用 E.recognize + E.canBeat', /E\.recognize\(cards\)/.test(logicSrc) && /E\.canBeat\(rec, lastPlay\.value\)/.test(logicSrc))
  check('useGameLogic 导出 selectedPreview', /selectedPreview,/.test(logicSrc))
  check('两端渲染 selected-preview 胶囊', desktopSrc.includes('class="selected-preview"') && mobileSrc.includes('class="selected-preview"'))
  // G-2 拖动连选
  check('useGameLogic 拖动状态机(dragStart/dragOver/dragEnd)', logicSrc.includes('function dragStart') && logicSrc.includes('function dragOver') && logicSrc.includes('function dragEnd'))
  check('consumeDragSuppress 吞合成 click', logicSrc.includes('function consumeDragSuppress'))
  check('Desktop mousedown/mouseenter 接线', desktopSrc.includes('@mousedown="onDragStart(c, $event)"') && desktopSrc.includes('@mouseenter="onDragEnter(c)"'))
  check('Mobile touchmove 命中检测 + data-card-key', mobileSrc.includes('@touchmove="onHandTouchMove"') && mobileSrc.includes(':data-card-key="cardKey(c)"'))
  // G-3 记牌器
  check('useGameLogic 定义 cardCounter(playedHistory 驱动)', /const cardCounter = computed/.test(logicSrc) && logicSrc.includes('playedHistory.value'))
  check('CardCounter 组件存在', fs.existsSync(path.join(repoRoot, 'src/components/CardCounter.vue')))
  check('两端挂载 CardCounter', desktopSrc.includes('<CardCounter') && mobileSrc.includes('<CardCounter'))
  // G-4 飞牌轨迹
  check('useGameLogic lastPlayerPos 方位 computed', /const lastPlayerPos = computed/.test(logicSrc))
  check('TableCenter fly-from 类绑定', tableSrc.includes('fly-from-${lastPlayerPos}'))
  check('TableCenter 飞牌 CSS 变量', tableSrc.includes('--fly-x') && tableSrc.includes('fly-from-left'))
  // G-5 简洁模式
  check('simple-mode.css 存在', fs.existsSync(path.join(repoRoot, 'src/styles/simple-mode.css')))
  check('storage DEFAULT_SETTINGS 含 simpleMode', fs.readFileSync(path.join(repoRoot, 'src/common/storage.js'), 'utf-8').includes('simpleMode: false'))
  check('两端 .page 挂 simple-mode class', desktopSrc.includes("'simple-mode': simpleMode") && mobileSrc.includes("'simple-mode': simpleMode"))
  check('SettingsView 简洁模式开关', fs.readFileSync(path.join(repoRoot, 'src/views/settings/SettingsView.vue'), 'utf-8').includes('v-model="simpleMode"'))
  check('main.js 引入 simple-mode.css', fs.readFileSync(path.join(repoRoot, 'src/main.js'), 'utf-8').includes('simple-mode.css'))
  // G-6 级牌进度轨
  check('LevelTrack 组件存在', fs.existsSync(path.join(repoRoot, 'src/components/LevelTrack.vue')))
  check('TableCenter 挂载 LevelTrack', tableSrc.includes('<LevelTrack'))
  check('useGameLogic 同步 teamLevels', /teamLevels\.value = Array\.isArray\(st\.teamLevels\)/.test(logicSrc))
  // G-7 P1-16 横屏触控区
  check('横屏 hand-card 透明 hit area 扩到 44px', /\.page\.is-landscape \.hand-column \.hand-card::before/.test(mobileSrc))
}

// ============== 8. H:发牌动画未完时延迟出牌音效/特效 ==============
console.log('\n=== 8. H:发牌中延迟出牌音效/特效(_afterDeal) ===')
{
  check('useGameLogic 定义 _afterDeal(watch isDealing)', /function _afterDeal\(fn\) \{[\s\S]*?watch\(isDealing/.test(logicSrc))
  check('play 事件音效包裹 _afterDeal', /_afterDeal\(\(\) => \{\s*try \{\s*audio\.playSfxForType/.test(logicSrc))
  check('play 事件特效统一走 showBombFx(顺子等也触发)', /audio\.playSfxForType\(playType, cards\.length\)\s*showBombFx\(playType\)/.test(logicSrc))
  check('特效触发不再只限炸弹系(旧条件已移除)', !logicSrc.includes("playType === 'JOKER_BOMB' || (typeof playType === 'string' && playType.startsWith('BOMB'))"))
  check('报数音效也延迟(_afterDeal)', logicSrc.includes('_afterDeal(() => audio.sfxCountdownWarn())') && logicSrc.includes('_afterDeal(() => audio.sfxCountdownTick())'))
}

// ============== 9. I:AI 模式隐藏房间号(HudTop showRoomCode) ==============
console.log('\n=== 9. I:AI 模式隐藏房间号 ===')
{
  const hudSrc = fs.readFileSync(path.join(repoRoot, 'src/components/HudTop.vue'), 'utf-8')
  check('HudTop 声明 showRoomCode prop', hudSrc.includes('showRoomCode: { type: Boolean'))
  check('roomCode computed 尊重 showRoomCode', hudSrc.includes('if (!props.showRoomCode) return'))
  check('Desktop 按 isP2PMode 传 show-room-code', desktopSrc.includes(':show-room-code="isP2PMode"'))
}

// ============== 10. J:理牌模式(rank/combo/custom) + 出牌牌型名 ==============
console.log('\n=== 10. J:理牌三模式 + 出牌牌型名 ===')
{
  check('引擎导出 groupHandCombo', typeof groupHandCombo === 'function')
  check('useGameLogic sortMode 三模式循环', logicSrc.includes("SORT_MODES = ['rank', 'combo', 'custom']"))
  check('combo 模式走 E.groupHandCombo', logicSrc.includes('E.groupHandCombo(myHand.value, levelRank.value)'))
  check('custom 模式兜底新牌(customOrder 外的牌附加)', logicSrc.includes('byKey.delete(k)'))
  check('moveCustomCard 实现换位', /function moveCustomCard\(key, targetKey\)/.test(logicSrc))
  check('reorder 三函数存在', logicSrc.includes('function reorderStart') && logicSrc.includes('function reorderOver') && logicSrc.includes('function reorderEnd'))
  check('colRankLabel 支持 col.label', logicSrc.includes('if (col.label) return col.label'))
  check('Desktop 自定义模式拖动走 reorder', desktopSrc.includes('if (reorderStart(c)) return'))
  check('Mobile 自定义模式 touchmove 走 reorderOver', mobileSrc.includes('if (c) reorderOver(c)'))
  check('lastPlayTypeName computed(数字枚举映射)', logicSrc.includes('const lastPlayTypeName = computed'))
  check('TableCenter 牌型名 lp-type', tableSrc.includes('class="lp-type"'))
  check('两端传 :last-play-type', desktopSrc.includes(':last-play-type="lastPlayTypeName"') && mobileSrc.includes(':last-play-type="lastPlayTypeName"'))
  check('AI chooseLead 残局才领炸弹(≤6 张)', aiSrc.includes('bombRanks.length > 0 && cards.length <= 6'))
  check('AI 单张优先不拆炸弹 rank', aiSrc.includes('nonBomb.length > 0 ? nonBomb : concrete'))
}

// ============== 11. K:扫码自动进房 + guandan:// 深链 ==============
console.log('\n=== 11. K:扫码自动进房 + guandan:// 深链 ===')
{
  const joinSrc = fs.readFileSync(path.join(repoRoot, 'src/views/join/JoinView.vue'), 'utf-8')
  const manifestSrc = fs.readFileSync(path.join(repoRoot, 'android/app/src/main/AndroidManifest.xml'), 'utf-8')
  const mainSrc = fs.readFileSync(path.join(repoRoot, 'src/main.js'), 'utf-8')
  const qrCardSrc = fs.readFileSync(path.join(repoRoot, 'src/components/QrFallbackCard.vue'), 'utf-8')
  check('JoinView 扫码成功直接 router.push 进房', /closeScanner\(\)[\s\S]{0,200}router\.push\(`\/room\?role=joiner/.test(joinSrc))
  check('JoinView 扫码不再仅填地址(旧版填充逻辑移除)', !joinSrc.includes('hostAddress.value = `${parsed.host}:${parsed.port}`'))
  check('JoinView 浏览器页有 App 深链桥(appDeepLink)', joinSrc.includes('appDeepLink') && joinSrc.includes('buildAppDeepLink'))
  check('AndroidManifest 注册 guandan scheme', manifestSrc.includes('android:scheme="guandan"'))
  check('main.js 监听 appUrlOpen + getLaunchUrl', mainSrc.includes('appUrlOpen') && mainSrc.includes('getLaunchUrl'))
  check('main.js 深链用 parseQrScanResult 解析', mainSrc.includes('parseQrScanResult(url)'))
  check('QrFallbackCard 展示 App 深链', qrCardSrc.includes('deepLink') && qrCardSrc.includes('buildAppDeepLink'))
}

console.log(`\n========== v0.4.25 大小王 + 出牌归属测试: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
