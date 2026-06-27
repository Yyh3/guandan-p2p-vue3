<template>
  <div class="page">
    <div class="bg"></div>
    <h1 class="title">新手引导</h1>
    <p class="subtitle">3 步搞定,4 人高铁/隧道也能开局</p>

    <div v-for="(step, i) in steps" :key="i" class="step-card">
      <div class="step-num">{{ i + 1 }}</div>
      <div class="step-body">
        <h2 class="step-title">{{ step.title }}</h2>
        <div class="step-content">
          <p v-for="(line, j) in step.lines" :key="j">{{ line }}</p>
        </div>
      </div>
    </div>

    <div class="rules-card">
      <h2 class="rules-title">规则速查</h2>
      <div v-for="rule in rules" :key="rule.label" class="rule-item">
        <span class="rule-label">{{ rule.label }}</span>
        <span class="rule-text">{{ rule.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
const steps = [
  { title: '其中一人开手机热点', lines: [
    '· 选一个手机当"房主",打开系统设置',
    '· 安卓:设置 → 网络 → 个人热点 → 打开',
    '· iOS:设置 → 个人热点 → 打开"允许其他人加入"',
    '· 关闭移动数据(避免偷跑流量,APP 本身不联网)',
    '· 记下热点名称和密码',
  ]},
  { title: '其他 3 人连这个热点', lines: [
    '· 其他人打开 WiFi 列表,连上房主的热点',
    '· 输密码 → 等出现"已连接"',
    '· 这一步也要关闭自己的移动数据',
  ]},
  { title: '打开 APP,4 人开局', lines: [
    '· 房主:打开 APP → "开热点建房" → 看到房间号',
    '· 其他人:打开 APP → "连热点加入" → 输入房间号',
    '· 4 人齐 → 房主点"开局" → 进对局',
  ]},
]
const rules = [
  { label: '基础', text: '2 副牌 108 张,4 人 2v2,对家为队友' },
  { label: '牌型', text: '单/对/三/三带二/顺子/三连对/钢板/4-8炸/同花顺/王炸' },
  { label: '牌序', text: '大王 > 小王 > 2 > A > K > Q > J > 10 > ... > 3' },
  { label: '炸弹', text: '4-8 张同 rank。张数越多越大' },
  { label: '同花顺', text: '5 张同花连续。比 5 炸大,比 6 炸小' },
  { label: '王炸', text: '4 张王(2 大 + 2 小)。最大牌' },
  { label: '逢人配', text: '红桃级牌 = 万能牌(除大小王)' },
  { label: '升级', text: '双上 +3 / 头+三 +2 / 头+末 +1 / 双下 +0' },
  { label: '进贡', text: '双下 → 输家两人各贡一张;单下 → 末贡给头' },
]
</script>

<style scoped>
.page { position: relative; min-height: 100vh; background: var(--bg-deep); padding: 70px 20px 30px; }
.bg { position: fixed; inset: 0; background:
    radial-gradient(circle at 30% 20%, rgba(255, 215, 0, 0.10), transparent 55%),
    radial-gradient(ellipse 95% 70% at 50% 55%,
      var(--emerald-bright, #1f7a55) 0%,
      var(--emerald-base, #14533b) 55%,
      var(--emerald-deep, #0a3d2c) 100%),
    linear-gradient(180deg, var(--bg-deep) 0%, var(--emerald-deep, #0a3d2c) 100%);
  box-shadow: var(--felt-inner-shadow, inset 0 0 80px rgba(0, 0, 0, 0.4)); }
.title, .subtitle, .step-card, .rules-card { position: relative; z-index: 1; }
.title { font-size: 28px; font-weight: bold; color: #fff; text-align: center; }
.subtitle { font-size: 13px; color: rgba(255,255,255,0.6); text-align: center; margin-top: 6px; }
.step-card {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 14px;
  padding: 18px;
  margin-top: 16px;
  display: flex; gap: 14px;
  color: #fff;
}
.step-num {
  flex-shrink: 0;
  width: 36px; height: 36px;
  background: var(--gold-metallic, linear-gradient(135deg, #ffd700 0%, #d4af37 50%, #a8862a 100%));
  color: #1a1a1a;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: bold;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.4);
}
.step-body { flex: 1; }
.step-title { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
.step-content p { font-size: 13px; color: rgba(255,255,255,0.75); line-height: 1.7; }
.rules-card {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 14px;
  padding: 20px;
  margin-top: 16px;
  color: #fff;
}
.rules-title { font-size: 17px; font-weight: bold; margin-bottom: 12px; }
.rule-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
.rule-item:last-child { border-bottom: none; }
.rule-label { flex-shrink: 0; font-size: 13px; color: #ffeb3b; font-weight: bold; width: 60px; }
.rule-text { flex: 1; font-size: 13px; color: rgba(255,255,255,0.8); line-height: 1.5; }
</style>
