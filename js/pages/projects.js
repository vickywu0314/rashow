/* projects.html 页面脚本（依赖 boot.js → data.js → common.js → shared/qc-rules.js）
   8 个数字按接口 P01 的口径实时计算（口径编号 P-01 ~ P-08，见《后端接口说明》计算口径表）。 */
"use strict";
document.addEventListener('DOMContentLoaded',()=>{
  shell('projects');
  const N=patients.length, qc=qcSummary(), SITE_COUNT=new Set(patients.map(p=>p.center)).size, TARGET=12000; // 计划入组数：方案目标 12000 例
  // P-02 计划随访完成率：截至今天应完成的计划访视中，实际已完成的比例（访视级，不设窗口）
  const monthsBetween=(a,b)=>{a=new Date(a);b=new Date(b);return (b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth())-(b.getDate()<a.getDate()?1:0)};
  let expected=0, done=0;
  patients.forEach(p=>{
    const cycle=+p.followCycle||6;
    const start=p.followStart||p.created||(p.last?ymd(addMonths(p.last,-cycle*Math.max(0,(p.visits||1)-1))):null); if(!start)return;
    const end=p.lost?(p.withdrawal?.date||p.last||ymd(TODAY)):ymd(TODAY); if(end<start)return;
    const e=Math.floor(monthsBetween(start,end)/cycle)+1; expected+=e; done+=Math.min(p.visits||0,e);
  });
  const pending=patients.filter(p=>['随访逾期','近期需随访'].includes(followupStatus(p).label)).length;
  const openIds=new Set(qcIssues().filter(x=>x.state!=='已处理').map(x=>x.p.id));
  const ready=patients.filter(p=>!openIds.has(p.id)).reduce((s,p)=>s+(p.visits||0),0);
  const set=(id,v,count)=>{const el=document.getElementById(id);if(!el)return;if(count){el.dataset.count=v;el.textContent='0'}else el.textContent=v};
  set('pv-enrolled',fmtN(N),1); set('pv-completion',(expected?Math.round(done/expected*100):0)+'%',1); set('pv-quality',(qc.rate*100).toFixed(1)+'%',1); set('pv-sites',SITE_COUNT,1);
  set('pv-progress',`${fmtN(N)} / ${fmtN(TARGET)}`); set('pv-progress-note',`入组进度 · ${TARGET?Math.round(N/TARGET*100):0}%`);
  set('pv-pending',fmtN(pending),1); set('pv-qc',fmtN(qc.open),1); set('pv-ready',fmtN(ready),1);
  // 入组趋势：按月统计
  const byMonth=new Map();patients.forEach(p=>{const m=(p.created||'').slice(0,7);if(m)byMonth.set(m,(byMonth.get(m)||0)+1)});
  const months=[...byMonth.keys()].sort(),first=months[0]||ymd(TODAY).slice(0,7),list=[];
  for(let d=new Date(first+'-01');ymd(d).slice(0,7)<=ymd(TODAY).slice(0,7);d.setMonth(d.getMonth()+1))list.push([ymd(d).slice(0,7),byMonth.get(ymd(d).slice(0,7))||0]);
  const max=Math.max(...list.map(x=>x[1]),1);let cum=0;
  document.getElementById('pv-trend').innerHTML=`<div class="enroll-bars">${list.map(([m,n],i)=>{cum+=n;return `<div class="enroll-col" data-tip="${m.replace('-',' 年 ')} 月 · 新入组 ${n} 例 · 累计 ${fmtN(cum)} 例"><i style="height:${(n/max*100).toFixed(1)}%;animation-delay:${i*12}ms"></i>${m.endsWith('-01')||i===0?`<small>${m.slice(0,4)}</small>`:''}</div>`}).join('')}</div>`;
  document.getElementById('pv-trend-note').textContent=`${first.replace('-','.')} 起累计入组 ${fmtN(N)} 例，近 3 个月月均新入组 ${Math.round(list.slice(-4,-1).reduce((s,x)=>s+x[1],0)/3)} 例`;
  set('pv-period',`${first.replace('-','.')} — 2028.12`); set('pv-centers',`${SITE_COUNT} 家三甲中医院 / 中西医结合医院`);
  const tip=document.createElement('div');tip.className='viz-tip';tip.hidden=true;document.body.appendChild(tip);
  document.getElementById('pv-trend').addEventListener('mousemove',e=>{const c=e.target.closest('[data-tip]');if(!c){tip.hidden=true;return}tip.textContent=c.dataset.tip;tip.hidden=false;tip.style.left=Math.min(e.clientX+14,innerWidth-tip.offsetWidth-8)+'px';tip.style.top=(e.clientY+16)+'px'});
  document.getElementById('pv-trend').addEventListener('mouseleave',()=>tip.hidden=true);
  countUp(document);
});
