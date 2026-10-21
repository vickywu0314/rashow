/* data-quality.html 页面脚本（依赖 boot.js → data.js → common.js） */
"use strict";
shell('quality');
const TYPE_TONE={'缺失':'warning','逻辑冲突':'danger'};
const STATE_TONE={'待处理':'warning','已处理':'success'};
// 质控问题：由患者数据的缺失 / 逻辑冲突规则派生
// 每类问题对应的病历位置：访视详情的具体模块（带 qc 参数，详情页显示质控提示并高亮问题字段），或患者详情页的具体区块
const qcQuery=x=>`&qc=${x.rule}&qk=${encodeURIComponent(x.key)}`;
function locate(x){const p=x.p;
  if(x.rule==='QC-M03'||!x.visit)return {href:`patient-visits.html?id=${encodeURIComponent(p.id)}&from=quality${qcQuery(x)}#related-history`,where:x.where};
  return {href:`visit-detail.html?id=${encodeURIComponent(p.id)}&visit=${x.visit}&from=quality&entry=direct${qcQuery(x)}#section-${x.sec}`,where:x.where};
}
// 问题类型说明：缺失 vs 逻辑冲突，点击卡片即按该类型筛选
function legend(){
  const n=r=>issues.filter(x=>x.rule===r).length,open=t=>issues.filter(x=>x.type===t&&x.state!=='已处理').length;
  const card=(t,tone,title,desc,example,rules)=>`<button type="button" class="qc-type-card ${tone}${state.type===t?' active':''}" data-type="${t}"><span class="qc-type-head">${badge(t,TYPE_TONE[t])}<b>${title}</b><em>${fmtN(issues.filter(x=>x.type===t).length)} 个 · ${fmtN(open(t))} 个待处理</em></span><span class="qc-type-desc">${desc}</span><span class="qc-type-eg"><i>例</i>${example}</span><span class="qc-rule-list">${rules.map(r=>`<span><code>${r}</code>${QC_RULES[r].name}<small>${n(r)}</small></span>`).join('')}</span></button>`;
  $('#qc-legend').innerHTML=card('缺失','warn','该填的没有填','必填项没有录入。数据本身没有错，但不完整，相关指标（如 DAS28）算不出来，患者无法进入分析。','基线访视没有录入压痛 / 肿胀关节数 → DAS28 无法计算',['QC-M01','QC-M02','QC-M04','QC-M03'])+card('逻辑冲突','bad','填了，但前后矛盾','每个字段单看都填了，但两个字段放在一起不可能同时成立，通常是录入笔误，需要核对原始病历后更正。','甲氨蝶呤起始日期 2026-11-02，晚于本次访视日期 2026-10-19',['QC-L01']);
}
const issues=qcIssues();
let state=loadListState('quality',{q:'',type:'',st:'',center:'',page:1,perPage:10});
if(![10,20,50].includes(+state.perPage))state.perPage=10;
if(queryParam('type'))state.type=queryParam('type'); // 看板等页面带条件进入
function kpi(){
  const S=qcSummary(issues), open=S.open, pts=S.affected, ok=S.ready, rate=(S.rate*100).toFixed(1);
  $('#dq-kpi').innerHTML=[[rate+'%','无待处理问题的患者占比'],[fmtN(open),'待处理问题'],[fmtN(pts),'涉及患者'],[fmtN(ok),'满足研究级质量要求']].map(([v,l])=>`<article><strong data-count="${v}">0</strong><span>${l}</span></article>`).join('');countUp($('#dq-kpi'));
  $('#dq-summary').textContent=`共发现 ${fmtN(issues.length)} 个质控问题 · ${fmtN(open)} 个待处理，涉及 ${fmtN(pts)} 位患者`;
}
function row(x){const p=x.p,loc=locate(x);return `<div class="patient-card selectable"><a class="patient-card-link" href="${loc.href}" title="定位到：${loc.where}"><span class="patient-identity"><span class="record-icon">${icon('record')}</span><span class="patient-info"><span class="patient-name">${escapeHTML(p.name)}</span><span class="patient-meta">${escapeHTML(p.sex)} · ${p.year} 年</span><span class="patient-meta">ID号: ${escapeHTML(p.id)}</span></span></span><span class="patient-cell research-cell"><span class="cell-label">研究信息</span><span class="study-code">${escapeHTML(p.code)}</span><span class="cell-center" title="${escapeHTML(p.center||'')}">${escapeHTML(p.center||'')}</span><span class="cell-note">已随访 ${p.visits} 次${x.found?` · 发现于 ${x.found}`:''}</span></span><span class="patient-cell issue-cell"><span class="cell-label">质控问题</span><span class="issue-text"><code class="rule-code">${x.rule}</code>${escapeHTML(x.ruleName)}</span><span class="issue-detail">${escapeHTML(x.detail||'')}</span><span class="cell-note">${x.state==='已处理'?'已核实并更新':`点击定位到：${loc.where}`}</span></span><span class="patient-cell type-cell"><span class="cell-label">问题类型</span>${badge(x.type,TYPE_TONE[x.type])}</span><span class="patient-cell status-cell"><span class="cell-label">处理状态</span>${badge(x.state,STATE_TONE[x.state])}${x.state!=='已处理'?`<span class="mark-done" role="button" tabindex="0" data-key="${escapeHTML(x.key)}">标记已处理</span>`:''}</span>${icon('chevron','chevron')}</a></div>`}
function rows(){return issues.filter(x=>(!state.q||[x.p.name,x.p.id,x.p.code].some(v=>v.toLowerCase().includes(state.q)))&&(!state.type||x.type===state.type)&&(!state.st||x.state===state.st)&&(!state.center||x.p.center===state.center)).sort((a,b)=>(a.state==='待处理'?0:1)-(b.state==='待处理'?0:1)||(b.found||'').localeCompare(a.found||''))}
function render(){saveListState('quality',state);legend();const list=rows(),pages=Math.max(1,Math.ceil(list.length/state.perPage));state.page=Math.min(state.page,pages);const start=(state.page-1)*state.perPage;
  $('#rows').innerHTML=list.slice(start,start+state.perPage).map(row).join('');$('#empty').hidden=!!list.length;
  $('#result-count').textContent=list.length?`显示第 ${fmtN(start+1)}–${fmtN(Math.min(start+state.perPage,list.length))} 条，共 ${fmtN(list.length)} 条`:'共 0 条匹配记录';
  $('#pagination').innerHTML=pagerHTML(state.page,pages)}
// 标记已处理：保存在本地并写入该患者的修改记录
const markDone=e=>{const b=e.target.closest('.mark-done');if(!b)return false;e.preventDefault();e.stopPropagation();const x=issues.find(i=>i.key===b.dataset.key);if(!x)return true;const prev=x.state;x.state='已处理';store.qc[x.key]='已处理';saveStore();audit(x.p.id,'质控处理',`问题：${x.text}（${x.type}）；状态：${prev} → 已处理`);kpi();render();toast(`已标记处理：${x.p.name} · ${x.text}`,'ok');return true};
$('#rows').addEventListener('click',markDone);
$('#rows').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.mark-done'))markDone(e)});
$('#run-check').onclick=e=>{const b=e.currentTarget;b.disabled=true;b.textContent='质控检查中…';setTimeout(()=>{b.disabled=false;b.textContent='运行质控检查';kpi();render();toast(`质控检查完成：扫描 ${fmtN(patients.length)} 位患者，共 ${fmtN(issues.length)} 个问题`,'ok')},1400)};
$('#search-form').addEventListener('submit',e=>{e.preventDefault();state.q=$('#query').value.trim().toLowerCase();state.type=$('#dq-type').value;state.st=$('#dq-state').value;state.center=$('#f-center').value;state.page=1;render()});
$('#dq-type').addEventListener('change',e=>{state.type=e.target.value;state.page=1;render()});
$('#qc-legend').addEventListener('click',e=>{const c=e.target.closest('[data-type]');if(!c)return;state.type=state.type===c.dataset.type?'':c.dataset.type;$('#dq-type').value=state.type;state.page=1;render()});
$('#dq-state').addEventListener('change',e=>{state.st=e.target.value;state.page=1;render()});
bindPager($('#pagination'),n=>{state.page=n;render()});
$('#f-center').addEventListener('change',e=>{state.center=e.target.value;state.page=1;render()});
let qT=0;$('#query').addEventListener('input',e=>{clearTimeout(qT);qT=setTimeout(()=>{state.q=e.target.value.trim().toLowerCase();state.page=1;render()},300)});
$('#page-size').addEventListener('change',e=>{state.perPage=+e.target.value;state.page=1;render()});
$('#reset').onclick=()=>{state={q:'',type:'',st:'',center:'',page:1,perPage:state.perPage};$('#query').value='';$('#dq-type').value='';$('#dq-state').value='';$('#f-center').value='';render()};
$('#query').value=state.q;$('#f-center').value=state.center||'';$('#dq-type').value=state.type;$('#dq-state').value=state.st;$('#page-size').value=state.perPage;kpi();render();
