<template>
  <!-- 单张牌:有 4 种尺寸 / 选中 / 高亮 / 级牌 / JOKER 几种变体 -->
  <div
    class="card-play"
    :class="[
      sizeClass,
      { 'is-red': isRed, 'is-black': isBlack, 'is-level': isLevel, 'is-joker': isJoker,
        'is-joker-big': isJokerBig,
        'is-big-joker': isBigJoker, 'is-small-joker': isSmallJoker,
        'selected': selected, 'hinted': hinted, 'face-down': faceDown }
    ]"
    :style="styleOverride"
  >
    <!-- 牌面 -->
    <template v-if="!faceDown">
      <!-- 4 角设计(大小王不显示角标,牌面只有小丑) -->
      <template v-if="!isJoker">
        <div class="corner corner-tl">
          <span class="rank">{{ displayRank }}</span>
          <span class="suit-sm">{{ suitSymbol }}</span>
        </div>
      </template>

      <!-- 中央大花色 / JOKER 图案 -->
<div class="center-area">
        <template v-if="isJoker">
          <!-- v3.8:大小王 SVG 重设计 — 真实扑克牌风格的小丑(帽铃铛+表情脸+JOKER 字)
               大王=红金/小王=灰银 双色调区分 -->
          <svg
            class="joker-svg"
            :class="isBigJoker ? 'is-big-joker-svg' : 'is-small-joker-svg'"
            viewBox="0 0 60 80"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <!-- 顶部 JOKER 字 -->
            <text x="30" y="9" text-anchor="middle" font-family="Georgia, serif" font-size="7" font-weight="bold"
                  fill="currentColor" letter-spacing="0.5">JOKER</text>

            <!-- 装饰小角星(大王左侧/小王右侧) -->
            <text x="6" y="13" font-size="5" fill="currentColor" opacity="0.7">✦</text>
            <text x="49" y="13" font-size="5" fill="currentColor" opacity="0.7">✦</text>

            <!-- 小丑帽(3 尖角,每个尖角带一个铃铛球) -->
            <path d="M 12 28 L 18 14 L 22 22 L 30 12 L 38 22 L 42 14 L 48 28 Z"
                  fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round"/>
            <!-- 帽尖上的 3 个铃铛球 -->
            <circle cx="18" cy="14" r="1.6" fill="currentColor"/>
            <circle cx="30" cy="12" r="1.6" fill="currentColor"/>
            <circle cx="42" cy="14" r="1.6" fill="currentColor"/>
            <!-- 帽底装饰带 -->
            <rect x="11" y="26" width="38" height="2.5" rx="1" fill="currentColor" opacity="0.85"/>

            <!-- 脸(椭圆) -->
            <ellipse cx="30" cy="48" rx="14" ry="13" fill="#fff8e1" stroke="currentColor" stroke-width="1.2"/>

            <!-- 红润脸颊(大王红/小王灰) -->
            <circle cx="20" cy="51" r="2.5" :fill="isBigJoker ? '#ff6b6b' : '#bbb'" opacity="0.55"/>
            <circle cx="40" cy="51" r="2.5" :fill="isBigJoker ? '#ff6b6b' : '#bbb'" opacity="0.55"/>

            <!-- 眉毛(浓黑,上扬) -->
            <path d="M 22 41 Q 24 39 27 41" stroke="#1a1a1a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
            <path d="M 33 41 Q 36 39 38 41" stroke="#1a1a1a" stroke-width="1.5" fill="none" stroke-linecap="round"/>

            <!-- 眼睛(白底 + 黑瞳 + 高光) -->
            <circle cx="25" cy="46" r="2.5" fill="#fff"/>
            <circle cx="35" cy="46" r="2.5" fill="#fff"/>
            <circle cx="25" cy="46" r="1.3" fill="#1a1a1a"/>
            <circle cx="35" cy="46" r="1.3" fill="#1a1a1a"/>
            <circle cx="25.5" cy="45.5" r="0.4" fill="#fff"/>
            <circle cx="35.5" cy="45.5" r="0.4" fill="#fff"/>

            <!-- 红鼻子(大王红/小王灰) -->
            <circle cx="30" cy="52" r="2.5" :fill="isBigJoker ? '#e53935' : '#888'"/>

            <!-- 嘴(咧嘴笑,带牙齿) -->
            <path d="M 23 56 Q 30 62 37 56" stroke="#1a1a1a" stroke-width="1.2" fill="#c62828" stroke-linejoin="round"/>
            <path d="M 25 57 L 26 58.5 M 28 57 L 29 58.5 M 31 57 L 32 58.5 M 34 57 L 35 58.5"
                  stroke="#fff" stroke-width="0.8" fill="none"/>

            <!-- 下巴尖 -->
            <path d="M 30 60 L 28 62 L 32 62 Z" fill="currentColor" opacity="0.4"/>

            <!-- 底部 JOKER 字 -->
            <text x="30" y="76" text-anchor="middle" font-family="Georgia, serif" font-size="7" font-weight="bold"
                  fill="currentColor" letter-spacing="0.5">JOKER</text>
          </svg>
        </template>
        <template v-else>
          <div class="center-suit">{{ suitSymbol }}</div>
          <div v-if="isLevel" class="level-tag">级</div>
        </template>
      </div>

      <!-- 右下角(大小王不显示) -->
      <template v-if="!isJoker">
        <div class="corner corner-br">
          <span class="rank">{{ displayRank }}</span>
          <span class="suit-sm">{{ suitSymbol }}</span>
        </div>
      </template>
    </template>

    <!-- 牌背(对手用) -->
    <template v-else>
      <div class="card-back-inner">
        <div class="back-pattern">♦</div>
      </div>
    </template>

    <!-- 提示灯泡(浮在右上) -->
    <span v-if="hinted" class="hint-pin">💡</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // 卡牌数据 {suit, rank} 或 null
  card: { type: Object, default: null },
  // 是否牌背
  faceDown: { type: Boolean, default: false },
  // 尺寸: sm=对手(小), md=手牌(中), lg=桌面(大)
  size: { type: String, default: 'md' },
  // 是否选中(手牌)
  selected: { type: Boolean, default: false },
  // 是否高亮(提示)
  hinted: { type: Boolean, default: false },
  // 是否级牌
  isLevel: { type: Boolean, default: false },
  // 自定义 transform(用于桌面堆叠)
  styleOverride: { type: Object, default: () => ({}) },
})

const SUIT_SYM = ['♠', '♥', '♣', '♦']
const RANK_LABEL = { 3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王' }

const suit = computed(() => props.card?.suit ?? 0)
const rank = computed(() => props.card?.rank ?? 0)
const isJoker = computed(() => rank.value === 16 || rank.value === 17)
const isJokerBig = computed(() => isJoker.value)
// v3.7:大小王区分(用于 🤡 emoji 颜色 + CSS 滤镜 + 4 角单字)
const isBigJoker = computed(() => rank.value === 17)
const isSmallJoker = computed(() => rank.value === 16)
const isRed = computed(() => !isJoker.value && (suit.value === 1 || suit.value === 3))
const isBlack = computed(() => !isJoker.value && (suit.value === 0 || suit.value === 2))
const suitSymbol = computed(() => SUIT_SYM[suit.value] || '?')
const displayRank = computed(() => RANK_LABEL[rank.value] || '?')
// v3.7:大小王 4 角用单字"大/小",普通牌用数字/A/K 等
const cornerRank = computed(() => {
  if (isBigJoker.value) return '大'
  if (isSmallJoker.value) return '小'
  return displayRank.value
})
// v3.7:大王=🤡(红调)、小王=🤡(灰调)
const jokerEmoji = computed(() => '🤡')
const sizeClass = computed(() => `size-${props.size}`)
</script>

<style scoped>
.card-play {
  position: relative;
  display: inline-block;
  background: linear-gradient(180deg, var(--card-bg) 0%, var(--card-bg-soft) 100%);
  border-radius: 6px;
  box-shadow: var(--shadow-card);
  user-select: none;
  color: var(--black-card);
  font-weight: bold;
  line-height: 1;
  transition: transform var(--t-fast) var(--ease-out), box-shadow var(--t-fast) var(--ease-out);
}

/* 尺寸 */
.size-sm { width: 22px; height: 32px; font-size: 9px; }
.size-md { width: var(--hand-card-w); height: var(--hand-card-h); font-size: 12px; }
.size-lg { width: var(--play-card-w); height: var(--play-card-h); font-size: 13px; }

/* 颜色 */
.is-red   { color: var(--red-card); }
.is-black { color: var(--black-card); }

/* JOKER 大王牌 */
.is-joker {
  background: linear-gradient(180deg, #fff8e1 0%, #ffe082 100%);
  border: 1.5px solid var(--accent-yellow-dark);
  box-shadow: 0 0 0 1px var(--gold), var(--shadow-card);
}
/* v3.8:大王红小丑 / 小王灰小丑 — inline SVG 画真实扑克牌风格小丑
 * (emoji 字体在 60x84 牌里渲染不稳,改 inline SVG)
 * viewBox 0 0 60 80 留足空间画帽+脸+嘴+上下 JOKER 字
 * currentColor 跟随 .is-big-joker-svg(红)或 .is-small-joker-svg(灰)
 * 居中放在 .card-play 中央,绕开 .center-area 0 宽高问题 */
.joker-svg {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 42px;
  height: 56px;
  pointer-events: none;
  user-select: none;
}
.size-sm .joker-svg { width: 22px; height: 30px; }
.size-md .joker-svg { width: 42px; height: 56px; }
.size-lg .joker-svg { width: 80px; height: 108px; }
/* 大王:红色调(暖红) + 红色光晕 */
.is-big-joker-svg {
  color: #E74C3C;  /* SVG currentColor = 帽/铃铛/眉毛/眼外圈 */
  filter:
    drop-shadow(0 0 3px rgba(231, 76, 60, 0.55))
    drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.3));
}
/* 小王:灰色调(冷灰) + 灰色光晕 */
.is-small-joker-svg {
  color: #6B6B6B;  /* SVG currentColor = 帽/铃铛/眉毛/眼外圈 */
  filter:
    drop-shadow(0 0 3px rgba(120, 120, 120, 0.45))
    drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.3));
}
.is-joker-big .joker-big-suit {
  position: absolute;
  left: 50%; top: 75%;
  transform: translate(-50%, -50%);
  font-size: 11px;
  font-weight: bold;
  color: #fff;
  background: var(--red-card);
  padding: 1px 4px;
  border-radius: 3px;
  letter-spacing: 1px;
  z-index: 2;
}
/* v3.7:小王"小王"角标背景改灰色,跟 emoji 配色统一 */
.is-joker-big.is-small-joker .joker-big-suit {
  background: linear-gradient(180deg, #757575, #424242);
}
/* v3.8:joker-mid-text 移除(改用全 SVG 画小丑,不再用文字占位) */

/* 4 角 */
.corner {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}
.corner .rank { font-size: 0.95em; font-weight: bold; }
.corner .suit-sm { font-size: 0.75em; margin-top: 1px; }
.corner-tl { top: 3px; left: 4px; }
.corner-br { bottom: 3px; right: 4px; transform: rotate(180deg); }

/* 中央花色 */
.center-area {
  position: absolute;
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
}
.center-suit {
  font-size: 1.6em;
  line-height: 1;
  font-weight: bold;
}

/* 级牌样式 */
.is-level {
  background: linear-gradient(180deg, #fff9c4 0%, #ffe082 100%);
  box-shadow: 0 0 0 1.5px var(--accent-orange), var(--shadow-card);
}
.is-level .center-suit { font-size: 1.6em; }
.level-tag {
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
  background: var(--red-card);
  color: #fff;
  font-size: 9px;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1;
  letter-spacing: 1px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

/* 选中态(手牌) */
.card-play.selected {
  transform: translateY(-14px);
  box-shadow: 0 0 0 2px var(--gold), 0 6px 12px rgba(255, 215, 0, 0.5);
}

/* 提示高亮(手牌) */
.card-play.hinted {
  box-shadow: 0 0 0 2px var(--accent-orange), 0 0 14px rgba(255, 152, 0, 0.7);
  animation: hint-glow 1.1s ease-in-out infinite;
}
.hint-pin {
  position: absolute;
  top: -10px; right: -4px;
  font-size: 12px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
  animation: hint-bob 0.9s ease-in-out infinite;
}
@keyframes hint-glow {
  0%, 100% { box-shadow: 0 0 0 2px rgba(255, 152, 0, 0.4), 0 0 14px rgba(255, 152, 0, 0.5); }
  50%      { box-shadow: 0 0 0 3px rgba(255, 152, 0, 0.7), 0 0 20px rgba(255, 152, 0, 0.9); }
}
@keyframes hint-bob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
}

/* 牌背 */
.card-back-inner {
  position: absolute;
  inset: 2px;
  background: linear-gradient(135deg, #1e88e5 0%, #1565c0 100%);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255,255,255,0.4);
}
.back-pattern {
  font-size: 10px;
  color: rgba(255,255,255,0.5);
}
</style>
