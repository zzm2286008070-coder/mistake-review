// 错题回顾 —— 每日提醒推送发送端
// 由 GitHub Actions 每 30 分钟运行一次：读取 Gist 中的 reminder.json，
// 到设定时间且当天尚未发送时，通过 Web Push 发送提醒并刷新图标角标。
const webpush = require('web-push');

const GIST_TOKEN = process.env.GIST_TOKEN;
const GIST_ID = process.env.GIST_ID;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:zzm2286008070@users.noreply.github.com';
const REMIND_FN = 'reminder.json';

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

if (!GIST_TOKEN || !GIST_ID || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  fail('缺少环境变量（GIST_TOKEN / GIST_ID / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY）');
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

async function gist(method, body) {
  const url = 'https://api.github.com/gists/' + GIST_ID;
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + GIST_TOKEN,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'mistake-review-reminder'
    }
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error('Gist API ' + r.status + ': ' + ((j && j.message) || ''));
  }
  return j;
}

// 在指定时区下取当前本地时间的年月日/时分（用 en-US + timeZone 换算）
function partsInTz(tz) {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  return {
    Y: d.getFullYear(),
    M: d.getMonth() + 1,
    D: d.getDate(),
    h: d.getHours(),
    m: d.getMinutes()
  };
}
function dateStr(tz) {
  const p = partsInTz(tz);
  return p.Y + '-' + String(p.M).padStart(2, '0') + '-' + String(p.D).padStart(2, '0');
}
function hhmm(tz) {
  const p = partsInTz(tz);
  return String(p.h).padStart(2, '0') + ':' + String(p.m).padStart(2, '0');
}

(async () => {
  const g = await gist('GET');
  const f = g.files && g.files[REMIND_FN];
  if (!f || !f.content) {
    console.log('⏸ ' + REMIND_FN + ' 不存在，跳过');
    return;
  }

  let cfg;
  try { cfg = JSON.parse(f.content); } catch (e) { fail('reminder.json 解析失败'); }

  if (!cfg.enabled) {
    console.log('⏸ 提醒未开启，跳过');
    return;
  }
  if (!cfg.subscription || !cfg.subscription.endpoint) {
    console.log('⏸ 尚无推送订阅，跳过');
    return;
  }

  const tz = cfg.tz || 'Asia/Shanghai';
  const todayStr = dateStr(tz);
  const now = hhmm(tz);
  const time = cfg.time || '20:00';

  if (cfg.lastSent === todayStr) {
    console.log('⏸ 今天（' + todayStr + '）已发送过，跳过');
    return;
  }
  if (now < time) {
    console.log('⏸ 未到提醒时间（现在 ' + now + ' < ' + time + '），跳过');
    return;
  }

  const due = (typeof cfg.dueCount === 'number') ? cfg.dueCount : 0;
  const payload = JSON.stringify({
    title: '📝 错题回顾',
    body: due > 0
      ? ('今天有 ' + due + ' 道错题待复习，打开复习一下吧！')
      : '今天没有待复习的错题，继续保持！',
    badge: due,
    url: '.'
  });

  await webpush.sendNotification(cfg.subscription, payload, { TTL: 86400 });
  console.log('✅ 已发送提醒推送（due=' + due + '）');

  const newCfg = Object.assign({}, cfg, { lastSent: todayStr });
  await gist('PATCH', { files: { [REMIND_FN]: { content: JSON.stringify(newCfg) } } });
  console.log('✅ 已更新 lastSent=' + todayStr);
})().catch((e) => {
  fail(e && e.message ? e.message : String(e));
});
