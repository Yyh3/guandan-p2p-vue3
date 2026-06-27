<template>
  <main class="restart-preview" aria-label="过 A 后重开一局演示">
    <div class="app-half-table-bg" aria-hidden="true"></div>

    <section class="score-strip" aria-label="本局结果概览">
      <div class="score-box current">
        <small>本局打</small>
        <strong>A</strong>
      </div>
      <div class="score-box">
        <small>升级</small>
        <strong>+1</strong>
      </div>
      <div class="score-box complete">
        <small>状态</small>
        <strong>已过 A</strong>
      </div>
    </section>

    <section class="result-panel app-panel">
      <div class="medal">A</div>
      <p class="eyebrow">本轮封顶完成</p>
      <h1>恭喜完成对局</h1>
      <p class="result-copy">
        当前级牌已从 A 过关，下一步不再继续升级牌局，而是由房主发起新一轮完整对局。
      </p>

      <div class="rank-row" aria-label="玩家名次">
        <article v-for="player in players" :key="player.label" class="rank-card">
          <span>{{ player.place }}</span>
          <strong>{{ player.label }}</strong>
          <small>{{ player.team }}</small>
        </article>
      </div>

      <div class="actions">
        <button class="primary app-gold-button">重开一局</button>
        <button class="secondary">返回大厅</button>
      </div>
    </section>
  </main>
</template>

<script setup>
const players = [
  { place: '头游', label: '本机玩家', team: '我方' },
  { place: '二游', label: '队友', team: '我方' },
  { place: '三游', label: '起风了', team: '对方' },
  { place: '末游', label: '用户3738', team: '对方' },
]
</script>

<style scoped>
.restart-preview {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  padding: clamp(18px, 4vw, 30px);
  color: #fff;
}

.score-strip,
.result-panel {
  position: relative;
  z-index: 1;
}

.score-strip {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin: 0 auto clamp(34px, 7vh, 72px);
}

.score-box {
  min-width: 86px;
  padding: 8px 16px;
  border-radius: 8px;
  text-align: center;
  background: rgba(11, 16, 36, 0.64);
  border: 1px solid rgba(255,255,255,0.16);
  box-shadow: 0 10px 22px rgba(0,0,0,0.28);
}

.score-box small {
  display: block;
  color: rgba(255,255,255,0.66);
  font-size: 12px;
}

.score-box strong {
  display: block;
  margin-top: 2px;
  color: #ffe37c;
  font-size: 22px;
  line-height: 1.1;
}

.score-box.current {
  background: linear-gradient(180deg, #ff8e21 0%, #fff0bc 48%, #fff 100%);
}

.score-box.current small,
.score-box.current strong {
  color: #b63f07;
}

.score-box.complete strong {
  color: #9df2ff;
}

.result-panel {
  width: min(520px, calc(100vw - 40px));
  margin: 0 auto;
  padding: 24px 22px 22px;
  border-radius: 16px;
  text-align: center;
}

.medal {
  width: 76px;
  height: 76px;
  margin: -58px auto 10px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 4px solid rgba(255,255,255,0.78);
  background:
    radial-gradient(circle at 36% 28%, #fff8cf 0 16%, transparent 17%),
    linear-gradient(145deg, #fff0a4, #f2b12c 48%, #9e5d08);
  color: #a12c07;
  font-size: 44px;
  font-weight: 900;
  box-shadow: 0 14px 28px rgba(0,0,0,0.34), 0 0 24px rgba(255,206,61,0.45);
}

.eyebrow {
  margin: 0 0 6px;
  color: #9df2ff;
  font-size: 13px;
  font-weight: 700;
}

h1 {
  margin: 0;
  color: #fff;
  font-size: clamp(28px, 5vw, 42px);
  line-height: 1.05;
  text-shadow: 0 3px 10px rgba(0,0,0,0.36);
}

.result-copy {
  width: min(420px, 100%);
  margin: 14px auto 20px;
  color: rgba(255,255,255,0.72);
  font-size: 14px;
  line-height: 1.7;
}

.rank-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 20px;
}

.rank-card {
  min-height: 78px;
  padding: 10px 6px;
  border-radius: 10px;
  background: rgba(3, 7, 20, 0.36);
  border: 1px solid rgba(255,255,255,0.12);
}

.rank-card span,
.rank-card small {
  display: block;
  color: rgba(255,255,255,0.62);
  font-size: 11px;
}

.rank-card strong {
  display: block;
  margin: 7px 0 3px;
  color: #fff;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.actions {
  display: flex;
  gap: 12px;
}

.actions button {
  flex: 1;
  height: 50px;
  border: 0;
  border-radius: 12px;
  font-size: 17px;
  font-weight: 800;
  cursor: pointer;
}

.secondary {
  color: rgba(255,255,255,0.86);
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.16);
}

@media (max-width: 520px) {
  .score-strip {
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .rank-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-height: 520px) and (orientation: landscape) {
  .restart-preview {
    padding: 12px 24px;
  }

  .score-strip {
    margin-bottom: 24px;
  }

  .score-box {
    min-width: 80px;
    padding: 6px 14px;
  }

  .score-box strong {
    font-size: 20px;
  }

  .result-panel {
    width: min(520px, calc(100vw - 48px));
    padding: 16px 20px 16px;
  }

  .medal {
    width: 58px;
    height: 58px;
    margin: -42px auto 6px;
    font-size: 34px;
    border-width: 3px;
  }

  .eyebrow {
    margin-bottom: 4px;
    font-size: 12px;
  }

  h1 {
    font-size: 32px;
  }

  .result-copy {
    margin: 8px auto 12px;
    font-size: 12px;
    line-height: 1.55;
  }

  .rank-row {
    gap: 8px;
    margin-bottom: 12px;
  }

  .rank-card {
    min-height: 56px;
    padding: 7px 6px;
  }

  .rank-card strong {
    margin: 4px 0 2px;
  }

  .actions button {
    height: 42px;
    font-size: 15px;
  }
}
</style>
