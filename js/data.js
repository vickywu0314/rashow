"use strict";
/* RA 类风湿关节炎研究数据库 · 患者数据集
   · 10028 例患者，按固定种子生成：同一患者每次加载的姓名、病程、访视、检验、用药完全一致。
   · 时间轴以「今天」为锚点向前推算（建档、随访、下次应访日期始终与当前日期匹配）。
   · 患者级字段（列表、看板、随访、质控用）在加载时生成；单次访视的完整病例表（CRF）在打开访视时按需生成，
     由 visitFormOf(p, k) 提供，结构与 crf-schema.js 一致。
   接入后端后：INITIAL_PATIENTS 换成患者列表接口，visitFormOf 换成访视详情接口。 */

const DATASET_SIZE = 10028;
const DATASET_SEED = 20230301;

/* ---------- 随机数与日期工具 ---------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const seedOf = (...xs) => xs.reduce((h, x) => Math.imul(h ^ (x | 0), 2654435761) >>> 0, DATASET_SEED);
function rngTools(rng) {
  const t = {
    r: rng,
    u: (a, b) => a + rng() * (b - a),
    int: (a, b) => a + Math.floor(rng() * (b - a + 1)),
    pick: arr => arr[Math.floor(rng() * arr.length)],
    chance: p => rng() < p,
    norm: (m = 0, s = 1) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    w: pairs => { const tot = pairs.reduce((s, p) => s + p[1], 0); let x = rng() * tot; for (const p of pairs) { if ((x -= p[1]) < 0) return p[0]; } return pairs[pairs.length - 1][0]; }
  };
  return t;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (v, d = 0) => { const m = 10 ** d; return Math.round(v * m) / m; };
const _T = new Date();
const TODAY_D = Math.round(Date.UTC(_T.getFullYear(), _T.getMonth(), _T.getDate()) / 864e5);
// 天数 → YYYY-MM-DD（纯整数运算，避免大量创建 Date 对象）
const dstr = d => { const z = d + 719468, era = Math.floor(z / 146097), doe = z - era * 146097, yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365), doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153), dd = doy - Math.floor((153 * mp + 2) / 5) + 1, mm = mp < 10 ? mp + 3 : mp - 9, yy = yoe + era * 400 + (mm <= 2 ? 1 : 0); return yy + (mm < 10 ? '-0' : '-') + mm + (dd < 10 ? '-0' : '-') + dd; };
const dnum = s => Math.round(Date.parse(s) / 864e5);
const MONTH_D = 30.44;

/* ---------- 研究中心（20 家，含牵头单位） ---------- */
const CENTER_LIST = [
  { code: 'GAM', name: '中国中医科学院广安门医院', city: '北京', w: 15, area: ['110102', '110105', '110106', '110108', '110114'] },
  { code: 'XYY', name: '中国中医科学院西苑医院', city: '北京', w: 6, area: ['110108', '110107', '110105'] },
  { code: 'DZM', name: '北京中医药大学东直门医院', city: '北京', w: 6, area: ['110101', '110105', '110113'] },
  { code: 'BJZ', name: '首都医科大学附属北京中医医院', city: '北京', w: 5, area: ['110101', '110102', '110112'] },
  { code: 'LHY', name: '上海中医药大学附属龙华医院', city: '上海', w: 6, area: ['310104', '310112', '310115'] },
  { code: 'SGY', name: '上海中医药大学附属曙光医院', city: '上海', w: 5, area: ['310101', '310115', '310110'] },
  { code: 'GDZ', name: '广东省中医院', city: '广州', w: 7, area: ['440103', '440104', '440106', '440111'] },
  { code: 'JSZ', name: '江苏省中医院', city: '南京', w: 6, area: ['320102', '320104', '320106'] },
  { code: 'ZJZ', name: '浙江省中医院', city: '杭州', w: 5, area: ['330102', '330106', '330108'] },
  { code: 'AHZ', name: '安徽中医药大学第一附属医院', city: '合肥', w: 5, area: ['340102', '340104', '340111'] },
  { code: 'HNZ', name: '河南中医药大学第一附属医院', city: '郑州', w: 5, area: ['410102', '410105', '410122'] },
  { code: 'XZY', name: '湖南中医药大学第一附属医院', city: '长沙', w: 4, area: ['430102', '430104', '430111'] },
  { code: 'LNZ', name: '辽宁中医药大学附属医院', city: '沈阳', w: 4, area: ['210102', '210104', '210106'] },
  { code: 'TJZ', name: '天津中医药大学第一附属医院', city: '天津', w: 4, area: ['120101', '120104', '120111'] },
  { code: 'CDZ', name: '成都中医药大学附属医院', city: '成都', w: 5, area: ['510104', '510106', '510107'] },
  { code: 'SDZ', name: '山东中医药大学附属医院', city: '济南', w: 5, area: ['370102', '370103', '370105'] },
  { code: 'HBZ', name: '湖北省中医院', city: '武汉', w: 4, area: ['420102', '420106', '420111'] },
  { code: 'HLJ', name: '黑龙江中医药大学附属第一医院', city: '哈尔滨', w: 3, area: ['230102', '230103', '230108'] },
  { code: 'SXZ', name: '陕西中医药大学附属医院', city: '咸阳', w: 3, area: ['610402', '610404', '610481'] },
  { code: 'YNZ', name: '云南省中医医院', city: '昆明', w: 3, area: ['530102', '530103', '530111'] }
];
const CENTERS = CENTER_LIST.map(c => c.name);
const OTHER_AREAS = ['130102', '130602', '140105', '150102', '220102', '360102', '350102', '450103', '500103', '520102', '620102', '640104', '650102', '371302', '321102', '411302', '421002', '431102'];

/* ---------- 姓名 ---------- */
const SURNAMES = [['王', 72], ['李', 71], ['张', 68], ['刘', 54], ['陈', 45], ['杨', 31], ['黄', 24], ['赵', 22], ['吴', 20], ['周', 20], ['徐', 16], ['孙', 15], ['马', 14], ['朱', 13], ['胡', 13], ['郭', 12], ['何', 11], ['林', 11], ['高', 11], ['罗', 10], ['郑', 10], ['梁', 9], ['谢', 8], ['宋', 7], ['唐', 7], ['许', 7], ['韩', 7], ['冯', 7], ['邓', 7], ['曹', 6], ['彭', 6], ['曾', 6], ['肖', 6], ['田', 5], ['董', 5], ['袁', 5], ['潘', 5], ['于', 5], ['蒋', 5], ['蔡', 5], ['余', 5], ['杜', 5], ['叶', 4], ['程', 4], ['苏', 4], ['魏', 4], ['吕', 4], ['丁', 4], ['任', 4], ['沈', 4], ['姚', 3], ['卢', 3], ['姜', 3], ['崔', 3], ['钟', 3], ['谭', 3], ['陆', 3], ['汪', 3], ['范', 3], ['金', 3], ['石', 3], ['廖', 3], ['贾', 3], ['夏', 3], ['韦', 2], ['付', 2], ['方', 2], ['白', 2], ['邹', 2], ['孟', 2], ['熊', 2], ['秦', 2], ['邱', 2], ['江', 2], ['尹', 2], ['薛', 2], ['闫', 2], ['段', 2], ['雷', 2], ['侯', 2], ['龙', 2], ['史', 2], ['陶', 2], ['黎', 2], ['贺', 2], ['顾', 2], ['毛', 2], ['郝', 2], ['龚', 1], ['邵', 1], ['万', 1], ['钱', 1], ['严', 1], ['武', 1], ['戴', 1], ['莫', 1], ['孔', 1], ['向', 1], ['常', 1], ['欧阳', 1], ['司马', 0.2], ['诸葛', 0.1]];
const GIVEN = {
  F: {
    old: '秀英 桂英 秀兰 玉兰 桂兰 淑珍 凤英 玉珍 秀珍 桂珍 淑兰 凤兰 玉梅 秀梅 素珍 翠兰 秀云 桂芳 淑华 玉英 金凤 美兰 丽华 秀芳 爱华 秀荣 玉华 桂荣 春兰 淑英 素英 凤琴 秀琴 文英 兰英 冬梅 雪梅 秀华 玉芬 桂芬 淑芬 玉琴 凤珍 爱兰 素兰 慧珍 瑞华 玉霞'.split(' '),
    mid: '丽 红 敏 静 燕 娟 霞 艳 芳 萍 丽娟 红梅 海燕 晓燕 晓红 春燕 艳红 秀丽 丽萍 慧敏 美玲 小红 建华 卫红 爱玲 丽丽 秋菊 凤霞 素琴 晓梅 红霞 玉洁 丹 琳 莉 洁 晓丽 亚琴 宏英 雪莲 艳华 立新 春梅 晓琳 丽君 彩霞 文娟 慧芳 少华 秋云 淑娟 惠玲'.split(' '),
    young: '婷 倩 颖 静怡 欣怡 思琪 雨欣 佳琪 梦瑶 雅琪 诗涵 晓雯 婉婷 雪婷 佳怡 文静 丽娜 晶晶 莹 璐 悦 妍 楠 蕾 薇 琳琳 梦婷 心怡 雨婷 慧娟 玥 佳慧 晓彤 一诺 思雨 子涵 若曦 梓萱 欣然 雅婷'.split(' ')
  },
  M: {
    old: '建国 国华 振华 建华 志强 德明 国庆 永祥 福生 立新 卫东 建军 志明 洪涛 宝山 金生 德福 长林 学军 国强 有才 永福 振国 光明 树林 世杰 德胜 庆华 文华 守义'.split(' '),
    mid: '伟 强 军 勇 磊 涛 斌 鹏 辉 刚 明 杰 海涛 志刚 建平 晓东 立军 永刚 卫国 海军 文斌 红军 东升 建伟 宏伟 志勇 国栋 春雷 晓峰 振宇'.split(' '),
    young: '浩 宇 凯 帅 鑫 博 晨 昊 子豪 浩然 宇航 俊杰 一鸣 嘉豪 思远 天宇 志远 文博 子轩 宇轩 梓豪 皓轩 明轩 家乐'.split(' ')
  }
};
function personName(t, sex, birthYear) {
  const era = birthYear < 1965 ? 'old' : birthYear < 1986 ? 'mid' : 'young';
  const pool = t.chance(0.82) ? GIVEN[sex][era] : GIVEN[sex][era === 'old' ? 'mid' : era === 'young' ? 'mid' : t.pick(['old', 'young'])];
  return t.w(SURNAMES) + t.pick(pool);
}
// 各中心研究者 / 研究协调员（姓名固定）
const CENTER_STAFF = CENTER_LIST.map((c, ci) => {
  const t = rngTools(mulberry32(seedOf(9001, ci)));
  const doc = () => personName(t, t.chance(0.55) ? 'F' : 'M', t.int(1968, 1988));
  return { doctors: [doc(), doc(), doc()], crc: personName(t, 'F', t.int(1988, 1998)) };
});

/* ---------- 证件号 / 手机号 ---------- */
function idCheck(s17) { const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2], c = '10X98765432'; let s = 0; for (let i = 0; i < 17; i++) s += +s17[i] * w[i]; return c[s % 11]; }
function makeIdNo(t, area, birth, sex) { let seq = t.int(1, 99) * 10 + t.int(0, 9); if ((seq % 2 === 1) !== (sex === '男')) seq = seq % 2 ? seq - 1 : seq + 1; seq = clamp(seq, 10, 999); const s17 = area + birth.replace(/-/g, '') + String(seq).padStart(3, '0'); return s17 + idCheck(s17); }
const PHONE_PRE = ['130', '131', '132', '133', '135', '136', '137', '138', '139', '150', '151', '152', '153', '155', '156', '157', '158', '159', '166', '176', '177', '180', '181', '182', '183', '185', '186', '187', '188', '189', '191', '198', '199'];

/* ---------- 合并疾病（已确诊的其他疾病） ---------- */
// code → 基础患病率；女性 / 年龄 / 吸烟等在生成时调整
const COMORBID_PREV = { HTN: 0.21, OP: 0.15, HLP: 0.12, SjS: 0.075, T2DM: 0.085, FM: 0.07, 'RA-ILD': 0.055, 'RA-MS': 0.055, HT: 0.04, CHD: 0.035, AS: 0.012 };
function comorbidDetail(t, code, ctx) {
  const since = Math.min(ctx.nowYear, Math.max(ctx.birthYear + 18, ctx.nowYear - t.int(1, code === 'HTN' || code === 'T2DM' ? 15 : 9)));
  switch (code) {
    case 'FM': { const wpi = t.int(7, 14), sss = t.int(5, 10); return { since, status: t.pick(['症状稳定，间断加重', '近 3 个月疼痛加重', '症状控制良好', '睡眠改善后疼痛减轻']), core: [`WPI ${wpi} · SSS ${sss}`, t.pick(['睡眠障碍、疲劳', '疲劳、晨起僵硬感', '睡眠障碍、注意力下降', '广泛疼痛伴焦虑'])], treatment: t.pick(['度洛西汀 60 mg/日 + 有氧运动', '普瑞巴林 75 mg bid', '规律运动 + 认知行为治疗', '阿米替林 12.5 mg qn + 太极拳']) }; }
    case 'AS': { const b = rnd(t.u(1.6, 5.2), 1); return { since: Math.min(since, ctx.birthYear + 35), status: b >= 4 ? '疾病活动（BASDAI ≥ 4）' : '低疾病活动', core: [`BASDAI ${b} · HLA-B27 阳性`, t.pick(['双侧骶髂关节炎 II 级（X 线）', '双侧骶髂关节炎 III 级，腰椎韧带骨赘', 'MRI 骶髂关节骨髓水肿'])], treatment: t.pick(['NSAIDs 按需', '阿达木单抗 40 mg q2w', '司库奇尤单抗 150 mg q4w']) }; }
    case 'RA-ILD': { const fvc = t.int(62, 95), dlco = t.int(45, 82); return { since, status: t.pick(['肺功能稳定', '较前轻度进展', '影像学稳定，偶有干咳', '活动后气短']), core: [`HRCT：${t.pick(['双下肺网格影（UIP 型）', '双肺磨玻璃影（NSIP 型）', '双下肺胸膜下网格影'])}`, `FVC ${fvc}% · DLCO ${dlco}%`], treatment: t.pick(['吡非尼酮 400 mg tid', '尼达尼布 150 mg bid', '定期复查 HRCT，暂未抗纤维化治疗', '乙酰半胱氨酸 600 mg tid']) }; }
    case 'SjS': return { since, status: t.pick(['口眼干燥稳定', '口干加重', '症状轻微']), core: [`抗 SSA ${t.pick(['阳性', '强阳性'])} · Schirmer 试验 ${t.int(2, 5)} mm/5min`, t.pick(['唾液腺超声：腮腺回声不均', '唇腺活检：灶性淋巴细胞浸润（FS = 2）', '泪液分泌减少'])], treatment: t.pick(['人工泪液 + 毛果芸香碱 5 mg tid', '人工泪液 + 口腔护理', '羟氯喹 200 mg bid']) };
    case 'OP': { const ts = rnd(-t.u(2.5, 3.6), 1); return { since, status: t.pick(['规律抗骨松治疗', '近 1 年无新发骨折', '骨密度较前改善', '曾发生腰椎压缩性骨折']), core: [`腰椎 T 值 ${ts} · 股骨颈 T 值 ${rnd(ts + t.u(0.2, 0.8), 1)}`, t.pick(['25(OH)D 18 ng/mL', '25(OH)D 22 ng/mL', 'β-CTX 0.62 ng/mL'])], treatment: t.pick(['阿仑膦酸钠 70 mg qw + 钙尔奇 D', '唑来膦酸 5 mg/年 + 骨化三醇', '地舒单抗 60 mg q6m + 碳酸钙 D3', '骨化三醇 0.25 μg qd + 碳酸钙 D3']) }; }
    case 'HTN': return { since, status: t.pick(['血压控制达标', '血压控制良好', '偶有波动']), core: [`血压 ${t.int(122, 145)}/${t.int(74, 92)} mmHg`, t.pick(['高血压 1 级', '高血压 2 级', '高血压 1 级，中危'])], treatment: t.pick(['氨氯地平 5 mg qd', '缬沙坦 80 mg qd', '硝苯地平控释片 30 mg qd', '厄贝沙坦氢氯噻嗪 1 片 qd']) };
    case 'T2DM': return { since, status: t.pick(['血糖控制达标', '血糖控制欠佳', '血糖平稳']), core: [`HbA1c ${rnd(t.u(6.2, 8.4), 1)}%`, `空腹血糖 ${rnd(t.u(6.2, 9.1), 1)} mmol/L`], treatment: t.pick(['二甲双胍 0.5 g tid', '二甲双胍 + 达格列净 10 mg qd', '阿卡波糖 50 mg tid', '甘精胰岛素 14 U qn']) };
    case 'HLP': return { since, status: t.pick(['血脂控制达标', '低密度脂蛋白未达标', '规律服药']), core: [`LDL-C ${rnd(t.u(2.6, 4.4), 2)} mmol/L`, `TG ${rnd(t.u(1.3, 3.1), 2)} mmol/L`], treatment: t.pick(['阿托伐他汀 20 mg qn', '瑞舒伐他汀 10 mg qn', '饮食控制 + 运动']) };
    case 'HT': return { since, status: t.pick(['甲功正常', '亚临床甲减', '甲减替代治疗中']), core: [`TPOAb ${t.int(120, 860)} IU/mL`, `TSH ${rnd(t.u(2.1, 7.8), 2)} mIU/L`], treatment: t.pick(['左甲状腺素 50 μg qd', '左甲状腺素 25 μg qd', '定期复查甲功']) };
    case 'RA-MS': return { since, status: t.pick(['握力较前改善', '肌量减少，功能受限', '营养干预中']), core: [`ASM/身高² ${rnd(ctx.sex === '女' ? t.u(4.6, 5.6) : t.u(5.9, 6.9), 2)} kg/m²`, `握力 ${ctx.sex === '女' ? t.int(12, 17) : t.int(20, 27)} kg · 步速 ${rnd(t.u(0.7, 0.98), 2)} m/s`], treatment: t.pick(['抗阻运动 + 蛋白质补充 1.2 g/kg/d', '营养科随访 + 康复训练', '八段锦 + 乳清蛋白补充']) };
    case 'CHD': return { since, status: t.pick(['病情稳定', '偶有胸闷', 'PCI 术后稳定']), core: [t.pick(['冠脉 CTA：LAD 中段狭窄约 50%', '冠脉造影：RCA 支架植入术后', '心电图：ST-T 改变']), `LVEF ${t.int(55, 66)}%`], treatment: t.pick(['阿司匹林 100 mg qd + 阿托伐他汀 20 mg', '氯吡格雷 75 mg qd + 瑞舒伐他汀 10 mg', '单硝酸异山梨酯 20 mg bid']) };
  }
  return { since, status: '', core: [], treatment: '' };
}

/* ---------- 治疗方案 ---------- */
const DRUGS = {
  MTX: { name: '甲氨蝶呤片', cat: 'csdmard', spec: '2.5 mg × 16 片', route: 'oral', freq: 'qw', unit: 'mg', dose: t => t.pick([7.5, 10, 10, 12.5, 15, 15]) },
  FA: { name: '叶酸片', cat: 'other', spec: '5 mg × 100 片', route: 'oral', freq: 'qw', unit: 'mg', dose: () => 5 },
  LEF: { name: '来氟米特片', cat: 'csdmard', spec: '10 mg × 30 片', route: 'oral', freq: 'qd', unit: 'mg', dose: t => t.pick([10, 20]) },
  HCQ: { name: '硫酸羟氯喹片', cat: 'csdmard', spec: '0.2 g × 14 片', route: 'oral', freq: 'bid', unit: 'mg', dose: () => 200 },
  SSZ: { name: '柳氮磺吡啶肠溶片', cat: 'csdmard', spec: '0.25 g × 60 片', route: 'oral', freq: 'bid', unit: 'g', dose: () => 1 },
  IGU: { name: '艾拉莫德片', cat: 'csdmard', spec: '25 mg × 14 片', route: 'oral', freq: 'bid', unit: 'mg', dose: () => 25 },
  PRED: { name: '醋酸泼尼松片', cat: 'gc', spec: '5 mg × 100 片', route: 'oral', freq: 'qd', unit: 'mg', dose: t => t.pick([5, 7.5, 10]) },
  MP: { name: '甲泼尼龙片', cat: 'gc', spec: '4 mg × 30 片', route: 'oral', freq: 'qd', unit: 'mg', dose: t => t.pick([4, 8]) },
  CXB: { name: '塞来昔布胶囊', cat: 'nsaid', spec: '0.2 g × 6 粒', route: 'oral', freq: 'qd', unit: 'mg', dose: () => 200 },
  ADA: { name: '阿达木单抗注射液', cls: 'TNFi', cat: 'bdmard', spec: '40 mg/0.8 mL', route: 'sc', freq: 'q2w', unit: 'mg', dose: () => 40 },
  ETN: { name: '依那西普注射液', cls: 'TNFi', cat: 'bdmard', spec: '25 mg/支', route: 'sc', freq: 'biw', unit: 'mg', dose: () => 25 },
  YSP: { name: '注射用重组人Ⅱ型肿瘤坏死因子受体-抗体融合蛋白', cls: 'TNFi', cat: 'bdmard', spec: '25 mg/支', route: 'sc', freq: 'biw', unit: 'mg', dose: () => 25 },
  IFX: { name: '注射用英夫利西单抗', cls: 'TNFi', cat: 'bdmard', spec: '100 mg/支', route: 'iv', freq: 'other', unit: 'mg', dose: t => t.pick([200, 300]) },
  GLM: { name: '戈利木单抗注射液', cls: 'TNFi', cat: 'bdmard', spec: '50 mg/0.5 mL', route: 'sc', freq: 'q4w', unit: 'mg', dose: () => 50 },
  TOF: { name: '枸橼酸托法替布片', cls: 'JAKi', cat: 'tsdmard', spec: '5 mg × 28 片', route: 'oral', freq: 'bid', unit: 'mg', dose: () => 5 },
  BAR: { name: '巴瑞替尼片', cls: 'JAKi', cat: 'tsdmard', spec: '2 mg × 28 片', route: 'oral', freq: 'qd', unit: 'mg', dose: t => t.pick([2, 4, 4]) },
  UPA: { name: '乌帕替尼缓释片', cls: 'JAKi', cat: 'tsdmard', spec: '15 mg × 7 片', route: 'oral', freq: 'qd', unit: 'mg', dose: () => 15 },
  TCZ: { name: '托珠单抗注射液', cls: 'IL-6i', cat: 'bdmard', spec: '200 mg/10 mL', route: 'iv', freq: 'q4w', unit: 'mg', dose: t => t.pick([400, 480]) },
  ABT: { name: '阿巴西普注射液', cls: 'Abatacept', cat: 'bdmard', spec: '125 mg/mL', route: 'sc', freq: 'qw', unit: 'mg', dose: () => 125 }
};
const BIO_BY_CLS = { TNFi: ['ADA', 'ADA', 'ETN', 'YSP', 'YSP', 'IFX', 'GLM'], JAKi: ['TOF', 'TOF', 'BAR', 'UPA'], 'IL-6i': ['TCZ'], Abatacept: ['ABT'] };
const BRAND = { ADA: '修美乐 / 格乐立', ETN: '恩利', YSP: '益赛普', IFX: '类克', GLM: '欣普尼', TOF: '尚杰', BAR: '艾乐明', UPA: '瑞福', TCZ: '雅美罗', ABT: '恩瑞舒' };
const TCM_PATENT = {
  LGT: { name: '雷公藤多苷片', spec: '10 mg × 50 片', dose: 20, unit: 'mg', freq: 'tid' },
  BSZ: { name: '白芍总苷胶囊', spec: '0.3 g × 60 粒', dose: 0.6, unit: 'g', freq: 'tid' },
  ZQF: { name: '正清风痛宁缓释片', spec: '60 mg × 24 片', dose: 60, unit: 'mg', freq: 'bid' },
  WBP: { name: '尪痹片', spec: '0.5 g × 48 片', dose: 4, unit: '片', freq: 'tid' },
  YSJ: { name: '益肾蠲痹丸', spec: '8 g × 12 袋', dose: 8, unit: 'g', freq: 'tid' },
  BQJ: { name: '痹祺胶囊', spec: '0.3 g × 48 粒', dose: 4, unit: '粒', freq: 'bid' },
  SRB: { name: '湿热痹片', spec: '0.25 g × 48 片', dose: 6, unit: '片', freq: 'tid' },
  KXJ: { name: '昆仙胶囊', spec: '0.3 g × 24 粒', dose: 2, unit: '粒', freq: 'tid' },
  XHP: { name: '新癀片', spec: '0.32 g × 24 片', dose: 2, unit: '片', freq: 'tid' },
  FSG: { name: '风湿骨痛片', spec: '0.36 g × 36 片', dose: 3, unit: '片', freq: 'bid' }
};
const PATENT_BY_SYN = { damp_heat: ['SRB', 'XHP', 'LGT', 'ZQF'], wind_damp: ['ZQF', 'FSG', 'LGT', 'BSZ'], cold_damp: ['FSG', 'WBP', 'ZQF'], phlegm_stasis: ['BQJ', 'LGT', 'KXJ'], blood_stasis: ['BQJ', 'ZQF'], qi_blood_def: ['BSZ', 'BQJ'], liver_kidney_def: ['WBP', 'YSJ', 'BSZ'], qi_yin_def: ['BSZ', 'YSJ'] };
const FORMULA_BY_SYN = {
  damp_heat: [['宣痹汤', '忍冬藤 30 g、薏苡仁 30 g、萆薢 15 g'], ['四妙丸加味', '黄柏 10 g、苍术 12 g、土茯苓 30 g'], ['当归拈痛汤', '茵陈 15 g、羌活 10 g、猪苓 10 g']],
  wind_damp: [['羌活胜湿汤', '羌活 10 g、独活 10 g、防风 10 g'], ['蠲痹汤', '海风藤 15 g、桑枝 15 g、秦艽 10 g']],
  cold_damp: [['乌头汤', '制川乌 6 g（先煎）、麻黄 6 g、黄芪 30 g'], ['桂枝芍药知母汤', '桂枝 10 g、白芍 15 g、知母 10 g']],
  phlegm_stasis: [['双合汤', '桃仁 10 g、红花 10 g、法半夏 9 g'], ['身痛逐瘀汤合二陈汤', '秦艽 10 g、川芎 10 g、陈皮 10 g']],
  blood_stasis: [['身痛逐瘀汤', '桃仁 10 g、红花 10 g、地龙 10 g']],
  qi_blood_def: [['八珍汤', '党参 15 g、白术 12 g、当归 10 g'], ['黄芪桂枝五物汤', '黄芪 30 g、桂枝 10 g、鸡血藤 30 g']],
  liver_kidney_def: [['独活寄生汤', '独活 10 g、桑寄生 15 g、杜仲 15 g'], ['补肾祛寒治尪汤', '续断 15 g、补骨脂 10 g、熟地 15 g']],
  qi_yin_def: [['生脉散合四妙勇安汤', '太子参 15 g、麦冬 12 g、玄参 15 g']]
};
const SYN_LABEL = { wind_damp: '风湿痹阻证', cold_damp: '寒湿痹阻证', damp_heat: '湿热痹阻证', phlegm_stasis: '痰瘀痹阻证', blood_stasis: '瘀血痹阻证', qi_blood_def: '气血两虚证', liver_kidney_def: '肝肾不足证', qi_yin_def: '气阴两虚证' };
const SYN_SIGNS = {
  damp_heat: { tc: ['red', 'red', 'light_red'], ts: ['normal', 'enlarged'], ct: ['greasy', 'thick'], cc: ['yellow'], pulse: ['滑数', '濡数', '弦滑'] },
  wind_damp: { tc: ['light_red'], ts: ['normal'], ct: ['thin', 'greasy'], cc: ['white'], pulse: ['浮缓', '濡缓', '弦'] },
  cold_damp: { tc: ['pale', 'light_red'], ts: ['enlarged', 'normal'], ct: ['greasy', 'thin'], cc: ['white'], pulse: ['弦紧', '沉紧', '沉迟'] },
  phlegm_stasis: { tc: ['purple'], ts: ['enlarged', 'normal'], ct: ['greasy'], cc: ['white', 'yellow'], pulse: ['弦涩', '弦滑', '细涩'] },
  blood_stasis: { tc: ['purple'], ts: ['normal'], ct: ['thin'], cc: ['white'], pulse: ['涩', '细涩'] },
  qi_blood_def: { tc: ['pale'], ts: ['teeth_marks', 'thin'], ct: ['thin'], cc: ['white'], pulse: ['沉细', '细弱'] },
  liver_kidney_def: { tc: ['red', 'light_red'], ts: ['thin', 'fissured'], ct: ['thin', 'peeled'], cc: ['white'], pulse: ['沉细', '细数', '沉弱'] },
  qi_yin_def: { tc: ['red'], ts: ['thin', 'fissured'], ct: ['peeled', 'thin'], cc: ['white'], pulse: ['细数', '细弱'] }
};

/* ---------- 疾病活动度 → 关节数 / 血沉 / 总体评价（各组成项代入公式后 DAS28 与记录值一致） ---------- */
const das28EsrOf = (tjc, sjc, esr, gh) => Math.round((0.56 * Math.sqrt(tjc) + 0.28 * Math.sqrt(sjc) + 0.70 * Math.log(esr) + 0.014 * gh) * 100) / 100;
const das28CrpOf = (tjc, sjc, crp, gh) => Math.round((0.56 * Math.sqrt(tjc) + 0.28 * Math.sqrt(sjc) + 0.36 * Math.log(crp + 1) + 0.014 * gh + 0.96) * 100) / 100;
function componentsFor(t, das, fm) {
  const esr = Math.round(clamp(Math.exp(1.55 + 0.47 * (das - 2) + t.norm(0, 0.18)), 3, 118));
  const gh = Math.round(clamp(8 + 14.5 * (das - 2) + (fm ? 14 : 0) + t.norm(0, 6), 0, 100));
  const R = das - 0.70 * Math.log(esr) - 0.014 * gh, k = fm ? 0.22 : t.u(0.45, 0.8);
  let tjc = R > 0 ? Math.round(clamp((R / (0.56 + 0.28 * Math.sqrt(k))) ** 2, 0, 28)) : 0;
  let sjc = Math.round(clamp(tjc * k + t.norm(0, 0.6), 0, Math.min(28, tjc + 2)));
  if (fm) tjc = clamp(tjc + t.int(1, 3), 0, 28);
  const crp = rnd(clamp(Math.exp(-0.25 + 0.62 * (das - 2) + t.norm(0, 0.35)), 0.3, 128), 1);
  const pain = Math.round(clamp(gh + t.norm(4, 7) + (fm ? 8 : 0), 0, 100));
  const phga = Math.round(clamp(6 + 12 * (das - 2) + t.norm(0, 6), 0, 100));
  const haq = rnd(clamp(Math.round((0.05 + 0.27 * (das - 1.8) + (fm ? 0.35 : 0) + t.norm(0, 0.15)) * 8) / 8, 0, 3), 3);
  return { tjc, sjc, esr, crp, gh, pain, phga, haq, das: das28EsrOf(tjc, sjc, esr, gh), dasCrp: das28CrpOf(tjc, sjc, crp, gh) };
}

/* ---------- 单个患者的病程模型 ---------- */
const TRAJ = [['improve', 37], ['partial', 15], ['stable', 14], ['switch', 13], ['worsen', 12], ['flare', 9]];
const TRAJ_LABEL = { improve: '持续改善', partial: '部分改善', stable: '稳定达标', switch: '换药后改善', worsen: '病情恶化', flare: '复发后再控制' };
function makePatient(i) {
  const t = rngTools(mulberry32(seedOf(i, 17)));
  const ci = (() => { let x = t.r() * CENTER_LIST.reduce((s, c) => s + c.w, 0); for (let k = 0; k < CENTER_LIST.length; k++) { if ((x -= CENTER_LIST[k].w) < 0) return k; } return 0; })();
  const center = CENTER_LIST[ci], staff = CENTER_STAFF[ci];
  const sex = t.chance(0.785) ? '女' : '男', S = sex === '女' ? 'F' : 'M';
  // 建档：近 1300 天内，越近入组越多（项目入组持续爬坡）
  const enrollOff = Math.floor(1300 * (1 - Math.sqrt(t.r())));
  const enroll = TODAY_D - enrollOff;
  const ageAtEnroll = Math.round(clamp(t.norm(54, 11.5), 21, 84));
  const birthD = enroll - Math.round(ageAtEnroll * 365.25) - t.int(0, 364);
  const birth = dstr(birthD), year = +birth.slice(0, 4);
  const name = personName(t, S, year);
  const area = t.chance(0.84) ? t.pick(center.area) : t.pick(OTHER_AREAS);
  const durationY = clamp(Math.exp(t.norm(1.45, 0.95)), 0.25, Math.min(38, ageAtEnroll - 16));
  const onsetD = enroll - Math.round(durationY * 365.25);
  const diagD = Math.min(enroll - 7, onsetD + t.int(30, 540));
  const rfPos = t.chance(0.72), ccpPos = rfPos ? t.chance(0.82) : t.chance(0.32);
  const smoking = sex === '男' ? t.w([['never', 45], ['former', 25], ['current', 30]]) : t.w([['never', 93], ['former', 4], ['current', 3]]);
  const height = Math.round(sex === '女' ? t.norm(158, 5.5) : t.norm(170, 6));
  const weight = rnd(clamp(sex === '女' ? t.norm(58, 8) : t.norm(69, 9.5), 38, 110), 1);
  const nowYear = new Date(TODAY_D * 864e5).getUTCFullYear(), ageNow = Math.floor((TODAY_D - birthD) / 365.25);

  // 合并疾病
  const comorbid = {}, ctx = { nowYear, birthYear: year, sex };
  Object.entries(COMORBID_PREV).forEach(([code, base]) => {
    let p = base;
    if (code === 'OP') p *= sex === '女' ? (ageNow >= 55 ? 2.0 : 0.6) : 0.4;
    if (code === 'HTN' || code === 'CHD' || code === 'T2DM' || code === 'HLP') p *= ageNow >= 60 ? 1.8 : ageNow < 45 ? 0.35 : 1;
    if (code === 'RA-ILD') p *= (sex === '男' ? 1.8 : 0.8) * (smoking !== 'never' ? 1.7 : 1) * (ageNow >= 60 ? 1.6 : 0.7);
    if (code === 'RA-MS') p *= ageNow >= 65 ? 2.2 : ageNow < 50 ? 0.4 : 1;
    if (code === 'FM' || code === 'SjS' || code === 'HT') p *= sex === '女' ? 1.15 : 0.35;
    if (code === 'AS') p *= sex === '男' ? 2.6 : 0.5;
    if (t.chance(p)) comorbid[code] = comorbidDetail(t, code, ctx);
  });
  const fm = !!comorbid.FM;

  // 病程轨迹与治疗
  let traj = t.w(TRAJ);
  const followCycle = t.w([[3, 58], [6, 32], [12, 4], [1, 6]]);
  const syn0 = t.w([['damp_heat', 28], ['wind_damp', 18], ['cold_damp', 14], ['phlegm_stasis', 12], ['liver_kidney_def', 12], ['qi_blood_def', 8], ['blood_stasis', 4], ['qi_yin_def', 4]]);
  const das0 = traj === 'stable' ? t.u(2.2, 3.3) : clamp(t.norm(5.05, 0.75), 3.4, 7.4);
  // 证型与中西医结合治疗对应答的影响：湿热 / 风湿等实证应答较好，痰瘀、虚证应答偏慢
  const synEffect = { damp_heat: -0.2, wind_damp: -0.12, cold_damp: 0, phlegm_stasis: 0.4, blood_stasis: 0.3, liver_kidney_def: 0.12, qi_blood_def: 0.3, qi_yin_def: 0.35 }[syn0];
  const patentKey = t.chance(0.66) ? t.pick(PATENT_BY_SYN[syn0]) : null, useHerbal = t.chance(0.46);
  const floor = (traj === 'partial' ? t.u(3.3, 4.5) : t.u(1.75, 2.95)) + synEffect + (patentKey ? -0.12 : 0) + (useHerbal ? -0.15 : 0);
  const tau = t.u(2.2, 5.5) * (synEffect > 0.25 ? 1.35 : 1);
  const tSwitch = t.u(5, 10), tWorse = t.u(5, 14), tFlare = t.u(7, 16), flareLen = t.u(3, 6);
  const worsenReason = t.w([['stop', 32], ['reduce', 22], ['irregular', 20], ['infection', 16], ['fatigue', 10]]);
  const flareReason = t.w([['fatigue', 24], ['cold', 22], ['weather', 22], ['reduce', 18], ['emotion', 14]]);
  function dasAtMonth(m) {
    switch (traj) {
      case 'stable': return das0 + t.norm(0, 0.22) - 0.1 * Math.min(m, 6) / 6;
      case 'improve': case 'partial': return floor + (das0 - floor) * Math.exp(-m / tau);
      case 'switch': return m < tSwitch ? das0 - 0.35 * Math.min(1, m / 3) : floor + (das0 - 0.35 - floor) * Math.exp(-(m - tSwitch) / tau);
      case 'worsen': { const base = Math.max(floor + 0.6, das0 - 1.4), lo = base + (das0 - base) * Math.exp(-m / tau); return m < tWorse ? lo : Math.min(7.6, lo + 0.42 * (m - tWorse)); }
      case 'flare': { const lo = floor + (das0 - floor) * Math.exp(-m / tau); if (m < tFlare) return lo; if (m < tFlare + flareLen) return lo + 2.1; return lo + 2.1 * Math.exp(-(m - tFlare - flareLen) / 2.5); }
    }
    return das0;
  }

  // 访视日期：按随访周期 + 波动；部分患者漏访（随访逾期）或脱落
  const dates = [Math.min(TODAY_D, enroll + t.int(0, 3))];
  const step = followCycle * MONTH_D;
  while (true) { const nx = dates[dates.length - 1] + Math.round(step + t.norm(2, followCycle >= 3 ? 9 : 3)); if (nx > TODAY_D) break; dates.push(nx); }
  const pendingFirst = enrollOff < 12 && t.chance(0.45);
  let lost = false, withdrawal = null;
  if (!pendingFirst && dates.length >= 3 && t.chance(0.055)) {
    const k = t.int(2, dates.length - 1); dates.length = k; lost = true;
    const wd = Math.min(TODAY_D, dates[k - 1] + Math.round(step) + t.int(20, 75));
    const reason = t.w([['lost', 58], ['withdraw_consent', 15], ['other', 15], ['adverse', 8], ['death', ageNow > 70 ? 4 : 1]]);
    withdrawal = { date: dstr(wd), reason, note: { lost: t.pick(['连续 2 次电话随访未联系上', '更换联系方式，多次联系未果', '外出务工，失去联系']), withdraw_consent: t.pick(['患者本人要求退出研究', '家属不同意继续参加']), other: t.pick(['转至外院治疗', '迁居外地，无法按期随访']), adverse: t.pick(['发生严重感染后停药退出', '药物性肝损伤后退出']), death: t.pick(['因肺部感染去世', '因心血管事件去世']) }[reason] };
  } else if (!pendingFirst && dates.length >= 2 && t.chance(0.085)) {
    dates.pop(); if (dates.length >= 3 && t.chance(0.25)) dates.pop();
  }
  if (pendingFirst) dates.length = 0;
  if (traj === 'switch' && dates.length && (dates[dates.length - 1] - dates[0]) / MONTH_D < tSwitch + 2) traj = dates.length > 2 ? 'improve' : traj;

  // 治疗阶段
  const phases = [];
  const csCombo = t.w([['MTX', 46], ['MTX+HCQ', 16], ['MTX+LEF', 12], ['LEF', 12], ['MTX+IGU', 6], ['HCQ', 4], ['SSZ', 4]]);
  const preBio = t.chance(0.12) ? t.w([['TNFi', 55], ['JAKi', 25], ['IL-6i', 15], ['Abatacept', 5]]) : null;
  const useGC = das0 > 4.6 && t.chance(0.45), gcDrug = t.chance(0.7) ? 'PRED' : 'MP', useNSAID = t.chance(0.28);
  const mkPhase = (startD, cls, bio, line) => ({ start: startD, cls, bio, line, cs: csCombo });
  if (preBio) phases.push(mkPhase(dates[0] ?? enroll, preBio, t.pick(BIO_BY_CLS[preBio]), 2));
  else phases.push(mkPhase(dates[0] ?? enroll, 'csDMARD', null, 1));
  const switchCls = () => t.w([['TNFi', 50], ['JAKi', 30], ['IL-6i', 14], ['Abatacept', 6]]);
  const monthOf = d => (d - (dates[0] ?? enroll)) / MONTH_D;
  if (traj === 'switch' && dates.length) {
    const k = dates.findIndex(d => monthOf(d) >= tSwitch); if (k > 0) { const prev = phases[0], c = switchCls(); phases.push(mkPhase(dates[k], c === prev.cls ? (c === 'TNFi' ? 'JAKi' : 'TNFi') : c, null, prev.line + 1)); }
  }
  if (traj === 'worsen' && dates.length) {
    const k = dates.findIndex(d => monthOf(d) >= tWorse + 4); if (k > 0 && (k === dates.length - 1 || t.chance(0.5))) { const prev = phases[0]; const c = switchCls(); phases.push(mkPhase(dates[k], c === prev.cls ? 'JAKi' : c, null, prev.line + 1)); }
  }
  phases.forEach(ph => { if (ph.cls !== 'csDMARD' && !ph.bio) ph.bio = t.pick(BIO_BY_CLS[ph.cls]); });

  // 逐次访视：疾病活动与核心检验（完整病例表在打开时按需生成）
  const mtxDose = DRUGS.MTX.dose(t);
  const visits = dates.map((d, k) => {
    const m = monthOf(d);
    let target = dasAtMonth(m) + t.norm(0, 0.22);
    if (traj === 'worsen' && phases.length > 1 && d >= phases[1].start) target = Math.max(3.2, target - 0.4 * (d - phases[1].start) / MONTH_D);
    target = clamp(target, 1.2, 8.2);
    const method = k === 0 ? (t.chance(0.06) ? 'inpatient' : 'outpatient') : t.w([['outpatient', 86], ['phone', 8], ['inpatient', target > 5.4 ? 9 : 2]]);
    const c = componentsFor(t, target, fm);
    const phaseIdx = phases.reduce((acc, ph, pi) => d >= ph.start ? pi : acc, 0);
    const ph = phases[phaseIdx];
    const hgbBase = sex === '女' ? t.norm(128, 8) : t.norm(145, 9);
    const hgb = Math.round(clamp(hgbBase - Math.max(0, c.das - 3.6) * 7 + t.norm(0, 4), 72, 178));
    const plt = Math.round(clamp(t.norm(238, 38) + Math.max(0, c.das - 3.2) * 34, 92, 620));
    const wbc = rnd(clamp(t.norm(6.4, 1.15) + (ph.cs.includes('MTX') && t.chance(0.03) ? -3 : 0), 2.4, 13.5), 2);
    const hepatotoxic = ph.cs.includes('MTX') || ph.cs.includes('LEF') || patentKey === 'LGT' || patentKey === 'KXJ';
    const liverAE = hepatotoxic && k > 0 && t.chance(0.03 + (patentKey === 'LGT' || patentKey === 'KXJ' ? 0.018 : 0));
    const alt = rnd(liverAE ? t.u(68, 165) : clamp(t.norm(21, 7.5), 6, 52), 1);
    const isPhone = method === 'phone';
    const firstOfPhase = phases.some((p2, pi) => pi > 0 && p2.start === d);
    const trigger = (traj === 'worsen' && m >= tWorse && m < tWorse + 4) ? worsenReason : (traj === 'flare' && m >= tFlare && m < tFlare + 2.5) ? flareReason : null;
    return {
      k, date: dstr(d), d, method, doctor: t.pick(staff.doctors), phase: phaseIdx, isPhone, regimenChanged: firstOfPhase, trigger,
      das: isPhone ? null : c.das, dasCrp: isPhone ? null : c.dasCrp, tjc: isPhone ? null : c.tjc, sjc: isPhone ? null : c.sjc,
      esr: isPhone ? null : c.esr, crp: isPhone ? null : c.crp, gh: c.gh, pain: c.pain, phga: isPhone ? null : c.phga, haq: c.haq,
      hgb: isPhone ? null : hgb, plt: isPhone ? null : plt, wbc: isPhone ? null : wbc, alt: isPhone ? null : alt, liverAE, latent: target
    };
  });
  // 换药访视：前一阶段疗效不佳 / 不良事件
  visits.forEach(v => { if (v.regimenChanged) v.changeReason = visits.slice(0, v.k).some(x => x.liverAE) && t.chance(0.4) ? 'adverse' : t.chance(0.1) ? 'economic' : 'poor_efficacy'; });

  // 资料完整性：约 6% 患者基线访视存在缺失项（与质控规则一致）
  let missing = '';
  if (visits.length && t.chance(0.062)) missing = t.w([['缺 DAS28 评分', 34], ['缺基线检验', 26], ['缺用药史', 22], ['缺合并疾病记录', 18]]);
  if (missing === '缺 DAS28 评分') Object.assign(visits[0], { das: null, dasCrp: null, tjc: null, sjc: null });
  if (missing === '缺基线检验') Object.assign(visits[0], { esr: null, crp: null, das: null, dasCrp: null });
  if (missing === '缺合并疾病记录') Object.keys(comorbid).forEach(k => delete comorbid[k]);
  const comorbidNone = !Object.keys(comorbid).length && missing !== '缺合并疾病记录';
  // 逻辑冲突（QC-L01）：约 1.3% 患者最近一次访视的用药起始日期晚于访视日期
  const logicConflict = visits.length >= 2 && t.chance(0.013);

  const seq = String(i + 1).padStart(5, '0');
  const last = visits.length ? visits[visits.length - 1] : null;
  const subtype = rfPos || ccpPos ? '血清阳性 RA' : '血清阴性 RA';
  return {
    id: String(2310000 + i * 3 + (i % 3)),
    name, sex, year, birth, center: center.name, centerCode: center.code, centerIdx: ci,
    phone: t.pick(PHONE_PRE) + String(t.int(0, 99999999)).padStart(8, '0'),
    identityNo: makeIdNo(t, area, birth, sex),
    maritalStatus: ageAtEnroll < 26 ? t.w([['未婚', 70], ['已婚', 30]]) : t.w([['已婚', 86], ['离异', 5], ['丧偶', ageNow > 65 ? 12 : 2], ['未婚', 3]]),
    ethnicity: t.w([['汉族', 91], ['回族', 2.2], ['满族', 2], ['壮族', 1.2], ['蒙古族', 0.9], ['土家族', 0.8], ['苗族', 0.6], ['朝鲜族', center.city === '沈阳' || center.city === '哈尔滨' ? 3 : 0.2], ['彝族', center.city === '昆明' ? 4 : 0.1], ['白族', center.city === '昆明' ? 2 : 0]]),
    code: `RA-${center.code}-${seq}`,
    created: dstr(enroll), followStart: dstr(enroll),
    subtype, das28: last && last.das != null ? last.das : null,
    visits: visits.length, last: last ? last.date : null,
    incomplete: !!missing, missing,
    abnormal: !!last && !last.isPhone && ((last.crp ?? 0) > 10 || (last.esr ?? 0) > 20 || (last.hgb != null && last.hgb < (sex === '女' ? 115 : 130)) || (last.alt ?? 0) > 40 || (last.plt ?? 0) > 350 || (last.wbc != null && last.wbc < 3.5)),
    lost, withdrawal, followCycle, comorbid, comorbidNone,
    height, weight,
    _m: { i, traj, syn0, rfPos, ccpPos, onset: dstr(onsetD), diag: dstr(diagD), smoking, phases, visits, patentKey, useHerbal, useGC, gcDrug, useNSAID, mtxDose, logicConflict, staff, fm, durationY }
  };
}
const INITIAL_PATIENTS = Array.from({ length: DATASET_SIZE }, (_, i) => makePatient(i));
const MISSING_ITEMS = ["缺 DAS28 评分", "缺基线检验", "缺合并疾病记录", "缺用药史"];

/* ---------- 单次访视的完整病例表（CRF JSON，按需生成） ---------- */
const FREQ_TXT = { qd: '每日一次', bid: '每日两次', tid: '每日三次', qw: '每周一次', biw: '每周两次', q2w: '每两周一次', q4w: '每四周一次', prn: '必要时', other: '每 8 周一次' };
function phaseMeds(p, ph, v, t) {
  const M = p._m, meds = [], start = dstr(ph.start);
  const west = (key, extra = {}) => { const D = DRUGS[key]; meds.push({ drugType: 'western', drugCategory: D.cat, drugName: D.name, ...(BRAND[key] ? { brandName: BRAND[key].split(' / ')[0] } : {}), spec: D.spec, dose: key === 'MTX' ? M.mtxDose : D.dose(t), doseUnit: D.unit, route: D.route, frequency: D.freq, startDate: start, ...extra }); };
  if (ph.cs) ph.cs.split('+').forEach(k => { west(k, { startDate: dstr(M.phases[0].start) }); if (k === 'MTX') west('FA', { startDate: dstr(M.phases[0].start) }); });
  if (ph.bio) west(ph.bio);
  const monthsIn = (v.d - ph.start) / MONTH_D;
  if (M.useGC && (v.k === 0 || v.das > 4.2) && monthsIn < 6) west(M.gcDrug, { adjustProcess: v.k === 0 ? '起始剂量' : '逐渐减量中', adjustReason: v.k === 0 ? '控制急性期炎症' : '病情好转后减量' });
  if (M.useNSAID && v.das != null && v.das > 3.6) west('CXB', { frequency: v.das > 4.8 ? 'qd' : 'prn' });
  if (M.patentKey) { const P = TCM_PATENT[M.patentKey]; meds.push({ drugType: 'chinese_patent', drugName: P.name, spec: P.spec, dose: P.dose, doseUnit: P.unit, route: 'oral', frequency: P.freq, startDate: dstr(M.phases[0].start) }); }
  return meds;
}
function synAt(p, v) {
  // 证型随疾病活动变化：缓解期实证多转为虚证，活动期虚证可见湿热表现
  const M = p._m; if (v.das == null) return M.syn0;
  const remit = { damp_heat: 'liver_kidney_def', wind_damp: 'qi_blood_def', cold_damp: 'liver_kidney_def', phlegm_stasis: 'blood_stasis' }[M.syn0];
  if (v.das < 2.8 && remit && v.k % 2) return remit;
  if (v.das > 5.2 && (M.syn0 === 'liver_kidney_def' || M.syn0 === 'qi_blood_def')) return 'damp_heat';
  return M.syn0;
}
const lvl = (das, xs) => das == null ? undefined : das < 2.6 ? xs[0] : das < 3.2 ? xs[1] : das < 5.1 ? xs[2] : xs[3];
function visitFormOf(p, k) {
  const M = p._m; if (!M) return null;
  const v = M.visits[k]; if (!v) return null;
  const t = rngTools(mulberry32(seedOf(M.i, 31, k)));
  const prev = k > 0 ? M.visits[k - 1] : null, ph = M.phases[v.phase];
  const syn = synAt(p, v), sign = SYN_SIGNS[syn];
  const fullLab = !v.isPhone, yearly = k === 0 || (k > 0 && Math.floor((v.d - M.visits[0].d) / 365) > Math.floor((M.visits[k - 1].d - M.visits[0].d) / 365));
  const comorbidTxt = Object.entries(p.comorbid || {}).map(([c, d]) => `${{ HTN: '高血压', OP: '骨质疏松症', HLP: '高脂血症', SjS: '继发性干燥综合征', T2DM: '2 型糖尿病', FM: '纤维肌痛', 'RA-ILD': '类风湿关节炎相关间质性肺病', 'RA-MS': '肌少症', HT: '桥本甲状腺炎', CHD: '冠心病', AS: '强直性脊柱炎' }[c] || c}（${d.since} 年确诊，${d.treatment}）`).join('；');
  const pick = arr => arr[Math.floor(t.r() * arr.length)];
  const joints = ['双手近端指间关节', '双腕关节', '双手掌指关节', '双膝关节', '双足跖趾关节', '双肘关节', '右腕及双手掌指关节', '左膝及双手近端指间关节'];
  const site = joints[(M.i + 3) % joints.length];
  const history = {
    subtype: M.rfPos || M.ccpPos ? 'sero_pos' : 'sero_neg',
    firstVisitDate: dstr(M.visits[0].d), onsetDate: M.onset, diagnosisDate: M.diag,
    chiefComplaint: k === 0 ? `反复${site}肿痛${M.durationY >= 1 ? ` ${Math.round(M.durationY)} 年` : ` ${Math.max(2, Math.round(M.durationY * 12))} 个月`}，${v.das > 5.1 ? '加重 1 个月' : v.das > 3.2 ? '伴晨僵' : '症状反复'}` : v.trigger ? `${site}肿痛加重 ${t.int(1, 4)} 周` : v.das != null && prev && prev.das != null && v.das < prev.das - 0.5 ? `${site}肿痛较前减轻，复诊` : '类风湿关节炎规律复诊',
    course: k === 0 ? `患者 ${M.onset.slice(0, 4)} 年无明显诱因出现${site}肿痛，伴晨僵，${M.diag.slice(0, 7).replace('-', ' 年 ')} 月于外院确诊类风湿关节炎。${M.phases[0].bio ? '既往已使用传统 DMARDs 疗效欠佳，' : ''}现为进一步系统治疗入组随访。` : undefined,
    pastHistory: comorbidTxt || '否认高血压、糖尿病、冠心病等慢性病史',
    familyHistory: t.chance(0.09) ? pick(['母亲患类风湿关节炎', '姐姐患类风湿关节炎', '父亲患强直性脊柱炎']) : '否认家族遗传病史',
    smoking: M.smoking, allergy: t.chance(0.1) ? pick(['青霉素过敏', '磺胺类药物过敏', '头孢类药物过敏', '海鲜过敏']) : '否认药物及食物过敏史',
    flareTriggers: v.trigger ? [v.trigger] : (k > 0 ? ['none'] : undefined),
    jointPain: lvl(v.das ?? (v.latent), ['none', 'mild', 'moderate', 'severe']),
    painNature: v.latent > 3 ? pick(['distending', 'aching', 'stabbing', syn === 'cold_damp' ? 'cold' : 'aching']) : 'unclear',
    painSitePattern: syn === 'wind_damp' && t.chance(0.5) ? 'migratory' : 'fixed',
    painWorseTime: v.latent > 3 ? pick(['morning', 'morning', 'night']) : 'none',
    morningStiffness: lvl(v.latent, ['none', 'lt30m', '30m_1h', v.latent > 6 ? 'gt2h' : '1h_2h']),
    jointSwelling: lvl(v.latent, ['none', 'mild', 'moderate', 'severe']),
    jointHeat: syn === 'damp_heat' && v.latent > 3.2 ? 'hot_feel' : 'none',
    skinRedness: syn === 'damp_heat' && v.latent > 4.5 ? 'yes' : 'no',
    coldHeatChange: syn === 'cold_damp' ? 'cold_worse' : syn === 'damp_heat' ? 'heat_worse' : 'none',
    subcutaneousNodule: M.rfPos && t.chance(0.08) ? 'yes' : 'no',
    deformityJoints: M.durationY > 8 ? ['pip', 'mcp', 'wrist'].slice(0, 1 + (M.i % 3)) : [],
    appetite: v.latent > 5.5 ? 'fair' : 'good',
    insomnia: p.comorbid?.FM ? 'often' : v.latent > 5 ? 'occasional' : 'none',
    restlessness: p.comorbid?.FM ? 'often' : 'almost_never',
    fatigue: lvl(v.latent, ['none', 'mild', 'mild', 'moderate']),
    aversionWindCold: syn === 'cold_damp' || syn === 'wind_damp' ? 'relieved' : 'none',
    urine: syn === 'damp_heat' ? '小便黄' : '小便调', stool: syn === 'damp_heat' && t.chance(0.4) ? '大便黏滞' : '大便调'
  };
  const exam = {};
  if (fullLab && v.esr != null) Object.assign(exam, { esr: v.esr, crp: v.crp });
  if (fullLab && v.hgb != null) Object.assign(exam, { wbc: v.wbc, hgb: v.hgb, plt: v.plt });
  if (fullLab) {
    const liverLab = v.alt;
    Object.assign(exam, { alt: liverLab, ast: rnd(v.liverAE ? liverLab * t.u(0.6, 0.9) : clamp(liverLab * t.u(0.8, 1.2), 10, 45), 1), ggt: rnd(clamp(t.norm(24, 9) + (v.liverAE ? 40 : 0), 8, 180), 0), dbil: rnd(clamp(t.norm(3.4, 1.1), 1, 9), 1), urea: rnd(clamp(t.norm(5.1, 1.1), 2.4, 9.5), 2), crea: Math.round(clamp(p.sex === '女' ? t.norm(58, 9) : t.norm(76, 11), 35, 140)) });
    if (k % 2 === 0 || yearly) {
      const lipidUp = ph.cls === 'JAKi' || ph.cls === 'IL-6i' ? 0.6 : 0, dm = p.comorbid?.T2DM, hl = p.comorbid?.HLP;
      Object.assign(exam, { cho: rnd(clamp(t.norm(4.6, 0.7) + lipidUp + (hl ? 0.9 : 0), 2.6, 8.2), 2), tg: rnd(clamp(t.norm(1.35, 0.5) + (hl ? 0.8 : 0), 0.4, 5.6), 2), hdlc: rnd(clamp(t.norm(p.sex === '女' ? 1.42 : 1.15, 0.22), 0.6, 2.4), 2), ldlc: rnd(clamp(t.norm(2.7, 0.55) + lipidUp * 0.7 + (hl ? 0.8 : 0), 1, 6), 2), glu: rnd(clamp(dm ? t.norm(7.6, 1.2) : t.norm(5.1, 0.45), 3.6, 14), 2) });
    }
    if (v.esr != null && v.latent > 3.2 && t.chance(0.35)) exam.hscrp = rnd(Math.min(50, v.crp), 2);
    if (yearly) {
      Object.assign(exam, { rf: rnd(M.rfPos ? Math.exp(t.norm(4.3, 0.9)) : t.u(3, 15), 1), antiCcp: rnd(M.ccpPos ? Math.exp(t.norm(5.0, 0.9)) : t.u(0.5, 12), 1), ana: t.chance(p.comorbid?.SjS ? 0.9 : 0.25) ? 'positive' : 'negative', antiSsa: p.comorbid?.SjS ? 'positive' : 'negative', antiSsb: p.comorbid?.SjS && t.chance(0.5) ? 'positive' : 'negative', antiRo52: p.comorbid?.SjS && t.chance(0.6) ? 'positive' : 'negative', igg: rnd(clamp(t.norm(13.5, 2.8) + (p.comorbid?.SjS ? 4 : 0), 6, 30), 1), iga: rnd(clamp(t.norm(2.6, 0.8), 0.6, 6), 2), igm: rnd(clamp(t.norm(1.3, 0.45), 0.3, 4), 2) });
      if (t.chance(0.55)) Object.assign(exam, { xrayDate: dstr(v.d + t.int(0, 3)), xrayNo: 'DR' + dstr(v.d).replace(/-/g, '') + String(t.int(1000, 9999)), xraySites: ['hand', ...(t.chance(0.5) ? ['foot'] : [])], reportText: M.durationY > 6 ? pick(['双手骨质疏松，近端指间关节间隙变窄，可见边缘性骨侵蚀（Sharp 评分约 28 分）', '双腕关节间隙狭窄，腕骨可见囊状透亮区', '双手掌指关节周围软组织肿胀，关节间隙变窄']) : pick(['双手骨质未见明显破坏，关节周围软组织肿胀', '双手关节周围骨质疏松，未见明确骨侵蚀', '双手诸骨骨质未见明显异常']) });
      exam.ecgResult = p.comorbid?.CHD && t.chance(0.7) ? 'abnormal' : 'normal';
      if (exam.ecgResult === 'abnormal') exam.ecgAbnormalTypes = ['st'];
      exam.echoResult = p.comorbid?.['RA-ILD'] || p.comorbid?.CHD ? (t.chance(0.5) ? 'abnormal' : 'normal') : 'not_done';
      if (exam.echoResult === 'abnormal') exam.echoDetail = p.comorbid?.['RA-ILD'] ? '肺动脉收缩压约 38 mmHg，轻度升高' : '左室舒张功能减低';
    }
  }
  const assessment = {};
  if (!v.isPhone) {
    if (v.tjc != null) Object.assign(assessment, { tjc28: v.tjc, sjc28: v.sjc });
    Object.assign(assessment, { morningStiffnessMin: Math.round(clamp((v.latent - 2.2) * 26 + t.norm(0, 8), 0, 240)), painVas: v.pain, ptgaVas: v.gh, phgaVas: v.phga, haq: v.haq });
    if (v.das != null) assessment.das28Esr = v.das;
    if (v.dasCrp != null) assessment.das28Crp = v.dasCrp;
    if (k > 0 && v.das != null && M.visits[0].das != null) { const dd = M.visits[0].das - v.das; assessment.acrResponse = dd >= 2.4 ? 'acr70' : dd >= 1.6 ? 'acr50' : dd >= 0.9 ? 'acr20' : 'none'; }
  } else Object.assign(assessment, { painVas: v.pain, ptgaVas: v.gh, haq: v.haq });
  const organ = [];
  if (p.comorbid?.['RA-ILD']) organ.push('lung');
  assessment.organInvolvement = organ.length ? organ : ['none'];
  if (organ.length) assessment.organDetail = `${p.comorbid['RA-ILD'].core.join('，')}`;
  const tcm = { mainSyndrome: syn, secondarySyndromes: v.latent > 4.6 && syn !== 'blood_stasis' ? ['blood_stasis'] : syn === 'damp_heat' && t.chance(0.3) ? ['qi_yin_def'] : [], tongueColor: pick(sign.tc), tongueShape: pick(sign.ts), coatingTexture: pick(sign.ct), coatingColor: pick(sign.cc), pulse: pick(sign.pulse) };
  const meds = phaseMeds(p, ph, v, t);
  if (M.logicConflict && k === M.visits.length - 1 && meds.length) meds[0] = { ...meds[0], startDate: dstr(v.d + t.int(8, 40)) };
  if (p.missing === '缺用药史' && k === 0) meds.length = 0;
  const treatment = { regimenChanged: k === 0 ? 'na' : v.regimenChanged ? 'yes' : 'no', medications: meds };
  if (v.regimenChanged) { treatment.changeReason = v.changeReason || 'poor_efficacy'; const b = meds.find(x => x.drugCategory === 'bdmard' || x.drugCategory === 'tsdmard'); if (b) { b.adjustProcess = `${dstr(ph.start)} 起加用`; b.adjustReason = { poor_efficacy: '传统 DMARDs 规范治疗 3 个月以上疗效不佳', adverse: '前期用药出现不良反应', economic: '医保报销后改用', other: '患者意愿' }[treatment.changeReason]; } }
  if (M.useHerbal && !v.isPhone) { const f = FORMULA_BY_SYN[syn][M.i % FORMULA_BY_SYN[syn].length]; Object.assign(treatment, { herbalFormula: f[0], herbalDoses: pick([7, 14, 14, 28]), herbalAdd: v.latent > 4 ? `${f[1]}、青风藤 15 g` : f[1] }); if (v.latent < 3 && t.chance(0.4)) treatment.herbalRemove = '去制川乌、细辛'; }
  const adverse = { occurred: 'no' };
  const ev = [];
  if (v.liverAE) ev.push({ name: 'AE12', startDate: dstr(v.d - t.int(3, 20)), endDate: dstr(v.d + t.int(20, 45)), action: 'reduce', isSae: 'no', detail: `ALT ${v.alt} U/L，考虑药物性肝损伤，予${ph.cs.includes('MTX') ? '甲氨蝶呤减量' : '停用可疑药物'}并加用保肝治疗` });
  if (v.wbc != null && v.wbc < 3.5) ev.push({ name: 'AE01', startDate: dstr(v.d - t.int(2, 10)), action: 'reduce', isSae: 'no', detail: `WBC ${v.wbc} ×10⁹/L，减量观察` });
  if (k > 0 && ph.cls !== 'csDMARD' && t.chance(0.05)) ev.push({ name: 'AE35', startDate: dstr(v.d - t.int(10, 60)), endDate: dstr(v.d - t.int(1, 9)), action: 'symptomatic', isSae: t.chance(0.15) ? 'yes' : 'no', detail: ph.cls === 'JAKi' && t.chance(0.5) ? '带状疱疹（胸背部），抗病毒治疗后好转' : '上呼吸道感染，暂停生物制剂 1 次，对症治疗后好转' });
  if (k > 0 && ph.cs.includes('MTX') && t.chance(0.03)) ev.push({ name: 'AE09', startDate: dstr(v.d - t.int(10, 40)), action: 'unchanged', isSae: 'no', detail: '服用甲氨蝶呤次日轻度恶心，调整至睡前服用后缓解' });
  ev.forEach(e => { if (e.isSae === 'yes') e.saeCategories = ['hospitalization']; });
  if (ev.length) { adverse.occurred = 'yes'; adverse.events = ev; }
  const caseRecord = { note: visitSummaryText(p, v, prev, meds, treatment) };
  return { visitDate: v.date, method: v.method, history, exam, assessment, tcm, treatment, adverse, caseRecord };
}
function visitSummaryText(p, v, prev, meds, tr) {
  const M = p._m, act = v.das == null ? null : v.das < 2.6 ? '临床缓解' : v.das <= 3.2 ? '低疾病活动' : v.das <= 5.1 ? '中疾病活动' : '高疾病活动';
  const medTxt = meds.filter(m => m.drugType !== 'herbal').slice(0, 3).map(m => `${m.drugName.replace(/注射液|片$|胶囊$|缓释片$/g, '')} ${m.dose} ${m.doseUnit} ${FREQ_TXT[m.frequency] || ''}`).join(' + ');
  if (v.isPhone) return `电话随访：患者自述关节症状${v.latent < 3.4 ? '平稳' : v.latent < 5 ? '时有反复' : '明显加重，建议尽快门诊复诊'}，按医嘱规律用药，疼痛 VAS ${v.pain}。`;
  if (v.k === 0) return `基线访视：DAS28-ESR ${v.das ?? '未评估'}${act ? `（${act}）` : ''}，ESR ${v.esr ?? '—'} mm/h，CRP ${v.crp ?? '—'} mg/L。治疗：${medTxt || '待补充'}。中医辨证：${SYN_LABEL[M.syn0]}。`;
  const trend = prev && prev.das != null && v.das != null ? (v.das < prev.das - 0.6 ? '较前明显改善' : v.das > prev.das + 0.6 ? '较前加重' : '与上次基本持平') : '';
  const trig = v.trigger ? `近期${{ stop: '自行停药', reduce: '自行减药', irregular: '间断服药', infection: '合并感染', fatigue: '劳累', cold: '受凉感冒', weather: '天气变化', emotion: '情绪波动' }[v.trigger]}后症状反复，` : '';
  const change = tr.regimenChanged === 'yes' ? `因${{ poor_efficacy: '疗效不佳', adverse: '不良反应', economic: '经济原因', other: '其他原因' }[tr.changeReason]}调整方案，` : '';
  return `${trig}DAS28-ESR ${v.das ?? '—'}（${act || '未评估'}），${trend}。${change}治疗：${medTxt}${tr.herbalFormula ? ` + 中药${tr.herbalFormula}` : ''}。建议 ${p.followCycle} 个月后复诊。`;
}

/* ---------- 修改记录（建档、随访录入、质控、档案修改等留痕） ---------- */
function seedAudit(p) {
  const M = p._m; if (!M) return [];
  const t = rngTools(mulberry32(seedOf(M.i, 53))), crc = `${M.staff.crc}（研究协调员）`, doc = n => `${n}（研究者）`, out = [];
  const at = (d, h, m) => `${dstr(d)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  const enroll = dnum(p.created);
  out.push({ t: at(enroll, 9, t.int(5, 50)), user: crc, action: '新建档案', detail: `${p.name} · ${p.code} · 随访周期：每 ${p.followCycle} 个月` });
  M.visits.forEach(v => out.push({ t: at(v.d, t.int(9, 16), t.int(0, 59)), user: doc(v.doctor), action: '新增随访', detail: `第 ${v.k + 1} 次随访 · ${v.date} · ${v.k === 0 ? '基线访视' : '常规随访'} · 填写 ${t.int(46, 88)} 项` }));
  if (M.visits.length > 2 && t.chance(0.35)) { const v = M.visits[t.int(1, M.visits.length - 1)]; out.push({ t: at(v.d + t.int(1, 4), 14, t.int(0, 59)), user: doc(v.doctor), action: '编辑随访', detail: `${v.date} 常规随访；ESR：${v.esr ? v.esr * 10 : 15} → ${v.esr ?? 15} mm/h（录入笔误）` }); }
  if (t.chance(0.2)) out.push({ t: at(Math.min(TODAY_D, enroll + t.int(40, 300)), 10, t.int(0, 59)), user: crc, action: '修改档案', detail: `手机号：${p.phone.slice(0, 3)}****${String(t.int(1000, 9999))} → ${p.phone.slice(0, 3)}****${p.phone.slice(-4)}；原因：患者更换联系方式` });
  if (p.lost && p.withdrawal) out.push({ t: at(dnum(p.withdrawal.date), 15, t.int(0, 59)), user: crc, action: '标记脱落', detail: `随访状态：随访中 → 已脱落；脱落原因：${({ lost: '失访', withdraw_consent: '撤回知情同意', adverse: '不良事件', death: '死亡', other: '其他' })[p.withdrawal.reason]}（${p.withdrawal.note}）` });
  return out;
}
