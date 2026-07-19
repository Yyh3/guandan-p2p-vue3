<template>
  <div class="page">
    <div class="bg app-half-table-bg"></div>
    <!-- ★ v0.4.24:补返回入口(原来是纯死端页面) -->
    <button class="back-btn-top" aria-label="返回" @click="router.back()">← 返回</button>
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
import { useRouter } from 'vue-router'
const router = useRouter()
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
  // ★ v0.4.24 修复:步骤文案与现 UI 对齐(旧版按钮名已不存在,
  //   真机也没有"输入房间号"入口,会把新用户带进死路)
  { title: '打开 APP,4 人开局', lines: [
    '· 房主:首页点"开始游戏" → 创建房间,展示二维码 / 本机 IP',
    '· 其他人:首页点"加入房间" → 扫码,或手动输入房主 IP:端口',
    '· (浏览器试玩:输入房主显示的 6 位房间号加入)',
    '· 4 人齐 → 3 位加入者点"准备" → 房主切牌后自动开局',
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
.page { position: relative; min-height: 100vh; background: #080b16; padding: 70px 20px 30px; overflow: hidden; }
/* ★ v0.4.24:左上角返回按钮 */
.back-btn-top {
  position: absolute; top: 18px; left: 18px; z-index: 2;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
  color: #fff; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer;
}
.back-btn-top:hover { background: rgba(255,255,255,0.18); }
.bg { z-index: 0; }
.title, .subtitle, .step-card, .rules-card { position: relative; z-index: 1; }
.title { font-size: 28px; font-weight: 900; color: #fff; text-align: center; text-shadow: 0 3px 12px rgba(0,0,0,0.35); }
.subtitle { font-size: 13px; color: rgba(255,255,255,0.7); text-align: center; margin-top: 6px; }
.step-card {
  background: linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.07));
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 12px;
  padding: 18px;
  margin-top: 16px;
  display: flex; gap: 14px;
  color: #fff;
  box-shadow: 0 18px 38px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18);
  backdrop-filter: blur(14px);
}
.step-num {
  flex-shrink: 0;
  width: 36px; height: 36px;
  background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%);
  color: #3a2308;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: bold;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
  box-shadow: 0 8px 18px rgba(255, 178, 24, 0.32), inset 0 1px 0 rgba(255,255,255,0.72);
}
.step-body { flex: 1; }
.step-title { font-size: 16px; font-weight: 800; margin-bottom: 8px; color: #ffe37c; }
.step-content p { font-size: 13px; color: rgba(255,255,255,0.78); line-height: 1.7; }
.rules-card {
  background: linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.07));
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 12px;
  padding: 20px;
  margin-top: 16px;
  color: #fff;
  box-shadow: 0 18px 38px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18);
  backdrop-filter: blur(14px);
}
.rules-title { font-size: 17px; font-weight: 800; margin-bottom: 12px; color: #ffe37c; }
.rule-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
.rule-item:last-child { border-bottom: none; }
.rule-label { flex-shrink: 0; font-size: 13px; color: #ffe37c; font-weight: bold; width: 60px; }
.rule-text { flex: 1; font-size: 13px; color: rgba(255,255,255,0.8); line-height: 1.5; }
</style>
