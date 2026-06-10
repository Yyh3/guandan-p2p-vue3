<template>
  <!-- 特效层:屏幕中央大字(炸弹/王炸) + 不出/过牌飘字 + 屏幕震动 -->
  <div class="effect-layer" :class="{ shake: shaking }">
    <!-- 中央大字特效 -->
    <transition name="bomb-fade">
      <div v-if="bombFx" class="bomb-fx" :class="`kind-${bombFx.kind}`">
        <div class="bomb-text">{{ bombFx.text }}</div>
        <div v-if="bombFx.kind === 'super' || bombFx.kind === 'joker'" class="bomb-blast">
          <div v-for="i in 12" :key="i" class="spark" :style="sparkStyle(i)"></div>
        </div>
      </div>
    </transition>

    <!-- 飘字(不出/过牌) -->
    <div
      v-for="f in floatingTexts"
      :key="f.id"
      class="floating-text"
      :class="`floating-${f.kind}`"
      :style="f.style"
    >
      {{ f.text }}
    </div>
  </div>
</template>

<script setup>
defineProps({
  // 炸弹/王炸中央特效: { kind: 'bomb'|'joker'|'super', text: '炸弹' } 或 null
  bombFx: { type: Object, default: null },
  // 屏幕震动
  shaking: { type: Boolean, default: false },
  // 飘字列表: [{ id, kind: 'pass'|'skip'|'play', text, style: {left, top} }]
  floatingTexts: { type: Array, default: () => [] },
})

// 火星粒子位置
function sparkStyle(i) {
  const angle = (i / 12) * 360
  return {
    transform: `rotate(${angle}deg)`,
    '--angle': `${angle}deg`,
  }
}
</script>

<style scoped>
.effect-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 200;
}

/* 屏幕震动 */
.effect-layer.shake {
  animation: screen-shake 0.4s ease-in-out 2;
}
@keyframes screen-shake {
  0%, 100% { transform: translate(0, 0); }
  25%      { transform: translate(-4px, 2px); }
  50%      { transform: translate(4px, -2px); }
  75%      { transform: translate(-2px, -2px); }
}

/* 炸弹/王炸大字 */
.bomb-fx {
  position: absolute;
  left: 50%; top: 42%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.bomb-text {
  font-size: var(--fs-bomb);
  font-weight: 900;
  color: var(--accent-red);
  letter-spacing: 8px;
  text-shadow:
    0 0 20px rgba(255, 23, 68, 0.9),
    0 0 40px rgba(255, 87, 34, 0.7),
    0 4px 8px rgba(0, 0, 0, 0.6);
  -webkit-text-stroke: 2px #fff;
  animation: bomb-explode 1.5s ease-out forwards;
}
.kind-joker .bomb-text {
  color: var(--gold);
  text-shadow:
    0 0 20px rgba(255, 215, 0, 0.9),
    0 0 40px rgba(255, 152, 0, 0.7),
    0 4px 8px rgba(0, 0, 0, 0.6);
}
.kind-super .bomb-text {
  color: #ff5722;
  font-size: 88px;
  background: linear-gradient(180deg, #ff1744 0%, #ff9800 50%, #ffd600 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 20px rgba(255, 87, 34, 0.8));
}
@keyframes bomb-explode {
  0%   { transform: scale(0.3) rotate(-5deg); opacity: 0; }
  20%  { transform: scale(1.4) rotate(3deg); opacity: 1; }
  60%  { transform: scale(1) rotate(0deg); opacity: 1; }
  100% { transform: scale(1.5) rotate(0deg); opacity: 0; }
}

/* 火星(王炸 / 超级炸弹) */
.bomb-blast {
  position: absolute;
  width: 200px; height: 200px;
  pointer-events: none;
}
.spark {
  position: absolute;
  left: 50%; top: 50%;
  width: 4px; height: 60px;
  background: linear-gradient(180deg, transparent, #fff 50%, #ff9800);
  transform-origin: 50% 100%;
  transform: translate(-50%, -100%) rotate(var(--angle)) translateY(-30px);
  animation: spark-fly 1.5s ease-out forwards;
  border-radius: 2px;
  filter: drop-shadow(0 0 6px rgba(255, 152, 0, 0.8));
}
@keyframes spark-fly {
  0%   { opacity: 0; transform: translate(-50%, -100%) rotate(var(--angle)) translateY(0); }
  40%  { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -100%) rotate(var(--angle)) translateY(-120px); }
}

/* 飘字 */
.floating-text {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 24px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 2px;
  text-shadow: 0 0 8px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.6);
  z-index: 50;
  pointer-events: none;
  padding: 4px 14px;
  border-radius: 16px;
  background: rgba(255, 193, 7, 0.95);
  border: 2px solid #fff;
  color: #4a2c00;
  animation: float-up 1.2s ease-out forwards;
  white-space: nowrap;
}
.floating-skip {
  background: rgba(33, 150, 243, 0.95);
  color: #fff;
}
@keyframes float-up {
  0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
  20%  { opacity: 1; transform: translate(-50%, -60%) scale(1.2); }
  100% { opacity: 0; transform: translate(-50%, -120%) scale(1); }
}

.bomb-fade-enter-active, .bomb-fade-leave-active {
  transition: opacity var(--t-med) var(--ease-out);
}
.bomb-fade-enter-from, .bomb-fade-leave-to { opacity: 0; }
</style>
