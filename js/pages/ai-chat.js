/* ai-chat.html 页面脚本（依赖 boot.js → data.js → common.js → shared/ai-analytics.js）
   回答流程：识别问题 → 在研究数据库中检索与计算 → 「深度思考」流式输出推理过程 → 流式输出正文（表格、要点、跳转链接）。 */
"use strict";
shell('ai');
const params = new URLSearchParams(location.search);
const cohortFilters = filtersFromParams(params);
const hasCohort = params.get('scope') === 'cohort' && filterChips(cohortFilters).length > 0;
let scope = hasCohort ? 'cohort' : 'all', current = params.get('id') ? patientById(params.get('id')) : null;
if (current) scope = 'patient';

$('#scope-all-note').textContent = `${fmtN(patients.length)} 位患者 · ${new Set(patients.map(p => p.center)).size} 家中心`;
if (hasCohort) {
  $('#scope-cohort-wrap').hidden = false;
  $('#scope-cohort-note').textContent = `${applyFilters(cohortFilters).length} 位 · ${filterChips(cohortFilters).map(c => c.label).join('、')}`;
}
document.querySelector(`input[name=scope][value="${scope}"]`).checked = true;
$('#patient-picker').hidden = scope !== 'patient';
if (current) $('#picker').value = current.name;

// ---- 工具 ----
const T = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const cohortLink = (f, text = '在队列分析中打开') => { const q = filtersToQuery(f); return `<p><a href="ai-cohort.html${q ? '?' + q : ''}">${text} →</a></p>`; };
const pLink = p => `<a href="patient-insight.html?id=${encodeURIComponent(p.id)}&from=ai">${escapeHTML(p.name)}</a>`;
const N = n => fmtN(n);
const scopeList = () => scope === 'cohort' ? applyFilters(cohortFilters) : patients;
const scopeName = () => scope === 'cohort' ? '当前队列' : '研究数据库';
const firstLast = p => { const v = (aiOf(p).series || []).filter(x => x.das != null); return v.length >= 2 ? { f: v[0], l: v.at(-1), d: v.at(-1).das - v[0].das } : null; };
const isUnique = p => patients.filter(x => x.name === p.name).length === 1;
// 演示用的典型患者：换药后改善 / 治疗后恶化（按固定规则选出，每次一致）
const SHOW = {
  good: patients.find(p => p._m && p._m.traj === 'switch' && p.visits >= 8 && !p.lost && isUnique(p) && aiOf(p).dasNow != null && aiOf(p).dasNow <= 3.2 && firstLast(p)?.d <= -1.8),
  bad: patients.find(p => p._m && p._m.traj === 'worsen' && p.visits >= 6 && !p.lost && isUnique(p) && aiOf(p).dasNow > 5.1 && p._m.visits.some(v => v.trigger))
};

// ---- 预设问题：识别关键词 → 计算 → 思考 + 正文 ----
const SCRIPTS = [
  { id: 'overview', title: '研究数据库整体情况', q: '目前研究数据库的整体情况怎么样？', test: t => /整体|总体|概况|基本情况|整体情况|总览|现状/.test(t) && !/治疗|方案|证型/.test(t), run: overview },
  { id: 'tx', title: '各治疗方案达标率对比', q: '不同治疗方案 6 个月的达标率有什么差异？', test: t => /(治疗方案|治疗组|各组|方案|药物|生物制剂|JAK|TNF).*(达标|疗效|效果|差异|对比|比较)|(达标|疗效).*(方案|治疗组|对比)/i.test(t), run: byTreatment },
  { id: 'worse', title: '治疗后病情加重的患者', q: '哪些患者治疗后病情反而加重了？可能是什么原因？', test: t => /(加重|恶化|变差|变坏|反弹|复发)/.test(t) && !/^.{0,3}$/.test(t), run: worsened },
  { id: 'better', title: '病情改善的患者特征', q: '病情明显改善的患者有什么共同特征？', test: t => /(改善|好转|变好|缓解率|应答好)/.test(t) && /(特征|共同|哪些|什么样|规律)/.test(t), run: improved },
  { id: 'fm', title: '纤维肌痛对 DAS28 的影响', q: '合并纤维肌痛对 DAS28 评估有什么影响？', test: t => /纤维肌痛|FM/i.test(t), run: fmEffect },
  { id: 'ild', title: '间质性肺病患者用药', q: '合并间质性肺病的患者用药情况如何？', test: t => /间质性肺|肺间质|ILD|肺部/i.test(t), run: ild },
  { id: 'tcm', title: '中医证型与疗效', q: '不同中医证型的患者疗效有差异吗？', test: t => /证型|辨证|中医|湿热|寒湿|肝肾|痹阻/.test(t), run: syndrome },
  { id: 'lgt', title: '雷公藤多苷的肝功能安全性', q: '使用雷公藤多苷的患者肝功能异常发生率是多少？', test: t => /雷公藤|肝功|肝损|转氨酶|安全性|不良反应|不良事件/.test(t), run: safety },
  { id: 'missing', title: '资料不完整的患者', q: '哪些患者的资料还不完整？', test: t => /缺失|不完整|待补全|资料不全|质控/.test(t), run: missing }
];
function overview() {
  const L = scopeList(), s = cohortStats(L), centers = new Set(L.map(p => p.center)).size, visits = L.reduce((a, p) => a + (p.visits || 0), 0);
  const fl = L.map(firstLast).filter(Boolean), better = fl.filter(x => x.d <= -0.6).length, worse = fl.filter(x => x.d >= 0.6).length;
  const cm = {}; L.forEach(p => comorbidCodes(p).forEach(c => cm[c] = (cm[c] || 0) + 1));
  const topCm = Object.entries(cm).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const bio = L.filter(p => aiOf(p).tx !== 'csDMARD').length, lost = L.filter(p => p.lost).length;
  return {
    think: `用户想了解${scopeName()}的整体情况。我从四个层面汇总：入组规模、人群特征、疾病活动与转归、合并疾病。\n\n规模：共 ${N(L.length)} 位患者，来自 ${centers} 家中心，累计 ${N(visits)} 次访视，人均 ${(visits / L.length).toFixed(1)} 次；已脱落 ${lost} 位。\n\n人群：女性占 ${s.female}%，年龄中位数 ${s.ageMedian} 岁，病程中位数 ${s.durationMedian} 年，血清学阳性 ${s.sero}%，这和 RA 的流行病学特征一致。\n\n疾病活动：最近一次评分可评估 ${N(s.evaluable)} 位，达标（DAS28 ≤ 3.2）${s.target}%。有两次及以上评分的 ${N(fl.length)} 位中，改善 ${N(better)} 位、加重 ${N(worse)} 位。\n\n合并疾病里最常见的是${topCm.map(([c]) => (COMORBIDITY_INFO[c] || {}).name || c).slice(0, 3).join('、')}。回答时先给结论，再用表格展示分布。`,
    html: `<p><b>${scopeName()}共纳入 ${N(L.length)} 位 RA 患者</b>，来自 ${centers} 家研究中心，累计完成 ${N(visits)} 次随访（人均 ${(visits / L.length).toFixed(1)} 次）。</p><h4>人群特征</h4><ul><li>女性 ${s.female}%，年龄中位数 ${s.ageMedian} 岁，病程中位数 ${s.durationMedian} 年</li><li>血清学阳性（RF / 抗 CCP）${s.sero}%，资料完整率 ${s.complete}%</li><li>当前使用生物制剂 / JAK 抑制剂 ${N(bio)} 位（${pct(bio, L.length)}%），其余以传统 DMARDs 联合中医药为主</li></ul><h4>疾病活动度（最近一次 DAS28-ESR）</h4>${T(['分层', '人数', '占比'], s.distNow.map(d => [d.label, N(d.n), pct(d.n, s.evaluable) + '%']))}<p>当前<b>达标率 ${s.target}%</b>。有两次以上评分的 ${N(fl.length)} 位患者中，入组以来<b>病情改善 ${N(better)} 位（${pct(better, fl.length)}%）</b>，稳定 ${N(fl.length - better - worse)} 位，加重 ${N(worse)} 位（${pct(worse, fl.length)}%）。</p><h4>常见合并疾病</h4>${T(['疾病', '人数', '患病率'], topCm.map(([c, n]) => [`${(COMORBIDITY_INFO[c] || {}).name || c}`, N(n), pct(n, L.length) + '%']))}<p class="ai-ref">数据截至 ${ymd(TODAY)} · 统计口径与数据看板一致</p><p><a href="dashboard.html">查看数据看板 →</a></p>`
  };
}
function byTreatment() {
  const L = scopeList(), now = cohortStats(L), six = cohortStats(L, '6m');
  const good = tx => { const g = L.map(aiOf).filter(a => a.tx === tx && a.das6 != null && a.das0 != null); return { n: g.length, r: pct(g.filter(a => a.das0 - a.das6 >= 1.2 && a.das6 <= 3.2).length, g.length) }; };
  const rows = AI_TX_ORDER.map(tx => { const a = now.byTx.find(x => x.tx === tx), b = six.byTx.find(x => x.tx === tx), e = good(tx); return { tx, n: a.n, now: a.rate, six: b.n ? b.rate : null, n6: b.n, good: e.r, das: a.dasMean }; }).filter(r => r.n);
  const best = rows.filter(r => r.n6 >= 30).sort((x, y) => (y.six ?? 0) - (x.six ?? 0));
  const cs = rows.find(r => r.tx === 'csDMARD');
  return {
    think: `用户想比较不同治疗方案的疗效。"6 个月达标率"的口径是：当前方案使用满 6 个月的患者中，第 6 个月左右（4.5–8 个月窗口）那次 DAS28-ESR ≤ 3.2 的比例。\n\n按当前方案分组：${rows.map(r => `${r.tx} ${N(r.n)} 位`).join('，')}。满 6 个月可评估的人数分别是 ${rows.map(r => `${r.tx} ${N(r.n6)}`).join('、')}。\n\n${best.length ? `6 个月达标率最高的是 ${best[0].tx}（${best[0].six}%），最低的是 ${best.at(-1).tx}（${best.at(-1).six}%）。` : ''}要注意，换到生物制剂 / JAK 抑制剂的多是传统药物疗效不佳的患者，基线疾病活动更高、病程更长，所以组间差异不能直接解读为药物疗效差异。我把 EULAR 良好应答率也列出来作为补充。`,
    html: `<p>按<b>当前治疗方案</b>分组，各组达标情况如下（DAS28-ESR ≤ 3.2）：</p>${T(['治疗方案', '患者数', '6 个月达标率', 'EULAR 良好应答', '当前达标率', '当前 DAS28 均值'], rows.map(r => [r.tx, N(r.n), r.six == null ? '—' : `${r.six}%<small>（n=${N(r.n6)}）</small>`, r.n6 ? r.good + '%' : '—', r.now + '%', fmt1(r.das)]))}<h4>解读</h4><ul>${best.length ? `<li>6 个月达标率 <b>${best[0].tx} 最高（${best[0].six}%）</b>，${best.at(-1).tx} 最低（${best.at(-1).six}%）。</li>` : ''}${cs ? `<li>csDMARD 组人数最多（${N(cs.n)} 位），多为初始治疗的患者，联合中成药 / 中药饮片比例较高。</li>` : ''}<li>生物制剂 / JAK 抑制剂组多为<b>二线及以上</b>治疗，基线疾病活动更高，组间比较存在明显的指征偏倚。</li></ul><p>如需评估真实疗效差异，建议在队列分析中按基线 DAS28、病程和治疗线数分层，或进一步做倾向评分匹配。</p><p class="ai-ref">EULAR 良好应答：DAS28 较方案起始下降 &gt; 1.2 且 6 个月时 ≤ 3.2 · 观察性数据，未做多因素校正</p>${cohortLink({ ...AI_FILTER_DEFAULT, at: '6m' })}`
  };
}
function worsened() {
  const L = scopeList().map(p => ({ p, x: firstLast(p) })).filter(o => o.x && o.x.d >= 0.6).sort((a, b) => b.x.d - a.x.d);
  const total = scopeList().map(firstLast).filter(Boolean).length;
  const trig = {}; let withTrig = 0, escalated = 0, fm = 0, lowAdh = 0;
  L.forEach(({ p }) => { const ts = p._m ? p._m.visits.filter(v => v.trigger).map(v => v.trigger) : []; if (ts.length) withTrig++; new Set(ts).forEach(k => trig[k] = (trig[k] || 0) + 1); if (p._m && p._m.phases.length > 1) escalated++; if (comorbidCodes(p).includes('FM')) fm++; if (ts.some(k => ['stop', 'reduce', 'irregular'].includes(k))) lowAdh++; });
  const tr = Object.entries(trig).sort((a, b) => b[1] - a[1]);
  const top = L.slice(0, 6);
  return {
    think: `用户想找出治疗后病情加重的患者并分析原因。"加重"的口径：入组以来首末两次 DAS28-ESR 上升 ≥ 0.6（EULAR 定义的有临床意义的变化）。\n\n在 ${N(total)} 位有两次以上评分的患者中，符合的有 ${N(L.length)} 位，占 ${pct(L.length, total)}%。\n\n原因方面，我查了这些患者病史里记录的"加重诱因"：${withTrig} 位有明确诱因，其中${tr.slice(0, 3).map(([k, n]) => `${TRIGGER_TXT[k]} ${n} 位`).join('、')}。停药、减药、间断服药这类依从性问题合计 ${lowAdh} 位，是最主要的因素。\n\n另外 ${fm} 位合并纤维肌痛，DAS28 升高可能部分来自压痛和主观评分，而不完全是炎症加重。已有 ${escalated} 位在加重后调整了方案。我把加重幅度最大的几位列出来，方便逐个查看。`,
    html: `<p>入组以来 DAS28-ESR 上升 ≥ 0.6 的患者共 <b>${N(L.length)} 位</b>，占可评估患者的 ${pct(L.length, total)}%。</p><h4>可能原因（来自病史中记录的加重诱因）</h4>${T(['诱因', '患者数', '占加重患者'], tr.map(([k, n]) => [TRIGGER_TXT[k], n, pct(n, L.length) + '%']).concat([['未记录明确诱因', L.length - withTrig, pct(L.length - withTrig, L.length) + '%']]))}<ul><li><b>用药依从性是最主要因素：</b>自行停药、减药或间断服药共 ${lowAdh} 位（${pct(lowAdh, L.length)}%），建议加强用药宣教和随访提醒。</li><li><b>感染与劳累：</b>感染后暂停免疫抑制剂、过度劳累后疾病活动反弹较常见。</li><li><b>评分干扰：</b>${fm} 位合并纤维肌痛，DAS28 升高可能部分来自压痛关节数和总体评价，建议结合 CRP、SJC28 复核。</li><li><b>处理情况：</b>${escalated} 位（${pct(escalated, L.length)}%）已升级为生物制剂或 JAK 抑制剂。</li></ul><h4>加重幅度最大的患者</h4>${T(['患者', '研究编号', 'DAS28 首次 → 最近', '变化', '当前方案'], top.map(({ p, x }) => [pLink(p), escapeHTML(p.code), `${x.f.das.toFixed(2)} → ${x.l.das.toFixed(2)}`, `<b style="color:#c2413a">+${x.d.toFixed(2)}</b>`, escapeHTML(aiOf(p).drug)]))}<p><a href="patients.html?trend=worse">在患者列表中查看全部 ${N(L.length)} 位 →</a></p><p class="ai-ref">诱因为医生在随访病史中勾选的记录，仅提示时间关联，不代表因果</p>`
  };
}
function improved() {
  const all = scopeList().map(p => ({ p, x: firstLast(p) })).filter(o => o.x), G = all.filter(o => o.x.d <= -1.2), O = all.filter(o => o.x.d > -1.2);
  const r = (arr, f) => pct(arr.filter(f).length, arr.length);
  const feat = [['早期患者（病程 ≤ 2 年）', o => aiOf(o.p).duration <= 2], ['血清学阳性', o => aiOf(o.p).sero], ['联合中成药', o => o.p._m && o.p._m.patentKey], ['联合中药饮片', o => o.p._m && o.p._m.useHerbal], ['合并纤维肌痛', o => comorbidCodes(o.p).includes('FM')], ['基线高疾病活动', o => o.x.f.das > 5.1]];
  return {
    think: `用户想知道病情明显改善的患者有什么共同特征。我把"明显改善"定义为入组以来 DAS28-ESR 下降 > 1.2（EULAR 良好应答幅度），共 ${N(G.length)} 位，对照组是其余 ${N(O.length)} 位。\n\n逐项比较两组的特征比例：${feat.map(([n, f]) => `${n} ${r(G, f)}% vs ${r(O, f)}%`).join('；')}。\n\n这里要注意回归均值：基线越高，下降空间越大，所以"基线高活动"在改善组里比例更高是预期内的。合并纤维肌痛在改善组里明显更少，和 FM 抬高评分的机制一致。`,
    html: `<p>入组以来 DAS28-ESR 下降 &gt; 1.2 的患者共 <b>${N(G.length)} 位</b>（占可评估患者 ${pct(G.length, all.length)}%）。与其他患者对比：</p>${T(['特征', `明显改善（${N(G.length)} 位）`, `其他（${N(O.length)} 位）`, '差异'], feat.map(([n, f]) => { const a = r(G, f), b = r(O, f); return [n, a + '%', b + '%', `${a - b > 0 ? '+' : ''}${a - b} 个百分点`]; }))}<ul><li><b>病程越短，改善越明显</b>，符合"机会窗口期"早期达标治疗的理念。</li><li>联合中成药或中药饮片的患者在改善组中占比更高，可作为中西医结合疗效研究的线索，但需要校正基线差异后再下结论。</li><li>合并纤维肌痛的患者在改善组中明显更少，评分下降受 FM 相关疼痛影响。</li></ul><p class="ai-ref">描述性比较，未做显著性检验与多因素校正</p><p><a href="patients.html?trend=better">查看病情改善的患者 →</a></p>`
  };
}
function fmEffect() {
  const L = scopeList(), fm = subgroupFM(L);
  if (fm.nFM < 3) return { think: '用户问纤维肌痛的影响，但当前范围内合并 FM 的患者太少，无法做亚组对比。', html: `<p>${scopeName()}中合并纤维肌痛的患者不足 3 位，暂时无法做亚组对比。</p>` };
  const rw = Object.fromEntries(fm.rows.map(x => [x.label, x]));
  const dD = rw['当前 DAS28'].fm - rw['当前 DAS28'].other, dT = rw['压痛关节数 TJC28'].fm - rw['压痛关节数 TJC28'].other, dS = rw['肿胀关节数 SJC28'].fm - rw['肿胀关节数 SJC28'].other, dC = rw['CRP (mg/L)'].fm - rw['CRP (mg/L)'].other;
  return {
    think: `用户关心纤维肌痛（FM）对 DAS28 评估的影响。思路是把合并 FM 的 ${N(fm.nFM)} 位和未合并的 ${N(fm.nOther)} 位比较 DAS28 及其各组成项。\n\nDAS28 均值 FM 组高 ${dD.toFixed(2)}。拆开看：压痛关节数高 ${dT.toFixed(1)} 个，肿胀关节数只差 ${dS.toFixed(1)} 个，CRP 差 ${dC.toFixed(1)} mg/L，疼痛 VAS 也明显更高。\n\n这说明 FM 组 DAS28 偏高主要来自压痛和主观评分，而不是客观炎症。这和文献报道一致：FM 会让 DAS28 高估 RA 的炎症活动，可能导致不必要的治疗升级。`,
    html: `<p>合并纤维肌痛（${N(fm.nFM)} 位）与未合并（${N(fm.nOther)} 位）相比，<b>DAS28 平均高 ${dD.toFixed(2)}</b>，但差异主要来自<b>压痛关节数（+${dT.toFixed(1)}）和疼痛 VAS</b>，肿胀关节数（${dS >= 0 ? '+' : ''}${dS.toFixed(1)}）和 CRP（${dC >= 0 ? '+' : ''}${dC.toFixed(1)} mg/L）差别很小。</p>${T(['指标（均值）', '合并 FM', '未合并', '差值'], fm.rows.map(x => [x.label, x.fm.toFixed(x.d), x.other.toFixed(x.d), `${x.fm - x.other > 0 ? '+' : ''}${(x.fm - x.other).toFixed(x.d)}`]))}<h4>临床提示</h4><ul><li>合并 FM 时 DAS28 会<b>高估</b>RA 炎症活动，单看 DAS28 容易导致不必要的治疗升级。</li><li>建议同时参考 <b>SJC28、CRP</b>，或使用受主观因素影响较小的指标（如 SDAI 中的客观部分、关节超声）。</li><li>FM 相关疼痛更适合非药物干预（运动、认知行为治疗）及度洛西汀、普瑞巴林等药物。</li></ul><p class="ai-ref">描述性统计，未做显著性检验</p>${cohortLink({ ...AI_FILTER_DEFAULT, cm: 'FM' }, '查看合并 FM 的患者队列')}`
  };
}
function ild() {
  const L = scopeList(), G = L.filter(p => comorbidCodes(p).includes('RA-ILD')), O = L.filter(p => !comorbidCodes(p).includes('RA-ILD'));
  const sg = cohortStats(G), so = cohortStats(O);
  const cur = p => p._m ? p._m.phases[aiOf(p).series.length ? aiOf(p).series.at(-1).phase : 0] : null;
  const mtx = arr => pct(arr.filter(p => (cur(p)?.cs || '').includes('MTX')).length, arr.length);
  const txd = AI_TX_ORDER.map(tx => [tx, G.filter(p => aiOf(p).tx === tx).length]).filter(x => x[1]);
  const male = pct(G.filter(p => p.sex === '男').length, G.length), smoke = pct(G.filter(p => p._m && p._m.smoking !== 'never').length, G.length);
  const antiF = G.filter(p => /吡非尼酮|尼达尼布/.test(p.comorbid['RA-ILD'].treatment)).length;
  return {
    think: `用户问合并间质性肺病（RA-ILD）患者的用药情况。先找出档案中确诊 RA-ILD 的患者：${N(G.length)} 位，占 ${pct(G.length, L.length)}%。\n\n人群特征上，男性占 ${male}%（整体只有 ${pct(L.filter(p => p.sex === '男').length, L.length)}%），有吸烟史的占 ${smoke}%，年龄中位数 ${sg.ageMedian} 岁，比整体偏大。这符合 RA-ILD 的已知危险因素：男性、吸烟、高龄。\n\n用药方面，当前方案仍含甲氨蝶呤的占 ${mtx(G)}%，低于非 ILD 患者的 ${mtx(O)}%，说明医生在有意规避。抗纤维化治疗（吡非尼酮 / 尼达尼布）${antiF} 位。生物制剂中，阿巴西普在 ILD 患者里的使用更受推荐，可以把分布一起列出来。`,
    html: `<p>${scopeName()}中确诊<b>类风湿关节炎相关间质性肺病（RA-ILD）</b>的患者共 <b>${N(G.length)} 位</b>，占 ${pct(G.length, L.length)}%。</p><h4>人群特征</h4><ul><li>男性 ${male}%，有吸烟史 ${smoke}%，年龄中位数 ${sg.ageMedian} 岁——与男性、吸烟、高龄等已知危险因素一致</li><li>当前达标率 ${sg.target}%，低于非 ILD 患者（${so.target}%）</li></ul><h4>用药情况</h4>${T(['当前方案', '患者数', '占比'], txd.map(([tx, n]) => [tx, n, pct(n, G.length) + '%']))}<ul><li>当前方案含<b>甲氨蝶呤</b>的比例为 ${mtx(G)}%，低于非 ILD 患者（${mtx(O)}%），提示临床已在规避潜在肺毒性。</li><li>接受<b>抗纤维化治疗</b>（吡非尼酮 / 尼达尼布）${antiF} 位，其余以定期复查 HRCT 和肺功能为主。</li></ul><h4>用药建议（供参考）</h4><ul><li>2023 ACR / CHEST 指南：RA-ILD 患者可优先考虑<b>阿巴西普、利妥昔单抗</b>，JAK 抑制剂亦有一定证据；TNF 抑制剂需谨慎。</li><li>使用甲氨蝶呤、来氟米特前评估肺部基线，每 3–6 个月复查肺功能（FVC、DLCO）。</li></ul>${cohortLink({ ...AI_FILTER_DEFAULT, cm: 'RA-ILD' }, '查看 RA-ILD 患者队列')}`
  };
}
function syndrome() {
  const L = scopeList().filter(p => p._m), keys = Object.keys(SYN_LABEL);
  const rows = keys.map(k => { const g = L.filter(p => p._m.syn0 === k), fl = g.map(firstLast).filter(Boolean), s = cohortStats(g); return { k, n: g.length, imp: pct(fl.filter(x => x.d <= -1.2).length, fl.length), target: s.target, herbal: pct(g.filter(p => p._m.useHerbal).length, g.length), base: mean(fl.map(x => x.f.das)) }; }).filter(r => r.n).sort((a, b) => b.n - a.n);
  const hi = rows.slice().sort((a, b) => b.imp - a.imp)[0], lo = rows.slice().sort((a, b) => a.imp - b.imp)[0];
  const shift = L.filter(p => { const v = p._m.visits; return v.length >= 3 && synAt(p, v.at(-1)) !== p._m.syn0; }).length;
  return {
    think: `用户想知道不同中医证型的疗效差异。我按基线访视的主证分组，统计每组的"明显改善率"（DAS28 下降 > 1.2）和当前达标率。\n\n基线证型分布：${rows.slice(0, 4).map(r => `${SYN_LABEL[r.k]} ${N(r.n)} 位`).join('，')}……湿热痹阻证最多，这和 RA 活动期以湿热为主的认识一致。\n\n明显改善率最高的是${SYN_LABEL[hi.k]}（${hi.imp}%），最低的是${SYN_LABEL[lo.k]}（${lo.imp}%）。但各证型的基线疾病活动不同：实证组基线 DAS28 更高、下降空间更大，虚证组多见于病程长、活动度低的患者，所以这个差异要结合基线来看。\n\n另外随访中有 ${N(shift)} 位患者的证型发生了变化，多为活动期湿热证在缓解后转为肝肾不足或气血两虚，这也是中医"证随病变"的体现。`,
    html: `<p>按<b>基线中医主证</b>分组，各证型的疗效如下：</p>${T(['基线证型', '患者数', '基线 DAS28 均值', '明显改善率', '当前达标率', '使用中药饮片'], rows.map(r => [SYN_LABEL[r.k], N(r.n), fmt1(r.base), r.imp + '%', r.target + '%', r.herbal + '%']))}<h4>主要发现</h4><ul><li><b>湿热痹阻证</b>最常见，多处于疾病活动期，炎症指标高，经清热利湿 + 西药治疗后改善幅度较大。</li><li>明显改善率最高为<b>${SYN_LABEL[hi.k]}（${hi.imp}%）</b>，最低为${SYN_LABEL[lo.k]}（${lo.imp}%）；虚证组基线活动度较低，下降空间有限。</li><li>随访中 <b>${N(shift)} 位</b>患者证型发生转变，以"湿热 → 肝肾不足"最多，治法可相应由清热利湿转为补益肝肾。</li></ul><p>如需进一步验证中医证型对疗效的独立影响，建议按基线 DAS28 分层后比较，或将证型作为协变量纳入多因素模型。</p><p class="ai-ref">描述性比较 · 证型来自各次访视的中医诊断模块</p>`
  };
}
function safety() {
  const L = scopeList().filter(p => p._m), anyLiver = p => p._m.visits.some(v => v.liverAE);
  const grp = [['雷公藤多苷片（联合西药）', p => p._m.patentKey === 'LGT'], ['昆仙胶囊（联合西药）', p => p._m.patentKey === 'KXJ'], ['甲氨蝶呤（未用雷公藤类）', p => p._m.phases[0].cs.includes('MTX') && !['LGT', 'KXJ'].includes(p._m.patentKey)], ['来氟米特（未用雷公藤类）', p => p._m.phases[0].cs.includes('LEF') && !['LGT', 'KXJ'].includes(p._m.patentKey)], ['其他患者', p => !['LGT', 'KXJ'].includes(p._m.patentKey) && !/MTX|LEF/.test(p._m.phases[0].cs)]];
  const rows = grp.map(([n, f]) => { const g = L.filter(f), a = g.filter(anyLiver); return { n, total: g.length, ae: a.length, r: g.length ? (a.length / g.length * 100).toFixed(1) : '0.0' }; });
  const lg = rows[0], wbcLow = L.filter(p => p._m.patentKey === 'LGT' && p._m.visits.some(v => v.wbc != null && v.wbc < 3.5)).length;
  const lgF = L.filter(p => p._m.patentKey === 'LGT' && p.sex === '女' && aiOf(p).age < 50).length;
  return {
    think: `用户关心雷公藤多苷的肝功能安全性。肝功能异常的定义：随访期间任一次 ALT > 40 U/L，并在不良反应模块记录为"肝功异常"。\n\n使用雷公藤多苷片的患者共 ${N(lg.total)} 位，其中 ${lg.ae} 位出现过肝功能异常，发生率 ${lg.r}%。作为对照，单用甲氨蝶呤（不含雷公藤类）的是 ${rows[2].r}%，来氟米特 ${rows[3].r}%。\n\n雷公藤组的患者大多同时用甲氨蝶呤或来氟米特，两类药物都有肝毒性，所以不能把异常全部归因于雷公藤。另外雷公藤还需要关注白细胞减少和生殖毒性：白细胞 < 3.5 的有 ${wbcLow} 位；育龄期女性（< 50 岁）使用的有 ${lgF} 位，需要特别告知。`,
    html: `<p>使用<b>雷公藤多苷片</b>的患者共 <b>${N(lg.total)} 位</b>，随访期间发生肝功能异常（ALT &gt; 40 U/L）<b>${lg.ae} 位，发生率 ${lg.r}%</b>。</p>${T(['用药分组', '患者数', '肝功能异常', '发生率'], rows.map(r => [r.n, N(r.total), r.ae, r.r + '%']))}<h4>解读</h4><ul><li>雷公藤多苷组多数同时使用甲氨蝶呤 / 来氟米特，肝功能异常为<b>联合用药</b>下的发生率，不能单独归因。</li><li>多数肝功能异常为轻中度，经减量和保肝治疗后恢复，未见因肝损伤导致的严重不良事件。</li><li>白细胞降低（WBC &lt; 3.5×10⁹/L）${wbcLow} 位；育龄期女性使用 ${lgF} 位，需关注<b>生殖毒性</b>并做好知情告知。</li></ul><h4>监测建议</h4><ul><li>用药前查血常规、肝肾功能，用药后前 3 个月每 2–4 周复查，之后每 1–3 个月复查。</li><li>ALT 超过正常上限 3 倍时停药，1–3 倍时减量并加强监测。</li></ul><p class="ai-ref">肝功能异常来自不良反应模块与检验记录 · 观察性数据</p>`
  };
}
function missing() {
  const L = scopeList(), miss = L.filter(p => p.incomplete), by = {}; miss.forEach(p => by[p.missing] = (by[p.missing] || 0) + 1);
  const byC = {}; miss.forEach(p => byC[p.center] = (byC[p.center] || 0) + 1);
  const topC = Object.entries(byC).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    think: `用户想知道哪些患者资料不完整。按质控规则 QC-M01 ~ M04 检查基线访视：缺 DAS28 评分、缺基线检验、缺用药史、缺合并疾病记录。\n\n${scopeName()}共 ${N(miss.length)} 位资料待补全，占 ${pct(miss.length, L.length)}%。按缺失项：${Object.entries(by).map(([k, n]) => `${k} ${n} 位`).join('，')}。\n\n按中心看，缺失最多的是${topC[0] ? topC[0][0] : ''}。可以建议数据管理员按中心推送补录任务。`,
    html: `<p>${scopeName()}共 <b>${N(miss.length)} 位</b>患者资料待补全（占 ${pct(miss.length, L.length)}%），资料完整率 ${100 - pct(miss.length, L.length)}%。</p>${T(['缺失项', '人数', '对应质控规则'], Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n, QC_RULE_TXT[k] || '—']))}<h4>缺失较多的中心</h4>${T(['研究中心', '待补全患者'], topC.map(([c, n]) => [escapeHTML(c), n]))}<p>建议优先补录<b>基线 DAS28 评分和检验</b>，这两项直接影响疗效分析的样本量。</p><p><a href="data-quality.html">前往数据质控逐条定位补录 →</a></p>`
  };
}
const QC_RULE_TXT = { '缺 DAS28 评分': 'QC-M01', '缺基线检验': 'QC-M02', '缺合并疾病记录': 'QC-M03', '缺用药史': 'QC-M04' };

// ---- 通用回答：解析出筛选条件后统计 ----
function generic(q) {
  const { filters: qf, matched } = parseQuestion(q);
  const base = scope === 'cohort' ? { ...cohortFilters } : { ...AI_FILTER_DEFAULT };
  Object.keys(AI_FILTER_DEFAULT).forEach(k => { if (qf[k] && qf[k] !== AI_FILTER_DEFAULT[k]) base[k] = qf[k]; });
  const list = applyFilters(base), s = cohortStats(list, base.at), chips = filterChips(base).map(c => c.label);
  if (!matched.length) return {
    think: `用户的问题是"${q}"。我先尝试把它对应到研究数据库的字段：治疗方案、疾病活动度、合并疾病、性别年龄、资料完整性……这个问题里没有识别到明确的筛选条件。\n\n与其猜测用户意图，不如先给出${scopeName()}的关键数据作为参考，再提示可以怎样提问，便于下一步精确检索。`,
    html: `<p>这个问题我没有找到可以直接对应的数据字段。先给你${scopeName()}的关键数据作为参考：</p><ul><li>患者 ${N(list.length)} 位，女性 ${s.female}%，年龄中位数 ${s.ageMedian} 岁</li><li>当前达标率 ${s.target}%（DAS28-ESR ≤ 3.2）</li><li>资料完整率 ${s.complete}%</li></ul><p>你可以换一种问法，例如：</p><ul>${SCRIPTS.slice(0, 4).map(x => `<li><a href="#" data-q="${escapeHTML(x.q)}">${escapeHTML(x.q)}</a></li>`).join('')}</ul>`
  };
  const top = list.slice().sort((a, b) => (aiOf(b).dasNow ?? 0) - (aiOf(a).dasNow ?? 0)).slice(0, 6);
  return {
    think: `用户的问题是"${q}"。我识别到的条件是：${matched.join('、')}，对应筛选：${chips.join('、')}。\n\n在${scopeName()}中检索，符合条件的有 ${N(list.length)} 位。其中可评估疾病活动度的 ${N(s.evaluable)} 位，达标率 ${s.target}%，研究数据库整体是 ${cohortStats(patients, base.at).target}%。\n\n回答时给出人数、疾病活动分布，并列出疾病活动度最高的几位，方便直接点进去看病程。`,
    html: list.length ? `<p>符合「${escapeHTML(chips.join('、'))}」的患者共 <b>${N(list.length)} 位</b>，当前达标率 <b>${s.target}%</b>（研究数据库整体 ${cohortStats(patients, base.at).target}%）。</p>${T(['疾病活动分层', '人数', '占比'], s.distNow.map(d => [d.label, N(d.n), pct(d.n, s.evaluable) + '%']))}<h4>疾病活动度最高的患者</h4>${T(['患者', '当前方案', 'DAS28 方案起始 → 当前', 'CRP'], top.map(p => { const a = aiOf(p); return [pLink(p), `${a.tx}（${escapeHTML(a.drug)}）`, `${fmt1(a.das0)} → ${fmt1(dasAt(a, base.at))}`, fmt1(a.crpNow)]; }))}${cohortLink(base)}` : `<p>${scopeName()}中没有符合「${escapeHTML(chips.join('、'))}」的患者，可以放宽条件再试。</p>`
  };
}

// ---- 问题分发 ----
function findPatientIn(q) {
  if (SHOW.good && q.includes(SHOW.good.name)) return SHOW.good;
  if (SHOW.bad && q.includes(SHOW.bad.name)) return SHOW.bad;
  const hit = patients.filter(p => p.name.length >= 2 && q.includes(p.name));
  if (!hit.length) return null;
  return hit.sort((a, b) => b.visits - a.visits)[0];
}
function answer(q) {
  const t = q.replace(/\s+/g, '');
  const p = scope === 'patient' ? current : findPatientIn(t);
  if (scope === 'patient' && !current) return { think: '用户选择了单个患者范围，但还没有选定患者。', html: '<p>请先在左侧「单个患者」中选择一位患者，再针对病程提问。</p>' };
  if (p) {
    const same = patients.filter(x => x.name === p.name).length;
    const r = patientAnswer(p, /总结|概况|情况|病程|怎么样|如何/.test(t) && !/异常|指标|用药|治疗|证型|病史/.test(t) ? '总结' : t);
    if (same > 1 && scope !== 'patient') r.html = `<p class="ai-ref">研究数据库中有 ${same} 位同名患者，以下为随访次数最多的 ${escapeHTML(p.code)}（${escapeHTML(p.center)}）。</p>` + r.html;
    r.html += `<p><a href="patient-insight.html?id=${encodeURIComponent(p.id)}&from=ai">打开 ${escapeHTML(p.name)} 的病程分析 →</a></p>`;
    return r;
  }
  const s = SCRIPTS.find(x => x.test(t));
  return s ? s.run() : generic(q);
}

// ---- 对话 ----
const log = $('#chat-log'), welcome = $('#welcome');
const AVATAR = '<span class="avatar-ai"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 13.6 9l4.4 1.6-4.4 1.6L12 16.7l-1.6-4.5L6 10.6 10.4 9 12 4.5Z"/></svg></span>';
let ctl = null, turns = [];
const deepBtn = $('#deep-toggle'), dbBtn = $('#db-toggle');
[deepBtn, dbBtn].forEach(b => b.onclick = () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
const comp = aiComposer($('#chat-input'), $('#chat-send'), { onSend: q => ask(q), onStop: () => { if (ctl) ctl.stopped = true; } });
function sys(text) { welcome.hidden = true; log.insertAdjacentHTML('beforeend', `<div class="msg-sys">${escapeHTML(text)}</div>`); log.scrollTop = log.scrollHeight; }
function ask(q) {
  if (!q.trim() || $('#chat-send').classList.contains('stop')) return;
  welcome.hidden = true;
  log.insertAdjacentHTML('beforeend', `<div class="msg-user">${escapeHTML(q)}</div>`);
  const wrap = document.createElement('div'); wrap.className = 'msg-ai'; wrap.innerHTML = `${AVATAR}<div class="ai-body"></div>`; log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
  const box = wrap.querySelector('.ai-body');
  const run = () => {
    const r = answer(q); ctl = { stopped: false }; comp.busy(true);
    aiRespond(box, { think: r.think, html: r.html, deep: deepBtn.classList.contains('on'), sc: log, ctl, onDone: () => { comp.busy(false); $('#chat-input').focus(); } });
  };
  box._retry = () => { if (!$('#chat-send').classList.contains('stop')) run(); };
  run();
  if (!turns.length) addHistory(q);
  turns.push(q);
}
log.addEventListener('click', e => { const a = e.target.closest('a[data-q]'); if (a) { e.preventDefault(); ask(a.dataset.q); } });

// ---- 推荐问题与历史对话 ----
function drawSuggest() {
  const list = scope === 'patient'
    ? [['病程', '总结这位患者的病情变化'], ['检验', '哪些指标持续异常？'], ['治疗', '治疗方案历次如何调整？'], ['中医', '中医证型有什么变化？']]
    : [['总览', SCRIPTS[0].q], ['疗效', SCRIPTS[1].q], ['预后', SCRIPTS[2].q], ['中医', SCRIPTS[6].q], ['安全性', SCRIPTS[7].q], ['合并症', SCRIPTS[5].q]].concat(SHOW.good ? [['个案', `帮我总结一下患者${SHOW.good.name}的病程`]] : []).slice(0, 6);
  $('#suggest').innerHTML = list.map(([tag, q]) => `<button type="button" data-q="${escapeHTML(q)}"><small>${tag}</small>${escapeHTML(q)}</button>`).join('');
  $('#welcome-sub').textContent = scope === 'patient' && current ? `当前患者：${current.name}（${current.code}），可以针对病程、检验、用药和中医辨证提问` : '我可以帮你分析研究数据库中的患者数据，请把你的问题交给我吧～';
}
$('#suggest').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); });
const HISTORY = [['今天', []], ['7 天内', ['2026 年第三季度新入组患者特征', 'JAK 抑制剂治疗患者的血脂变化', '激素减停后复发的患者']], ['30 天内', ['广安门医院中心入组质量', '老年 RA 患者骨质疏松合并情况', '湿热痹阻证用药规律', 'TNFi 原发失效患者名单']]];
function drawHistory() { $('#history').innerHTML = HISTORY.filter(([, items]) => items.length).map(([g, items]) => `<p class="h-group">${g}</p>${items.map((t, i) => `<button type="button" class="${g === '今天' && i === 0 ? 'active' : ''}" data-h="${escapeHTML(t)}" title="${escapeHTML(t)}">${escapeHTML(t)}</button>`).join('')}`).join(''); }
function addHistory(q) { HISTORY[0][1].unshift(q.length > 18 ? q.slice(0, 18) + '…' : q); drawHistory(); }
$('#history').addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (!b || b.classList.contains('active')) return; toast('历史对话已归档，可在新对话中继续提问'); });
$('#new-chat').onclick = () => { if (ctl) ctl.stopped = true; log.querySelectorAll('.msg-user,.msg-ai,.msg-sys').forEach(x => x.remove()); welcome.hidden = false; turns = []; $('#history').querySelectorAll('.active').forEach(x => x.classList.remove('active')); $('#chat-input').focus(); };

document.querySelectorAll('input[name=scope]').forEach(r => r.addEventListener('change', e => {
  scope = e.target.value; $('#patient-picker').hidden = scope !== 'patient'; drawSuggest();
  if (scope === 'patient' && !current) $('#picker').focus();
  if (!welcome.hidden) return;
  sys(scope === 'patient' ? (current ? `已切换到患者：${current.name}` : '请选择一位患者') : scope === 'cohort' ? '已切换到当前队列' : '已切换到整个研究数据库');
}));
bindPatientPicker($('#picker'), $('#picker-list'), p => { current = p; $('#picker').value = p.name; drawSuggest(); if (welcome.hidden) sys(`已切换到患者：${p.name}（${p.code}）`); });

drawSuggest(); drawHistory();
if (params.get('q')) ask(params.get('q'));
