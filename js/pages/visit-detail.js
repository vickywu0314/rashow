/* visit-detail.html 页面脚本（依赖 boot.js → data.js → common.js） */
"use strict";
shell(pageOrigin().nav);
// API loading skeleton: shown before visit data is available.
$('#visit-hero').innerHTML=`<div class="skeleton skeleton-title"></div><div class="skeleton skeleton-tags"></div><div class="skeleton-grid">${Array.from({length:6},()=>'<div><i class="skeleton skeleton-label"></i><i class="skeleton skeleton-value"></i></div>').join('')}</div>`;
$('#visit-sections').innerHTML=Array.from({length:4},(_,i)=>`<section class="detail-section skeleton-section"><i class="skeleton skeleton-heading"></i><div class="skeleton-card-grid"><i class="skeleton skeleton-card"></i><i class="skeleton skeleton-card"></i></div></section>`).join('');
document.querySelector('.detail-anchor').classList.add('is-loading');
setTimeout(()=>{
const p=patientById(queryParam('id')), visits=demoVisits(p), v=visits.find(x=>x.id===queryParam('visit'))||visits[0];
document.title=`${p.name} · ${v.type} · 中国中医风湿病注册研究信息平台`; {const o=pageOrigin(),visitsUrl=withFrom(`patient-visits.html?id=${encodeURIComponent(p.id)}`),direct=queryParam('entry')==='direct';
 const c=$('#crumb-origin');c.textContent=o.crumb;c.href=o.href;$('#crumb-visits').href=visitsUrl;
 // 从列表直接跳入（如数据质控定位缺失项）时，返回回到来源列表；否则返回随访记录
 const b=$('#back-visits');b.textContent=direct?`← 返回${o.label}`:'← 返回随访记录';bindBack(b,direct?o.href:visitsUrl);}
const eye=`<svg class="eye-icon eye-open" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg><svg class="eye-icon eye-closed" viewBox="0 0 24 24"><path d="m3 3 18 18M10.6 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.1 2.8M6.1 6.1C3.8 7.7 2.5 12 2.5 12s3.5 6 9.5 6c1.4 0 2.7-.3 3.8-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
const masked=p.identityNo.slice(0,-4)+'****';
$('#visit-hero').innerHTML=`<div class="patient-basic-head"><div class="patient-basic-title"><div class="patient-name-line"><h1>${escapeHTML(p.name)}</h1>${p.lost?`<span class="patient-dropout">已脱落</span><span class="patient-dropout-reason">脱落原因：${escapeHTML(withdrawText(p))}</span>`:''}</div><div class="basic-tags">${badge('研究编号: '+p.code)} ${badge('ID号: '+p.id)} ${badge('疾病分型: '+(p.subtype||'待补充'))} ${badge(p.sex)} ${badge(p.year+'年出生')}</div></div><div class="heading-actions"><input id="ai-case-images" type="file" accept="image/*" multiple hidden><button class="button" id="ai-import">AI纸质病历拍照导入</button><button class="button" id="ask-ai">问问AI</button><button class="button danger-outline" id="delete-visit" type="button">删除本次随访</button><a class="button" id="edit-visit" href="visit-create.html?id=${encodeURIComponent(p.id)}&visit=${v.id}">编辑本次随访</a><button class="button primary" id="download-one">下载本次病历</button></div></div><div class="reference-basic-grid"><div><span>患者手机号</span><b>${escapeHTML(p.phone)}</b></div><div><span>患者身份证号</span><b class="identity-value"><em id="identity-no" data-full="${escapeHTML(p.identityNo)}" data-masked="${escapeHTML(masked)}">${escapeHTML(masked)}</em><button class="identity-toggle" id="identity-toggle" aria-label="显示完整身份证号" aria-pressed="false">${eye}</button></b></div><div><span>民族</span><b>${escapeHTML(p.ethnicity)}</b></div><div><span>婚史</span><b>${escapeHTML(p.maritalStatus)}</b></div><div><span>建档日期</span><b>${escapeHTML(p.created||'—')}</b></div><div><span>随访观察起始</span><b>${escapeHTML(p.followStart||p.created||'—')}</b></div><div><span>研究中心</span><b>${escapeHTML(p.center||'—')}</b></div><div><span>本次访视</span><b>${escapeHTML(v.type)} · ${escapeHTML(v.date)}</b></div></div>`;
$('#download-one').onclick=()=>downloadCase(p,v);
// 删除本次随访（接口 V05）：逻辑删除，必须填写原因；基线访视在还有其他访视时不能删除
$('#delete-visit').onclick=()=>{
  const all=demoVisits(p);
  if(v.type==='基线访视'&&all.length>1){alert('基线访视之后还有其他访视，不能删除基线访视。如基线数据有误，请使用「编辑本次随访」修改。');return;}
  let d=document.getElementById('delete-dialog');
  if(!d){d=document.createElement('dialog');d.id='delete-dialog';d.innerHTML=`<form method="dialog" class="dialog-form"><div class="dialog-header"><h2>删除本次随访</h2><button class="icon-button" value="cancel" formnovalidate aria-label="关闭">×</button></div><p class="dialog-note">将删除 ${escapeHTML(p.name)} 的「${escapeHTML(v.type)} ${escapeHTML(v.date)}」。删除后不再计入随访次数、统计与质控；原始数据保留在系统中，修改记录会留痕。</p><label class="form-field"><span>删除原因 <b class="required">*</b></span><textarea name="reason" rows="3" required placeholder="如：重复录入；录错患者"></textarea></label><div class="dialog-footer"><button class="button" value="cancel" formnovalidate>取消</button><button class="button danger" value="ok">确认删除</button></div></form>`;document.body.appendChild(d);
   d.addEventListener('close',()=>{if(d.returnValue!=='ok')return;const reason=d.querySelector('[name=reason]').value.trim();
     (store.deletedVisits[p.id]=store.deletedVisits[p.id]||[]).push(v.id);
     const rest=demoVisits(p), last=rest.reduce((m,x)=>x.date>m?x.date:m,'');
     patchPatient(p.id,{visits:Math.max(0,(p.visits||1)-1),last:last||null});
     audit(p.id,'删除随访',`${v.type} ${v.date}（${v.method}）；删除原因：${reason}`);
     location.href=withFrom(`patient-visits.html?id=${encodeURIComponent(p.id)}`);});}
  d.returnValue='';d.showModal();
};$('#ask-ai').onclick=()=>openAIChat({scope:'visit',patient:p,visit:v});
const aiInput=$('#ai-case-images');
$('#ai-import').onclick=()=>aiInput.click();
aiInput.onchange=()=>{
  const files=[...aiInput.files]; if(!files.length)return;
  const old=$('#ai-import-preview'); if(old)old.remove();
  const panel=document.createElement('div'); panel.id='ai-import-preview'; panel.className='ai-import-preview panel';
  panel.innerHTML=`<div class="ai-import-head"><div><strong>已选择 ${files.length} 张病历照片</strong><span>确认照片清晰、完整后，可交给 AI 识别并回填结构化字段。</span></div><button class="button compact" id="clear-ai-images">重新选择</button></div><div class="ai-image-grid"></div><div class="ai-import-actions"><span>照片仅用于本次导入，识别结果需医生核对确认后写入。</span><button class="button primary" id="start-ai-import">开始 AI 识别</button></div>`;
  $('#visit-hero').after(panel);
  const grid=panel.querySelector('.ai-image-grid');
  files.forEach((file,i)=>{const url=URL.createObjectURL(file);const item=document.createElement('div');item.className='ai-image-item';item.innerHTML=`<img src="${url}" alt="病历照片 ${i+1}"><small>${escapeHTML(file.name)}</small>`;grid.appendChild(item)});
  panel.querySelector('#clear-ai-images').onclick=()=>{aiInput.value='';panel.remove();aiInput.click()};
  panel.querySelector('#start-ai-import').onclick=e=>{const b=e.currentTarget;b.disabled=true;b.textContent='AI 识别中…';setTimeout(()=>{b.textContent='识别完成 · 待确认';panel.classList.add('recognized');toast('识别完成，请核对后保存','ok')},2200)};
};
$('#identity-toggle').onclick=e=>{const b=e.currentTarget,n=$('#identity-no'),open=b.getAttribute('aria-pressed')==='true';b.setAttribute('aria-pressed',String(!open));n.textContent=open?n.dataset.masked:n.dataset.full};
const field=(k,val)=>`<div class="detail-field"><span>${escapeHTML(k)}</span><strong>${escapeHTML(val??'未提供')}</strong></div>`;
const chips=(a,c='')=>`<div class="data-chips ${c}">${a.map(x=>`<span>${escapeHTML(x)}</span>`).join('')}</div>`;
const mt=(t,r)=>`<div class="subcard metric-card"><h3>${t}</h3><div class="metric-list">${r.map(x=>{const status=x[3]||'';return `<div class="${status?'metric-row '+status:'metric-row'}${x[1]==='未查'?' is-empty':''}"><span>${x[0]}</span><strong>${x[1]}${status==='high'?'<b class="abnormal-arrow">↑</b>':status==='low'?'<b class="abnormal-arrow">↓</b>':''}</strong><small>${x[2]||''}${x[4]?`<em>${x[4]}</em>`:''}</small></div>`}).join('')}</div></div>`;
// ---- 读取本次访视的病例表 ----
const QCX=queryParam('qc')&&typeof qcIssues==='function'?qcIssues([p]).find(x=>x.key===queryParam('qk')||x.rule===queryParam('qc')&&x.visit===v.id):null,QC=QCX?QCX.rule:'';
const F=visitForm(p.id,v.id)||{},H=F.history||{},E=F.exam||{},A=F.assessment||{},TC=F.tcm||{},TR=F.treatment||{},AD=F.adverse||{};
const allV=demoVisits(p),idx=allV.findIndex(x=>x.id===v.id),prevV=allV[idx+1],prevF=prevV?visitForm(p.id,prevV.id)||{}:{};
const fd=(sec,key)=>CRF_FIELDS.find(f=>f.key===key&&f.section.key===sec);
const lb=(sec,key,val)=>{if(val==null||val===''||(Array.isArray(val)&&!val.length))return '未提供';const f=fd(sec,key);if(!f)return String(val);return Array.isArray(val)?val.map(x=>crfOptionLabel(f,x)).join('、'):f.type==='single'?crfOptionLabel(f,val):String(val)};
// 检验：按 CRF 分组展示，超出参考区间标记（血红蛋白按性别）
const labRow=(key,group)=>{const f=fd('exam',key);if(!f)return null;const val=E[key];if(val==null)return QC==='QC-M02'&&(key==='esr'||key==='crp')?[f.label,'缺失',f.unit||'','qc-miss','基线必填']:[f.label,'未查',f.unit||''];let [lo,hi]=f.ref||[];if(key==='hgb'){lo=p.sex==='女'?115:130;hi=p.sex==='女'?150:175}const st=hi!=null&&val>hi?'high':lo!=null&&val<lo?'low':'';return [f.label,String(val),f.unit||'',st,st?(st==='high'?'偏高':'偏低'):(f.ref?`${lo??''}–${hi??''}`:'')]};
const LAB_GROUPS=[['血常规',['wbc','hgb','plt']],['炎症指标',['esr','crp','hscrp']],['免疫指标',['rf','antiCcp','igg','iga','igm']],['肝功能',['alt','ast','ggt','dbil']],['肾功能',['urea','crea']],['血脂 / 血糖',['cho','tg','hdlc','ldlc','glu']]];
const labCards=LAB_GROUPS.map(([t,keys])=>mt(t,keys.map(k=>labRow(k)).filter(Boolean)));
const abList=LAB_GROUPS.flatMap(([,keys])=>keys.map(k=>labRow(k)).filter(r=>r&&(r[3]==='high'||r[3]==='low')));
const posneg=k=>E[k]?lb('exam',k,E[k]):'未做';
const abnormalSummary=`<div class="abnormal-toolbar"><div><strong>${abList.length?`异常指标 ${abList.length} 项`:'检验指标均在参考区间内'}</strong><span>${abList.length?abList.map(r=>`${r[0].split(' ').find(w=>/[A-Za-z]/.test(w))||r[0]} ${r[1]}${r[3]==='high'?'↑':'↓'}`).join(' · '):'红色高亮用于快速定位异常；参考区间以医院检验科为准。'}</span></div>${abList.length?'<button class="button compact" id="toggle-abnormal">仅看异常</button>':''}</div>`;
const dasCmp=(cur,prev)=>cur==null?'':prev==null?'':`<small class="cmp ${cur<prev-0.05?'down':cur>prev+0.05?'up':''}">较上次 ${cur<prev?'↓':cur>prev?'↑':'→'} ${Math.abs(cur-prev).toFixed(2)}</small>`;
const pa=prevF.assessment||{};
const meds=TR.medications||[],west=meds.filter(m=>m.drugType==='western'),patent=meds.filter(m=>m.drugType==='chinese_patent');
const medBad=m=>QC==='QC-L01'&&m.startDate&&m.startDate>(F.visitDate||v.date);
const medRow=m=>`<div class="drug-row${medBad(m)?' qc-bad':''}"><div><strong>${escapeHTML(m.drugName)}${m.brandName?`<em class="brand">（${escapeHTML(m.brandName)}）</em>`:''}</strong><small>${m.drugCategory?escapeHTML(lb('treatment','drugCategory',m.drugCategory)):'中成药'}${m.spec?` · ${escapeHTML(m.spec)}`:''}${m.startDate?` · 起始 ${medBad(m)?`<b class="qc-inline">${m.startDate}</b>`:m.startDate}`:''}</small>${medBad(m)?`<small class="qc-why">⚠ 起始日期晚于本次访视日期 ${F.visitDate||v.date}</small>`:''}${m.adjustReason?`<small class="adjust">${escapeHTML(m.adjustProcess||'')}：${escapeHTML(m.adjustReason)}</small>`:''}</div><span>${m.dose??''} ${escapeHTML(m.doseUnit||'')} · ${escapeHTML(lb('treatment','frequency',m.frequency))} · ${escapeHTML(lb('treatment','route',m.route))}</span></div>`;
const syms=['jointPain','morningStiffness','jointSwelling','jointHeat','painNature','painWorseTime','coldHeatChange','fatigue','insomnia','appetite','aversionWindCold'].filter(k=>H[k]).map(k=>`${fd('history',k)?.label||k}：${lb('history',k,H[k])}`);
const evs=AD.events||[];
const sections=[
['病史病情',`<div class="detail-fields">${field('首诊时间',H.firstVisitDate)}${field('本次随访时间',F.visitDate||v.date)}${field('发病时间',H.onsetDate)}${field('确诊时间',H.diagnosisDate)}${field('疾病分型',lb('history','subtype',H.subtype))}${field('主诉',H.chiefComplaint)}${H.course?field('首发症状 / 病程',H.course):''}${field('既往史',H.pastHistory)}${field('家族史',H.familyHistory)}${field('吸烟史',lb('history','smoking',H.smoking))}${field('过敏史',H.allergy)}${field('加重诱因',lb('history','flareTriggers',H.flareTriggers))}</div>${syms.length?`<div class="subcard"><h3>症状</h3>${chips(syms)}</div>`:''}${(H.deformityJoints||[]).length?`<div class="subcard"><h3>屈伸不利 / 关节畸形部位</h3>${chips(H.deformityJoints.map(x=>lb('history','deformityJoints',[x])))}</div>`:''}`],
['辅助检查',Object.keys(E).length?`${abnormalSummary}<div class="subcard-grid lab-grid">${labCards.join('')}${mt('自身抗体',[['ANA',posneg('ana'),''],['抗 SSA',posneg('antiSsa'),''],['抗 SSB',posneg('antiSsb'),''],['抗 Ro-52',posneg('antiRo52'),'']].map(r=>[...r,r[1]==='阳性'?'high':'',r[1]==='阳性'?'阳性':'']))}</div><div class="subcard"><h3>关节 X 线检查</h3><div class="detail-fields compact-fields">${field('检查日期',E.xrayDate||'本次未检查')}${field('检查号',E.xrayNo||'—')}${field('部位',E.xraySites?lb('exam','xraySites',E.xraySites):'—')}${field('报告',E.reportText||'—')}</div></div><div class="subcard-grid">${mt('心电图',[['结果',E.ecgResult?lb('exam','ecgResult',E.ecgResult):'未做','',E.ecgResult==='abnormal'?'high':''],['异常类型',E.ecgAbnormalTypes?lb('exam','ecgAbnormalTypes',E.ecgAbnormalTypes):'—','']])}${mt('超声心动',[['结果',E.echoResult?lb('exam','echoResult',E.echoResult):'未做','',E.echoResult==='abnormal'?'high':''],['所见',E.echoDetail||'—','']])}</div>`:`<div class="empty-module">${v.method==='电话随访'?'本次为电话随访，未进行检验检查。':'本次访视未录入检验结果。'}</div>`],
['病情评估',`<div class="assessment-summary"><div class="${A.das28Esr==null&&(QC==='QC-M01'||QC==='QC-M02')?'qc-miss-box':''}"><span>DAS28-ESR</span><strong>${A.das28Esr??(QC==='QC-M01'||QC==='QC-M02'?'无法计算':'未评估')}</strong>${A.das28Esr!=null?`<em class="act-tag ${A.das28Esr<2.6?'remission':A.das28Esr<=3.2?'low':A.das28Esr<=5.1?'moderate':'high'}">${actName(A.das28Esr)}</em>`:''}${dasCmp(A.das28Esr,pa.das28Esr)}</div><div class="${A.das28Crp==null&&QC==='QC-M01'?'qc-miss-box':''}"><span>DAS28-CRP</span><strong>${A.das28Crp??(QC==='QC-M01'?'无法计算':'未评估')}</strong>${dasCmp(A.das28Crp,pa.das28Crp)}</div><div><span>晨僵持续时间</span><strong>${A.morningStiffnessMin!=null?A.morningStiffnessMin+' 分钟':'未记录'}</strong></div><div><span>HAQ</span><strong>${A.haq??'未完成'}</strong>${dasCmp(A.haq,pa.haq)}</div></div><div class="subcard-grid">${mt('关节评估',[['压痛关节数 TJC28',A.tjc28??(QC==='QC-M01'?'缺失':'未评估'),'/ 28',A.tjc28==null&&QC==='QC-M01'?'qc-miss':''],['肿胀关节数 SJC28',A.sjc28??(QC==='QC-M01'?'缺失':'未评估'),'/ 28',A.sjc28==null&&QC==='QC-M01'?'qc-miss':'']])}${mt('VAS 评分',[['患者疼痛 VAS',A.painVas??'未评估','/ 100'],['患者疾病总体 VAS',A.ptgaVas??'未评估','/ 100'],['医生疾病总体 VAS',A.phgaVas??'未评估','/ 100']])}</div><div class="subcard"><h3>脏器受累</h3>${chips((A.organInvolvement||['none']).map(x=>lb('assessment','organInvolvement',[x])),'soft')}${A.organDetail?`<p class="muted-copy organ-note">${escapeHTML(A.organDetail)}</p>`:''}</div><div class="subcard"><h3>本次评估结果 / 与上次评估比较</h3><div class="comparison-grid"><div><span>本次评估</span><strong>${A.das28Esr!=null?`DAS28-ESR ${A.das28Esr}，${actName(A.das28Esr)}${A.das28Esr<=3.2?'，已达标':'，未达标'}`:'本次未完成疾病活动度评估'}</strong></div><div><span>治疗反应（较基线）</span><strong>${A.acrResponse?lb('assessment','acrResponse',A.acrResponse):'基线访视 / 未评估'}</strong></div><div><span>与上次比较</span><strong>${A.das28Esr!=null&&pa.das28Esr!=null?`${pa.das28Esr} → ${A.das28Esr}（${A.das28Esr<pa.das28Esr-0.6?'明显改善':A.das28Esr>pa.das28Esr+0.6?'较前加重':'基本持平'}）`:'暂无可比较数据'}</strong></div></div></div>`],
['中医诊断',`<div class="tcm-grid"><div class="subcard"><h3>证型</h3>${chips([`主证：${lb('tcm','mainSyndrome',TC.mainSyndrome)}`,`兼证：${(TC.secondarySyndromes||[]).length?lb('tcm','secondarySyndromes',TC.secondarySyndromes):'无'}`])}</div><div class="subcard"><h3>舌诊</h3>${chips([`舌色：${lb('tcm','tongueColor',TC.tongueColor)}`,`舌形：${lb('tcm','tongueShape',TC.tongueShape)}`,`苔质：${lb('tcm','coatingTexture',TC.coatingTexture)}`,`苔色：${lb('tcm','coatingColor',TC.coatingColor)}`])}</div><div class="subcard"><h3>脉象</h3>${chips([`脉象：${TC.pulse||'未记录'}`])}</div></div>${(prevF.tcm||{}).mainSyndrome&&prevF.tcm.mainSyndrome!==TC.mainSyndrome?`<div class="module-note">证型变化：上次 ${lb('tcm','mainSyndrome',prevF.tcm.mainSyndrome)} → 本次 ${lb('tcm','mainSyndrome',TC.mainSyndrome)}</div>`:''}`],
['治疗方案',`<div class="treatment-head"><span>本次治疗</span><strong>西药 ${west.length} 项 · 中成药 ${patent.length} 项 · 中药饮片${TR.herbalFormula?'已开具':'未开药'}</strong></div><div class="treatment-change"><div class="treatment-change-main"><span>与上次相比治疗方案是否调整</span><strong class="${TR.regimenChanged==='yes'?'change-yes':''}">${lb('treatment','regimenChanged',TR.regimenChanged)}</strong></div>${TR.regimenChanged==='yes'?`<div class="treatment-change-reason"><span>调整原因</span><strong>${lb('treatment','changeReason',TR.changeReason)}</strong></div>`:''}</div><div class="treatment-groups"><div class="subcard"><h3>西药</h3>${west.length?west.map(medRow).join(''):`<p class="${QC==='QC-M04'?'qc-empty':'muted-copy'}">${QC==='QC-M04'?'缺失：基线访视未录入任何用药':'未记录西药'}</p>`}</div><div class="subcard"><h3>中成药</h3>${patent.length?patent.map(medRow).join(''):'<p class="muted-copy">未使用中成药</p>'}</div><div class="subcard"><h3>中药饮片</h3>${TR.herbalFormula?`<div class="drug-row"><div><strong>${escapeHTML(TR.herbalFormula)}</strong><small>加味：${escapeHTML(TR.herbalAdd||'—')}${TR.herbalRemove?` · 减味：${escapeHTML(TR.herbalRemove)}`:''}</small></div><span>${TR.herbalDoses||'—'} 剂 · 水煎服，日一剂</span></div>`:'<p class="muted-copy">本次未开中药饮片。</p>'}</div></div>`],
['不良反应',`<div class="adverse-status"><span class="status-dot ${AD.occurred==='yes'?'bad':'good'}"></span><div><span>本次是否发生不良反应</span><strong>${AD.occurred==='yes'?`是（${evs.length} 项）`:'否'}</strong></div></div>${evs.length?evs.map(e=>`<div class="subcard ae-card"><h3>${escapeHTML(lb('adverse','name',e.name))}${e.isSae==='yes'?' <em class="sae">SAE</em>':''}</h3><div class="detail-fields compact-fields">${field('发生日期',e.startDate)}${field('结束日期',e.endDate||'持续中')}${field('处理措施',lb('adverse','action',e.action))}${field('是否 SAE',e.isSae==='yes'?`是（${lb('adverse','saeCategories',e.saeCategories)}）`:'否')}</div><p class="muted-copy">${escapeHTML(e.detail||'')}</p></div>`).join(''):'<p class="muted-copy">本次随访未报告药物相关不良事件。</p>'}`],
['随诊病例',`<div class="detail-fields">${field('病例记录',(F.caseRecord||{}).note||v.summary||'—')}${field('记录医生',v.doctor)}${field('访视方式',v.method)}${field('记录状态','已完成 · 已提交')}</div>`]
];
// 本机录入 / 修改过的内容：按模块列出，便于核对
const entries=v.entries||[];
const groupsE=entries.reduce((m,e)=>{(m[e.sec]=m[e.sec]||[]).push(e);return m},{});
const entriesHTML=entries.length?`<section class="detail-section entries-section" id="entries"><div class="detail-section-head"><span class="section-check">✎</span><h2>本次录入内容 <small>${entries.length} 项</small></h2></div>${Object.entries(groupsE).map(([sec,list])=>`<div class="entries-group"><h3>${escapeHTML(sec)}</h3><dl>${list.map(e=>`<div><dt>${escapeHTML(e.label)}</dt><dd>${escapeHTML(e.value)}</dd></div>`).join('')}</dl></div>`).join('')}</section>`:'';
$('#visit-sections').innerHTML=entriesHTML+sections.map((g,i)=>`<section class="detail-section${QCX&&QCX.sec===i?' has-qc':''}" id="section-${i}"><div class="detail-section-head"><span class="section-check${QCX&&QCX.sec===i?' qc':''}">${QCX&&QCX.sec===i?'!':'✓'}</span><h2>${g[0]}</h2></div>${QCX&&QCX.sec===i?qcAlertHTML(QCX,`visit-create.html?id=${encodeURIComponent(p.id)}&visit=${v.id}`,QCX.type==='缺失'?'编辑本次随访，补录缺失项':'编辑本次随访，更正日期'):''}${g[1]}</section>`).join('');
if(QCX){bindQcAlert(QCX);const a=document.querySelector(`.detail-anchor a[href="#section-${QCX.sec}"] i`);if(a){a.textContent='!';a.parentElement.classList.add('qc')}}

// UX: abnormal-only view + active section navigation
const abnormalBtn=$('#toggle-abnormal');
if(abnormalBtn) abnormalBtn.onclick=()=>{const root=$('#section-1'),on=root.classList.toggle('abnormal-only');abnormalBtn.textContent=on?'查看全部指标':'仅看异常';};
const anchors=[...document.querySelectorAll('.detail-anchor a')];
const detailSections=[...document.querySelectorAll('.detail-section')];
const setActive=id=>anchors.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+id));
anchors.forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const target=document.querySelector(a.getAttribute('href'));if(!target)return;setActive(target.id);target.scrollIntoView({behavior:'smooth',block:'start'});}));
const syncActiveSection=()=>{if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-8){setActive(detailSections.at(-1).id);return;}const y=window.scrollY+130;let current=detailSections[0];for(const section of detailSections){if(section.offsetTop<=y)current=section;else break;}setActive(current.id)};
window.addEventListener('scroll',syncActiveSection,{passive:true});
window.addEventListener('resize',syncActiveSection);syncActiveSection();

document.querySelector('.detail-anchor').classList.remove('is-loading');

// 从病程分析的洞察卡片跳入：定位到对应数据区块并高亮，提供返回入口
const hashTarget=flashHashTarget();
if(hashTarget&&hashTarget.classList.contains('detail-section')) setActive(hashTarget.id);
if(queryParam('from')==='insight'){
  const back=document.createElement('a');back.className='from-insight';back.href=`patient-insight.html?id=${encodeURIComponent(p.id)}`;back.textContent='← 返回病程分析';
  const main=document.getElementById('main');main.insertBefore(back,main.querySelector('.breadcrumb')?.nextSibling||main.firstChild);
}
},650);
