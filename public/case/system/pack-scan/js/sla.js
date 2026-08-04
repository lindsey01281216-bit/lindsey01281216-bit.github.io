// TikTok Shop Malaysia — 标准订单发货时限计算（纯函数，无依赖，Node/浏览器通用）
//
// 规则来源：Lindsey 整理的《TikTok_MY_全国配送时限表》· sheet②「标准订单 Standard」（生效 2025-05-12）
//   表1 迟发货 LDR：
//     工作日 00:00–12:00 下单 → 当天 23:59 前须 Shipped
//     工作日 12:00–23:59 下单 → 次一工作日 23:59
//     非工作日 全天下单       → 次一工作日 23:59
//   表2 自动取消 SFCR：
//     次一工作日 23:59 前须 Awaiting Collection
//     3 个工作日后 23:59 前须 Shipped
//
// ⚠️ 源表内部有一处不自洽，实现时按「表1/表2」为准，未采用时间轴那段：
//   表1 写「工作日上午下单 → 当天 23:59」，但下面「时间轴(Day 0 = 下单日)」写「Day1 23:59」。
//   两者要同时成立，只有当时间轴其实是 1-indexed（下单日算 Day1）才对得上，即标注的
//   「Day 0 = 下单日」本身写错了。表1 是主规则表，故以表1 为准。
//   → 这个判断必须拿平台自己的 latest_rts_time 对过才算坐实（见 README 的验证步骤）。
//
// 工作日定义（sheet①）：
//   Kedah / Kelantan / Terengganu：周日~周四为工作日
//   其余所有州（含 Johor）：周一~周五为工作日
//   两者都要再排除公共假期。
//   Johor 自 2025-01-01 由「周五六休」改回「周六日休」，与上面归类一致。

const SUN_THU_STATES = new Set(['Kedah', 'Kelantan', 'Terengganu']);

// TikTok 导出表里同一个州会有多种写法（实测：Malacca 与 Melaka 并存），必须先归一
const STATE_ALIAS = {
  'malacca': 'Melaka', 'melaka': 'Melaka',
  'penang': 'Penang', 'pulau pinang': 'Penang',
  'kuala lumpur': 'Kuala Lumpur', 'wp kuala lumpur': 'Kuala Lumpur', 'w.p. kuala lumpur': 'Kuala Lumpur',
  'putrajaya': 'Putrajaya', 'wp putrajaya': 'Putrajaya',
  'labuan': 'Labuan', 'wp labuan': 'Labuan',
  'negeri sembilan': 'Negeri Sembilan', 'n. sembilan': 'Negeri Sembilan',
  'johor': 'Johor', 'johore': 'Johor',
  'kedah': 'Kedah', 'kelantan': 'Kelantan', 'terengganu': 'Terengganu', 'trengganu': 'Terengganu',
  'selangor': 'Selangor', 'perak': 'Perak', 'pahang': 'Pahang', 'perlis': 'Perlis',
  'sabah': 'Sabah', 'sarawak': 'Sarawak',
};
function normState(s) {
  const k = String(s || '').trim().toLowerCase();
  return STATE_ALIAS[k] || String(s || '').trim();
}

// ── 日历 ─────────────────────────────────────────────
// holidays: Set<'YYYY-MM-DD'>（已含顺延日）
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function isWorkday(d, state, holidays) {
  if (holidays && holidays.has(ymd(d))) return false;
  const wd = d.getDay();                                  // 0=Sun … 6=Sat
  return SUN_THU_STATES.has(state) ? (wd >= 0 && wd <= 4) : (wd >= 1 && wd <= 5);
}
function nextWorkday(d, state, holidays) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return isWorkday(x, state, holidays) ? x : nextWorkday(x, state, holidays);
}
function addWorkdays(d, n, state, holidays) {
  let x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  for (let i = 0; i < n; i++) x = nextWorkday(x, state, holidays);
  return x;
}
const at2359 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0);
const at = (d, h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m || 0, 0);

// RTS 截止：必须点「安排发货」并把包裹交给快递的时间点。
// ⚠️ 这才是包装部门的真死线，比 LDR 的 23:59 早 10 小时。
// 实测依据（2026-07-30 对账 162 单，无一例外）：平台 latest_rts_time 一律是当日 14:00，
// 而我们按表1 算出的 23:59 日期与之完全一致 → 日期逻辑对，只是时间点应为 14:00。
// 覆盖面：这 162 单全部落在「工作日下午下单」。「工作日上午下单 → 当天 14:00」尚未实测，
// 是按同一规律外推的（与 SLA 表 NDD 页「12:00PM 前下单 → 当天 14:00 前安排发货」吻合）。
const RTS_HOUR = 14;

// ── 主计算 ───────────────────────────────────────────
// created: Date（下单时间，本地时区 MYT）
// state:   决定工作日日历的州。⚠️ 用**仓库所在州**，不是买家州——
//          LDR 罚的是卖家没按时发货，看的是卖家能不能干活。Hestia = Johor。
function shipDeadline(created, state, holidays) {
  const st = normState(state);
  const day = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const onWorkday = isWorkday(day, st, holidays);
  const ldr = (onWorkday && created.getHours() < 12)
    ? at2359(day)                                          // 表1 第1行：当天 23:59
    : at2359(nextWorkday(day, st, holidays));              // 表1 第2、3 行
  return {
    rtsDue: at(ldr, RTS_HOUR),                             // ← 作业死线：交给快递的截止（已对账实测）
    ldrDue: ldr,                                           // 超时 → 迟发货率 LDR（23:59，比 RTS 晚 10h）
    awaitingCollectionDue: at2359(nextWorkday(day, st, holidays)),
    autoCancelDue: at2359(addWorkdays(day, 3, st, holidays)), // 超时 → 自动取消 SFCR
    basis: onWorkday ? (created.getHours() < 12 ? '工作日上午' : '工作日下午') : '非工作日',
  };
}

// 相对 now 的紧急度分桶（沿用 Lindsey 在 toship_pull.py 里定的四档）
function bucket(due, now) {
  if (due < now) return 'overdue';
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dd = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diff = Math.round((dd - d0) / 86400000);
  return diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : 'later';
}
const BUCKET_LABEL = { overdue: '已逾期', today: '今天到期', tomorrow: '明天', later: '更晚' };

// 把 holidays JSON（data/holidays-johor.json）摊平成 Set，含顺延日
function loadHolidays(json) {
  const s = new Set();
  for (const h of (json && json.holidays) || []) {
    if (h.date) s.add(h.date);
    if (h.substitute) s.add(h.substitute);
  }
  return s;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normState, isWorkday, nextWorkday, addWorkdays, shipDeadline, bucket, BUCKET_LABEL, loadHolidays, ymd, SUN_THU_STATES };
}
