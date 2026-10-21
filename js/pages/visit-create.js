/* visit-create.html 页面脚本（依赖 boot.js → data.js → common.js → shared/crf-schema.js → shared/case-form.js）
   两种模式：新增随访（?id=，接口 V02）；编辑已有随访（?id=&visit=，接口 V04）。基本信息只读，其余 7 个模块均可填写和修改。 */
"use strict";
document.addEventListener('DOMContentLoaded', () => {
  shell('patients');
  const p = patientById(queryParam('id')), pid = encodeURIComponent(p.id);
  const editId = queryParam('visit'), v = editId ? demoVisits(p).find(x => x.id === editId) : null, editing = !!v;
  const nth = (p.visits || 0) + 1;
  const back = editing ? `visit-detail.html?id=${pid}&visit=${v.id}` : `patient-visits.html?id=${pid}`;
  const METHOD = CRF_FIELDS.find(f => f.key === 'method'), SUBTYPE = CRF_FIELDS.find(f => f.key === 'subtype');
  document.title = `${p.name} · ${editing ? '编辑随访' : '新增随访'} · 中国中医风湿病注册研究信息平台`;
  document.querySelectorAll('.js-back-visits').forEach(a => a.href = `patient-visits.html?id=${pid}`);
  const backLink = document.querySelector('.back-link.js-back-visits');
  if (editing) { backLink.textContent = '← 返回访视详情'; backLink.href = back; document.querySelector('.breadcrumb').lastChild.textContent = ' 编辑随访'; }
  document.getElementById('visit-title').textContent = `${editing ? '编辑随访' : '新增随访'} · ${p.name}`;
  document.getElementById('visit-sub').textContent = editing
    ? `研究编号 ${p.code} · ${v.type} ${v.date} · 修改后保存，系统会在该患者的修改记录中留痕。`
    : `研究编号 ${p.code} · 第 ${nth} 次随访 · 基本信息沿用患者档案，仅录入本次随访内容；未完成内容可暂存后补。`;
  document.getElementById('edit-profile').href = `patient-edit.html?id=${pid}&back=visit`;

  // 基本信息：只读展示（身份证号、手机号脱敏：前 3 后 4 / 前 6 后 4）
  const mask = (val, keep) => val ? val.slice(0, keep) + '****' + val.slice(-4) : '未提供';
  const rows = [['患者姓名', p.name], ['性别', p.sex], ['出生日期', p.birth || `${p.year} 年`], ['民族', p.ethnicity], ['婚史', p.maritalStatus],
    ['患者手机号', mask(p.phone, 3)], ['患者身份证号', mask(p.identityNo, 6)], ['研究编号', p.code], ['ID号', p.id], ['随访周期', cycleLabel(p.followCycle)], ['随访观察起始', p.followStart || p.last || '未提供'],
    ['身高 / 体重', p.height || p.weight ? `${p.height ?? '—'} cm / ${p.weight ?? '—'} kg` : '未提供'], ['常见相关疾病', comorbidSummary(p)]];
  document.getElementById('basic-readonly').innerHTML = rows.map(([k, val]) => `<div><span>${k}</span><b>${escapeHTML(val || '未提供')}</b></div>`).join('');

  const form = document.querySelector('#create-form');
  const defaults = serializeSections(form);
  const vd = form.querySelector('[name="visitDate"]');
  if (editing) {
    restoreSections(form, visitForm(p.id, v.id));
    if (vd && !vd.value) vd.value = v.date;
    const m = METHOD.options.find(o => o.label === v.method); const ms = form.querySelector('[name="method"]'); if (m && ms && !visitForm(p.id, v.id)) ms.value = m.value;
  } else if (vd && !vd.value) vd.value = ymd(new Date());
  refreshCaseForm(form);
  const before = serializeSections(form);

  if (queryParam('source') === 'paper' && !editing) {
    const note = document.createElement('div'); note.className = 'draft-banner ai-source-note';
    // 识别结果：参照该患者最近一次访视的病例结构回填，日期为今天
    const lastK = p._m && p._m.visits.length ? p._m.visits.length - 1 : null, tpl = lastK != null ? JSON.parse(JSON.stringify(visitFormOf(p, lastK))) : null;
    if (tpl) { tpl.visitDate = ymd(new Date()); tpl.treatment.regimenChanged = 'no'; delete tpl.adverse.events; tpl.adverse.occurred = 'no'; restoreSections(form, tpl); }
    const n = tpl ? describeEntries(tpl).length : 0;
    note.innerHTML = `<span>来自「AI纸质病历拍照导入」：已识别并回填 <b>${n}</b> 个字段（病史病情、辅助检查、病情评估、中医诊断、治疗方案），请逐项核对后保存。</span>`;
    form.prepend(note);
  }
  document.getElementById('basic').open = false;
  // 从数据质控提示进入：打开问题所在模块并标出需要补录 / 更正的字段
  const QCR = queryParam('qc'), QC_SEC = { 'QC-M01': 'assessment', 'QC-M02': 'exam', 'QC-M04': 'treatment', 'QC-L01': 'treatment' }[QCR];
  const first = document.getElementById(QC_SEC || 'history'); if (first) first.open = true;
  if (QC_SEC) {
    const f = visitForm(p.id, v ? v.id : '') || {}, vd = f.visitDate || (v && v.date);
    const targets = { 'QC-M01': ['tjc28', 'sjc28'], 'QC-M02': ['esr', 'crp'], 'QC-M04': [], 'QC-L01': ['startDate'] }[QCR];
    const els = targets.flatMap(n => [...first.querySelectorAll(`[name="${n}"]`)]).filter(el => QCR !== 'QC-L01' || (el.value && el.value > vd));
    els.forEach(el => el.closest('.form-field')?.classList.add('qc-field'));
    const note = document.createElement('div'); note.className = 'draft-banner qc-source-note';
    note.innerHTML = `<span><b>正在处理质控问题 ${QCR}</b>：${{ 'QC-M01': '请补录压痛关节数 TJC28、肿胀关节数 SJC28，保存后 DAS28 自动计算。', 'QC-M02': '请补录 ESR 或 CRP 至少一项。', 'QC-M04': '请在「用药明细」中补录基线用药。', 'QC-L01': `红框中的用药起始日期晚于本次访视日期 ${vd}，请核对后更正。` }[QCR]}保存后该问题自动解除。</span>`;
    form.prepend(note);
    setTimeout(() => { (els[0] || first).scrollIntoView({ block: 'center' }); els[0]?.focus(); }, 60);
  }
  if (editing) document.querySelector('.create-footer .button.primary').textContent = '保存修改';

  initCaseForm({
    draftKey: editing ? `visit-edit:${p.id}:${v.id}` : `visit-new:${p.id}`,
    onSubmit(form) {
      const data = serializeSections(form), date = data.visitDate || ymd(new Date()), summary = (data.caseRecord?.note || '').trim(), u = currentUser();
      if (date > ymd(new Date())) { caseToast('随访日期不能晚于今天'); return false; }
      const meta = { date, method: crfOptionLabel(METHOD, data.method) || '门诊随访', entries: describeEntries(data), ...(summary ? { summary } : {}) };
      const pFields = {};
      if (data.history?.subtype) pFields.subtype = crfOptionLabel(SUBTYPE, data.history.subtype).replace(/（.*$/, '');
      if (data.assessment?.das28Crp != null) pFields.das28 = data.assessment.das28Crp;
      if (editing) {
        const changed = diffCount(before, data);
        store.visitEdits[p.id] = store.visitEdits[p.id] || {};
        store.visitEdits[p.id][v.id] = { form: data, meta };
        const own = (store.visits[p.id] || []).find(x => x.id === v.id); if (own) Object.assign(own, { form: data }, meta);
        if (v.type === '基线访视') { const m = caseMissing(p, data); pFields.incomplete = !!m; pFields.missing = m || ''; }
        const remaining = demoVisits(p); const last = remaining.reduce((m, x) => x.date > m ? x.date : m, '');
        patchPatient(p.id, { ...pFields, ...(last ? { last } : {}) });
        saveStore(); audit(p.id, '编辑随访', `${v.type} ${v.date}${date !== v.date ? ` → ${date}` : ''}：修改 ${changed} 项`);
        return changed ? `已保存 ${changed} 项修改` : '没有修改内容';
      }
      const visit = { id: 'n' + Date.now(), type: p.visits ? '常规随访' : '基线访视', date, method: meta.method, doctor: u ? u.name : '陈医生', status: 'completed', summary: summary || '按计划完成本次随访。', dropout: false, dropoutReasons: [], form: data, entries: meta.entries };
      (store.visits[p.id] = store.visits[p.id] || []).push(visit);
      if (visit.type === '基线访视') { const m = caseMissing(p, data); pFields.incomplete = !!m; pFields.missing = m || ''; }
      patchPatient(p.id, { ...pFields, visits: (p.visits || 0) + 1, last: !p.last || date > p.last ? date : p.last });
      audit(p.id, '新增随访', `第 ${nth} 次随访 · ${date} · ${visit.type} · 填写 ${diffCount(defaults, data)} 项`);
      return `第 ${nth} 次随访已保存，即将返回患者详情`;
    },
    afterSubmit: () => location.href = back
  });
});
