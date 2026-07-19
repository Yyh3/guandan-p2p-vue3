/**
 * v0.4.24 对局核心修复回归测试
 *
 * 覆盖(行为测试 + 源码断言):
 * - A-1:AI 鬼牌压不过单张大王(rank 17)返回 null,不再出必败牌卡死对局
 * - A-2:scheduleAI 仅 host 端运行(joiner 端不再用空手牌替 AI 决策污染状态)
 * - A-3:AI 出牌被规则拒绝时兜底 playerPass,避免回合悬置全房卡死
 * - A-4:getSnapshot() 中局 handCounts 按真实 hands 重算(host)/保留原值(joiner 远程座位)
 * - A-5:game 'play' 事件数字 type 映射字符串牌型名(炸弹特效/语音/牌型音效复活)
 * - A-6:useGameLogic 导出 dealTimeout + 快照恢复后清 dealTimeout/isDealing
 * - A-7:超时自动行动 autoPlayOnTimeout(findMinBeat / commitPass / 失败重启计时)
 * - A-8:_broadcastPerSeatDeal 遍历 0..3 跳过 host 自己座位(换座后 seat 0 能收到牌)
 * - A-9:URL 首局 firstSeat 只消费一次(第二局起不再同一人先出)
 * - A-10:onP2PAITakeover addAIPlayer 仅 host 端
 * - A-11:跟牌找不到能大过的牌时 toast 反馈
 * - A-12:CHAT_QUICK 跨端快捷聊天(广播 + 监听)
 * - A-13:audio.js real 模式音量遍历 pool entry.elements;unlock 恢复 bgmUseMp3
 */
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import * as E from './guandan-engine.js'
import { createGame } from './guandan-game.js'
import { findMinBeat } from './guandan-ai.js'
import * as audio from './audio.js'
import { bombFxForType } from './effects.js'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const gameSrc = fs.readFileSync(path.join(repoRoot, 'src/common/guandan-game.js'), 'utf-8')
const aiSrc = fs.readFileSync(path.join(repoRoot, 'src/common/guandan-ai.js'), 'utf-8')
const audioSrc = fs.readFileSync(path.join(repoRoot, 'src/common/audio.js'), 'utf-8')
const uglSrc = fs.readFileSync(path.join(repoRoot, 'src/views/game/useGameLogic.js'), 'utf-8')

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}

// ============== 1. A-1:AI 鬼牌 vs 单张大王 ==============
console.log('\n=== 1. A-1:AI 鬼牌压不过 rank17 大王 ===')
{
  const LV = 14  // 打 A,红桃 A 是鬼牌
  const ghost = { suit: 1, rank: LV }
  const bigJoker = { suit: -1, rank: 17 }
  const smallJoker = { suit: -1, rank: 16 }
  const t17 = E.recognize([bigJoker])
  const t16 = E.recognize([smallJoker])
  check('单张大王识别 mainRank=17', t17 && t17.mainRank === 17)
  check('单张小王识别 mainRank=16', t16 && t16.mainRank === 16)
  // 只有 1 张鬼牌,压大王 → 必须 null(旧版返回 [ghost] → playerPlay 必拒 → 卡死)
  const r17 = findMinBeat([ghost], t17, 1, LV)
  check('鬼牌压大王(rank17) 返回 null', r17 === null)
  // 压小王 → 鬼牌变 17 可压
  const r16 = findMinBeat([ghost], t16, 1, LV)
  check('鬼牌压小王(rank16) 返回 1 张', Array.isArray(r16) && r16.length === 1)
  // 常规回归:实牌 2 压单张 A
  const tA = E.recognize([{ suit: 0, rank: 14 }])
  const rA = findMinBeat([{ suit: 2, rank: 15 }], tA, 0, LV)
  check('实牌 2 压单张 A', Array.isArray(rA) && rA.length === 1 && rA[0].rank === 15)
  check('guandan-ai.js 源码含 mainRank<17 守卫', aiSrc.includes('target.mainRank < 17'))
}

// ============== 2. A-2 / A-3:scheduleAI host 守卫 + 兜底 pass ==============
console.log('\n=== 2. A-2/A-3:scheduleAI 仅 host + 兜底 pass ===')
{
  check('scheduleAI 含非 host 提前返回', gameSrc.includes("if (mode !== 'host') return"))
  check('AI play 被拒兜底 playerPass', gameSrc.includes('AI play rejected, fallback to pass'))
  check('兜底 pass 失败重调度(防首家不能 pass 死锁)',
    /playerPass\(seat\)[\s\S]{0,200}scheduleAI\(\)/.test(gameSrc))
}

// ============== 3. A-4:getSnapshot handCounts 实时重算 ==============
console.log('\n=== 3. A-4:getSnapshot handCounts(host 重算 / joiner 保留) ===')
{
  const g = createGame({ seats: 4, levelRank: 14, isHost: true, seed: 42 })
  g.deal(42)
  const snap1 = g.getSnapshot()
  check('发牌后 handCounts 全 27', JSON.stringify(snap1.handCounts) === '[27,27,27,27]')
  // 中局:当前玩家出 1 张单牌
  const cur = g.getState().currentPlayer
  const card = g.getState().hands[cur][0]
  const r = g.playerPlay(cur, [card])
  check('当前玩家出单张 ok', r && r.ok === true)
  const snap2 = g.getSnapshot()
  check(`中局 snapshot handCounts[${cur}] === 26`, snap2.handCounts[cur] === 26)
  check('中局 snapshot 其他座位仍 27',
    snap2.handCounts.every((n, i) => i === cur || n === 27))
  g.destroy()

  // joiner 模式:远程座位 hands 是空数组占位,handCounts 必须保留原值而非重算成 0
  const own = E.deal(7).hands[1]
  const j = createGame({ seats: 4, levelRank: 14, isHost: false, selfSeat: 1 })
  j.deal(null, null, { hands: [[], own, [], []], handCounts: [20, 27, 21, 22] })
  const jsnap = j.getSnapshot()
  check('joiner 自己座位用 hands 长度(27)', jsnap.handCounts[1] === 27)
  check('joiner 远程座位保留 handCounts 原值',
    jsnap.handCounts[0] === 20 && jsnap.handCounts[2] === 21 && jsnap.handCounts[3] === 22)
  j.destroy()
  check('guandan-game.js 含 handCounts 重算注释', gameSrc.includes('handCounts 实时重算'))
}

// ============== 4. A-5:数字 type → 牌型名(音效/特效/语音) ==============
console.log('\n=== 4. A-5:数字 type 映射(音效/特效复活) ===')
{
  check('useGameLogic 含 TYPE_NUM_TO_NAME 映射', uglSrc.includes('TYPE_NUM_TO_NAME'))
  let threw = false
  try {
    audio.playSfxForType(8, 4)   // BOMB_4 数字
    audio.playSfxForType(14, 4)  // KINGS_BOMB 数字
    audio.playSfxForType(1, 1)   // SINGLE 数字
  } catch (e) { threw = true }
  check('playSfxForType 数字入参不抛错', !threw)
  check('bombFxForType(BOMB_4=8) 返回炸弹特效', bombFxForType(8)?.kind === 'bomb')
  check('bombFxForType(KINGS_BOMB=14) 返回王炸特效', bombFxForType(14)?.kind === 'joker')
  check('bombFxForType(STRAIGHT_FLUSH=13) 返回同花顺', bombFxForType(13)?.text === '同花顺')
  check('bombFxForType(SINGLE=1) 返回 null', bombFxForType(1) === null)
  check('bombFxForType 字符串入参仍可用', bombFxForType('BOMB_5')?.kind === 'bomb')
}

// ============== 5. A-6:dealTimeout 导出 + 快照清理 ==============
console.log('\n=== 5. A-6:dealTimeout 导出 + 快照恢复后清理 ===')
{
  check('useGameLogic 导出块含 dealTimeout',
    uglSrc.includes('isDealing, dealProgress, dealTimeout'))
  check('快照恢复成功后清 dealTimeout(注释锚点)',
    uglSrc.includes('快照恢复成功后清发牌超时'))
  check('快照恢复清 dealTimeout 值',
    /快照恢复成功后清发牌超时[\s\S]{0,200}dealTimeout\.value = false/.test(uglSrc))
}

// ============== 6. A-7:超时自动行动 ==============
console.log('\n=== 6. A-7:autoPlayOnTimeout 不再无脑出最小单张 ===')
{
  check('autoPlayOnTimeout 函数存在', uglSrc.includes('async function autoPlayOnTimeout'))
  check('跟牌场景用 findMinBeat', /autoPlayOnTimeout[\s\S]{0,600}findMinBeat/.test(uglSrc))
  check('压不起走 commitPass', /autoPlayOnTimeout[\s\S]{0,900}commitPass\(selfSeat\.value, 'timeout'\)/.test(uglSrc))
  check('commit 失败重启计时器', uglSrc.includes('auto action rejected, restart timer'))
}

// ============== 7. A-8:_broadcastPerSeatDeal 不跳过 seat 0 真人 ==============
console.log('\n=== 7. A-8:_broadcastPerSeatDeal 遍历 0..3 跳过自己 ===')
{
  check('循环从 0 开始', /_broadcastPerSeatDeal[\s\S]{0,700}for \(let s = 0; s < 4; s\+\+\)/.test(uglSrc))
  check('跳过 host 自己座位', /if \(s === hostSelfSeat\) continue/.test(uglSrc))
  check('不再有硬编码 1..3 旧循环', !/for \(let s = 1; s < 4; s\+\+\)/.test(uglSrc))
}

// ============== 8. A-9:firstSeat 只消费一次 ==============
console.log('\n=== 8. A-9:URL 首局 firstSeat 消费一次即置空 ===')
{
  check('消费后 opts.firstSeat = null', uglSrc.includes('opts.firstSeat = null'))
}

// ============== 9. A-10:onP2PAITakeover 仅 host addAIPlayer ==============
console.log('\n=== 9. A-10:onP2PAITakeover host 守卫 ===')
{
  check('addAIPlayer 仅 host 端(注释锚点)', uglSrc.includes('addAIPlayer 仅 host 端执行'))
}

// ============== 10. A-11:跟牌无可压牌 toast ==============
console.log('\n=== 10. A-11:没有能大过的牌时反馈 ===')
{
  check('toast 没有能大过上家的牌', uglSrc.includes("showToast('没有能大过上家的牌')"))
}

// ============== 11. A-12:CHAT_QUICK 跨端快捷聊天 ==============
console.log('\n=== 11. A-12:CHAT_QUICK 广播 + 监听 ===')
{
  check('onChatSelect 广播 CHAT_QUICK', uglSrc.includes("type: 'CHAT_QUICK'"))
  check('监听 message:CHAT_QUICK', uglSrc.includes("onNet('message:CHAT_QUICK'"))
}

// ============== 12. A-13:audio 音量/unlock 修复 ==============
console.log('\n=== 12. A-13:audio real 模式音量 + unlock 恢复 ===')
{
  check('音量遍历 pool entry.elements(注释锚点)', audioSrc.includes('cache 值是 pool entry'))
  check('unlock 恢复 bgmUseMp3(注释锚点)', audioSrc.includes('恢复播放后把 bgmUseMp3 置回 true'))
}

console.log(`\n========== v0.4.24 对局核心修复测试: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
