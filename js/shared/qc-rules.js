/* 数据质控规则：data-quality.html 与 projects.html 共用，保证两页数字同一口径。
   缺失（QC-M01~M04）：必填项没有录入，数据无法进入分析；逻辑冲突（QC-L01）：录入了数据，但前后矛盾。
   状态：待处理 → 已处理。依赖 common.js。 */
"use strict";
const QC_RULES={
 'QC-M01':{how:'核对原始病历补录 TJC28、SJC28；当次确实未做关节查体的，备注原因后标记已处理（该访视不计入 DAS28 分析）。',type:'缺失',name:'基线 DAS28 组成项缺失',desc:'基线访视必须录入 TJC28、SJC28、ESR（或 CRP）和患者总体评价，缺任一项 DAS28 无法计算，该患者不能进入疗效分析。',sec:2,where:'基线访视 · 病情评估',fields:['tjc28','sjc28']},
 'QC-M02':{how:'核对检验报告补录 ESR 或 CRP；当次确实未检查的，备注原因后标记已处理。',type:'缺失',name:'基线炎症指标缺失',desc:'基线访视必须录入 ESR 或 CRP 至少一项，它们既是 DAS28 的组成项，也是判断炎症活动的依据。',sec:1,where:'基线访视 · 辅助检查',fields:['esr','crp']},
 'QC-M03':{how:'向患者或原始病历核实：有合并症的勾选具体病种并填写起病年份、治疗；确认没有的勾选「已确认无常见相关疾病」。',type:'缺失',name:'合并疾病未记录',desc:'档案「常见相关疾病」需勾选具体病种，或勾选「已确认无」，不能留空；否则无法区分“没有合并症”和“漏填”。',where:'患者详情 · 常见相关疾病'},
 'QC-M04':{how:'核对处方或病历补录基线用药（药名、剂量、频次、起始日期）。',type:'缺失',name:'基线用药缺失',desc:'基线访视需录入至少一条当前用药，用于治疗暴露与疗效分析。',sec:4,where:'基线访视 · 治疗方案',fields:['medications']},
 'QC-L01':{how:'核对处方或病历，确认是起始日期还是访视日期录错并更正；常见是把下次开药日期误填为起始日期。',type:'逻辑冲突',name:'用药起始日期晚于访视日期',desc:'本次访视记录的「正在使用」药物，起始日期不能晚于本次访视日期；常见原因是把下次开药日期误填为起始日期，或日期年份 / 月份录错。',sec:4,where:'最近访视 · 治疗方案',fields:['startDate']}
};
const QC_MISSING_RULE={'缺 DAS28 评分':'QC-M01','缺基线检验':'QC-M02','缺合并疾病记录':'QC-M03','缺用药史':'QC-M04'};
const QC_RULE=QC_MISSING_RULE;
// 逻辑冲突明细：找出起始日期晚于访视日期的药物
function qcConflictOf(p){
  const k=p._m.visits.length-1,f=visitForm(p.id,'v'+k);if(!f)return null;
  const m=(f.treatment.medications||[]).find(x=>x.startDate&&x.startDate>f.visitDate);if(!m)return null;
  return {k,med:m,visitDate:f.visitDate,days:Math.round((new Date(m.startDate)-new Date(f.visitDate))/DAY_MS)};
}
function qcIssues(list=patients){
  const issues=[];
  list.forEach(p=>{
    // 处理状态：本机已处理 > 数据库记录（早于近两个月发现的问题多数已处理）
    const add=(rule,text,detail,found,visit)=>{const r=QC_RULES[rule],key=`${p.id}|${r.type}|${text}`,h=(+p.id*2654435761>>>0)%100,old=found&&(TODAY-new Date(found))/DAY_MS>60;issues.push({p,type:r.type,rule,ruleName:r.name,text,detail,key,found,visit,sec:r.sec,where:r.where,state:store.qc[key]||(old?(h<78?'已处理':'待处理'):(h<30?'已处理':'待处理'))})};
    const base=p._m&&p._m.visits[0];
    if(p.incomplete&&!(p.missing==='缺合并疾病记录'&&(p.comorbidNone||comorbidCodes(p).length))){
      const rule=QC_MISSING_RULE[p.missing]||'QC-M01',d=base?base.date:p.created;
      const detail={'QC-M01':`基线访视 ${d}：病情评估未录入 TJC28、SJC28，DAS28 无法计算`,'QC-M02':`基线访视 ${d}：辅助检查未录入 ESR、CRP，DAS28 无法计算`,'QC-M03':'档案「常见相关疾病」既未勾选病种，也未勾选「已确认无」','QC-M04':`基线访视 ${d}：治疗方案未录入任何用药`}[rule];
      add(rule,QC_RULES[rule].name,detail,p.created,base?'v0':null);
    }
    if(p._m&&p._m.logicConflict&&p.visits&&!(store.deletedVisits[p.id]||[]).includes('v'+(p._m.visits.length-1))){const c=qcConflictOf(p);if(c)add('QC-L01',QC_RULES['QC-L01'].name,`${c.med.drugName} 起始日期 ${c.med.startDate}，晚于本次访视日期 ${c.visitDate}（晚 ${c.days} 天）`,p.last,'v'+c.k);}
  });
  return issues;
}
// 汇总：与数据质控页顶部指标、项目总览同一口径
function qcSummary(issues=qcIssues()){
  const open=issues.filter(x=>x.state!=='已处理'), pts=new Set(open.map(x=>x.p.id)).size, N=patients.length;
  return {total:issues.length,open:open.length,affected:pts,ready:N-pts,rate:N?(N-pts)/N:0};
}

// 访视详情 / 患者详情：从数据质控跳入时显示的质控提示（规则说明 + 本条问题 + 修正 / 标记已处理）
function qcAlertHTML(x,fixHref,fixText){
  const r=QC_RULES[x.rule],done=x.state==='已处理';
  return `<div class="qc-alert ${r.type==='缺失'?'warn':'bad'}" id="qc-alert"><div class="qc-alert-head"><span class="badge ${r.type==='缺失'?'warning':'danger'}">${r.type}</span><b><code class="rule-code">${x.rule}</code>${escapeHTML(r.name)}</b><span class="qc-alert-state ${done?'done':''}">${done?'已处理':'待处理'}</span></div><dl><div><dt>本条问题</dt><dd>${escapeHTML(x.detail)}</dd></div><div><dt>规则说明</dt><dd>${escapeHTML(r.desc)}</dd></div><div><dt>如何处理</dt><dd>${r.how}下方<mark class="qc-mark">红框</mark>标出了问题字段。</dd></div></dl><div class="qc-alert-actions"><a class="button primary compact" href="${fixHref}${fixHref.includes('visit-create')?`&qc=${x.rule}`:''}">${fixText}</a>${done?'':'<button type="button" class="button compact" id="qc-done">已核实，标记已处理</button>'}<a class="text-button" id="qc-back" href="data-quality.html">← 返回数据质控</a></div></div>`;
}
function bindQcAlert(x,onDone){
  const b=document.getElementById('qc-done');
  if(b)b.onclick=()=>{store.qc[x.key]='已处理';saveStore();audit(x.p.id,'质控处理',`问题：${x.text}（${x.type}）；状态：待处理 → 已处理`);x.state='已处理';const s=document.querySelector('#qc-alert .qc-alert-state');s.textContent='已处理';s.classList.add('done');b.remove();toast('已标记处理，修改记录已留痕','ok');onDone&&onDone()};
  const back=document.getElementById('qc-back');if(back)bindBack(back,'data-quality.html');
}
