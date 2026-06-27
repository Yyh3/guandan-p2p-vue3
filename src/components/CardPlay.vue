<template>
  <!--
    v3.x 单张扑克牌:奶油白底 + 金边 + 传统卷草纹
    - 桌面 60×84(默认 md / lg)/ 移动 48×68(由父组件 --hand-card-w/h 控制)
    - 大小王:v0.4.2 起金/银金属渐变 + 卡通小丑 PNG(红/紫)+ 小号"大/小王"字
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
      <div class="center-area">
        <template v-if="isJoker">
          <!-- v0.4.2:卡通小丑 PNG + 小号"大/小王"字
                 红鼻子橙帽 = 大王 / 紫鼻子蓝帽 = 小王(颜色已分,字号精简) -->
          <div class="joker-content">
            <img
              class="joker-face"
              :src="isBigJoker ? bigJokerImg : smallJokerImg"
              :alt="isBigJoker ? '大王' : '小王'"
              draggable="false"
            />
            <div class="joker-label">{{ isBigJoker ? '大' : '小' }}王</div>
          </div>
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
    <span v-if="hinted && !selected" class="hint-pin">💡</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
// v0.4.2 大小王卡通小丑 PNG(256x256,透明背景)— 替代王冠 + 王字 SVG
import bigJokerImg from '@/assets/cards/big-joker.png'
import smallJokerImg from '@/assets/cards/small-joker.png'

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
const sizeClass = computed(() => `size-${props.size}`)
</script>

<style scoped>
/* ============================================================
 * v3.x 卡牌视觉系统(UI-REDESIGN-V3-SPEC.md §5)
 * 牌面:奶油白 + 1.5px 金边 + 8px 圆角 + 传统卷草纹
 * 牌背:深红渐变 + 金色传统纹 + "掼"字徽章
 * 大小王:金/银金属渐变 + 王冠 + 王字
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

/* ----- 大王:金色金属渐变(spec §5.4)----- */
.is-big-joker {
  background-color: transparent;
  background-image: var(--big-joker-bg), var(--card-pattern-svg);
  background-repeat: no-repeat, repeat;
  background-size: 100% 100%, 80px 110px;
  border-color: #a8862a;
  color: #1a1a1a;
  box-shadow:
    0 4px 12px rgba(212, 175, 55, 0.4),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.6),
    0 0 12px rgba(255, 215, 0, 0.3);
}
.is-big-joker .card-pattern { opacity: 0.15; }
.is-big-joker .joker-content { color: #1a1a1a; }

/* ----- 小王:银灰色金属渐变(spec §5.4)----- */
.is-small-joker {
  background-color: transparent;
  background-image: var(--small-joker-bg), var(--card-pattern-svg);
  background-repeat: no-repeat, repeat;
  background-size: 100% 100%, 80px 110px;
  border-color: #888;
  color: #1a1a1a;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.25),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.6),
    0 0 8px rgba(192, 192, 192, 0.4);
}
.is-small-joker .card-pattern { opacity: 0.12; }
.is-small-joker .joker-content { color: #1a1a1a; }

/* ----- 大小王中央内容(v0.4.2 卡通小丑 PNG + 小号字)----- */
.joker-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  position: relative;
  z-index: 1;
}
.joker-face {
  /* 卡通小丑 PNG,透明背景,contain 适配;
     大王/小王共用同一尺寸,颜色靠 PNG 本身区分 */
  width: 70%;
  height: 70%;
  max-width: 56px;
  max-height: 56px;
  object-fit: contain;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
  user-select: none;
  -webkit-user-drag: none;
}
.size-sm .joker-face { max-width: 24px; max-height: 24px; }
.size-lg .joker-face { max-width: 72px; max-height: 72px; }
.joker-label {
  font-family: "Songti SC", "STSong", "KaiTi", serif;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 1px;
  line-height: 1;
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.5);
  margin-top: -2px;
}
.size-sm .joker-label { font-size: 7px; }
.size-lg .joker-label { font-size: 14px; letter-spacing: 2px; }

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
  background: linear-gradient(135deg, #8B1A1A 0%, #5C0E0E 100%);
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
