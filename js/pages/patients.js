/* patients.html 页面脚本（依赖 boot.js → data.js → common.js） */
"use strict";shell('patients');
const ADV_KEYS=['center','sex','age','act','tx','trend','cm','syn','created','sero'];
const DEFAULTS={q:'',status:'',data:'',page:1,perPage:10,sort:'last',...Object.fromEntries(ADV_KEYS.map(k=>[k,'']))};
let state=loadListState('patients',DEFAULTS);
// 看板等页面带条件进入：?trend=better、?center=…、?status=overdue
{const u=new URLSearchParams(location.search);['q','status','data',...ADV_KEYS].forEach(k=>{if(u.get(k)!=null){state[k]=u.get(k);state.page=1}})}
const selected=new Set();

function patientListSkeleton(){
  $('#patients').innerHTML=Array.from({length:6},()=>`<div class="patient-card selectable patient-skeleton-row"><span class="check-col"><i class="skeleton skeleton-check"></i></span><div class="patient-card-link">${Array.from({length:5},(_,i)=>`<span class="patient-skeleton-cell"><i class="skeleton ${i===0?'skeleton-patient-name':'skeleton-cell-line'}"></i><i class="skeleton skeleton-cell-sub"></i></span>`).join('')}<i class="skeleton skeleton-chevron"></i></div></div>`).join('');
  $('#result-count').innerHTML='<span class="skeleton skeleton-result-count"></span>';
  $('#pagination').innerHTML='';
}
let loadTimer=0;
function loadPatients(callback,delay=380){patientListSkeleton();clearTimeout(loadTimer);loadTimer=setTimeout(callback,delay)}

// ---- 患者派生字段（列表筛选、排序、展示共用，只算一次） ----
const actKey=d=>d==null?'none':d<2.6?'remission':d<=3.2?'low':d<=5.1?'moderate':'high';
const D=new Map();
function derived(p){
  let d=D.get(p.id);if(d)return d;
  const c=courseOf(p),vs=c.series||[],withDas=vs.filter(v=>v.das!=null),first=withDas[0],last=withDas.at(-1),prev=withDas.at(-2);
  const lastV=vs.at(-1);
  d={c,das:last?last.das:p.das28??null,act:actKey(last?last.das:p.das28),delta:first&&last&&first!==last?last.das-first.das:null,step:prev&&last?last.das-prev.das:null,
     age:TODAY.getFullYear()-p.year,syn:p._m&&lastV?synAt(p,lastV):'',status:followupStatus(p).label,hay:[p.name,p.id,p.code,p.phone||''].join(' ').toLowerCase()};
  D.set(p.id,d);return d;
}
// 随访状态筛选与列表「随访状态」列同一规则（followupStatus）
const STATUS_FILTER={ongoing:'随访中',due:'近期需随访',overdue:'随访逾期',none:'待首次随访',lost:'已脱落'};
function matches(p){
  const d=derived(p),s=state;
  if(s.q&&!s.q.split(/\s+/).every(w=>d.hay.includes(w)))return false;
  if(s.status&&d.status!==STATUS_FILTER[s.status])return false;
  if(s.data&&(s.data==='missing')!==!!p.incomplete)return false;
  if(s.center&&p.center!==s.center)return false;
  if(s.sex&&p.sex!==s.sex)return false;
  if(s.age){const [lo,hi]=s.age.split('-').map(Number);if(d.age<lo||d.age>hi)return false}
  if(s.act&&d.act!==s.act)return false;
  if(s.tx&&d.c.tx!==s.tx)return false;
  if(s.trend){if(d.delta==null)return false;if(s.trend==='better'&&d.delta>-0.6)return false;if(s.trend==='worse'&&d.delta<0.6)return false;if(s.trend==='stable'&&Math.abs(d.delta)>=0.6)return false}
  if(s.cm){const cs=comorbidCodes(p);if(s.cm==='any'?!cs.length:s.cm==='none'?cs.length:!cs.includes(s.cm))return false}
  if(s.syn&&d.syn!==s.syn)return false;
  if(s.created){const days=(TODAY-new Date(p.created||'2000-01-01'))/DAY_MS;if(s.created==='old'?days<=365:days>+s.created)return false}
  if(s.sero&&(s.sero==='pos')!==!!d.c.sero)return false;
  return true;
}
const SORTS={
  last:(a,b)=>(b.last||'').localeCompare(a.last||''),
  created:(a,b)=>(b.created||'').localeCompare(a.created||''),
  'das-desc':(a,b)=>(derived(b).das??-1)-(derived(a).das??-1),
  'das-asc':(a,b)=>(derived(a).das??99)-(derived(b).das??99),
  code:(a,b)=>a.code.localeCompare(b.code)
};
let cache={key:'',rows:[]};
function visibleRows(){
  const key=JSON.stringify({...state,page:0,perPage:0});
  if(cache.key!==key)cache={key,rows:patients.filter(matches).sort(SORTS[state.sort]||SORTS.last)};
  return {rows:cache.rows};
}

// ---- 渲染 ----
const hl=txt=>{const s=escapeHTML(txt);if(!state.q)return s;let out=s;state.q.split(/\s+/).filter(Boolean).forEach(w=>{const re=new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');out=out.replace(re,m=>`<mark class="hl">${m}</mark>`)});return out};
function comorbidCell(p){const cs=comorbidCodes(p);if(!cs.length)return '<span class="comorbid-none">无</span>';const show=cs.slice(0,2);return `<span class="comorbid-chips">${show.map(c=>`<span class="comorbid-chip" role="button" tabindex="0" data-comorbid="${c}" data-pid="${escapeHTML(p.id)}" title="查看${(COMORBIDITY_INFO[c]||{}).name||c}病程简要">${c==='FM'||c==='AS'?c+' ':''}${(COMORBIDITY_INFO[c]||{}).name||c}</span>`).join('')}${cs.length>2?`<span class="comorbid-more" title="${cs.slice(2).map(c=>(COMORBIDITY_INFO[c]||{}).name||c).join('、')}">+${cs.length-2}</span>`:''}</span>`}
function dasCell(p){const d=derived(p);if(d.das==null)return `<span class="missing-value">DAS28 未评估</span>`;const tr=d.step==null?'':d.step<=-0.6?'<span class="trend down" title="较上次改善">↓</span>':d.step>=0.6?'<span class="trend up" title="较上次加重">↑</span>':'<span class="trend flat" title="与上次持平">→</span>';return `<span class="das-pill ${d.act}" title="${actName(d.das)}"><i></i>DAS28 ${d.das.toFixed(2)}${tr}</span>`}
function card(p){const s=followupStatus(p);return `<div class="patient-card selectable" data-id="${escapeHTML(p.id)}"><span class="check-col"><input class="patient-check" type="checkbox" value="${escapeHTML(p.id)}" aria-label="选择患者 ${escapeHTML(p.name)}" ${selected.has(p.id)?'checked':''}></span><a class="patient-card-link" href="patient-visits.html?id=${encodeURIComponent(p.id)}"><span class="patient-identity"><span class="record-icon">${icon('record')}</span><span class="patient-info"><span class="patient-name">${hl(p.name)}${p.incomplete?badge('待补全','warning'):''}</span><span class="patient-meta">${escapeHTML(p.sex)} · ${derived(p).age} 岁 · ${p.year} 年生</span><span class="patient-meta">ID号: ${hl(p.id)}</span></span></span><span class="patient-cell research-cell"><span class="cell-label">研究信息</span><span class="study-code">${hl(p.code)}</span><span class="cell-center" title="${escapeHTML(p.center||'')}">${escapeHTML(p.center||'')}</span><span class="cell-note">已随访 ${p.visits} 次 · ${cycleLabel(p.followCycle)}</span></span><span class="patient-cell disease-cell"><span class="cell-label">疾病资料</span><span>${p.subtype?escapeHTML(p.subtype):'<span class="missing-value">分型未提供</span>'}</span><span class="cell-note">${dasCell(p)}</span></span><span class="patient-cell history-cell"><span class="cell-label">其他病史</span>${comorbidCell(p)}</span><span class="patient-cell visit-cell"><span class="cell-label">最近随访</span><span class="last-visit">${icon('calendar')}${p.last||'暂无访视'}</span><span class="cell-note">${p.visits?`累计 ${p.visits} 次访视`:'待完成基线访视'}</span></span><span class="patient-cell status-cell"><span class="cell-label">随访状态</span>${badge(s.label,s.tone)}</span>${icon('chevron','chevron')}</a></div>`}
function updateSelectionUI(pageRows=[]){const n=selected.size;const b=$('#ai-analysis');b.disabled=!n;b.textContent=n?`AI智能分析（已选 ${n} 人）`:'AI智能分析';const all=$('#select-all');if(all){const checked=pageRows.filter(p=>selected.has(p.id)).length;all.checked=pageRows.length>0&&checked===pageRows.length;all.indeterminate=checked>0&&checked<pageRows.length}}
const LABELS={
  q:v=>`关键词：${v}`,status:v=>STATUS_FILTER[v],data:v=>v==='missing'?'数据缺失':'数据完整',center:v=>v,sex:v=>`${v}性`,
  age:v=>{const [a,b]=v.split('-');return +b>=120?`${a} 岁及以上`:`${a}–${b} 岁`},act:v=>({remission:'临床缓解',low:'低疾病活动',moderate:'中疾病活动',high:'高疾病活动',none:'DAS28 未评估'})[v],
  tx:v=>({csDMARD:'传统合成 DMARD',TNFi:'TNF 抑制剂',JAKi:'JAK 抑制剂','IL-6i':'IL-6 受体拮抗剂',Abatacept:'阿巴西普'})[v],trend:v=>({better:'病情改善',stable:'病情稳定',worse:'病情加重'})[v],
  cm:v=>v==='any'?'有合并疾病':v==='none'?'无合并疾病':`合并${(COMORBIDITY_INFO[v]||{}).name||v}`,syn:v=>SYN_LABEL[v],created:v=>({30:'近 30 天建档',90:'近 3 个月建档',365:'近 1 年建档',old:'1 年以前建档'})[v],sero:v=>v==='pos'?'血清阳性':'血清阴性'
};
function renderChips(){
  const keys=['q','status','data',...ADV_KEYS].filter(k=>state[k]);
  $('#active-chips').innerHTML=keys.length?keys.map(k=>`<span class="chip">${escapeHTML(LABELS[k](state[k]))}<button type="button" data-clear="${k}" aria-label="移除条件">×</button></span>`).join('')+(keys.length>1?'<button type="button" class="chip-clear" data-clear="*">清除全部</button>':''):'';
  const n=ADV_KEYS.filter(k=>state[k]).length,c=$('#filter-count');c.hidden=!n;c.textContent=n;
}
function render(){
  saveListState('patients',state);
  const {rows}=visibleRows();const pages=Math.max(1,Math.ceil(rows.length/state.perPage));state.page=Math.min(state.page,pages);
  const start=(state.page-1)*state.perPage,pageRows=rows.slice(start,start+state.perPage);
  const incomplete=patients.filter(p=>p.incomplete).length,centers=new Set(patients.map(p=>p.center)).size;
  $('#patient-summary').innerHTML=`共 <b>${fmtN(patients.length)}</b> 位患者已建档 · 覆盖 ${centers} 家研究中心 · <button type="button" class="summary-link" id="show-incomplete" title="筛选资料待补全的患者">${fmtN(incomplete)}</button> 位资料待补全`;
  const list=$('#patients');list.innerHTML=pageRows.map(card).join('');list.classList.remove('result-flash');void list.offsetWidth;list.classList.add('result-flash');
  $('#empty').hidden=!!rows.length;
  $('#result-count').textContent=rows.length?`显示第 ${fmtN(start+1)}–${fmtN(Math.min(start+state.perPage,rows.length))} 条，共 ${fmtN(rows.length)} 条${rows.length<patients.length?`（全部 ${fmtN(patients.length)} 条）`:''}`:'共 0 条匹配记录';
  $('#pagination').innerHTML=pagerHTML(state.page,pages);
  renderChips();updateSelectionUI(pageRows);
}
function syncInputs(){$('#query').value=state.q;$('#visit-status').value=state.status;$('#data-status').value=state.data;$('#page-size').value=state.perPage;$('#sort').value=state.sort;ADV_KEYS.forEach(k=>{const el=$('#f-'+k);if(el)el.value=state[k]})}
function advPreview(){const n=patients.filter(matches).length;$('#adv-preview').textContent=`当前条件匹配 ${fmtN(n)} 位患者`}

// ---- 事件 ----
const chipOpen=e=>{const c=e.target.closest('.comorbid-chip');if(!c)return false;e.preventDefault();e.stopPropagation();openComorbidity(c.dataset.comorbid,patientById(c.dataset.pid));return true};
$('#patients').addEventListener('click',chipOpen);
$('#patients').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.comorbid-chip'))chipOpen(e)});
$('#patients').addEventListener('change',e=>{if(!e.target.matches('.patient-check'))return;e.target.checked?selected.add(e.target.value):selected.delete(e.target.value);const {rows}=visibleRows(),start=(state.page-1)*state.perPage;updateSelectionUI(rows.slice(start,start+state.perPage))});
$('#select-all').addEventListener('change',e=>{const {rows}=visibleRows();const start=(state.page-1)*state.perPage;rows.slice(start,start+state.perPage).forEach(p=>e.target.checked?selected.add(p.id):selected.delete(p.id));render()});
// 数据导出：勾选了患者则导出所选，否则导出当前筛选结果
function exportPatients(){const list=selected.size?patients.filter(p=>selected.has(p.id)):visibleRows().rows;if(!list.length){toast('当前没有可导出的患者数据','warn');return}
 const cols=[['ID号','id'],['姓名','name'],['性别','sex'],['出生年份','year'],['研究编号','code'],['研究中心','center'],['分型','subtype'],['DAS28-ESR','das28'],['随访次数','visits'],['最近随访','last'],['随访周期(月)','followCycle']];
 const cell=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
 const rows=list.map(p=>[...cols.map(c=>cell(p[c[1]])),cell(courseOf(p).tx),cell(comorbidCodes(p).map(c=>(COMORBIDITY_INFO[c]||{}).name||c).join('；')||'无'),cell(followupStatus(p).label),p.incomplete?'数据缺失':'数据完整'].join(','));
 const csv='﻿'+[...cols.map(c=>c[0]),'当前治疗','其他病史','随访状态','数据完整性'].join(',')+'\n'+rows.join('\n');
 const btn=$('#export-data');btn.disabled=true;btn.textContent='正在导出…';
 setTimeout(()=>{const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=`患者列表-${ymd(new Date())}-${list.length}人.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(u),500);btn.disabled=false;btn.textContent='数据导出';toast(`已导出 ${fmtN(list.length)} 位患者`,'ok')},Math.min(1200,300+list.length/20))}
$('#ai-analysis').onclick=()=>{if(selected.size)location.href=`ai-cohort.html?ids=${[...selected].map(encodeURIComponent).join(',')}`};
const apply=(delay)=>{state.page=1;loadPatients(render,delay)};
$('#search-form').addEventListener('submit',e=>{e.preventDefault();state.q=$('#query').value.trim().toLowerCase();state.status=$('#visit-status').value;state.data=$('#data-status').value;apply()});
let qTimer=0;$('#query').addEventListener('input',e=>{clearTimeout(qTimer);qTimer=setTimeout(()=>{const v=e.target.value.trim().toLowerCase();if(v===state.q)return;state.q=v;apply(240)},320)});
$('#visit-status').addEventListener('change',e=>{state.status=e.target.value;apply(220)});
$('#data-status').addEventListener('change',e=>{state.data=e.target.value;apply(220)});
$('#sort').addEventListener('change',e=>{state.sort=e.target.value;apply(220)});
ADV_KEYS.forEach(k=>{const el=$('#f-'+k);if(el)el.addEventListener('change',e=>{state[k]=e.target.value;advPreview();apply(260)})});
$('#filter-toggle').onclick=e=>{const p=$('#adv-filters'),open=p.hidden;p.hidden=!open;e.currentTarget.setAttribute('aria-expanded',String(open));if(open)advPreview()};
$('#adv-clear').onclick=()=>{ADV_KEYS.forEach(k=>state[k]='');syncInputs();advPreview();apply(220)};
$('#active-chips').addEventListener('click',e=>{const b=e.target.closest('[data-clear]');if(!b)return;const k=b.dataset.clear;if(k==='*')Object.assign(state,{q:'',status:'',data:'',...Object.fromEntries(ADV_KEYS.map(x=>[x,'']))});else state[k]='';syncInputs();if(!$('#adv-filters').hidden)advPreview();apply(220)});
$('#patient-summary').addEventListener('click',e=>{if(!e.target.closest('#show-incomplete'))return;state={...state,q:'',status:'',data:'missing',page:1};syncInputs();loadPatients(render)});
$('#export-data').onclick=exportPatients;
bindPager($('#pagination'),n=>{state.page=n;render()});
$('#page-size').addEventListener('change',e=>{state.perPage=+e.target.value;state.page=1;render()});
$('#reset').onclick=()=>{state={...DEFAULTS,perPage:state.perPage,sort:state.sort};syncInputs();loadPatients(render)};
if(![10,20,50].includes(+state.perPage))state.perPage=10;
syncInputs();if(ADV_KEYS.some(k=>state[k])){$('#adv-filters').hidden=false;$('#filter-toggle').setAttribute('aria-expanded','true')}
$('#patient-summary').innerHTML='<span class="skeleton skeleton-inline-summary"></span>';patientListSkeleton();setTimeout(render,480);
