<template>
  <div class="page">
    <div class="bg app-half-table-bg"></div>
    <!-- ★ v0.4.24:补返回入口(与 JoinView/SettingsView 一致) -->
    <button class="back-btn-top" aria-label="返回" @click="router.back()">← 返回</button>
    <h1 class="title">单机 AI 模式</h1>
    <p class="subtitle">无网络,3 个 AI 对手,适合练手</p>

    <!-- ★ v0.4.28 P1-4:生涯模式 — 从 2 打到 A 的爬梯,离线进度 -->
    <div class="career-card">
      <div class="career-head">
        <h2 class="career-title">生涯模式</h2>
        <span class="career-record">{{ career.wins }} 胜 {{ career.losses }} 负</span>
      </div>
      <div class="career-ladder" aria-label="生涯爬梯进度">
        <span
          v-for="(lv, i) in ladder"
          :key="lv"
          class="ladder-node"
          :class="{ done: i < career.levelIndex, current: i === career.levelIndex }"
        >{{ lv }}</span>
      </div>
      <div class="career-opponent">
        <span class="opponent-label">当前对手</span>
        <span class="opponent-name">{{ opponent.name }}</span>
        <span class="opponent-trait">{{ opponent.trait }}</span>
      </div>
      <button class="career-btn" @click="onStartCareer">
        {{ isChamp ? '👑 卫冕之战' : '⚔️ 生涯对战' }} · 打 {{ careerLabel }}
      </button>
    </div>

    <div class="config-card">
      <h2 class="config-title">对局配置</h2>
      <div class="config-row">
        <span class="config-label">起始级牌</span>
        <div class="config-options">
          <button v-for="lv in levelOptions" :key="lv.rank"
            class="config-chip" :class="{ active: levelRank === lv.rank }"
            @click="levelRank = lv.rank">打 {{ lv.label }}</button>
        </div>
      </div>
      <!-- ★ v0.4.9:AI 难度选择(medium 默认 / hard 防守+炸弹保留) -->
      <div class="config-row">
        <span class="config-label">AI 难度</span>
        <div class="config-options">
          <button
            class="config-chip"
            :class="{ active: difficulty === 'medium' }"
            @click="setDifficulty('medium')">
            中等
            <small class="chip-hint">规则 + 贪心</small>
          </button>
          <button
            class="config-chip"
            :class="{ active: difficulty === 'hard' }"
            @click="setDifficulty('hard')">
            困难
            <small class="chip-hint">防守 + 炸弹保留</small>
          </button>
        </div>
      </div>
    </div>
    <div class="action">
      <button class="action-btn" @click="onStart">开始对局</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import storage from '@/common/storage.js'
import {
  getCareer, careerLevelRank, careerLevelLabel, careerOpponent,
  careerDifficulty, careerLadder, isChampion,
} from '@/common/career.js'
const router = useRouter()
// ★ v0.4.28 P1-4:生涯进度(每次进页重读,保证从对局页返回后是最新)
const career = ref(getCareer())
const ladder = careerLadder()
const careerLabel = computed(() => careerLevelLabel(career.value))
const opponent = computed(() => careerOpponent(career.value))
const isChamp = computed(() => isChampion(career.value))
function onStartCareer() {
  router.push(`/game?levelRank=${careerLevelRank(career.value)}&ai=1&difficulty=${careerDifficulty(career.value)}&career=1`)
}
const levelRank = ref(15)
const levelOptions = [
  { rank: 3, label: '3' },
  { rank: 5, label: '5' },
  { rank: 7, label: '7' },
  { rank: 10, label: '10' },
  { rank: 15, label: '2' },
]
// ★ v0.4.9:AI 难度,默认从 SettingsView 持久化的 storage.aiDifficulty 读
//   旧版写死 ref('medium') — 用户上次选 hard 会被覆盖;现在尊重全局默认
const difficulty = ref('medium')
onMounted(() => {
  const s = storage.getSettings()
  if (s.aiDifficulty === 'medium' || s.aiDifficulty === 'hard') {
    difficulty.value = s.aiDifficulty
  }
})
// 切换时立刻持久化(AIView 改 → SettingsView 也会跟着变,反之亦然)
function setDifficulty(id) {
  if (id !== 'medium' && id !== 'hard') return
  difficulty.value = id
  storage.setSettings({ aiDifficulty: id })
}
function onStart() {
  router.push(`/game?levelRank=${levelRank.value}&ai=1&difficulty=${difficulty.value}`)
}
</script>

<style scoped>
.page { position: relative; min-height: 100vh; background: #080b16; padding: 70px 20px 30px; overflow: hidden; }
/* ★ v0.4.24:左上角返回按钮 */
.back-btn-top {
  position: absolute; top: 18px; left: 18px; z-index: 2;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
  color: #fff; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer;
}
.back-btn-top:hover { background: rgba(255,255,255,0.18); }
.bg { z-index: 0; }
.title, .subtitle, .config-card, .action { position: relative; z-index: 1; }
.title { font-size: 28px; font-weight: 900; color: #fff; text-align: center; text-shadow: 0 3px 12px rgba(0,0,0,0.35); }
.subtitle { font-size: 13px; color: rgba(255,255,255,0.7); text-align: center; margin-top: 6px; }
.config-card {
  background: linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.07));
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 12px;
  padding: 20px;
  margin-top: 24px;
  color: #fff;
  box-shadow: 0 18px 38px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18);
  backdrop-filter: blur(14px);
}
.config-title { font-size: 17px; font-weight: 800; margin-bottom: 14px; color: #ffe37c; }
.config-label { font-size: 14px; color: rgba(255,255,255,0.75); display: block; margin-bottom: 8px; }
.config-options { display: flex; flex-wrap: wrap; gap: 8px; }
.config-chip {
  background: rgba(4, 8, 22, 0.36);
  color: #fff;
  padding: 6px 14px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
}
.config-chip.active {
  background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%);
  color: #3a2308;
  border-color: rgba(255,255,255,0.7);
  box-shadow: 0 8px 18px rgba(255, 178, 24, 0.28);
}
.chip-hint {
  display: block;
  font-size: 10px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 2px;
  letter-spacing: 0;
}
.config-chip.active .chip-hint {
  color: var(--gold-primary, #d4af37);
}
.action { margin-top: 24px; }
.action-btn {
  width: 100%; height: 56px;
  background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%);
  color: #3a2308;
  border: none; border-radius: 12px;
  font-size: 17px; font-weight: 900;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(255, 178, 24, 0.38), inset 0 1px 0 rgba(255,255,255,0.72);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
}

/* ====== ★ v0.4.28 P1-4:生涯模式卡片 ====== */
.career-card {
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(31, 122, 85, 0.4), rgba(10, 61, 44, 0.85) 65%),
    rgba(4, 8, 22, 0.4);
  border: 1.5px solid var(--gold-primary);
  border-radius: 14px;
  padding: 18px 20px;
  margin-top: 22px;
  color: #fff;
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.3), 0 0 28px rgba(212, 175, 55, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.career-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.career-title { margin: 0; font-size: 17px; font-weight: 900; letter-spacing: 2px; color: var(--gold-bright); }
.career-record { font-size: 12px; font-weight: 700; color: rgba(255, 255, 255, 0.7); background: rgba(255, 255, 255, 0.08); padding: 3px 10px; border-radius: 999px; }
.career-ladder { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 14px; }
.ladder-node {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 26px; height: 26px; padding: 0 4px;
  border-radius: 7px;
  font-size: 12px; font-weight: 800;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.4);
}
.ladder-node.done {
  background: rgba(212, 175, 55, 0.22);
  border-color: rgba(212, 175, 55, 0.5);
  color: var(--gold-bright);
}
.ladder-node.current {
  background: var(--gold-metallic);
  border-color: #fff8dc;
  color: #2a1d08;
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
  transform: scale(1.12);
}
.career-opponent { display: flex; align-items: baseline; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.opponent-label { font-size: 11px; color: rgba(255, 255, 255, 0.5); }
.opponent-name { font-size: 15px; font-weight: 900; color: #fff; letter-spacing: 1px; }
.opponent-trait { font-size: 12px; color: rgba(255, 255, 255, 0.6); }
.career-btn {
  width: 100%; height: 52px;
  background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%);
  color: #3a2308;
  border: none; border-radius: 26px;
  font-size: 16px; font-weight: 900; letter-spacing: 2px;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(233, 173, 63, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  transition: transform var(--t-fast) var(--ease-out), filter 160ms var(--ease-out);
}
.career-btn:hover { filter: brightness(1.06); }
.career-btn:active { transform: scale(0.98); }
</style>
