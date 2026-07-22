<template>
  <!--
    v3.x 单张扑克牌:奶油白底 + 金边 + 传统卷草纹
    - 桌面 60×84(默认 md / lg)/ 移动 48×68(由父组件 --hand-card-w/h 控制)
    - 大小王:v0.4.25 起经典扑克设计(奶油白底 + 对角竖排 JOKER + 卡通小丑 SVG + 「大王/小王」,红/蓝双色)
    - 牌背:深红渐变 + 金色传统纹 + 中央"掼"字徽章
    - 选中态 / 可打出态 / 不可打出态按 spec §5.5 实现
  -->
  <div
    class="card-play"
    :class="[
      sizeClass,
      {
        'is-red': isRed, 'is-black': isBlack,
        'is-level': isLevel,
        'is-joker': isJoker,
        'is-big-joker': isBigJoker,
        'is-small-joker': isSmallJoker,
        'is-disabled': disabled,
        'selected': selected,
        'hinted': hinted,
        'is-glow': glow,
        'face-down': faceDown,
      },
    ]"
    :style="styleOverride"
  >
    <!-- 牌面 -->
    <template v-if="!faceDown">
      <!-- 牌面花纹层(传统卷草纹,opacity 6-10%)-->
      <div class="card-pattern" aria-hidden="true"></div>

      <!-- 4 角:仅普通牌显示;大小王只有中央王冠 + 王字 -->
      <template v-if="!isJoker">
        <div class="corner corner-tl">
          <span class="rank">{{ displayRank }}</span>
          <span class="suit-sm">{{ suitSymbol }}</span>
        </div>
        <div class="corner corner-br">
          <span class="rank">{{ displayRank }}</span>
          <span class="suit-sm">{{ suitSymbol }}</span>
        </div>
      </template>

      <!-- 中央装饰 -->
      <div
        class="center-area"
        :class="{ 'joker-face': isJoker }"
        :role="isJoker ? 'img' : undefined"
        :aria-label="isJoker ? jokerLabel : undefined"
      >
        <template v-if="isJoker">
          <!-- v0.4.25:经典扑克大小王 — 对角竖排 JOKER + 卡通小丑 SVG + 「大王/小王」
               (替代卡通小丑 PNG;SVG 自绘铃铛帽 + 笑脸 + 拉夫领,与奶油白 + 金边牌面风格统一;
                大王红帽金球,小王蓝灰帽银球) -->
          <span class="joker-word joker-word-tl" aria-hidden="true"><i v-for="ch in 'JOKER'" :key="ch">{{ ch }}</i></span>
          <svg class="joker-jester" viewBox="0 0 100 102" aria-hidden="true">
            <!-- 三尖铃铛帽(圆头粗线帽角 + 端部圆球) -->
            <path class="jst-horn" d="M34 40 C24 36 15 28 13 15" />
            <path class="jst-horn" d="M66 40 C76 36 85 28 87 15" />
            <path class="jst-horn" d="M50 34 C46 26 47 15 52 9" />
            <circle class="jst-ball" cx="13" cy="13" r="4.6" />
            <circle class="jst-ball" cx="87" cy="13" r="4.6" />
            <circle class="jst-ball" cx="52" cy="8" r="4.6" />
            <!-- 帽檐 -->
            <path class="jst-hat" d="M29 46 Q50 30 71 46 L68 38 Q50 26 32 38 Z" />
            <!-- 圆脸 + 弯月笑眼 + 腮红 + 圆鼻 + 微笑 -->
            <circle class="jst-face" cx="50" cy="61" r="20" />
            <path class="jst-eye" d="M40 58 Q43.5 55 47 58" />
            <path class="jst-eye" d="M53 58 Q56.5 55 60 58" />
            <ellipse class="jst-blush" cx="38" cy="66" rx="2.8" ry="1.7" />
            <ellipse class="jst-blush" cx="62" cy="66" rx="2.8" ry="1.7" />
            <circle class="jst-nose" cx="50" cy="63" r="3.1" />
            <path class="jst-mouth" d="M42 70 Q50 77 58 70" />
            <!-- 拉夫领(波浪粗线) -->
            <path class="jst-ruff" d="M31 77 Q35 85 39 78 Q43 87 47 79 Q50 89 53 79 Q57 87 61 78 Q65 85 69 77" />
          </svg>
          <!-- ★ v0.4.29:去除「大王/小王」汉字,仅保留 JOKER 竖排 + 小丑 SVG(用户反馈) -->
          <span class="joker-word joker-word-br" aria-hidden="true"><i v-for="ch in 'JOKER'" :key="ch">{{ ch }}</i></span>
        </template>
        <template v-else>
          <div class="center-suit">{{ suitSymbol }}</div>
          <div v-if="isLevel" class="level-tag">级</div>
        </template>
      </div>

      <!-- 选中态顶部金色亮线 -->
      <div v-if="selected" class="selected-line" aria-hidden="true"></div>
    </template>

    <!-- 牌背 -->
    <template v-else>
      <div class="card-back-inner">
        <div class="back-pattern" aria-hidden="true"></div>
        <div class="back-badge">
          <span class="back-char">掼</span>
        </div>
      </div>
    </template>

    <!-- 提示灯泡(浮在右上) -->
    <span v-if="hinted && !selected" class="hint-pin" aria-hidden="true">💡</span>
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
  // ★ v0.4.28 P0-4:自动金光(轮到自己且能压过时,可出牌呼吸发光,不带 💡 角标)
  glow: { type: Boolean, default: false },
  // 是否级牌
  isLevel: { type: Boolean, default: false },
  // 是否禁用(灰态)— v3.x 新增
  disabled: { type: Boolean, default: false },
  // 自定义 transform(用于桌面堆叠)
  styleOverride: { type: Object, default: () => ({}) },
})

const SUIT_SYM = ['♠', '♥', '♣', '♦']
const RANK_LABEL = { 3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王' }

const suit = computed(() => props.card?.suit ?? 0)
const rank = computed(() => props.card?.rank ?? 0)
const isJoker = computed(() => rank.value === 16 || rank.value === 17)
const isBigJoker = computed(() => rank.value === 17)
const isSmallJoker = computed(() => rank.value === 16)
const isRed = computed(() => !isJoker.value && (suit.value === 1 || suit.value === 3))
const isBlack = computed(() => !isJoker.value && (suit.value === 0 || suit.value === 2))
const suitSymbol = computed(() => SUIT_SYM[suit.value] || '?')
const displayRank = computed(() => RANK_LABEL[rank.value] || '?')
const jokerLabel = computed(() => isBigJoker.value ? '大王' : (isSmallJoker.value ? '小王' : ''))
const sizeClass = computed(() => `size-${props.size}`)
</script>

<style scoped>
/* ============================================================
 * v3.x 卡牌视觉系统(UI-REDESIGN-V3-SPEC.md §5)
 * 牌面:奶油白 + 1.5px 金边 + 8px 圆角 + 传统卷草纹
 * 牌背:深红渐变 + 金色传统纹 + "掼"字徽章
 * 大小王:经典扑克设计(v0.4.25)— 竖排 JOKER + 卡通小丑 SVG + 王字,红/蓝双色
 * ============================================================ */

.card-play {
  position: relative;
  display: inline-block;
  /* 牌面底色:奶油白(spec §5.1) */
  background-color: var(--card-cream);
  /* 牌面花纹:内联 SVG 卷草纹,opacity 6-10% */
  background-image: var(--card-pattern-svg);
  background-repeat: repeat;
  background-size: 80px 110px;
  /* 金边 + 圆角(spec §5.1) */
  border: var(--card-border-w) solid var(--card-border-gold);
  border-radius: var(--card-radius);
  /* 阴影(spec §5.1) */
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.18),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.6);
  color: var(--black-card);
  font-weight: bold;
  line-height: 1;
  /* 衬线字体(spec §5.2 — 牌面数字/字用衬线) */
  font-family: Georgia, "Times New Roman", "Songti SC", "STSong", serif;
  user-select: none;
  overflow: hidden;
  transition:
    transform var(--t-fast) var(--ease-out),
    box-shadow var(--t-fast) var(--ease-out),
    border-color var(--t-fast) var(--ease-out);
}

/* 牌面花纹覆盖层(opacity 8% 让传统纹若隐若现)*/
.card-pattern {
  position: absolute;
  inset: 0;
  background-image: var(--card-pattern-svg);
  background-repeat: repeat;
  background-size: 80px 110px;
  opacity: 0.08;
  pointer-events: none;
  z-index: 0;
}

/* ----- 尺寸(桌面 60×84 / 移动 48×68 由父组件 --hand-card-w/h 控制)----- */
.size-sm { width: 22px; height: 32px; font-size: 9px; }  /* 对手手牌背(face-down),保持原 22×32 不挤 360px */
.size-md { width: var(--hand-card-w); height: var(--hand-card-h); font-size: 12px; }  /* 手牌(桌面 60×84 / 移动由父级 override)*/
.size-lg { width: var(--play-card-w); height: var(--play-card-h); font-size: 13px; }    /* 桌面出牌区*/

/* ----- 颜色 ----- */
.is-red   { color: var(--red-card); }
.is-black { color: var(--black-card); }

/* ----- 4 角数字/花色 ----- */
.corner {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  z-index: 1;
}
.corner .rank {
  font-size: 0.95em;
  font-weight: bold;
  font-family: Georgia, "Times New Roman", serif;
  letter-spacing: 0.5px;
}
.corner .suit-sm {
  font-size: 0.75em;
  margin-top: 1px;
  font-family: Georgia, serif;
}
.corner-tl { top: 3px;    left: 4px; }
.corner-br { bottom: 3px; right: 4px; transform: rotate(180deg); }

/* ----- 中央大花色 ----- */
.center-area {
  position: absolute;
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
}
.center-suit {
  font-size: 1.6em;
  line-height: 1;
  font-weight: bold;
  font-family: Georgia, "Times New Roman", serif;
}

/* ----- 级牌样式 ----- */
.is-level {
  background-color: #fff8d8;
  background-image: var(--card-pattern-svg);
  background-repeat: repeat;
  background-size: 80px 110px;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.2),
    0 0 0 1.5px var(--accent-orange),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.6);
}
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
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  font-family: "PingFang SC", system-ui, sans-serif;
  z-index: 2;
}

/* ----- 大小王:经典扑克设计(v0.4.25)-----
 * 奶油白底(与普通牌一致)+ 对角竖排 JOKER + 皇冠 SVG + 竖排「大王/小王」
 * 大王 = 经典红字 + 金冠;小王 = 墨黑字 + 银冠(沿用真实扑克配色约定) */
.is-big-joker   { color: #c62f2f; }
.is-small-joker { color: #2f2f3a; }

/* 王牌中央区铺满整牌(普通牌 center-area 居中自适应即可) */
.center-area.joker-face { inset: 0; left: 0; top: 0; transform: none; }

/* 对角竖排 JOKER 字母(左上 + 右下旋转 180°,与真实扑克一致) */
.joker-word {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.52em;
  font-weight: 900;
  line-height: 1.3;
  font-family: Georgia, "Times New Roman", serif;
  z-index: 1;
}
.joker-word i { font-style: normal; }
.joker-word-tl { top: 4%;    left: 6.5%; }
.joker-word-br { bottom: 4%; right: 6.5%; transform: rotate(180deg); }

/* 卡通小丑 SVG(上中部,大王红帽金球 / 小王蓝灰帽银球) */
.joker-jester {
  position: absolute;
  left: 50%;
  top: 7%;
  transform: translateX(-50%);
  width: 64%;
  z-index: 1;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2));
}
/* 结构件共用描边/填充 */
.jst-horn  { fill: none; stroke-width: 7; stroke-linecap: round; }
.jst-eye   { fill: none; stroke: #3a3a3a; stroke-width: 1.7; stroke-linecap: round; }
.jst-mouth { fill: none; stroke: #3a3a3a; stroke-width: 1.8; stroke-linecap: round; }
.jst-face  { fill: #fff; stroke-width: 1.5; }
.jst-blush { fill: #ff9d9d; opacity: 0.55; }
.jst-ruff  { fill: none; stroke-width: 4.5; stroke-linecap: round; }
/* 大王:红帽 + 金球 + 红鼻 */
.is-big-joker .jst-horn { stroke: #e05545; }
.is-big-joker .jst-hat  { fill: #e05545; stroke: #a83a2c; stroke-width: 1.2; }
.is-big-joker .jst-ball { fill: #ffd54f; stroke: #b8860b; stroke-width: 1; }
.is-big-joker .jst-face { stroke: #a83a2c; }
.is-big-joker .jst-nose { fill: #d43a2a; }
.is-big-joker .jst-ruff { stroke: #e05545; }
/* 小王:蓝灰帽 + 银球 + 深蓝鼻 */
.is-small-joker .jst-horn { stroke: #8d94c9; }
.is-small-joker .jst-hat  { fill: #8d94c9; stroke: #565b85; stroke-width: 1.2; }
.is-small-joker .jst-ball { fill: #ececf2; stroke: #9a9ab0; stroke-width: 1; }
.is-small-joker .jst-face { stroke: #565b85; }
.is-small-joker .jst-nose { fill: #565b85; }
.is-small-joker .jst-ruff { stroke: #8d94c9; }

/* ★ v0.4.29:「大王/小王」汉字已移除(用户反馈),.joker-cn 样式不再需要 */

/* 小尺寸(sm)精简:隐藏 JOKER 字母,小丑放大 */
.size-sm .joker-word { display: none; }
.size-sm .joker-jester { top: 5%; width: 82%; }

/* ----- 选中态(桌面端)spec §5.5 ----- */
.card-play.selected {
  transform: translateY(var(--card-selected-translate));
  box-shadow:
    0 0 0 2px var(--gold-bright),
    0 12px 24px rgba(0, 0, 0, 0.35),
    0 0 16px rgba(255, 215, 0, 0.55),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.6);
}
.selected-line {
  position: absolute;
  top: 0; left: 4px; right: 4px;
  height: 2px;
  background: linear-gradient(90deg, transparent 0%, var(--gold-bright) 50%, transparent 100%);
  border-radius: 0 0 2px 2px;
  z-index: 3;
  box-shadow: 0 0 6px rgba(255, 215, 0, 0.8);
}

/* ----- 可打出:边框闪金光(1.5s 周期)spec §5.5 ----- */
.card-play.hinted {
  animation: card-hint-shine var(--card-hint-glow-period) ease-in-out infinite;
}

/* ----- ★ v0.4.28 P0-4:自动金光(轮到自己且能压过)-----
   复用 card-hint-shine 呼吸金光,但周期略缓、不弹 💡 角标,
   与手动提示(hinted)区分开,避免过度打扰 */
.card-play.is-glow {
  animation: card-hint-shine calc(var(--card-hint-glow-period) * 1.4) ease-in-out infinite;
}

/* ----- 不可打出:opacity 0.6 + 灰态 spec §5.5 ----- */
.card-play.is-disabled {
  opacity: 0.6;
  filter: grayscale(0.45);
  cursor: not-allowed;
}

/* ----- 提示灯泡(浮在右上)----- */
.hint-pin {
  position: absolute;
  top: -10px; right: -4px;
  font-size: 12px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  animation: hint-bob 0.9s ease-in-out infinite;
  z-index: 4;
}
@keyframes hint-bob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
}

/* ----- 牌背:深红渐变 + 金色传统纹 + "掼"字徽章(spec §5.3)----- */
.card-back-inner {
  position: absolute;
  inset: 0;
  /* ★ v0.4.28 P1-3:牌背底色可主题化(默认深红漆器) */
  background: var(--card-back-base, linear-gradient(135deg, #8B1A1A 0%, #5C0E0E 100%));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: calc(var(--card-radius) - 1px);
}
.back-pattern {
  position: absolute;
  inset: 0;
  background-image: var(--card-back-svg);
  background-repeat: repeat;
  background-size: 40px 55px;
  opacity: 0.55;
  pointer-events: none;
}
/* 牌背金边内框(仿扑克牌双线) */
.card-back-inner::before {
  content: '';
  position: absolute;
  inset: 4px;
  border: 1px solid var(--gold-primary);
  border-radius: calc(var(--card-radius) - 2px);
  pointer-events: none;
  opacity: 0.6;
}
.card-back-inner::after {
  content: '';
  position: absolute;
  inset: 7px;
  border: 0.5px solid var(--gold-dark);
  border-radius: calc(var(--card-radius) - 3px);
  pointer-events: none;
  opacity: 0.45;
}
.back-badge {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--gold-metallic);
  border: 1.5px solid #fff5d4;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.4),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.6);
  z-index: 1;
}
.size-sm .back-badge { width: 12px; height: 12px; border-width: 1px; }
.size-lg .back-badge { width: 48px; height: 48px; }
.back-char {
  font-family: "Songti SC", "STSong", "KaiTi", serif;
  font-size: 18px;
  font-weight: bold;
  color: #8B1A1A;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.3);
}
.size-sm .back-char { font-size: 7px; }
.size-lg .back-char { font-size: 26px; }
</style>
