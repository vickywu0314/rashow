"use strict";
const $=(s)=>document.querySelector(s);
const escapeHTML=(v)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const icon=(n,c="")=>`<img src="img/${n}.svg" alt="" class="${c}">`;
const badge=(t,v="")=>`<span class="badge ${v}">${escapeHTML(t)}</span>`;
// ===== 本地保存（浏览器 localStorage）：建档、随访、档案修改、质控处理、修改记录 =====
// 接入后端后，这一层替换为接口调用；页面读取 patients / demoVisits 的方式不变。
const STORE_KEY='ra-store-v2';
const store=(()=>{let s=null;try{s=JSON.parse(localStorage.getItem(STORE_KEY))}catch(e){}
  s=s&&typeof s==='object'?s:{};return {patients:{},added:[],visits:{},visitEdits:{},deletedVisits:{},qc:{},audit:[],...s}})();
function saveStore(){try{localStorage.setItem(STORE_KEY,JSON.stringify(store))}catch(e){}}
function resetStore(){try{localStorage.removeItem(STORE_KEY)}catch(e){}}
function audit(pid,action,detail){const u=currentUser();store.audit.unshift({t:new Date().toISOString(),pid,user:u?`${u.name}（${u.role}）`:'陈医生',action,detail});store.audit=store.audit.slice(0,500);saveStore()}
function patchPatient(id,fields){store.patients[id]={...(store.patients[id]||{}),...fields};const p=patients.find(x=>x.id===id);if(p)Object.assign(p,fields);saveStore()}

const patients=[...INITIAL_PATIENTS,...store.added].map(p=>({...p,...(store.patients[p.id]||{})}));
function patientById(id){return patients.find(p=>p.id===id)||patients[0]}

// ===== 随访周期与下次随访 =====
const DAY_MS=864e5, TODAY=new Date(new Date().toDateString());
const ymd=d=>{const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
const addMonths=(d,m)=>{const x=new Date(d);x.setMonth(x.getMonth()+m);return x};
const cycleLabel=m=>m?`每 ${m} 个月`:'未设置';
// 未脱落患者：有访视 → 上次随访 + 周期；尚无访视 → 以「随访观察起始」（或建档日期）作为首次应访日期
function nextFollowup(p){
  if(p.lost)return null;
  const cycle=+p.followCycle||6, first=!p.visits||!p.last;
  const base=first?(p.followStart||p.created):p.last; if(!base)return null;
  const due=first?new Date(base):addMonths(base,cycle), days=Math.round((due-TODAY)/DAY_MS);
  return {cycle,due:ymd(due),days,first,status:days<0?'overdue':days<=14?'soon':'later'};
}
patients.forEach(p=>{const n=nextFollowup(p);p.due=!!n&&n.days<=14;});
function followupStatus(p){if(p.lost)return{label:"已脱落",tone:"danger"};if(!p.visits)return{label:"待首次随访",tone:"neutral"};const n=nextFollowup(p);if(n&&n.status==='overdue')return{label:"随访逾期",tone:"danger"};if(p.due)return{label:"近期需随访",tone:"warning"};return{label:"随访中",tone:"success"}}
function queryParam(n){return new URLSearchParams(location.search).get(n)}
const NAV_ICONS={
 overview:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
 dashboard:'<path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V7"/><path d="M17 16v-8"/>',
 patients:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6"/><path d="M17.5 14.2c1.6.6 2.7 2.2 3 4.8"/>',
 followups:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="m9 15 2 2 4-4"/>',
 quality:'<path d="M12 3 5 6v5c0 4.4 2.9 8.3 7 9.5 4.1-1.2 7-5.1 7-9.5V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
 ai:'<path d="M12 4.5 13.6 9l4.4 1.6-4.4 1.6L12 16.7l-1.6-4.5L6 10.6 10.4 9 12 4.5Z"/><path d="M18.5 3.5v3M17 5h3M6 16.5v3M4.5 18h3"/>',
 guideData:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6v2.5H9z"/><path d="M9 12h6M9 16h4"/>',
 learning:'<path d="M4 5.5C6.5 4.3 9.3 4.3 12 6c2.7-1.7 5.5-1.7 8-.5V19c-2.5-1.2-5.3-1.2-8 .5-2.7-1.7-5.5-1.7-8-.5V5.5Z"/><path d="M12 6v13.5"/>',
 release:'<path d="M12 3.5l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.5l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6L12 3.5Z"/>',
 help:'<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4"/><path d="M12 16.8v.2"/>'
};
const navIcon=n=>`<svg class="nav-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${NAV_ICONS[n]}</svg>`;
// 平台版本：侧栏「更新亮点」入口与更新亮点页共用，发版时只改这里
const APP_VERSION='v1.0';
const STUDIES=[
 {code:'RA',name:'类风湿关节炎',en:'Rheumatoid Arthritis',ready:true,patients:patients.length,abnormal:patients.filter(p=>p.abnormal).length}, // 异常检验：最近一次访视任一检验超出参考区间的患者数
 {code:'AS',name:'强直性脊柱炎',en:'Ankylosing Spondylitis'}, // 接入后补充 ready:true 与 url（该库患者页地址），病史弹窗即可直接跳转
 {code:'SS',name:'系统性硬化症',en:'Systemic Sclerosis'},
 {code:'RA-ILD',name:'类风湿关节炎相关间质性肺病',en:'RA-associated Interstitial Lung Disease'},
 {code:'RA-MS',name:'类风湿关节炎肌少症',en:'RA & Sarcopenia'},
 {code:'FM',name:'纤维肌痛',en:'Fibromyalgia'}
];
function shell(active){
 const sidebar=document.querySelector('.sidebar');
 // 顶栏账号：显示当前登录用户，并提供退出登录
 const acc=document.querySelector('.account'), u=currentUser();
 if(acc&&u){acc.innerHTML=`<span class="avatar">${escapeHTML(u.name.slice(0,1))}</span><span>${escapeHTML(u.name)}<small>${escapeHTML(u.role)}</small></span><button type="button" class="logout-btn" title="退出登录" aria-label="退出登录"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/></svg></button>`;acc.querySelector('.logout-btn').onclick=()=>{if(confirm('确定退出登录？'))signOut()};}
 document.querySelectorAll('.header-knowledge-links,.header-study').forEach(el=>el.remove());
 if(sidebar){
   const cur=STUDIES[0];
   const studyItems=STUDIES.map(st=>st.ready
     ?`<a class="study-item is-current" href="projects.html" role="menuitem" aria-current="true"><span class="study-code">${st.code}</span><span class="study-text"><b>${st.code} ${st.name}</b><small>${st.en}</small><em class="study-meta"><i>${fmtN(st.patients)}</i> 患者 · <i>${fmtN(st.abnormal)}</i> 异常检验</em></span><span class="study-state ready">已接入</span></a>`
     :`<div class="study-item is-pending" role="menuitem" aria-disabled="true" title="该研究数据库尚未接入，暂不可进入"><span class="study-code">${st.code}</span><span class="study-text"><b>${st.code} ${st.name}</b><small>${st.en}</small></span><span class="study-state">待接入</span></div>`).join('');
   const item=(key,href,ic,label,count)=>`<a class="nav-item" data-nav="${key}" href="${href}">${navIcon(ic)}<span class="nav-text">${label}</span>${count?`<span class="nav-count">${count}</span>`:''}</a>`;
   sidebar.innerHTML=`<div class="project-context" id="project-context"><button type="button" id="project-switch" aria-haspopup="true" aria-expanded="false" aria-controls="project-menu"><span class="pc-code">${cur.code}</span><span class="pc-text"><b>${cur.name}</b><small><i class="pc-dot"></i>已接入 · ${fmtN(cur.patients)} 例</small></span><svg class="pc-chevron" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 10 5 5 5-5"/></svg></button><div class="project-menu" id="project-menu" role="menu" aria-label="研究数据平台"><div class="project-menu-head"><b>研究数据库</b><span>1 个已接入 · ${STUDIES.length-1} 个待接入</span></div><div class="project-menu-list">${studyItems}</div><p class="project-menu-foot">更多病种研究数据库将陆续接入，接入后可在此直接切换，工作台功能一致复用。</p></div></div><nav aria-label="主导航"><p class="nav-label">概览</p><div class="sidebar-nav-group">${item('projects','projects.html','overview','项目总览')}${item('dashboard','dashboard.html','dashboard','数据看板')}</div><p class="nav-label">研究执行</p><div class="sidebar-nav-group">${item('patients','patients.html','patients','患者管理')}${item('followups','followups.html','followups','随访管理')}${item('quality','data-quality.html','quality','数据质控')}</div><p class="nav-label">智能分析</p><div class="sidebar-nav-group">${item('ai','ai-analysis.html','ai','AI 智能分析')}</div><p class="nav-label">帮助与学习</p><div class="sidebar-nav-group">${item('data-guide','data-guide.html','help','使用指南')}${item('learning','learning-center.html','learning','学习中心')}</div></nav><div class="sidebar-footer-nav">${item('guide','system-guide.html','release',`${APP_VERSION} 更新亮点`)}</div>`;
   const act=sidebar.querySelector(`[data-nav="${active}"]`);
   if(act){act.classList.add('active');act.setAttribute('aria-current','page');}
   const ctx=sidebar.querySelector('#project-context');
   const sw=sidebar.querySelector('#project-switch');
   const setOpen=o=>{ctx.classList.toggle('open',o);sw.setAttribute('aria-expanded',String(o));};
   sw.addEventListener('click',e=>{e.stopPropagation();setOpen(!ctx.classList.contains('open'));});
   document.addEventListener('click',e=>{if(!ctx.contains(e.target))setOpen(false);});
   document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ctx.classList.contains('open')){setOpen(false);sw.focus();}});
   sidebar.querySelectorAll('.study-item.is-pending').forEach(el=>el.addEventListener('click',()=>{el.classList.remove('nudge');void el.offsetWidth;el.classList.add('nudge');}));
 }
 const map={dashboard:'dashboard.html',patients:'patients.html',projects:'projects.html',followups:'followups.html',quality:'data-quality.html',ai:'ai-analysis.html'};
 document.querySelectorAll('[data-home]').forEach(a=>a.href=map[active]||'patients.html');
}

// 访视列表：本地新增的随访 + 数据库中的历次访视（最新在前）；编辑过的访视叠加本地修改，已删除的不再显示
const METHOD_LABEL={outpatient:'门诊随访',phone:'电话随访',inpatient:'住院随访'};
function demoVisits(p){
 const gone=new Set(store.deletedVisits[p.id]||[]);
 return demoVisitsAll(p).filter(v=>!gone.has(v.id));
}
function demoVisitsAll(p){
 const added=(store.visits[p.id]||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
 const M=p._m, base=M?M.visits.map(v=>({id:'v'+v.k,k:v.k,type:v.k===0?'基线访视':'常规随访',date:v.date,method:METHOD_LABEL[v.method],doctor:v.doctor,status:'completed',das:v.das,regimenChanged:v.regimenChanged,trigger:v.trigger,dropout:!!p.lost&&v.k===M.visits.length-1,dropoutReasons:p.lost&&v.k===M.visits.length-1?[withdrawText(p)]:[]})).reverse():[];
 if(!base.length&&added.length)added[added.length-1].type='基线访视';
 const edits=store.visitEdits[p.id]||{};
 return [...added,...base].sort((a,b)=>b.date.localeCompare(a.date)).map(v=>edits[v.id]?{...v,...edits[v.id].meta}:v);
}
// 访视的完整病例表：本机修改 > 本机新增 > 数据库记录
function visitForm(pid,vid){const e=(store.visitEdits[pid]||{})[vid];if(e&&e.form)return e.form;const a=(store.visits[pid]||[]).find(v=>v.id===vid);if(a&&a.form)return a.form;const p=patients.find(x=>x.id===pid);if(p&&p._m&&/^v\d+$/.test(vid))return visitFormOf(p,+vid.slice(1));return null}
// 下载病历：按病例表生成文本病历
function downloadCase(p,v){
 const list=v?[v]:demoVisits(p).slice().reverse();
 const SEC={history:'病史病情',exam:'辅助检查',assessment:'病情评估',tcm:'中医诊断',treatment:'治疗方案',adverse:'不良反应'};
 const fmtV=(f,val)=>Array.isArray(val)?val.map(x=>typeof crfOptionLabel==='function'&&f?crfOptionLabel(f,x):x).join('、'):(f&&f.type==='single'&&typeof crfOptionLabel==='function'?crfOptionLabel(f,val):val)+(f&&f.unit&&!/^\d/.test(f.unit)?' '+f.unit:'');
 const fields=typeof CRF_FIELDS!=='undefined'?CRF_FIELDS:[];
 const body=list.map(x=>{const fm=visitForm(p.id,x.id)||{};const lines=[`【${x.type}】${x.date} · ${x.method} · ${x.doctor}`];
  Object.entries(SEC).forEach(([k,title])=>{const sec=fm[k];if(!sec)return;const rows=[];Object.entries(sec).forEach(([fk,val])=>{if(val==null||val===''||(Array.isArray(val)&&!val.length))return;if(fk==='medications'){val.forEach((m,i)=>rows.push(`  药物 ${i+1}：${m.drugName} ${m.dose??''} ${m.doseUnit??''} ${({qd:'qd',bid:'bid',tid:'tid',qw:'qw',biw:'biw',q2w:'q2w',q4w:'q4w',prn:'prn'})[m.frequency]||''}（起始 ${m.startDate||'—'}）`));return}if(fk==='events'){val.forEach((e,i)=>rows.push(`  不良事件 ${i+1}：${e.detail||e.name}`));return}const f=fields.find(ff=>ff.key===fk&&ff.section&&ff.section.key===k);rows.push(`  ${f?f.label:fk}：${fmtV(f,val)}`)});if(rows.length)lines.push(`${title}`,...rows)});
  if(fm.caseRecord&&fm.caseRecord.note)lines.push('随诊病例',`  ${fm.caseRecord.note}`);return lines.join('\n')}).join('\n\n');
 const text=`RA 随诊病历\n${p.center||''}\n\n患者：${p.name}　性别：${p.sex}　出生日期：${p.birth||p.year}\n研究编号：${p.code}　ID号：${p.id}\n导出时间：${ymd(new Date())}\n${'—'.repeat(30)}\n\n${body}\n`;
 const u=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=`${p.name}-${v?v.date:'随诊病历'}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(u),500);toast(`已生成 ${p.name} 的${v?'本次':''}病历文件`)}

// ===== 通用：轻提示、分页、数字滚动 =====
function toast(msg,tone=''){let box=document.getElementById('toast-stack');if(!box){box=document.createElement('div');box.id='toast-stack';box.className='toast-stack';box.setAttribute('aria-live','polite');document.body.appendChild(box)}const t=document.createElement('div');t.className=`toast ${tone}`;t.textContent=msg;box.appendChild(t);requestAnimationFrame(()=>t.classList.add('show'));setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),260)},2600)}
// 分页条：首页 / 上一页 / 页码（含省略）/ 下一页 / 末页 / 跳转
function pagerHTML(page,pages){
 if(pages<=1)return '';
 const nums=new Set([1,pages,page-2,page-1,page,page+1,page+2].filter(n=>n>=1&&n<=pages)),list=[...nums].sort((a,b)=>a-b),out=[];
 list.forEach((n,i)=>{if(i&&n-list[i-1]>1)out.push('<span class="pager-gap">…</span>');out.push(`<button type="button" data-page="${n}" class="${n===page?'active':''}" ${n===page?'aria-current="page"':''}>${n}</button>`)});
 return `<button type="button" class="pager-step" data-page="${page-1}" ${page<=1?'disabled':''} aria-label="上一页">‹</button>${out.join('')}<button type="button" class="pager-step" data-page="${page+1}" ${page>=pages?'disabled':''} aria-label="下一页">›</button><label class="pager-jump">跳至<input type="number" min="1" max="${pages}" data-jump inputmode="numeric" aria-label="跳转页码">页</label>`;
}
function bindPager(el,go){
 el.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b&&!b.disabled){go(+b.dataset.page);el.closest('main')?.querySelector('.toolbar,.page-heading')?.scrollIntoView({behavior:'smooth',block:'nearest'})}});
 el.addEventListener('keydown',e=>{if(e.key!=='Enter'||!e.target.matches('[data-jump]'))return;e.preventDefault();const n=Math.round(+e.target.value);const max=+e.target.max;if(n>=1&&n<=max)go(n);else{toast(`请输入 1–${max} 之间的页码`,'warn');e.target.select()}});
}
// 数字滚动：KPI 进入时从 0 增长到目标值（保留原有格式：千分位、百分号、小数）
function countUp(root=document){
 root.querySelectorAll('[data-count]').forEach(el=>{const raw=el.dataset.count,target=parseFloat(raw.replace(/,/g,'')),dec=(raw.split('.')[1]||'').replace(/\D/g,'').length,suffix=raw.replace(/^[\d,.]+/,''),comma=raw.includes(',');if(isNaN(target))return;const t0=performance.now(),dur=700;const f=v=>{let s=v.toFixed(dec);if(comma)s=Number(s).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});return s+suffix};const step=now=>{const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);el.textContent=f(target*e);if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)});
}
const fmtN=n=>Number(n).toLocaleString('en-US');

// ===== 患者病程摘要（病程分析、队列分析、AI 问答共用同一份数据） =====
const TX_SHORT={MTX:'甲氨蝶呤',HCQ:'羟氯喹',LEF:'来氟米特',SSZ:'柳氮磺吡啶',IGU:'艾拉莫德',ADA:'阿达木单抗',ETN:'依那西普',YSP:'益赛普',IFX:'英夫利西单抗',GLM:'戈利木单抗',TOF:'托法替布',BAR:'巴瑞替尼',UPA:'乌帕替尼',TCZ:'托珠单抗',ABT:'阿巴西普'};
const csText=cs=>(cs||'MTX').split('+').map(k=>TX_SHORT[k]||k).join(' + ');
const phaseDrug=ph=>ph?(ph.bio?TX_SHORT[ph.bio]:csText(ph.cs)):'—';
const _course=new Map();
function courseOf(p){
 if(_course.has(p.id))return _course.get(p.id);
 const M=p._m,age=TODAY.getFullYear()-p.year;let c;
 if(!M||!M.visits.length){
  const f=(store.visits[p.id]||[]).map(v=>v.form?.assessment?.das28Esr).filter(x=>x!=null);
  c={tx:M?M.phases[0].cls:'csDMARD',drug:M?phaseDrug(M.phases[0]):'待定',line:1,months:0,das0:f[0]??null,das6:null,dasNow:f.at(-1)??null,crp0:null,crpNow:null,tjc:null,sjc:null,vas:null,haq:null,sero:M?(M.rfPos||M.ccpPos):p.subtype!=='血清阴性 RA',duration:M?Math.max(1,Math.round(M.durationY)):1,age,series:[],traj:M?M.traj:null,start:null,phases:M?M.phases:[]};
 }else{
  const vs=M.visits,last=vs[vs.length-1],ph=M.phases[last.phase],inPh=vs.filter(v=>v.d>=ph.start);
  const first=(arr,k)=>{for(const v of arr)if(v[k]!=null)return v[k];return null},lastOf=(arr,k)=>{for(let i=arr.length-1;i>=0;i--)if(arr[i][k]!=null)return arr[i][k];return null};
  const months=Math.round((last.d-ph.start)/MONTH_D);let best=null;
  if(months>=6)inPh.forEach(v=>{const m=(v.d-ph.start)/MONTH_D;if(v.das!=null&&m>=4.5&&m<=8&&(!best||Math.abs(m-6)<Math.abs(best.m-6)))best={m,v}});
  c={tx:ph.cls,drug:phaseDrug(ph),line:ph.line,months,das0:first(inPh,'das'),das6:best?best.v.das:null,dasNow:lastOf(vs,'das'),crp0:first(inPh,'crp'),crpNow:lastOf(vs,'crp'),esrNow:lastOf(vs,'esr'),tjc:lastOf(vs,'tjc'),sjc:lastOf(vs,'sjc'),vas:lastOf(vs,'pain'),haq:lastOf(vs,'haq'),hgb:lastOf(vs,'hgb'),alt:lastOf(vs,'alt'),
   sero:M.rfPos||M.ccpPos,duration:Math.max(1,Math.round(M.durationY+(TODAY_D-dnum(p.created))/365.25)),age,series:vs,traj:M.traj,start:dstr(ph.start),phases:M.phases,firstDas:first(vs,'das')};
 }
 _course.set(p.id,c);return c;
}
const actName=d=>d==null?'未评估':d<2.6?'临床缓解':d<=3.2?'低疾病活动':d<=5.1?'中疾病活动':'高疾病活动';
const f1=v=>v==null?'—':(Math.round(v*10)/10).toFixed(1);
const f2=v=>v==null?'—':(Math.round(v*100)/100).toFixed(2);
// 常用检验参考区间（界面异常提示）
const LAB_REF={esr:['ESR','mm/h',0,20],crp:['CRP','mg/L',0,10],hscrp:['hsCRP','mg/L',0,3],wbc:['WBC','×10⁹/L',3.5,9.5],hgb:['HGB','g/L',115,175],plt:['PLT','×10⁹/L',125,350],alt:['ALT','U/L',7,40],ast:['AST','U/L',13,35],ggt:['GGT','U/L',7,45],crea:['CREA','μmol/L',41,111],urea:['UREA','mmol/L',2.6,7.5],glu:['GLU','mmol/L',3.9,6.1],cho:['CHO','mmol/L',0,5.2],tg:['TG','mmol/L',0,1.7],ldlc:['LDL-C','mmol/L',0,3.4],rf:['RF','IU/mL',0,20],antiCcp:['抗 CCP','U/mL',0,17],igg:['IgG','g/L',7,16]};
function labFlags(exam,sex){const out=[];Object.entries(exam||{}).forEach(([k,v])=>{const r=LAB_REF[k];if(!r||typeof v!=='number')return;let lo=r[2],hi=r[3];if(k==='hgb'&&sex==='女'){hi=150}if(k==='hgb'&&sex==='男'){lo=130}if(v>hi)out.push({k,name:r[0],v,unit:r[1],dir:'high',ref:`${lo}–${hi}`});else if(v<lo)out.push({k,name:r[0],v,unit:r[1],dir:'low',ref:`${lo}–${hi}`})});return out}

// ===== AI 回答的流式呈现：先「深度思考」，再逐字输出正文 =====
const aiSleep=ms=>new Promise(r=>setTimeout(r,ms));
function aiNearBottom(sc){return !sc||sc.scrollHeight-sc.scrollTop-sc.clientHeight<80}
async function aiTypeText(node,text,ctl,cps,sc){
 let i=0,last=performance.now();
 while(i<text.length){
  if(ctl.stopped){node.textContent+=text.slice(i);return}
  await new Promise(requestAnimationFrame);
  const now=performance.now(),dt=Math.min(80,now-last);last=now;
  let n=Math.max(1,Math.round(cps*dt/1000*(0.6+Math.random()*0.8)));
  const stick=aiNearBottom(sc);
  node.textContent+=text.slice(i,i+n);i+=n;
  if(/[。；！？\n]/.test(text[i-1]))await aiSleep(ctl.fast?0:60+Math.random()*120);
  if(stick&&sc)sc.scrollTop=sc.scrollHeight;
 }
}
async function aiStreamHTML(target,html,ctl,cps,sc){
 const src=document.createElement('div');src.innerHTML=html;
 const cursor=document.createElement('span');cursor.className='ai-cursor';
 async function walk(from,to){
  for(const ch of [...from.childNodes]){
   if(ch.nodeType===3){if(!ch.textContent.trim()&&/^\s*$/.test(ch.textContent)){to.appendChild(document.createTextNode(ch.textContent));continue}const tn=document.createTextNode('');to.appendChild(tn);to.appendChild(cursor);await aiTypeText(tn,ch.textContent,ctl,cps,sc);}
   else if(ch.nodeType===1){const el=ch.cloneNode(false);to.appendChild(el);if(['TABLE','UL','OL'].includes(el.tagName)&&!ctl.stopped)await aiSleep(120);await walk(ch,el);}
  }
 }
 await walk(src,target);cursor.remove();
}
// 一条 AI 回复：think（思考文本，段落用空行分隔）、html（正文），返回 Promise
async function aiRespond(box,{think,html,deep=true,sc,ctl={stopped:false},onDone}){
 box.classList.add('ai-reply');
 box.innerHTML=`${deep&&think?`<div class="ai-think open"><button type="button" class="ai-think-head" aria-expanded="true"><span class="ai-think-icon" aria-hidden="true"></span><span class="ai-think-label">思考中</span><span class="ai-think-dots" aria-hidden="true"><i></i><i></i><i></i></span><svg class="ai-think-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button><div class="ai-think-body"></div></div>`:'<div class="ai-pending"><i></i><i></i><i></i></div>'}<div class="ai-answer"></div><div class="ai-actions" hidden><button type="button" data-act="copy" title="复制"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button><button type="button" data-act="retry" title="重新生成"><svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></svg></button><button type="button" data-act="up" title="有帮助"><svg viewBox="0 0 24 24"><path d="M7 11v9H4v-9h3Zm0 0 4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/></svg></button><button type="button" data-act="down" title="没帮助"><svg viewBox="0 0 24 24"><path d="M17 13V4h3v9h-3Zm0 0-4 7a2 2 0 0 1-2-2v-4H6a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 7.2 4H17"/></svg></button><span class="ai-meta"></span></div>`;
 const t0=performance.now(),think_=box.querySelector('.ai-think'),ans=box.querySelector('.ai-answer');
 if(think_){
  const head=think_.querySelector('.ai-think-head'),body=think_.querySelector('.ai-think-body'),label=think_.querySelector('.ai-think-label');
  head.onclick=()=>{const o=think_.classList.toggle('open');head.setAttribute('aria-expanded',String(o))};
  await aiSleep(ctl.fast?0:700+Math.random()*700);
  for(const para of think.split(/\n\s*\n/)){if(ctl.stopped)break;const pEl=document.createElement('p');body.appendChild(pEl);await aiTypeText(pEl,para.trim(),ctl,ctl.fast?4000:48+Math.random()*22,sc);if(!ctl.stopped)await aiSleep(ctl.fast?0:220+Math.random()*260)}
  const secs=Math.max(1,Math.round((performance.now()-t0)/1000));
  think_.classList.add('done');label.textContent=ctl.stopped?'已停止思考':`已深度思考（用时 ${secs} 秒）`;think_.querySelector('.ai-think-dots').remove();
  await aiSleep(ctl.fast?0:260);
 }else{await aiSleep(ctl.fast?0:500+Math.random()*500);box.querySelector('.ai-pending')?.remove()}
 if(!ctl.stopped)await aiStreamHTML(ans,html,ctl,ctl.fast?20000:190,sc);
 if(ctl.stopped&&!ans.textContent.trim())ans.innerHTML='<p class="ai-stopped">已停止生成</p>';else if(ctl.stopped)ans.insertAdjacentHTML('beforeend','<p class="ai-stopped">（已停止生成）</p>');
 const acts=box.querySelector('.ai-actions');acts.hidden=false;
 acts.querySelector('.ai-meta').textContent=`${ctl.stopped?'已中断':'生成完成'} · ${new Date().toTimeString().slice(0,5)}`;
 acts.onclick=e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='copy'){const txt=ans.innerText;(navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>toast('已复制到剪贴板')).catch(()=>{const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('已复制到剪贴板')}catch(e2){}ta.remove()})}
  if(a==='up'||a==='down'){acts.querySelectorAll('[data-act=up],[data-act=down]').forEach(x=>x.classList.toggle('on',x===b&&!b.classList.contains('on')));toast(a==='up'?'感谢反馈，我们会继续保持':'感谢反馈，我们会持续改进')}
  if(a==='retry'&&box._retry)box._retry();
 };
 if(sc&&aiNearBottom(sc))sc.scrollTop=sc.scrollHeight;
 onDone&&onDone();
}
// 输入框：自动增高；生成中发送按钮变为停止
function aiComposer(input,sendBtn,{onSend,onStop}){
 const grow=()=>{input.style.height='auto';input.style.height=Math.min(180,input.scrollHeight)+'px';sendBtn.disabled=!input.value.trim()&&!sendBtn.classList.contains('stop')};
 input.addEventListener('input',grow);
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!sendBtn.classList.contains('stop'))sendBtn.click()}});
 sendBtn.addEventListener('click',e=>{e.preventDefault();if(sendBtn.classList.contains('stop')){onStop();return}const q=input.value.trim();if(!q)return;input.value='';grow();onSend(q)});
 grow();
 return {busy(on){sendBtn.classList.toggle('stop',on);sendBtn.setAttribute('aria-label',on?'停止生成':'发送');sendBtn.title=on?'停止生成':'发送';grow()}};
}

// ===== 患者 / 访视维度的 AI 回答 =====
const TRIGGER_TXT={stop:'自行停药',reduce:'自行减药',irregular:'间断服药',infection:'合并感染',fatigue:'劳累',cold:'受凉感冒',weather:'天气变化',emotion:'情绪刺激'};
const CHANGE_TXT={poor_efficacy:'疗效不佳',adverse:'不良反应',economic:'经济原因',other:'其他原因'};
function patientAnswer(p,q,visit){
 const c=courseOf(p),vs=c.series,cs=comorbidCodes(p),nm=escapeHTML(p.name);
 const t=q.replace(/\s+/g,'');
 if(!vs.length)return {think:`用户想了解${p.name}的情况。我先检查这位患者的随访记录：目前已建档，但尚未完成基线访视，没有疾病活动度、检验和用药记录。\n\n没有数据就不能下结论，应当提示先完成基线访视。`,html:`<p>${nm} 目前<b>尚未完成基线访视</b>，系统中还没有疾病活动度、检验和用药记录，暂时无法分析病情。</p><p>建议尽快安排基线访视，录入 TJC28 / SJC28、ESR / CRP、患者总体评价和当前用药，录入后即可生成病程分析。</p>`};
 const withDas=vs.filter(v=>v.das!=null),first=withDas[0],last=withDas.at(-1)||vs.at(-1);
 const peak=withDas.reduce((m,v)=>!m||v.das>m.das?v:m,null),low=withDas.reduce((m,v)=>!m||v.das<m.das?v:m,null);
 const changes=vs.filter(v=>v.regimenChanged),triggers=vs.filter(v=>v.trigger);
 const delta=first&&last&&first!==last?last.das-first.das:0;
 const trend=delta<=-1.2?'明显改善':delta<=-0.6?'有所改善':delta>=0.6?'较前加重':'总体平稳';
 const v=visit&&visit.k!=null?vs[visit.k]:null;
 // 本次访视
 if(v){
  const fm=visitFormOf(p,v.k)||{},flags=labFlags(fm.exam,p.sex),prev=v.k>0?vs[v.k-1]:null,meds=(fm.treatment?.medications||[]);
  return {think:`用户在看${p.name}的${v.date}这次访视，想知道需要关注什么。我按三个方面梳理：疾病活动度和上次比有没有变化；检验里有哪些超出参考区间；治疗方案有没有调整。\n\n本次 DAS28-ESR ${f2(v.das)}${prev&&prev.das!=null?`，上次是 ${f2(prev.das)}`:''}。检验异常 ${flags.length} 项${flags.length?`：${flags.map(f=>f.name+' '+f.v).join('、')}`:''}。${v.regimenChanged?`本次调整了方案，原因是${CHANGE_TXT[v.changeReason]||'疗效不佳'}。`:'本次方案没有调整。'}${v.trigger?`病史里记录了诱因：${TRIGGER_TXT[v.trigger]}。`:''}\n\n回答时先给结论，再列证据，最后给可执行的关注点。`,
   html:`<p><b>本次访视（${v.date}）小结：</b>DAS28-ESR <b>${f2(v.das)}</b>（${actName(v.das)}）${prev&&prev.das!=null&&v.das!=null?`，较上次 ${f2(prev.das)} ${v.das<prev.das?'下降':'上升'} ${Math.abs(v.das-prev.das).toFixed(2)}`:''}。</p><ul><li><b>关节与评分：</b>TJC28 ${v.tjc??'—'}，SJC28 ${v.sjc??'—'}，患者总体评价 ${v.gh}，疼痛 VAS ${v.pain}，HAQ ${v.haq}。</li><li><b>检验异常：</b>${flags.length?flags.map(f=>`${f.name} ${f.v} ${f.unit}（${f.dir==='high'?'↑':'↓'}，参考 ${f.ref}）`).join('；'):'本次检验均在参考区间内'}。</li><li><b>治疗：</b>${meds.length?meds.slice(0,4).map(m=>escapeHTML(m.drugName)).join('、'):'未记录用药'}${v.regimenChanged?`；本次因<b>${CHANGE_TXT[v.changeReason]||'疗效不佳'}</b>调整方案`:'；方案与上次一致'}。</li>${v.trigger?`<li><b>加重诱因：</b>${TRIGGER_TXT[v.trigger]}，建议加强用药依从性宣教。</li>`:''}</ul><p><b>建议关注：</b>${v.das>3.2?'当前未达标，按达标治疗策略建议 1–3 个月内复评；':'当前处于目标范围内，可按原周期随访；'}${flags.some(f=>f.k==='alt')?'转氨酶升高，需复查肝功能并评估甲氨蝶呤 / 来氟米特 / 雷公藤等药物剂量；':''}${flags.some(f=>f.k==='hgb'&&f.dir==='low')?'存在贫血，可结合炎症指标判断是否为慢性病贫血；':''}请结合完整病历判断。</p>`};
 }
 const tableRows=vs.filter(x=>x.das!=null).slice(-6).map(x=>`<tr><td>${x.date}</td><td>${f2(x.das)}</td><td>${actName(x.das)}</td><td>${x.esr??'—'}</td><td>${x.crp??'—'}</td><td>${x.tjc??'—'}/${x.sjc??'—'}</td></tr>`).join('');
 const table=`<table><thead><tr><th>访视日期</th><th>DAS28-ESR</th><th>分层</th><th>ESR</th><th>CRP</th><th>TJC/SJC</th></tr></thead><tbody>${tableRows}</tbody></table>`;
 if(/异常|指标|检验|化验|CRP|ESR|肝功|血常规/i.test(t)){
  const fm=visitFormOf(p,vs.at(-1).k)||{},flags=labFlags(fm.exam,p.sex),altHigh=vs.filter(x=>x.alt>40),anemia=vs.filter(x=>x.hgb!=null&&x.hgb<(p.sex==='女'?115:130)),crpHigh=vs.filter(x=>x.crp>10);
  return {think:`用户问${p.name}哪些指标异常。我需要同时看最近一次和全部 ${vs.length} 次访视，区分"持续异常"和"一过性异常"。\n\n最近一次（${vs.at(-1).date}）异常 ${flags.length} 项。历次看：CRP > 10 mg/L 共 ${crpHigh.length} 次，ALT > 40 U/L 共 ${altHigh.length} 次，血红蛋白低于参考下限 ${anemia.length} 次。\n\n炎症指标和疾病活动度一般同向变化，可以对照 DAS28 一起解读。`,
   html:`<p><b>最近一次访视（${vs.at(-1).date}）</b>${flags.length?`有 <b>${flags.length} 项</b>检验超出参考区间：`:'检验均在参考区间内。'}</p>${flags.length?`<ul>${flags.map(f=>`<li>${f.name} <b>${f.v}</b> ${f.unit}（${f.dir==='high'?'偏高 ↑':'偏低 ↓'}，参考 ${f.ref}）</li>`).join('')}</ul>`:''}<p><b>历次随访的异常情况（共 ${vs.length} 次访视）：</b></p><ul><li>炎症指标：CRP &gt; 10 mg/L 出现 ${crpHigh.length} 次${crpHigh.length?`，最高 ${Math.max(...crpHigh.map(x=>x.crp))} mg/L（${crpHigh.reduce((m,x)=>x.crp>m.crp?x:m).date}）`:''}</li><li>肝功能：ALT &gt; 40 U/L 出现 ${altHigh.length} 次${altHigh.length?`，最高 ${Math.max(...altHigh.map(x=>x.alt))} U/L`:''}</li><li>血红蛋白偏低：${anemia.length} 次</li></ul>${table}<p>${crpHigh.length>=Math.ceil(vs.length/2)?'炎症指标<b>持续偏高</b>，与疾病活动度一致，提示炎症控制不充分。':'炎症指标多数时间在可接受范围。'}${altHigh.length?'曾出现转氨酶升高，用药期间建议每 4–8 周监测肝功能。':''}</p>`};
 }
 if(/治疗|用药|方案|药|调整/.test(t)){
  const rows=c.phases.map((ph,i)=>`<tr><td>${dstr(ph.start)}</td><td>${i===0?'初始方案':'方案调整'}</td><td>${escapeHTML(ph.bio?`${csText(ph.cs)} + ${TX_SHORT[ph.bio]}`:csText(ph.cs))}</td><td>${ph.cls} · ${ph.line} 线</td></tr>`).join('');
  return {think:`用户想看${p.name}的治疗方案和历次调整。我从治疗记录里按时间排一下：共 ${c.phases.length} 个治疗阶段${changes.length?`，在 ${changes.map(x=>x.date).join('、')} 做过调整`:'，入组以来没有换药'}。\n\n还要看每次调整前后疾病活动度的变化，判断调整是否有效。当前方案已使用 ${c.months} 个月，从 DAS28 ${f2(c.das0)} 到 ${f2(c.dasNow)}。${p._m&&p._m.patentKey?`另外联合了中成药${TCM_PATENT[p._m.patentKey].name}。`:''}`,
   html:`<p>${nm} 当前方案为 <b>${escapeHTML(c.drug)}</b>（${c.tx} · ${c.line} 线），已使用 <b>${c.months} 个月</b>，DAS28-ESR 由 ${f2(c.das0)} 变为 <b>${f2(c.dasNow)}</b>（${actName(c.dasNow)}）。</p><table><thead><tr><th>开始日期</th><th>阶段</th><th>西药方案</th><th>分类</th></tr></thead><tbody>${rows}</tbody></table>${p._m&&p._m.patentKey?`<p>中成药：${TCM_PATENT[p._m.patentKey].name} ${TCM_PATENT[p._m.patentKey].dose} ${TCM_PATENT[p._m.patentKey].unit} ${FREQ_TXT[TCM_PATENT[p._m.patentKey].freq]}${p._m.useHerbal?'；同时按证型开具中药饮片':''}。</p>`:''}<p>${changes.length?`调整原因：${changes.map(x=>`${x.date} ${CHANGE_TXT[x.changeReason]||'疗效不佳'}`).join('；')}。`:''}${c.dasNow!=null&&c.dasNow<=3.2?'目前已达标，建议维持当前方案，稳定 6 个月以上可考虑逐步减停激素 / NSAIDs。':'目前仍未达标，按 Treat-to-Target 原则，若 3 个月无明显改善、6 个月未达标，可考虑调整方案。'}</p>`};
 }
 if(/病史|合并|其他疾病|共病|纤维肌痛|间质|骨质疏松/.test(t)){
  return {think:`用户问${p.name}的其他病史。档案里记录的常见相关疾病有 ${cs.length} 项${cs.length?'：'+cs.map(x=>(COMORBIDITY_INFO[x]||{}).name||x).join('、'):''}。\n\n需要说明这些合并疾病对 RA 评估和用药的影响，比如 FM 会抬高 DAS28，间质性肺病要注意甲氨蝶呤的使用。`,
   html:cs.length?`<p>${nm} 已确诊的其他疾病共 <b>${cs.length}</b> 项：</p><ul>${cs.map(x=>{const d=p.comorbid[x],i=COMORBIDITY_INFO[x]||{name:x};return `<li><b>${x} ${i.name}</b>（${d.since} 年起）：${escapeHTML(d.status)}；${escapeHTML((d.core||[]).join('，'))}；治疗：${escapeHTML(d.treatment)}</li>`}).join('')}</ul><p>${cs.map(x=>(COMORBIDITY_INFO[x]||{}).relevance).filter(Boolean).slice(0,2).join('')}</p>`:`<p>${nm} 已确认无 FM、AS、间质性肺病、骨质疏松等常见相关疾病。</p>`};
 }
 if(/中医|证型|舌|脉|辨证/.test(t)){
  const fm=visitFormOf(p,vs.at(-1).k)||{},tc=fm.tcm||{},base=visitFormOf(p,0)?.tcm||{};
  return {think:`用户关心${p.name}的中医辨证。我对比基线和最近一次的证型、舌脉：基线 ${SYN_LABEL[base.mainSyndrome]||'—'}，最近 ${SYN_LABEL[tc.mainSyndrome]||'—'}。\n\n证型随疾病活动变化是常见的：活动期多见湿热、痰瘀等实证，缓解后多转为肝肾不足、气血两虚等虚证。`,
   html:`<p>${nm} 基线辨证为 <b>${SYN_LABEL[base.mainSyndrome]||'—'}</b>，最近一次（${vs.at(-1).date}）为 <b>${SYN_LABEL[tc.mainSyndrome]||'—'}</b>${(tc.secondarySyndromes||[]).length?`，兼${tc.secondarySyndromes.map(x=>SYN_LABEL[x]).join('、')}`:''}。</p><p>最近舌脉：舌${({pale:'淡白',light_red:'淡红',red:'红',crimson:'绛',purple:'紫暗'})[tc.tongueColor]||'—'}，${({normal:'舌形正常',enlarged:'舌体胖大',thin:'舌体瘦薄',teeth_marks:'边有齿痕',fissured:'有裂纹'})[tc.tongueShape]||''}，苔${({thin:'薄',thick:'厚',greasy:'腻',dry:'燥',peeled:'剥'})[tc.coatingTexture]||''}${({white:'白',yellow:'黄',grey_black:'灰黑'})[tc.coatingColor]||''}，脉${escapeHTML(tc.pulse||'—')}。</p><p>${base.mainSyndrome!==tc.mainSyndrome?'证型由实转虚 / 由虚夹实，与疾病活动度变化一致，可相应调整治法（如由清热利湿转为补益肝肾）。':'证型较稳定，可守方加减。'}${fm.treatment?.herbalFormula?`当前中药处方：${escapeHTML(fm.treatment.herbalFormula)}。`:''}</p>`};
 }
 // 默认：病程总结
 return {think:`用户想了解${p.name}近期的病情变化。我先整理时间线：${p.created} 入组，共 ${vs.length} 次访视，其中 ${withDas.length} 次有完整的 DAS28 评分。\n\n疾病活动度从基线 ${f2(first&&first.das)} 到最近 ${f2(last&&last.das)}，${trend}。${peak&&low?`最高 ${f2(peak.das)}（${peak.date}），最低 ${f2(low.das)}（${low.date}）。`:''}${changes.length?`期间 ${changes.length} 次调整方案。`:''}${triggers.length?`记录到的加重诱因：${[...new Set(triggers.map(x=>TRIGGER_TXT[x.trigger]))].join('、')}。`:''}\n\n${cs.length?`另外还合并 ${cs.join('、')}，解读评分时需要考虑。`:''}回答先给一句话结论，再列关键节点和数据。`,
  html:`<p><b>一句话结论：</b>${nm} 入组以来疾病活动度<b>${trend}</b>，DAS28-ESR 由 ${f2(first&&first.das)} 变为 <b>${f2(last&&last.das)}</b>（${actName(last&&last.das)}）${last&&last.das!=null?(last.das<=3.2?'，已达到治疗目标':'，尚未达到治疗目标'):''}。</p><ul><li><b>病程：</b>病程约 ${c.duration} 年，${c.sero?'血清学阳性（RF / 抗 CCP）':'血清学阴性'}，${p.created} 入组，累计 ${vs.length} 次访视。</li><li><b>当前治疗：</b>${escapeHTML(c.drug)}（${c.tx}，已用 ${c.months} 个月）${changes.length?`；入组后调整方案 ${changes.length} 次（${changes.map(x=>x.date).join('、')}）`:''}。</li>${triggers.length?`<li><b>加重诱因：</b>${[...new Set(triggers.map(x=>`${TRIGGER_TXT[x.trigger]}（${x.date}）`))].join('、')}。</li>`:''}<li><b>最近一次：</b>${vs.at(-1).date}，TJC28 ${c.tjc??'—'} / SJC28 ${c.sjc??'—'}，CRP ${c.crpNow??'—'} mg/L，HAQ ${c.haq??'—'}。</li>${cs.length?`<li><b>合并疾病：</b>${cs.map(x=>`${x} ${(COMORBIDITY_INFO[x]||{}).name||''}`).join('、')}。${cs.includes('FM')?'合并纤维肌痛时 DAS28 可能被压痛关节数和总体评价抬高。':''}</li>`:''}</ul>${table}<p class="ai-ref">以上内容根据该患者的结构化随访数据生成，仅供临床参考。</p>`};
}

// 患者 / 访视侧边 AI 助手（患者详情、访视详情、病程分析页共用）
window.openAIChat=function(opts={}){
  const scope=opts.scope||'patient',patient=opts.patient||{},visit=opts.visit||null;
  let drawer=document.getElementById('ai-assistant-drawer');
  if(!drawer){
    const backdrop=document.createElement('div');backdrop.id='ai-drawer-backdrop';backdrop.className='ai-drawer-backdrop';document.body.appendChild(backdrop);
    drawer=document.createElement('aside');drawer.id='ai-assistant-drawer';drawer.className='ai-drawer';drawer.setAttribute('aria-label','AI 病情助手');
    drawer.innerHTML=`<div class="ai-drawer-head"><div class="ai-drawer-title"><span class="ai-drawer-title-mark">AI</span><span><strong>AI 病情助手</strong><small>基于当前患者的结构化随访数据</small></span></div><div class="ai-drawer-tools"><button class="ai-icon-btn" id="ai-drawer-new" title="新对话">＋</button><button class="ai-icon-btn" id="ai-drawer-expand" title="展开">↔</button><button class="ai-icon-btn" id="ai-drawer-close" title="关闭">×</button></div></div><div class="ai-context" id="ai-context"></div><div class="ai-chat" id="ai-chat"></div><div class="ai-compose"><div class="ai-compose-box"><textarea id="ai-input" rows="1" placeholder="针对当前患者病情提问，Enter 发送，Shift + Enter 换行"></textarea><div class="ai-compose-bar"><button type="button" class="ai-deep on" id="ai-deep" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3Z"/><path d="M9.5 20.5h5"/></svg>深度思考</button><button class="ai-send" id="ai-send" aria-label="发送"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg><i class="ai-stop-icon"></i></button></div></div><div class="ai-disclaimer">内容由 AI 基于研究数据生成，仅供临床参考，请结合实际情况判断。</div></div>`;
    document.body.appendChild(drawer);
    backdrop.onclick=()=>window.closeAIChat();
    drawer.querySelector('#ai-drawer-close').onclick=()=>window.closeAIChat();
    drawer.querySelector('#ai-drawer-expand').onclick=()=>{drawer.classList.toggle('wide');document.body.classList.toggle('ai-drawer-wide',drawer.classList.contains('wide'));};
    drawer.querySelector('#ai-deep').onclick=e=>{const b=e.currentTarget,on=!b.classList.contains('on');b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))};
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawer.classList.contains('open'))window.closeAIChat()});
  }
  const chat=drawer.querySelector('#ai-chat'),input=drawer.querySelector('#ai-input'),send=drawer.querySelector('#ai-send');
  const p=patient.id?patientById(patient.id):patient;
  const visitText=visit?`${visit.date||''} ${visit.type||'本次访视'}`:'全部随访记录';
  drawer.querySelector('#ai-context').innerHTML=`<strong>当前患者：</strong>${escapeHTML(p.name||'当前患者')} <span class="ai-context-badge">${scope==='visit'?'单次访视':'患者全程'}</span><br><strong>数据范围：</strong>${escapeHTML(visitText)} · ${demoVisits(p).length} 次访视`;
  const suggestions=scope==='visit'?['总结本次访视需要关注的问题','哪些检查指标异常？','本次治疗方案有什么变化？']:['总结患者近期病情变化','哪些指标持续异常？','治疗方案历次如何调整？','中医证型有什么变化？'];
  chat.innerHTML=`<div class="ai-msg assistant ai-welcome"><span class="ai-msg-label">AI 病情助手</span>我已载入 <b>${escapeHTML(p.name||'该患者')}</b> 的${scope==='visit'?'本次访视及历次对照数据':'基础资料与历次随访'}。可以一边查看左侧病历，一边针对病情继续提问。<div class="ai-suggestions">${suggestions.map(x=>`<button class="ai-suggestion">${escapeHTML(x)}</button>`).join('')}</div></div>`;
  let ctl=null;
  const comp=drawer._comp||(drawer._comp=aiComposer(input,send,{onSend:q=>drawer._ask(q),onStop:()=>{if(drawer._ctl)drawer._ctl.stopped=true}}));
  drawer._ask=q=>{
    chat.insertAdjacentHTML('beforeend',`<div class="ai-msg user"><span class="ai-msg-label">我</span>${escapeHTML(q)}</div>`);chat.scrollTop=chat.scrollHeight;
    const box=document.createElement('div');box.className='ai-msg assistant';chat.appendChild(box);
    const run=()=>{const v=scope==='visit'&&visit?{...visit,k:visit.k??(/^v\d+$/.test(visit.id||'')?+visit.id.slice(1):null)}:null;const ans=patientAnswer(p,q,/本次|这次|访视/.test(q)||scope==='visit'?v:null);ctl={stopped:false};drawer._ctl=ctl;comp.busy(true);aiRespond(box,{...ans,deep:drawer.querySelector('#ai-deep').classList.contains('on'),sc:chat,ctl,onDone:()=>comp.busy(false)})};
    box._retry=run;run();
  };
  chat.querySelectorAll('.ai-suggestion').forEach(b=>b.onclick=()=>{if(send.classList.contains('stop'))return;drawer._ask(b.textContent)});
  drawer.querySelector('#ai-drawer-new').onclick=()=>window.openAIChat(opts);
  document.getElementById('ai-drawer-backdrop').classList.add('open');drawer.classList.add('open');document.body.classList.add('ai-drawer-open');
  setTimeout(()=>input.focus(),220);
};
window.closeAIChat=function(){const d=document.getElementById('ai-assistant-drawer'),b=document.getElementById('ai-drawer-backdrop');if(d){d.classList.remove('open');if(d._ctl)d._ctl.stopped=true}if(b)b.classList.remove('open');document.body.classList.remove('ai-drawer-open','ai-drawer-wide');};


// ===== 其他病史 / 常见相关疾病：病程简要弹窗（患者列表与随访页共用） =====
const COMORBIDITY_INFO={
 FM:{code:'FM',name:'纤维肌痛',en:'Fibromyalgia',
  intro:'以慢性广泛性疼痛为核心，常伴疲劳、睡眠障碍和认知症状（“纤维雾”）。病程慢性、波动，一般不造成关节或器官结构损害，但对生活质量影响明显。',
  stages:[['起病','局部或多部位疼痛，数月内逐渐扩展为全身广泛疼痛'],['确立','疼痛持续 ≥ 3 个月，WPI / SSS 达到诊断标准，伴睡眠与疲劳问题'],['慢性波动','症状时轻时重，应激、睡眠不足、天气变化常诱发加重'],['管理','以运动、认知行为治疗等非药物干预为主，可联合度洛西汀、普瑞巴林等']],
  relevance:'RA 患者合并 FM 时，压痛关节数与患者总体评估可能偏高，导致 DAS28 高估疾病活动，解读时需与炎症指标（CRP/ESR、肿胀关节数）对照。'},
 AS:{code:'AS',name:'强直性脊柱炎',en:'Ankylosing Spondylitis',
  intro:'以骶髂关节和脊柱慢性炎症为主的脊柱关节炎，典型表现为 40 岁前起病的炎性腰背痛，HLA-B27 阳性率高。',
  stages:[['早期','炎性腰背痛、晨僵，MRI 可见骶髂关节骨髓水肿'],['进展','骶髂关节侵蚀、硬化，脊柱出现韧带骨赘'],['晚期','脊柱部分或完全融合（“竹节样脊柱”），活动度明显受限'],['伴随表现','可出现外周关节炎、肌腱端炎、葡萄膜炎；以 BASDAI / ASDAS 评估活动度']],
  relevance:'RA 与 AS 同时存在较少见，需核实诊断依据（影像、HLA-B27、RF/抗 CCP）；两者生物制剂选择存在交叉，分析治疗暴露时需一并考虑。'},
 'RA-ILD':{code:'RA-ILD',name:'间质性肺病',en:'RA-associated Interstitial Lung Disease',
  intro:'RA 最常见的肺部关节外表现，HRCT 以 UIP、NSIP 型为主；男性、吸烟、高滴度 RF / 抗 CCP 与疾病高活动是主要危险因素。',
  stages:[['亚临床期','HRCT 可见胸膜下网格影或磨玻璃影，多无症状'],['临床期','活动后气短、干咳，肺功能 FVC / DLCO 下降'],['进展期','纤维化范围扩大，可出现蜂窝肺，急性加重风险上升'],['管理','控制 RA 活动，必要时抗纤维化治疗（吡非尼酮、尼达尼布），定期复查 HRCT 与肺功能']],
  relevance:'合并 RA-ILD 时，甲氨蝶呤、来氟米特的使用需评估肺部风险，阿巴西普、利妥昔单抗等常作为优先选择；分析疗效时应将 ILD 作为重要协变量。'},
 SjS:{code:'SjS',name:'继发性干燥综合征',en:"Secondary Sjögren's Syndrome",
  intro:'约 10%–30% 的 RA 患者合并继发性干燥综合征，表现为口干、眼干，抗 SSA / SSB 抗体可阳性，唇腺活检见灶性淋巴细胞浸润。',
  stages:[['腺体期','口眼干燥为主，泪液、唾液分泌减少'],['系统受累','可出现紫癜、肺间质病变、肾小管酸中毒等腺外表现'],['长期风险','淋巴瘤风险较普通人群升高，需关注腮腺持续肿大'],['管理','人工泪液 / 唾液替代、M 受体激动剂，腺外受累按病情加用免疫抑制剂']],
  relevance:'合并 SjS 的 RA 患者 IgG、ANA 阳性率更高，ESR 可因高球蛋白血症偏高，评估 DAS28-ESR 时建议同时参考 DAS28-CRP。'},
 OP:{code:'OP',name:'骨质疏松症',en:'Osteoporosis',
  intro:'RA 患者骨质疏松患病率约为普通人群的 2 倍，与慢性炎症、糖皮质激素、活动减少和绝经相关。',
  stages:[['骨量减少','T 值 -1.0 至 -2.5，多无症状'],['骨质疏松','T 值 ≤ -2.5，骨折风险明显增加'],['脆性骨折','椎体压缩性骨折、髋部骨折等'],['管理','钙剂 + 维生素 D，双膦酸盐 / 地舒单抗，减少激素用量与跌倒风险']],
  relevance:'长期使用糖皮质激素的 RA 患者应定期评估 FRAX 与骨密度；分析激素暴露与安全性结局时需纳入骨质疏松信息。'},
 HTN:{code:'HTN',name:'高血压',en:'Hypertension',
  intro:'RA 患者心血管疾病风险较普通人群升高约 1.5 倍，高血压是最常见的合并症之一。',
  stages:[['1 级','140–159 / 90–99 mmHg'],['2 级','160–179 / 100–109 mmHg'],['3 级','≥ 180 / 110 mmHg'],['管理','生活方式干预 + 降压药物，NSAIDs 与激素可使血压升高']],
  relevance:'NSAIDs、糖皮质激素、来氟米特可升高血压；JAK 抑制剂用于心血管高危患者时需评估获益与风险。'},
 T2DM:{code:'T2DM',name:'2 型糖尿病',en:'Type 2 Diabetes Mellitus',
  intro:'慢性炎症与胰岛素抵抗相关，长期糖皮质激素会进一步升高血糖。',
  stages:[['糖尿病前期','空腹血糖受损或糖耐量异常'],['确诊','HbA1c ≥ 6.5% 或空腹血糖 ≥ 7.0 mmol/L'],['并发症','微血管与大血管并发症，感染风险增加'],['管理','控制血糖，尽量减少激素用量，关注感染风险']],
  relevance:'合并糖尿病会增加生物制剂治疗期间的感染风险；激素使用与血糖波动需同步记录。'},
 HLP:{code:'HLP',name:'高脂血症',en:'Hyperlipidemia',
  intro:'RA 存在“脂质悖论”：高炎症时血脂偏低、心血管风险反而升高；炎症控制后血脂常回升。',
  stages:[['边缘升高','LDL-C 3.4–4.1 mmol/L'],['升高','LDL-C ≥ 4.1 mmol/L 或 TG ≥ 2.3 mmol/L'],['合并动脉粥样硬化','颈动脉斑块、冠心病等'],['管理','他汀类药物，按心血管风险分层确定目标值']],
  relevance:'托珠单抗与 JAK 抑制剂治疗后血脂可升高，用药 4–8 周建议复查血脂。'},
 HT:{code:'HT',name:'桥本甲状腺炎',en:"Hashimoto's Thyroiditis",
  intro:'自身免疫性甲状腺疾病，RA 女性患者中较常见，TPOAb 阳性，可逐渐发展为甲状腺功能减退。',
  stages:[['甲功正常期','抗体阳性，甲功正常'],['亚临床甲减','TSH 升高，FT4 正常'],['临床甲减','乏力、怕冷、水肿'],['管理','左甲状腺素替代，定期复查甲功']],
  relevance:'甲减引起的乏力、肌痛可能影响患者总体评价与 HAQ，解读 PRO 指标时需考虑。'},
 'RA-MS':{code:'RA-MS',name:'肌少症',en:'RA & Sarcopenia',
  intro:'以骨骼肌量减少、肌力下降和躯体功能减退为特征，RA 患者患病率约 25%–30%，与炎症、活动减少和营养不足相关。',
  stages:[['肌量减少','ASM/身高² 低于切点'],['肌少症','肌量减少 + 握力或步速下降'],['严重肌少症','三者均下降，跌倒与骨折风险高'],['管理','抗阻运动、蛋白质与维生素 D 补充，控制疾病活动']],
  relevance:'肌少症会影响 HAQ 与功能结局，是 RA 远期残疾的重要因素；建议在功能评估中同时记录握力和步速。'},
 CHD:{code:'CHD',name:'冠心病',en:'Coronary Heart Disease',
  intro:'RA 患者动脉粥样硬化进展更快，冠心病风险与疾病活动度、病程和激素用量相关。',
  stages:[['稳定型','劳力性胸闷、胸痛'],['急性冠脉综合征','不稳定心绞痛、心肌梗死'],['血运重建后','PCI / CABG 术后二级预防'],['管理','抗血小板、他汀，控制 RA 炎症可降低心血管事件']],
  relevance:'合并冠心病时慎用 NSAIDs 和 COX-2 抑制剂；JAK 抑制剂用于心血管高危患者需权衡风险。'}
};
const comorbidCodes=p=>Object.keys((p&&p.comorbid)||{});
// 常见相关疾病编辑（新建患者 / 编辑档案共用）：FM、AS 勾选后填写起病年份、当前状态、核心指标、治疗；或勾选「已确认无」
function comorbidEditorHTML(){
 const det=c=>`<div class="comorbid-detail" data-cm-detail="${c}" hidden><b>${c} ${COMORBIDITY_INFO[c].name}</b><label class="form-field"><span>起病年份</span><input type="number" name="cm_${c}_since" min="1950" max="2100" step="1" placeholder="如 2019"></label><label class="form-field"><span>当前状态</span><input name="cm_${c}_status" placeholder="如：症状稳定，间断加重"></label><label class="form-field"><span>核心指标</span><input name="cm_${c}_core" placeholder="多项用；分隔"></label><label class="form-field"><span>治疗</span><input name="cm_${c}_treatment" placeholder="如：度洛西汀 60 mg/日"></label></div>`;
 return `<div class="form-field span-3 comorbid-editor" id="comorbid-editor"><span>常见相关疾病（其他病史）</span><div class="choice-row">${Object.keys(COMORBIDITY_INFO).map(c=>`<label><input type="checkbox" name="cm_has" value="${c}"> ${c} ${COMORBIDITY_INFO[c].name}</label>`).join('')}<label><input type="checkbox" name="cm_none" value="1"> 已确认无常见相关疾病</label></div>${Object.keys(COMORBIDITY_INFO).map(det).join('')}</div>`;
}
function bindComorbidEditor(root){
 const box=root.querySelector('#comorbid-editor');if(!box)return;
 const sync=e=>{
  if(e&&e.target.name==='cm_none'&&e.target.checked)box.querySelectorAll('[name=cm_has]').forEach(x=>x.checked=false);
  if(e&&e.target.name==='cm_has'&&e.target.checked)box.querySelector('[name=cm_none]').checked=false;
  box.querySelectorAll('[name=cm_has]').forEach(x=>box.querySelector(`[data-cm-detail="${x.value}"]`).hidden=!x.checked);
 };
 box.addEventListener('change',sync);sync();
}
function readComorbid(root){
 const box=root.querySelector('#comorbid-editor'),out={};if(!box)return {comorbid:{},none:false};
 box.querySelectorAll('[name=cm_has]:checked').forEach(x=>{const c=x.value,v=n=>(box.querySelector(`[name=cm_${c}_${n}]`)?.value||'').trim();out[c]={since:+v('since')||null,status:v('status'),core:v('core')?v('core').split(/[；;]/).map(t=>t.trim()).filter(Boolean):[],treatment:v('treatment')}});
 return {comorbid:out,none:!!box.querySelector('[name=cm_none]')?.checked};
}
function fillComorbid(root,p){
 const box=root.querySelector('#comorbid-editor');if(!box)return;
 Object.entries(p.comorbid||{}).forEach(([c,d])=>{const cb=box.querySelector(`[name=cm_has][value="${c}"]`);if(!cb)return;cb.checked=true;const set=(n,v)=>{const el=box.querySelector(`[name=cm_${c}_${n}]`);if(el)el.value=v??''};set('since',d.since);set('status',d.status);set('core',(d.core||[]).join('；'));set('treatment',d.treatment)});
 box.querySelector('[name=cm_none]').checked=!!p.comorbidNone&&!comorbidCodes(p).length;
 box.dispatchEvent(new Event('change'));
}
// 资料完整性（演示）：按质控缺失规则 QC-M01~M04 检查基线访视数据，返回首个缺失项；完整返回 null
function caseMissing(p,base){
 const b=base||{},a=b.assessment||{},e=b.exam||{};
 if(a.das28Crp==null&&a.das28Esr==null)return '缺 DAS28 评分';
 if(e.esr==null&&e.crp==null)return '缺基线检验';
 if(!(b.treatment?.medications||[]).length)return '缺用药史';
 if(!comorbidCodes(p).length&&!p.comorbidNone)return '缺合并疾病记录';
 return null;
}
const comorbidSummary=p=>comorbidCodes(p).length?comorbidCodes(p).join('、'):(p.comorbidNone?'已确认无':'未记录');
// 脱落原因
const WITHDRAW_REASONS={lost:'失访',withdraw_consent:'撤回知情同意',adverse:'不良事件',death:'死亡',other:'其他'};
function withdrawText(p){if(p.withdrawal)return `${WITHDRAW_REASONS[p.withdrawal.reason]||p.withdrawal.reason}${p.withdrawal.note?`（${p.withdrawal.note}）`:''} · ${p.withdrawal.date}`;return '失访'}

function openComorbidity(code,p){
 const info=COMORBIDITY_INFO[code];if(!info)return;
 const st=STUDIES.find(s=>s.code===code)||{};
 const d=p&&p.comorbid&&p.comorbid[code];
 let dlg=document.getElementById('comorbid-dialog');
 if(!dlg){dlg=document.createElement('dialog');dlg.id='comorbid-dialog';dlg.className='comorbid-dialog';document.body.appendChild(dlg);
  dlg.addEventListener('click',e=>{if(e.target===dlg||e.target.closest('[data-close]'))dlg.close();});}
 dlg.innerHTML=`<div class="cd-head"><span class="cd-code">${info.code}</span><div><h2>${info.name}</h2><small>${info.en} · 病程发展简要</small></div><button type="button" class="cd-x" data-close aria-label="关闭">×</button></div>
 ${d?`<section class="cd-patient"><h3>${escapeHTML(p.name)} 的病程</h3><dl><div><dt>起病</dt><dd>${d.since} 年起（约 ${Math.max(1,TODAY.getFullYear()-d.since)} 年）</dd></div><div><dt>当前情况</dt><dd>${escapeHTML(d.status)}</dd></div><div><dt>核心指标</dt><dd>${d.core.map(escapeHTML).join('；')}</dd></div><div><dt>治疗</dt><dd>${escapeHTML(d.treatment)}</dd></div></dl></section>`:''}
 <p class="cd-intro">${info.intro}</p>
 <ol class="cd-stages">${info.stages.map(s=>`<li><b>${s[0]}</b><span>${s[1]}</span></li>`).join('')}</ol>
 <p class="cd-relevance"><b>对 RA 研究的影响：</b>${info.relevance}</p>
 <p class="cd-note" id="cd-note" hidden></p>
 <div class="cd-actions"><button type="button" class="button" data-close>关闭</button>${st.code?`<button type="button" class="button primary" id="cd-enter">进入 ${info.code} ${info.name}研究数据库查看数据 →</button>`:''}</div>
 <p class="cd-foot">病程说明为通用医学概述，不替代临床判断</p>`;
 const enter=dlg.querySelector('#cd-enter');if(enter)enter.onclick=()=>{
  if(st.ready&&st.url){location.href=st.url+(p?`${st.url.includes('?')?'&':'?'}patient=${encodeURIComponent(p.id)}`:'');return;}
  const n=dlg.querySelector('#cd-note');n.hidden=false;n.textContent=`${info.code} ${info.name}研究数据库尚未接入。接入后点击此处将直接打开${p?`「${p.name}」`:'该患者'}在 ${info.code} 库中的记录。`;
 };
 dlg.showModal();
}


// ===== 来源感知的返回（goBack(-1) 语义） =====
// 从随访管理 / 数据质控进入患者详情时带 from 参数：面包屑、侧栏高亮、返回按钮都回到来源列表；
// 返回优先 history.back()，保留列表的筛选、分页与滚动位置；直接打开链接时回退到来源列表地址。
const PAGE_ORIGINS={
 patients:{nav:'patients',crumb:'患者管理 / 患者列表',label:'患者列表',href:'patients.html'},
 followups:{nav:'followups',crumb:'研究执行 / 随访管理',label:'随访管理',href:'followups.html'},
 quality:{nav:'quality',crumb:'研究执行 / 数据质控',label:'数据质控',href:'data-quality.html'},
 ai:{nav:'ai',crumb:'智能分析 / AI 智能分析',label:'AI 智能分析',href:'ai-analysis.html'},
 'ai-cohort':{nav:'ai',crumb:'智能分析 / 队列分析',label:'队列分析',href:'ai-cohort.html'}
};
function pageOrigin(){return PAGE_ORIGINS[queryParam('from')]||PAGE_ORIGINS.patients}
function withFrom(url){const f=queryParam('from');return f&&PAGE_ORIGINS[f]?url.replace(/(#.*)?$/,m=>`${url.includes('?')?'&':'?'}from=${f}${m}`):url}
function canGoBack(){if(history.length<2)return false;if(!document.referrer)return true;try{return new URL(document.referrer).origin===location.origin}catch(e){return false}}
function bindBack(a,fallback){a.href=fallback;a.addEventListener('click',e=>{if(canGoBack()){e.preventDefault();history.back()}})}
// 定位到 hash 指向的区块并短暂高亮（数据质控 / 病程分析跳入时使用）
function flashHashTarget(){const t=location.hash&&document.querySelector(location.hash);if(!t)return null;t.scrollIntoView({block:'start'});t.classList.add('is-target');setTimeout(()=>t.classList.remove('is-target'),2600);return t}

// 列表页状态（检索词、筛选、分页）：仅在“返回”回到列表时恢复，正常从菜单进入时为默认状态
function loadListState(key,defaults){try{const nav=performance.getEntriesByType('navigation')[0];if(nav&&nav.type==='back_forward'){const s=JSON.parse(sessionStorage.getItem('list:'+key));if(s)return {...defaults,...s}}}catch(e){}return {...defaults}}
function saveListState(key,state){try{sessionStorage.setItem('list:'+key,JSON.stringify(state))}catch(e){}}
