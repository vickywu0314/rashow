/* patient-insight.html 页面脚本（依赖 boot.js → data.js → common.js → shared/ai-analytics.js）
   病程分析的所有数值都来自该患者的分析数据（与队列分析、研究数据对话同源），不再使用写死的示例。 */
"use strict";
document.addEventListener('DOMContentLoaded', () => {
  shell(pageOrigin().nav);
  const p = patientById(queryParam('id')), a = aiOf(p), pid = encodeURIComponent(p.id);
  document.title = `${p.name} · 病程分析 · 中国中医风湿病注册研究信息平台`;
  $('#patient-name').textContent = p.name + ' · 病程分析';
  $('#patient-meta').textContent = `研究编号 ${p.code} · ${p.sex} · ${a.age} 岁 · 病程 ${a.duration} 年 · ${a.sero ? 'RF / ACPA 阳性' : '血清学阴性'} · ${p.center} · ${(a.series || []).length} 次访视`;
  const fs = followupStatus(p); $('#fu-state').className = `patient-followup-state ${fs.tone}`; $('#fu-state').textContent = fs.label;

  // ---- 导航与返回 ----
  const o = pageOrigin(), fromAi = o.nav === 'ai';
  ['back-patient', 'visit-record'].forEach(id => document.getElementById(id).href = withFrom(`patient-visits.html?id=${pid}`));
  const crumb = $('#crumb-origin'); crumb.textContent = o.crumb; crumb.href = o.href;
  const back = $('#back-link');
  if (fromAi) { back.textContent = `← 返回${o.label}`; bindBack(back, o.href); } else back.href = withFrom(`patient-visits.html?id=${pid}`);
  $('#similar-detail').onclick = () => location.href = `ai-cohort.html?preset=similar&id=${pid}`;
  const ask = () => openAIChat({ scope: 'patient', patient: p });
  $('#ask-ai').onclick = ask; $('#ask-ai-2').onclick = ask;

  // ---- 无访视：只显示提示 ----
  const vs = a.series || [], withDas = vs.filter(v => v.das != null);
  if (withDas.length < 1) {
    document.querySelector('.target-strip').insertAdjacentHTML('beforebegin', `<p class="new-note">${escapeHTML(p.name)} 尚未完成含疾病活动度评分的访视，病程分析需要至少一次完整的 DAS28 评估。</p>`);
    document.querySelectorAll('.insight-grid,.target-strip,.evidence-panel,.trend-panel').forEach(el => el.hidden = true);
    return;
  }
  // ---- 时间点：当前方案起始 → 6 个月 → 最近一次访视 ----
  const ym = d => d.slice(0, 7).replace('-', '.');
  const lastV = withDas.at(-1), lastDate = lastV.date;
  const inPh = vs.filter(v => v.date >= a.start), baseV = inPh.find(v => v.das != null) || withDas[0];
  const baseDate = baseV.date, sixV = a.das6 != null ? inPh.find(v => v.das === a.das6) : null, sixDate = sixV ? sixV.date : ymd(addMonths(baseDate, 6));
  const sjc0 = baseV.sjc ?? 0, tjc0 = baseV.tjc ?? 0, haq0 = baseV.haq ?? a.haq;
  const prevV = withDas.length > 1 ? withDas.at(-2) : baseV, prevDas = prevV.das, prevDate = prevV.date;
  const cat = actOf(a.dasNow), fm = comorbidCodes(p).includes('FM');

  // ---- 顶部状态条 + 参考结论 ----
  const statusTone = { remission: 'good', low: 'good', moderate: 'warn', high: 'bad' }[cat];
  $('#st-status').className = statusTone; $('#st-status').textContent = `${actLabel(cat)} · ${atTarget(a.dasNow) ? '已达标' : '未达标'}`;
  $('#st-since').textContent = `${a.months} 个月（${a.drug}）`;
  $('#das-label').textContent = `DAS28-ESR（较上次 ${ym(prevDate)}）`;
  const delta = a.dasNow - prevDas, tone = delta <= -0.6 ? 'improved' : delta >= 0.6 ? 'worsened' : 'stable', reached = atTarget(a.dasNow);
  const TONES = {
    improved: { label: '改善', arrow: '↓', text: reached ? '病情较前改善，已达到治疗目标。' : '病情较前改善，但当前仍未达到目标。' },
    stable: { label: '稳定', arrow: '→', text: reached ? '病情与上次基本持平，维持在治疗目标内。' : '病情与上次基本持平（DAS28 变化 < 0.6），当前仍未达到目标。' },
    worsened: { label: '恶化', arrow: '↑', text: '病情较前加重（DAS28 升高 ≥ 0.6），建议复核治疗依从性与近期事件。' }
  }, t = TONES[tone];
  $('#das-trend').innerHTML = `${fmt1(prevDas)} → ${fmt1(a.dasNow)} <em class="tone-${tone}">${t.arrow} ${Math.abs(delta).toFixed(1)}</em>`;
  $('#target-note').className = `target-note tone-${tone}`;
  $('#target-note').innerHTML = `<b class="tone-label">参考结论 · ${t.label}</b><span>${t.text}${fm ? '合并纤维肌痛，DAS28 可能被压痛相关指标抬高。' : ''}请结合完整病历进行临床判断。</span><span class="tone-legend" aria-hidden="true"><i class="tone-improved">改善</i><i class="tone-stable">稳定</i><i class="tone-worsened">恶化</i></span>`;

  // ---- 研究数据覆盖：按实际录入情况统计 ----
  const nLab = vs.filter(v => v.esr != null || v.crp != null).length, nPro = vs.filter(v => v.pain != null).length, nX = vs.filter((v, i) => visitFormOf(p, v.k)?.exam?.xrayDate).length;
  const dom = [['疾病活动', withDas.length, vs.length, 'DAS28 · TJC28 · SJC28'], ['实验室', nLab, vs.length, 'CRP · ESR · 血常规 · 肝肾功能'], ['治疗暴露', vs.length, vs.length, `${a.phases.length} 个治疗阶段 · 启用 · 调整`], ['患者报告 PRO', nPro, vs.length, '疼痛 VAS · 总体评价 · HAQ'], ['影像 / 结构损伤', nX, Math.max(1, Math.ceil(vs.length / 4)), nX ? `关节 X 线 ${nX} 次` : '当前缺少可比对影像']];
  document.querySelector('.research-evidence').innerHTML = dom.map(([n, k, tot, note]) => { const r = k / tot, st = r >= 0.9 ? '完整' : r >= 0.5 ? '部分' : k ? '较少' : '待补充'; return `<div class="evidence-domain${k ? '' : ' missing'}"><span>${n}</span><strong>${st}</strong><small>${note}${k && n !== '影像 / 结构损伤' ? ` · ${k}/${tot} 次` : ''}</small></div>`; }).join('');

  // ---- 疾病活动轨迹（SVG） ----
  drawTrend(vs, a);

  // ---- 疾病历程：由历次访视自动生成 ----
  const events = [];
  const fmtV = v => `DAS28-ESR ${fmt1(v.das)} · SJC28 ${v.sjc ?? '—'} · TJC28 ${v.tjc ?? '—'} · CRP ${fmt1(v.crp)}`;
  const first = withDas[0];
  events.push({ id: 'node-base', date: first.date, kind: 'treat', cls: '', title: `入组基线 · ${actLabel(actOf(first.das))}`, data: fmtV(first), tag: ['event-treatment', `开始 ${phaseDrug(a.phases[0])}（${a.phases[0].cls} · ${a.phases[0].line} 线）`], k: first.k });
  vs.filter(v => v.regimenChanged).forEach(v => { const ph = a.phases[v.phase]; events.push({ id: `node-ch${v.k}`, date: v.date, kind: 'treat', cls: '', title: `调整方案 · ${CHANGE_TXT[v.changeReason] || '疗效不佳'}`, data: v.das != null ? fmtV(v) : '本次未评估 DAS28', tag: ['event-treatment', `加用 ${phaseDrug(ph)}（${ph.cls} · ${ph.line} 线）`], k: v.k }); });
  const trig = vs.filter(v => v.trigger && v.das != null);
  if (trig.length) { const v = trig.reduce((m, x) => x.das > m.das ? x : m); events.push({ id: 'node-flare', date: v.date, kind: 'alert', cls: 'alert', title: `疾病活动反弹 · ${actLabel(actOf(v.das))}`, data: fmtV(v), tag: ['event-alert', `同期记录：${TRIGGER_TXT[v.trigger]} · 仅提示时间关联`], k: v.k }); }
  if (sixV) { const d6 = a.das0 - a.das6, good = d6 >= 1.2; events.push({ id: 'node-6m', date: sixV.date, kind: good ? 'good' : 'alert', cls: good ? 'good' : 'alert', title: good ? '当前方案 6 个月 · 明显改善' : d6 > 0.6 ? '当前方案 6 个月 · 部分改善' : '当前方案 6 个月 · 改善不足', data: `DAS28-ESR ${fmt1(a.das6)}（较方案起始 ${d6 >= 0 ? '↓' : '↑'} ${Math.abs(d6).toFixed(1)}）`, tag: good ? ['event-response', '达到 EULAR 良好应答幅度'] : ['event-alert', d6 > 0.6 ? 'EULAR 中等应答' : 'EULAR 无应答，建议评估是否调整方案'], k: sixV.k }); }
  const best = withDas.reduce((m, x) => x.das < m.das ? x : m);
  if (best !== lastV && best !== first && first.das - best.das >= 1.2 && !events.some(e => e.k === best.k)) events.push({ id: 'node-best', date: best.date, kind: 'good', cls: 'good', title: `最佳状态 · ${actLabel(actOf(best.das))}`, data: fmtV(best), tag: ['event-response', `较基线下降 ${(first.das - best.das).toFixed(1)}`], k: best.k });
  if (fm) events.push({ id: 'node-fm', date: `${p.comorbid.FM.since}-01-01`, kind: 'alert', cls: 'alert', title: '合并纤维肌痛（FM）', data: p.comorbid.FM.core.join(' · '), tag: ['event-alert', '压痛关节数与 PRO 解读需考虑 FM 影响'] });
  const rebound = a.das6 != null && a.dasNow - a.das6 >= 0.6;
  if (lastV !== first) events.push({ id: 'node-now', date: lastDate, kind: rebound ? 'alert' : 'good', cls: 'current', title: `最近访视 · ${actLabel(cat)}`, data: `${fmtV(lastV)} · HAQ ${fmt1(lastV.haq)}`, tag: rebound ? ['event-alert', `较 6 个月时回升 ${(a.dasNow - a.das6).toFixed(1)}`] : [atTarget(a.dasNow) ? 'event-response' : 'event-alert', atTarget(a.dasNow) ? '处于治疗目标内' : '尚未达到治疗目标'], k: lastV.k });
  events.sort((x, y) => x.date.localeCompare(y.date));
  $('#journey').innerHTML = events.map(e => `<article class="${e.cls}" id="${e.id}" data-kind="${e.kind}"><time>${ym(e.date)}</time><i></i><div><strong>${escapeHTML(e.title)}</strong><p>${escapeHTML(e.data)}</p><span class="${e.tag[0]}">${escapeHTML(e.tag[1])}</span>${e.k != null ? `<a class="event-link" href="visit-detail.html?id=${pid}&visit=v${e.k}&from=insight">查看当次随访记录 →</a>` : ''}</div></article>`).join('');
  // 筛选事件
  $('#filter-toggle').onclick = () => { const f = $('#journey-filter'); f.hidden = !f.hidden; $('#filter-toggle').setAttribute('aria-expanded', String(!f.hidden)); };
  $('#journey-filter').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    $('#journey-filter').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    $('#journey').querySelectorAll('article').forEach(n => n.hidden = b.dataset.f !== 'all' && n.dataset.kind !== b.dataset.f);
  });

  // ---- 多维疾病画像 ----
  const crpLv = a.crpNow < 10 ? '正常' : a.crpNow < 30 ? '轻度升高' : '明显升高';
  const dims = [
    ['疾病活动', actLabel(cat).replace('疾病活动', ''), Math.min(100, a.dasNow / 7.5 * 100), `DAS28 ${fmt1(a.dasNow)}`],
    ['炎症', crpLv, Math.min(100, a.crpNow / 50 * 100), `CRP ${fmt1(a.crpNow)} mg/L`],
    ['关节体征', a.sjc <= sjc0 - 2 ? '改善' : a.sjc <= 2 ? '稳定' : '仍有肿胀', Math.min(100, a.sjc / 12 * 100), `SJC28 ${a.sjc} · TJC28 ${a.tjc}`],
    ['症状 / PRO', a.vas >= 60 ? '仍需关注' : '可接受', a.vas, `疼痛 VAS ${a.vas}`],
    ['功能', a.haq <= haq0 - 0.3 ? '改善' : a.haq < 1 ? '轻度受限' : '受限', Math.min(100, a.haq / 3 * 100), `HAQ ${fmt1(a.haq)}`],
    (() => { const ae = vs.filter(v => v.liverAE || (v.wbc != null && v.wbc < 3.5)).length; return ['安全性', ae ? '需关注' : '稳定', ae ? 55 : 15, ae ? `曾出现 ${ae} 次实验室异常相关不良事件` : '未记录药物相关不良事件']; })()
  ];
  $('#dims').innerHTML = dims.map(([n, l, v, s]) => `<div><span>${n}</span><b>${l}</b><meter min="0" max="100" value="${Math.round(v)}"></meter><small>${s}</small></div>`).join('');

  // ---- 治疗响应 ----
  $('#resp').innerHTML = `<div><strong>${escapeHTML(a.drug)}</strong><span>${a.tx} · ${a.line} 线 · 已使用 ${a.months} 个月</span></div><dl><dt>DAS28</dt><dd>${fmt1(a.das0)} <b>→ ${fmt1(a.dasNow)}</b></dd><dt>CRP</dt><dd>${fmt1(a.crp0)} <b>→ ${fmt1(a.crpNow)}</b> mg/L</dd><dt>SJC28</dt><dd>${sjc0} <b>→ ${a.sjc}</b></dd><dt>HAQ</dt><dd>${fmt1(haq0)} <b>→ ${fmt1(a.haq)}</b></dd></dl>`;

  // ---- 相似患者（与队列分析的「相似患者」同一规则） ----
  const simF = { ...AI_FILTER_DEFAULT, sex: p.sex, age: `${a.age - 5}-${a.age + 5}`, sero: a.sero ? '1' : '' };
  const simList = applyFilters(simF).filter(x => x.id !== p.id), ss = cohortStats(simList);
  $('#sim-tags').innerHTML = [p.sex === '女' ? '女性' : '男性', `${a.age - 5}–${a.age + 5} 岁`, a.sero ? 'RF / ACPA 阳性' : '血清学阴性'].map(x => `<span>${x}</span>`).join('');
  const persist = pct(simList.filter(x => aiOf(x).months >= 12).length, simList.length);
  $('#sim-sum').innerHTML = [['当前匹配', `${ss.n} 名`, '同性别 · 年龄 ±5 岁'], ['当前达标率', `${ss.target}%`, 'DAS28 ≤ 3.2'], ['方案持续 ≥ 12 月', `${persist}%`, '研究数据库观察值'], ['数据完整度', `${ss.complete}%`, '资料完整患者占比']].map(([l, v, n]) => `<div><span>${l}</span><strong>${v}</strong><small>${n}</small></div>`).join('');
  const maxN = Math.max(1, ...ss.byTx.map(g => g.n));
  $('#sim-bars').innerHTML = ss.byTx.filter(g => g.n).map(g => `<div class="outcome-row"><span>${g.tx}</span><i style="--w:${Math.round(g.n / maxN * 100)}%"></i><b>${g.n}</b></div>`).join('');

  // ---- 智能洞察 ----
  const latest = demoVisits(p)[0];
  const visitUrl = (v, sec) => v ? `visit-detail.html?id=${pid}&visit=${v.id}&from=insight#section-${sec}` : '#';
  const dS = sjc0 - a.sjc, dT = tjc0 - a.tjc, crpDrop = a.crp0 ? Math.round((1 - a.crpNow / a.crp0) * 100) : 0;
  const main = dS >= dT ? `肿胀关节数（${sjc0} → ${a.sjc}）` : `压痛关节数（${tjc0} → ${a.tjc}）`;
  const c1 = delta <= 0 || a.das0 > a.dasNow
    ? { t: `DAS28 较基线下降 ${(a.das0 - a.dasNow).toFixed(1)}，主要来自${main}`, p: `同期 CRP ${crpDrop >= 0 ? '下降' : '上升'} ${Math.abs(crpDrop)}%（${fmt1(a.crp0)} → ${fmt1(a.crpNow)} mg/L），疼痛 VAS 当前 ${a.vas}。` }
    : { t: `DAS28 较基线上升 ${(a.dasNow - a.das0).toFixed(1)}`, p: `压痛 ${tjc0} → ${a.tjc}，肿胀 ${sjc0} → ${a.sjc}，CRP ${fmt1(a.crp0)} → ${fmt1(a.crpNow)} mg/L。` };
  const c2 = fm ? { tag: '可能被抬高', t: '合并 FM：压痛与疼痛偏高，炎症指标相对较低', p: `TJC28 ${a.tjc} 明显高于 SJC28 ${a.sjc}，疼痛 VAS ${a.vas}，CRP ${fmt1(a.crpNow)} mg/L。建议结合 SJC28、CRP 或 CDAI 复核疾病活动。` }
    : crpDrop >= 30 && a.vas >= 60 ? { tag: '未同步改善', t: '炎症改善快于患者主观疼痛', p: `CRP 已下降 ${crpDrop}%，但疼痛 VAS 仍为 ${a.vas}，建议查看症状与功能相关记录。` }
    : { tag: '多维一致', t: '炎症、关节体征与患者报告结局变化方向一致', p: `CRP ${fmt1(a.crpNow)} mg/L · SJC28 ${a.sjc} · VAS ${a.vas} · HAQ ${fmt1(a.haq)}，未发现明显不同步。` };
  const keyNode = rebound ? 'node-now' : a.das6 != null ? 'node-6m' : 'node-base';
  const c3 = rebound ? { t: '6 个月后疾病活动回升', p: `DAS28 由 ${fmt1(a.das6)} 回升至 ${fmt1(a.dasNow)}。仅提示时间关联，建议核对同期用药与依从性记录。` }
    : a.das6 != null ? { t: `治疗 6 个月时 DAS28 ${fmt1(a.das6)}`, p: `较基线${a.das0 - a.das6 >= 0 ? '下降' : '上升'} ${Math.abs(a.das0 - a.das6).toFixed(1)}，${a.das0 - a.das6 >= 1.2 ? '达到良好应答幅度' : '未达到良好应答幅度'}。` }
    : { t: `当前方案仅使用 ${a.months} 个月`, p: '尚未到 6 个月评估时点，建议按 Treat-to-Target 在 3 个月时评估是否改善。' };
  $('#insights').innerHTML = [
    ['01 · 评分贡献', c1.t, c1.p, `<a class="text-button" href="${visitUrl(latest, 2)}">查看证据数据 →</a>`],
    [`02 · ${c2.tag}`, c2.t, c2.p, `<a class="text-button" href="${visitUrl(latest, 1)}">查看相关趋势 →</a>`],
    ['03 · 关键节点', c3.t, c3.p, `<a class="text-button" href="#${keyNode}" data-locate="${keyNode}">定位到病程节点 →</a>`]
  ].map(([s, st, pp, link]) => `<article><span>${s}</span><strong>${escapeHTML(st)}</strong><p>${escapeHTML(pp)}</p>${link}</article>`).join('');
  document.querySelectorAll('[data-locate]').forEach(el => el.addEventListener('click', e => {
    e.preventDefault();
    const node = document.getElementById(el.dataset.locate); if (!node) return;
    node.hidden = false; node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.remove('is-located'); void node.offsetWidth; node.classList.add('is-located');
  }));
});


// 疾病活动轨迹：DAS28-ESR 折线 + 疾病活动分层底色 + 方案调整标记 + CRP 柱
function drawTrend(vs, a) {
  const host = document.getElementById('trend-chart'); if (!host) return;
  const pts = vs.filter(v => v.das != null); if (!pts.length) { host.innerHTML = ''; return; }
  const W = 960, H = 260, L = 44, R = 20, T = 16, B = 36, d0 = vs[0].d, d1 = Math.max(vs.at(-1).d, d0 + 30);
  const x = d => L + (d - d0) / (d1 - d0) * (W - L - R), yMax = Math.max(7, Math.ceil(Math.max(...pts.map(v => v.das)) + 0.3)), y = v => T + (1 - v / yMax) * (H - T - B);
  const crpMax = Math.max(20, ...vs.map(v => v.crp || 0)), yc = c => H - B - c / crpMax * (H - T - B) * 0.45;
  const band = (lo, hi, cls, label) => `<rect class="band ${cls}" x="${L}" y="${y(Math.min(hi, yMax))}" width="${W - L - R}" height="${y(lo) - y(Math.min(hi, yMax))}"/><text class="band-label" x="${W - R - 6}" y="${y(Math.min(hi, yMax)) + 13}" text-anchor="end">${label}</text>`;
  const ticks = [0, 2.6, 3.2, 5.1, yMax].map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const months = []; { const s0 = new Date(dstr(d0).slice(0, 7) + '-01'); for (let d = s0; ; d.setMonth(d.getMonth() + 3)) { const dn = Math.round(Date.UTC(d.getFullYear(), d.getMonth(), 1) / 864e5); if (dn > d1) break; if (dn >= d0) months.push(dn); } }
  const xt = months.map(dn => `<text class="axis" x="${x(dn)}" y="${H - B + 18}" text-anchor="middle">${dstr(dn).slice(2, 7).replace('-', '.')}</text>`).join('');
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(v.d).toFixed(1)},${y(v.das).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.at(-1).d).toFixed(1)},${H - B} L${x(pts[0].d).toFixed(1)},${H - B} Z`;
  const bars = vs.filter(v => v.crp != null).map(v => `<rect class="crp-bar" x="${x(v.d) - 4}" y="${yc(v.crp)}" width="8" height="${H - B - yc(v.crp)}" data-tip="${v.date} · CRP ${v.crp} mg/L"/>`).join('');
  const marks = vs.filter(v => v.regimenChanged).map(v => { const ph = a.phases[v.phase]; return `<line class="switch" x1="${x(v.d)}" x2="${x(v.d)}" y1="${T}" y2="${H - B}"/><text class="switch-label" x="${x(v.d) + 5}" y="${T + 12}">换用 ${phaseDrug(ph)}</text>`; }).join('');
  const trig = vs.filter(v => v.trigger && v.das != null).map(v => `<text class="trig" x="${x(v.d)}" y="${y(v.das) - 12}" text-anchor="middle">!</text>`).join('');
  const dots = pts.map(v => `<circle class="dot ${actOf(v.das)}" cx="${x(v.d)}" cy="${y(v.das)}" r="5" data-tip="${v.date} · DAS28-ESR ${v.das.toFixed(2)}（${actLabel(actOf(v.das))}）· TJC ${v.tjc ?? '—'} / SJC ${v.sjc ?? '—'} · ESR ${v.esr ?? '—'}" data-k="${v.k}"/>`).join('');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="DAS28-ESR 随访轨迹">${band(0, 2.6, 'remission', '缓解')}${band(2.6, 3.2, 'low', '低活动')}${band(3.2, 5.1, 'moderate', '中活动')}${band(5.1, yMax, 'high', '高活动')}${ticks}${xt}${bars}${marks}<path class="area" d="${area}"/><path class="line" d="${line}" pathLength="1"/>${dots}${trig}</svg>`;
  const tip = document.getElementById('viz-tip') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'viz-tip', className: 'viz-tip', hidden: true });
  host.onmousemove = e => { const t = e.target.closest('[data-tip]'); if (!t) { tip.hidden = true; return; } tip.textContent = t.dataset.tip; tip.hidden = false; tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; };
  host.onmouseleave = () => tip.hidden = true;
  host.onclick = e => { const c = e.target.closest('[data-k]'); if (c) location.href = `visit-detail.html?id=${encodeURIComponent(queryParam('id'))}&visit=v${c.dataset.k}&from=insight`; };
  const tr = pts.length >= 2 ? pts.at(-1).das - pts[0].das : 0;
  document.getElementById('trend-sum').textContent = `${pts.length} 次评分 · 入组 ${pts[0].das.toFixed(2)} → 最近 ${pts.at(-1).das.toFixed(2)}（${tr <= -0.6 ? '改善' : tr >= 0.6 ? '加重' : '稳定'} ${tr > 0 ? '+' : ''}${tr.toFixed(2)}）· 方案调整 ${vs.filter(v => v.regimenChanged).length} 次`;
}
