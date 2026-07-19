<template>
  <!--
   * v3.6 中央椭圆牌桌 + 装饰花纹 + 信息条 + 出牌堆
   * 视觉结构:
   *   - 椭圆牌桌(深蓝径向 + 木边)+ 装饰花纹(SVG 圆环 + 十字 + PVP)
   *   - 顶部 3 颗 pill 信息条(打 X / 第 N 轮 / ×N 倍)
   *   - 中央出牌堆(扇形错位 32px + ±6° 旋转)
   *   - 底部首家提示胶囊(头像 + 名字 + 出牌中 ▶)
   *   - v0.4.25:出牌归属标签(牌堆上方标注刚出牌玩家头像 + 名字)
   * 桌面中央改为几何装饰花纹,不再有大字水印。
   -->
  <div class="table-center-wrap" :class="{ 'is-dealing': isDealing }">
<!-- 椭圆牌桌(背景) -->
    <div class="ellipse-table">
      <!-- 木边外圈装饰高光 -->
      <div class="wood-edge"></div>
      <!-- 桌面装饰花纹(SVG 圆环 + 十字 + PVP) -->
      <div class="table-deco">
        <svg viewBox="0 0 280 140" fill="none" stroke="white" stroke-width="1">
          <circle cx="140" cy="70" r="60" />
          <circle cx="140" cy="70" r="40" />
          <path d="M 60 70 L 220 70 M 140 10 L 140 130" />
          <path d="M 80 30 L 200 110 M 80 110 L 200 30" />
          <circle cx="80" cy="30" r="3" fill="white" />
          <circle cx="200" cy="30" r="3" fill="white" />
          <circle cx="80" cy="110" r="3" fill="white" />
          <circle cx="200" cy="110" r="3" fill="white" />
          <text x="140" y="76" text-anchor="middle" font-size="14" fill="white" stroke="none" font-weight="900" letter-spacing="2">{{ modeLabel }}</text>
        </svg>
      </div>
      <!-- 桌面顶光(顶部一线亮,底部压暗) -->
      <div class="table-toplight"></div>
      <!-- 桌面暗角(中心聚光) -->
      <div class="table-vignette"></div>
      <!-- v3.9:首家出牌人胶囊挪进椭圆内,绝对定位在椭圆底部内沿
       *   ellipse-table overflow:hidden 自动裁掉溢出椭圆外的部分 → 不再压到下方 .hand-area 手牌顶
       *   stack-card(出牌堆)在椭圆中心 ±55px,胶囊 bottom 8% ≈ 椭圆内 +115px,有 ~60px 间距不冲突 -->
      <div v-if="!isDealing && firstPlayerName" class="first-tip-bottom">
        <span class="tip-emoji">{{ firstPlayerEmoji || '🤖' }}</span>
        <span class="tip-name">{{ firstPlayerName }}</span>
        <span class="tip-act">出牌中 ▶</span>
      </div>
    </div>

    <!-- 桌面顶部信息条:打 X · 第 N 轮 · ×N 倍(浮在桌面上方,不挡中央出牌堆) -->
    <!-- v2.5:信息条从桌面内 top:8px 改 top:-24px(浮到桌面上沿),首家出牌胶囊单独挪到桌面下沿,避免跟出牌堆扇形重叠 -->
    <div class="table-info-top" v-if="!isDealing">
      <div class="table-info-pill">
        <span class="ico">♠</span>打 <b class="v">{{ levelLabel }}</b>
      </div>
      <div class="table-info-pill">
        <span class="ico">⏱</span>第 <b class="v">{{ round }}</b> 轮
      </div>
      <div class="table-info-pill">
        <span class="ico">×</span><b class="v">{{ multiplier }}</b> 倍
      </div>
    </div>

    <!-- v3.9: 首家出牌人胶囊已挪进 .ellipse-table 内部(见上),这里不再单独渲染 -->

    <!-- v0.4.25:级牌进度轨(2→A 双方队伍位置,信息条下方) -->
    <LevelTrack
      v-if="!isDealing"
      class="table-level-track"
      :team-levels="teamLevels"
      :level-rank="levelRankNum"
      :self-seat="selfSeat"
    />

    <!-- 桌面牌堆 -->
    <div class="card-stack-area">
      <!-- v0.4.25:出牌归属标签 — 牌堆上方标注"谁出的牌"(头像 + 名字),解决出牌者难感知 -->
      <transition name="last-pop">
        <div
          v-if="tableCards.length > 0 && lastPlayerName"
          :key="lastPlayerName + '-' + tableCards.length"
          class="last-play-tag"
        >
          <span class="lp-emoji" aria-hidden="true">{{ lastPlayerEmoji || '🙂' }}</span>
          <span class="lp-name">{{ lastPlayerName }}</span>
          <!-- v0.4.25:牌型名(对子/三张/顺子…),桌面叠牌分不清几张时的关键信息 -->
          <span v-if="lastPlayType" class="lp-type">{{ lastPlayType }}</span>
          <span v-else class="lp-act">出的牌</span>
        </div>
      </transition>
      <div v-if="tableCards.length === 0 && !isDealing" class="stack-empty">
        <span class="empty-text">{{ firstPlayerName }} 先出</span>
      </div>
      <transition-group v-else-if="!isDealing" name="card-fly" tag="div" class="card-stack" :class="[`stack-size-${Math.min(tableCards.length, 8)}`, `fly-from-${lastPlayerPos}`]">
        <div
          v-for="(c, i) in tableCards"
          :key="'c' + c.suit + '-' + c.rank + '-' + i"
          class="stack-card"
          :style="stackStyle(i)"
        >
          <CardPlay :card="c" :is-level="isLevel(c)" size="lg" />
        </div>
      </transition-group>
    </div>

    <!-- v3.7:旧的 absolute .first-tip 已并入 .table-info-top,这里不再单独渲染 -->

    <!-- 发牌中提示 -->
    <div v-if="isDealing" class="dealing-hint">
      <div class="dealing-deck">
        <div class="d-card"></div>
        <div class="d-card"></div>
        <div class="d-card"></div>
      </div>
      <div class="dealing-text">正在发牌...</div>
    </div>
  </div>
</template>

<script setup>
import CardPlay from './CardPlay.vue'
import LevelTrack from './LevelTrack.vue'

const props = defineProps({
  // 桌面牌(刚出的牌)
  tableCards: { type: Array, default: () => [] },
  // 首家名字
  firstPlayerName: { type: String, default: '' },
  // 首家 emoji 头像
  firstPlayerEmoji: { type: String, default: '' },
  // ★ v0.4.25:刚出牌玩家归属(lastPlay.who → name/avatar),标注在牌堆上方
  lastPlayerName: { type: String, default: '' },
  lastPlayerEmoji: { type: String, default: '' },
  // ★ v0.4.25:出牌者屏幕方位(bottom/top/left/right),飞牌轨迹起点
  lastPlayerPos: { type: String, default: 'bottom' },
  // ★ v0.4.25:刚出牌的牌型名(对子/三张/顺子…),归属胶囊展示
  lastPlayType: { type: String, default: '' },
  // 是否级牌判定函数
  isLevel: { type: Function, required: true },
  // 是否发牌中
  isDealing: { type: Boolean, default: false },
  // v3.6 信息条:打 X
  levelLabel: { type: String, default: '2' },
  // v3.6 信息条:第 N 轮
  round: { type: Number, default: 1 },
  // v3.6 信息条:×N 倍
  multiplier: { type: Number, default: 1 },
  // ★ P1-10 修复:AI 对局不显示 PVP,显示"AI 对局"或"好友对局"
  modeLabel: { type: String, default: 'PVP' },
  // ★ v0.4.25:级牌进度轨数据(双方队伍等级 / 本局级牌 / 自己座位)
  teamLevels: { type: Array, default: () => [15, 15] },
  levelRankNum: { type: Number, default: 15 },
  selfSeat: { type: Number, default: 0 },
})

/**
 * 桌面牌堆叠:每张错位 16-32px + 旋转 ±3-6°
 * 中央对齐,呈扇形展开(v3.6 强化:中间牌旋转小,两边旋转大)
 */
function stackStyle(i) {
  const n = props.tableCards.length
  // 错位 32px(从 16 加到 32,v3.6 扇形更明显)
  const centerIdx = (n - 1) / 2
  const offset = 32
  const x = (i - centerIdx) * offset
  // 旋转 ±6°(从 ±3 改 ±6)
  const rot = (i - centerIdx) * 6
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: `translate(calc(-50% + ${x}px), -50%) rotate(${rot}deg)`,
    zIndex: i + 1,
    transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  }
}
</script>

<style scoped>
/* ============================================================
 * 牌桌容器(给 TableCenter 外层用,加 padding 留位)
 * ============================================================ */
.table-center-wrap {
  position: relative;
  width: 100%;
  height: 460px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
  margin-top: 140px;
  pointer-events: none;
}

/* ============================================================
 * 椭圆牌桌
 * - 横向 95% max 720px
 * - 高度 80% 容器
 * - 棕色木边 8-10px
 * - 桌面径向渐变(中心亮)
 * ============================================================ */
.ellipse-table {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 96%;
  max-width: 960px;
  height: 88%;
  border-radius: 50%;
  box-shadow:
    inset 0 0 40px rgba(0, 0, 0, 0.7),
    inset 0 0 80px rgba(74, 25, 130, 0.35),
    inset 0 0 120px rgba(10, 18, 51, 0.5),
    inset 0 0 0 3px #a0683a,
    inset 0 0 0 4px #8B5A2B,
    inset 0 0 0 5px #6b3f1d,
    inset 0 0 0 6px rgba(0, 0, 0, 0.4),
    0 0 40px rgba(126, 87, 194, 0.18),
    0 10px 28px rgba(0, 0, 0, 0.55);
  background: radial-gradient(ellipse at center,
    #3a5a8a 0%,
    #2a3a6a 35%,
    #1a2a4e 70%,
    #0a1233 100%);
  overflow: hidden;
}

/* 木边高光(顶部一线) */
.wood-edge {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(180deg,
    rgba(255, 220, 170, 0.35) 0%,
    transparent 18%,
    transparent 70%,
    rgba(0, 0, 0, 0.45) 100%);
  pointer-events: none;
  z-index: 4;
}

/* ============================================================
 * v3.6 装饰花纹(替代旧的中央水印)
 * ============================================================ */
.table-deco {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}
.table-deco svg {
  width: 280px;
  height: 140px;
  opacity: 0.18;
}

/* v3.6 桌面顶光(顶部一线更亮) */
.table-toplight {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(180deg,
    rgba(255, 220, 170, 0.25) 0%,
    transparent 25%,
    transparent 75%,
    rgba(0, 0, 0, 0.4) 100%);
  pointer-events: none;
  z-index: 2;
}

/* 桌面暗角 */
.table-vignette {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(ellipse at center,
    transparent 30%,
    rgba(0, 0, 0, 0.35) 85%);
  pointer-events: none;
  z-index: 3;
}

/* ============================================================
 * v3.6 桌面顶部信息条:打 X / 第 N 轮 / ×N 倍
 * 浮动在桌面上沿的 3 颗 pill
 * ============================================================ */
.table-info-top {
  position: absolute;
  top: -24px;                  /* v2.5: 从桌面内 8px 浮到 -24px(桌面上方),不挡中央出牌堆 */
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  z-index: 6;
  pointer-events: none;
}
.table-info-pill {
  background: rgba(0, 0, 0, 0.65);
  border: 1px solid rgba(255, 215, 0, 0.35);
  border-radius: 14px;
  padding: 3px 10px;
  font-size: 10px;
  color: var(--text-primary, #fff);
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  letter-spacing: 0.5px;
}
.table-info-pill .ico {
  color: var(--gold, #FFD700);
  font-size: 11px;
}
.table-info-pill .v {
  color: var(--gold, #FFD700);
  font-weight: 900;
  margin: 0 1px;
}

/* ============================================================
 * v3.9:首家出牌人胶囊 — 移到 .ellipse-table 内部(由 template 改),
 *   absolute 定位在椭圆内底部 10px。ellipse-table overflow:hidden 会
 *   自动裁掉溢出椭圆外的部分,胶囊永远不溢出到桌面外下方 → 不再压到
 *   .hand-area 手牌顶数字(横屏尤其严重,以前 bottom:-22px 会盖 9 个牌顶)
 * ============================================================ */
.first-tip-bottom {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  background: linear-gradient(180deg, rgba(255, 215, 0, 0.18), rgba(0, 0, 0, 0.65));
  border: 1.5px solid var(--gold, #FFD700);
  border-radius: 14px;
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.25), 0 2px 6px rgba(0, 0, 0, 0.5);
  z-index: 5;
  pointer-events: none;
  white-space: nowrap;
  backdrop-filter: blur(4px);
}
.first-tip-bottom .tip-emoji { font-size: 12px; line-height: 1; }
.first-tip-bottom .tip-name  { font-size: 11px; font-weight: 700; color: #fff; }
.first-tip-bottom .tip-act   { font-size: 11px; font-weight: 700; color: var(--gold, #FFD700); }
/* v2.5:旧 .first-tip-inline 类名保留(空规则),以防 v3.7 旧引用样式破裂 */
.first-tip-inline { /* 已被 .first-tip-bottom 替代 */ }

/* v0.4.25:级牌进度轨 — 信息条下方、椭圆桌面上沿内侧居中
 *   (top 6px 会被顶部座位卡片遮住,下移到 34px 避开) */
.table-level-track {
  position: absolute;
  top: 34px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  pointer-events: none;
}

/* ============================================================
 * 桌面牌堆(已出牌)
 * ============================================================ */
.card-stack-area {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: none;
}
.card-stack {
  position: relative;
  width: 380px;
  height: 160px;
  /* v0.4.25:飞牌起点(按出牌者方位覆盖) */
  --fly-x: 0px;
  --fly-y: 200px;
}
/* v0.4.25:飞牌轨迹 — 牌从出牌玩家的座位方向飞入桌面中央 */
.card-stack.fly-from-top   { --fly-x: 0px;    --fly-y: -160px; }
.card-stack.fly-from-left  { --fly-x: -240px; --fly-y: 40px; }
.card-stack.fly-from-right { --fly-x: 240px;  --fly-y: 40px; }
.card-stack.fly-from-bottom{ --fly-x: 0px;    --fly-y: 200px; }

/* ============================================================
 * v0.4.25 出牌归属标签(谁出的牌)— 浮在牌堆正上方,金边玻璃胶囊
 * ============================================================ */
.last-play-tag {
  position: absolute;
  top: calc(50% - 112px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  background: rgba(0, 0, 0, 0.68);
  border: 1.5px solid var(--gold, #FFD700);
  border-radius: 14px;
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.3), 0 2px 6px rgba(0, 0, 0, 0.5);
  z-index: 8;
  pointer-events: none;
  white-space: nowrap;
  backdrop-filter: blur(4px);
}
.last-play-tag .lp-emoji { font-size: 13px; line-height: 1; }
.last-play-tag .lp-name  { font-size: 12px; font-weight: 800; color: #fff; }
.last-play-tag .lp-act   { font-size: 11px; font-weight: 700; color: var(--gold, #FFD700); }
/* v0.4.25:牌型名高亮(胶囊核心信息) */
.last-play-tag .lp-type  { font-size: 12px; font-weight: 900; color: var(--gold, #FFD700); letter-spacing: 1px; }
.last-pop-enter-active { transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1); }
.last-pop-leave-active { transition: opacity 0.15s ease-in; }
.last-pop-enter-from { opacity: 0; transform: translateX(-50%) scale(0.5); }
.last-pop-leave-to   { opacity: 0; }
.stack-card {
  pointer-events: auto;
  animation: card-to-table 300ms cubic-bezier(0.4, 0, 0.2, 1) backwards;
}
@keyframes card-to-table {
  0% {
    opacity: 0;
    /* v0.4.25:从出牌者方位(var(--fly-x/y))飞入,替代固定底部冒牌 */
    transform: translate(calc(-50% + var(--fly-x, 0px)), calc(-50% + var(--fly-y, 200px))) scale(0.6) rotate(0deg);
  }
  60% {
    opacity: 1;
  }
  100% {
    opacity: 1;
  }
}
.card-fly-enter-active {
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms ease-out;
}
.card-fly-leave-active {
  transition: opacity 200ms ease-in;
  position: absolute;
}
.card-fly-enter-from {
  opacity: 0;
  transform: translate(-50%, 100px) scale(0.5);
}
.card-fly-leave-to {
  opacity: 0;
}

.stack-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.empty-text {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.55);
  background: rgba(0, 0, 0, 0.45);
  padding: 10px 20px;
  border-radius: 18px;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  letter-spacing: 2px;
}

/* ============================================================
 * 发牌中提示
 * ============================================================ */
.dealing-hint {
  position: absolute;
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  z-index: 10;
  pointer-events: none;
}
.dealing-deck {
  position: relative;
  width: 100px; height: 130px;
}
.d-card {
  position: absolute;
  width: 70px; height: 100px;
  background: linear-gradient(135deg, #1e88e5 0%, #0d47a1 100%);
  border: 2px solid #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  animation: deal-shuffle 1.2s ease-in-out infinite;
}
.d-card:nth-child(2) { animation-delay: 0.15s; }
.d-card:nth-child(3) { animation-delay: 0.3s; }
@keyframes deal-shuffle {
  0%, 100% { transform: translate(-50%, -50%) rotate(-8deg); }
  50%      { transform: translate(-50%, -50%) rotate(8deg); }
}
.dealing-text {
  font-size: 14px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  padding: 6px 18px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(4px);
  letter-spacing: 2px;
}
</style>
