/* Auditable equations for report-derived plots. No DOM or network dependency. */
(function (global) {
'use strict';
const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CP = 'Cp = 1007 J/(kg·K)', B = 'b(T) = Cp[(T − T₀) − T₀ ln(T/T₀)]，T₀ = 298.15 K';
const integral = 'E = 10⁻⁶ Σ[(Pᵢ + Pᵢ₊₁)/2]·(tᵢ₊₁ − tᵢ)';
const integrationNote = 't 用秒，P 用 W，E 用 MJ；保留功率正负号，仅积分相邻有效采样，不跨缺步、不补首条记录之前的区间。';
const temperatureNote = 'T 为 K，θ 为 °C；报告温度换算 θ = T − 273.15。';
const probeNote = '统计对象为 point-t1-s 的最多 12 个内部测温通道；不是 PCM 全域平均、液相率或全部胶囊的相变完成判据。';
const scope = '空气侧边界量不等于 PCM 储存焓或储㶲；未计辅机耗功，不据此给出净系统效率。';
const number = (value, fallback) => value !== null && value !== '' && Number.isFinite(Number(value)) ? String(Number(value)) : fallback;
function context(input) {
  const c = input || {};
  return {...c, phase: ['charge','discharge','cycle'].includes(c.phase) ? c.phase : 'charge',
    loop: ['open','closed','mixed'].includes(c.loop) ? c.loop : 'mixed'};
}
function item(title, formula, variables, notes) { return {title, formula, variables: variables || [], notes: notes || []}; }
function heatEquations(c) {
  const out = [];
  if (c.phase !== 'discharge') out.push('Pbed,ch = |ṁ₁| Cp(Tbed,in − Tbed,out)');
  if (c.phase !== 'charge') out.push('Pbed,dis = |ṁ₁| Cp(Tbed,out − Tbed,in)');
  if (c.loop !== 'closed') {
    if (c.phase !== 'discharge') out.push('Psrc,open = |ṁ₁| Cp(Tbed,in − 293.15 K)');
    if (c.phase !== 'charge') out.push('Pdel,open = Pbed,dis');
  }
  if (c.loop !== 'open') {
    if (c.phase !== 'discharge') out.push('Psrc,closed = ṁ₂ Cp(T₂,in − T₂,out)');
    if (c.phase !== 'charge') out.push('Pdel,closed = ṁ₂ Cp(T₂,out − T₂,in)');
  }
  return out;
}
function heatNotes(c) {
  const out = [scope];
  if (c.loop !== 'closed' && c.phase !== 'discharge') out.push('开环充热热源热量以 20 °C 新风为参考；该热量参考与 25 °C 的㶲参考环境不同。');
  if (c.loop !== 'closed' && c.phase !== 'charge') out.push('开环放热按实际床层入口至出口的净增量计，不把将入口空气预热至约 60 °C 的外部贡献计为床层交付。');
  return out;
}
function exergyEquations(c) {
  const out = [B];
  if (c.phase !== 'discharge') out.push('Pex,bed,ch = |ṁ₁|[b(Tbed,in) − b(Tbed,out)]');
  if (c.phase !== 'charge') out.push('Pex,bed,dis = |ṁ₁|[b(Tbed,out) − b(Tbed,in)]');
  if (c.loop !== 'closed') {
    if (c.phase !== 'discharge') out.push('Pex,src,open = |ṁ₁| b(Tbed,in)');
    if (c.phase !== 'charge') out.push('Pex,del,open = Pex,bed,dis');
  }
  if (c.loop !== 'open') {
    if (c.phase !== 'discharge') out.push('Pex,src,closed = ṁ₂[b(T₂,in) − b(T₂,out)]');
    if (c.phase !== 'charge') out.push('Pex,del,closed = ṁ₂[b(T₂,out) − b(T₂,in)]');
  }
  out.push('Ex = 10⁻⁶ Σ[(Pex,ᵢ + Pex,ᵢ₊₁)/2]·Δtᵢ');
  return out;
}
const catalog = {
  pcm_mean: c => item('测点温度统计', ['θ̄(t) = Σⱼ θⱼ(t)/n(t)', 'θmin(t) = minⱼ θⱼ(t)，θmax(t) = maxⱼ θⱼ(t)'],
    ['n(t) 为该时刻有有效值的测点数，n ≤ 12；各测点等权。', temperatureNote], [probeNote, '均值曲线与最小—最大包络直接来自同一时刻的有效测点，不以入口或出口温度补造缺失通道。']),
  pcm_dispersion: c => item('测点离散程度', ['Δθ(t) = θmax(t) − θmin(t)', 'σ(t) = √{Σⱼ[θⱼ(t) − θ̄(t)]²/n(t)}'],
    ['σ 为总体标准差，分母是 n 而非 n − 1；Δθ、σ 单位均为 K。', 'n(t) 仅计该时刻的有效测温通道。'], [probeNote]),
  boundary_temperature: c => item('边界温度', ['θbed,in/out = Tbed,in/out − 273.15', ...(c.loop !== 'open' ? ['θ₂,in/out = T₂,in/out − 273.15'] : []),
    ...(c.phase !== 'charge' ? ['θdel = θbed,out（开环）；θdel = θ₂,out（闭环）'] : [])],
    ['bed,in/out 按各阶段实际流向识别；下标 2 为外置换热器二次侧。', temperatureNote],
    ['边界温度直接采用报告记录，未进行全域温度重构。']),
  heat_power: c => item('瞬时边界热功率', heatEquations(c),
    [CP, 'ṁ₁、ṁ₂ 单位 kg/s；P 单位 W，图示 kW = P/1000。', '一次侧采用可用的实际流量绝对值；缺少逐点值时采用登记值。二次侧流量为登记参数。'], heatNotes(c)),
  heat_energy: c => item('累计边界热量', [integral],
    ['P 取对应的床层、外部热源或交付热功率；各功率定义与瞬时功率图一致。', ...heatEquations(c)],
    [integrationNote, '每条累计曲线从所属阶段首个有效采样起算；图中截取窗口不会将累计曲线在窗口左端重新归零。', scope]),
  exergy_energy: c => item('累计边界热㶲', exergyEquations(c),
    [CP, 'b 单位 J/kg；Pex 单位 W；Ex 单位 MJ。所有对数中的温度均为 K。'],
    [integrationNote, 'b(T) 仅含气流温度项，忽略压力、动能和位能。开环充热输入为入口气流总温度㶲 |ṁ₁|b(Tbed,in)，不再减去 b(293.15 K)。', scope]),
  window_summary: c => item('所选窗口的积分与平均值', ['E[a,b] = 10⁻⁶ Σ有效区间 ∫max(a,tᵢ)^min(b,tᵢ₊₁) Plinear(t) dt',
    'tcovered = Σ有效区间 Δtclip，P̄ = E[a,b]·10⁶/tcovered'],
    ['仅累加裁剪后右端大于左端的区间；端点处的 Plinear 由相邻有效采样线性插值。a、b、tcovered 用秒。', '热量与热㶲分别仅使用自身数据有效的覆盖区间。P̄ 为 W，除以 1000 后为 kW。'],
    [integrationNote, '平均功率分母为实际覆盖时长，不是包含缺口的首末记录跨度；不同覆盖率须同时报告。']),
  response_time: c => item('首次观测响应时间', ['τ* = τᵢ + (θ* − yᵢ)(τᵢ₊₁ − τᵢ)/(yᵢ₊₁ − yᵢ)',
    'y = θ̄（测点均值）、minⱼθⱼ（全部测点）或 θbed,out'],
    ['仅在相邻有效记录满足 yᵢ < θ* ≤ yᵢ₊₁ 时插值；τ 单位 min，θ* 为所选响应阈值（°C）。', '“全部测点”要求全部原测温通道在该时刻均有效，并以其最低值越阈判断。'],
    ['首条记录已超过阈值或缺口后首次超过阈值时，仅报告首次观测时刻；不反推未记录区间的真实越阈时间。未达到记为缺失。', probeNote]),
  useful_delivery: c => item('温度阈值下的有效交付', [`θ* = ${number(c.threshold, '所选阈值')} °C；Ωθ = {t ∈ 有效记录区间：θdel(t) ≥ θ*}`,
    'Quse = 10⁻⁶ ∫Ωθ max(Pdel,0) dt；Exuse = 10⁻⁶ ∫Ωθ max(Pex,del,0) dt',
    'tuse = ∫Ωθ 1[Pdel > 0] dt/60；Qnet,θ = 10⁻⁶ ∫Ωθ Pdel dt'],
    ['Quse、Exuse 单位 MJ，tuse 单位 min；Pdel、Pex,del 分别采用热功率与热㶲功率边界。',
      'θdel 为开环床层出口或闭环二次侧出口；热量与㶲分别按自身功率的过零点裁剪。'],
    ['温度阈值和功率零点均在相邻记录内线性定位后分段积分；不整步计入越阈区间，不跨缺口。', '有效供热时长同时要求温度达标与正热功率；净量保留负值。阈值为分析参数，不代表已指定的工艺要求。', ...heatNotes(c)]),
  pcm_probes: c => item('单测点温度记录', ['θⱼ(τᵢ) = Tⱼ(tᵢ) − 273.15'],
    ['j 为 point-t1-s 报告中的测温通道；纵轴 °C，阶段历时 τ = (t − torigin)/60（min）。'],
    [probeNote, '逐点曲线保留缺失与断线，不由测点序号推定空间位置。']),
  probe_heatmap: c => item('测点—时间色映射', ['u = clip[(θⱼ(tᵢ) − θmin,view)/(θmax,view − θmin,view), 0, 1]', '颜色 = palette(u)'],
    ['色阶上下限取当前可见有效测点温度；上下限相等时使用固定色阶起点。', '横轴为时间，纵轴为报告通道顺序；色块取区间起点的记录温度，不表示区间内求解场。'],
    ['缺步区间留白；该图是离散报告的色映射，不是 CFD 温度云图，也不能据此确定胶囊位置或液相分布。']),
  hx_diagnostics: c => diagnostic(c),
  matrix: c => matrix(c),
  temperature_difference: c => item('相对基准的温度差', [c.timeBase === 'physical' ? 'Δθout(t) = θout,member(t) − θout,reference(t)' : 'Δθout(τ) = θout,member(τ) − θout,reference(τ)'],
    [c.timeBase === 'physical' ? '成员与基准按原始 flow-time 时间网格在共同区间比较；温差单位 K。' : '成员与基准按阶段相对时间在共同区间比较；温差单位 K。', '公共时间网格上的值由各自相邻采样线性插值。'],
    ['温差为成员减基准，正值表示成员床层出口更热；不代表 PCM 内部温差或模型误差的已验证界限。']),
  legacy_efficiency: c => legacy(c),
  cycle_net_input: c => item('历史回放的累计空气侧净输入', ['Enet,air = Ech（充热段）', 'Enet,air = Ech,end − Edis（放热段）'],
    ['Ech、Edis 为各自阶段空气侧边界热量累计值（MJ）；放热阶段按正释放定义后从充热末值扣除。', '历史回放按各阶段相对时间拼接；不改变原始报告时间或补齐切换缺口。'],
    ['这是边界累计净输入的展示，不是扣除壁损后的 PCM 全域储能；配对关系本身不能证明 case/data 初始场连续。']),
  legacy_heat_energy: c => item('历史床层累计热量与壁损估计',
    ['qbed,raw = |ṁ₁| Cp(Tbed,in − Tbed,out)', 'Eraw = 10⁻⁶ Σ[(qbed,raw,ᵢ + qbed,raw,ᵢ₊₁)/2]·Δtᵢ',
      'Ebed = Eraw（充热）；Ebed = −Eraw（放热）',
      'Pwall,est = 0.23 W/K × (Tbed,mean − 293.15 K)，Ewall,est = 10⁻⁶ ∫ Pwall,est dt'],
    [CP, 'E 单位 MJ，Δt 用秒；每阶段从所选首条记录起算。',
      'Tbed,mean 使用历史固相温度报告的可用通道均值；缺失时取床层入口与出口温度的平均值，温度用 K。'],
    ['该图沿用历史 analysis 的累积梯形结果，原算法连接全部相邻选中记录，不执行研究页的缺步排除规则；不可把历史曲线解释为已按新规则重算。',
      '0.23 W/K 为既定等效壁损估算系数。壁损曲线不是直接测量，也不是 PCM 全域焓；图示床层累计量未扣除该壁损。']),
  legacy_waterfall: c => item('历史㶲分项核算',
    ['Dch = Exsrc − Exgain,ch；Rbed = Exgain,ch − Exrel,dis；Ddis = Exrel,dis − Exdel',
      'Exsrc = Dch + Rbed + Ddis + Exdel；分项占比 = 100 Excomponent/Exsrc', '历史交付比 η = Exdel/Exsrc'],
    ['Exsrc、Exgain,ch 采用选定的充热窗口；Exrel,dis、Exdel 积分至床层累计释放热量峰值。所有 Ex 单位 MJ。',
      'Rbed 是由两段边界差值得到的剩余项，包含未释放部分、壁损及其他不可分辨贡献，不能直接称为床层内部㶲毁灭。'],
    ['此处保留历史 cycles 字段分解与分母。240 min 充热分母与全充热程分母不同，不能把前者自动解释为完整周期效率。',
      '未扣辅机耗功；报告配对不等于已核验的初始场连续性，历史交付比不作为已验证的系统净循环效率。'])
};
catalog.matrix_metric = catalog.matrix;
function diagnostic(c) {
  const base = ['曲线采用 UDF 原始报告值，未由网页重新计算或拟合；下式按当前收录的修复 UDF 源码核对，实际加载版本仍需运行日志确认。', '该误差不等于 Fluent 全域瞬态能量守恒误差；诊断通过不等于阶段完成或模型验收。'];
  const variables = ['ṁin = GEOMETRY_FACTOR × 正向入口质量流量；Cp₁ = 1007 J/(kg·K)。'];
  const defs = {
    hx_energy_error_pct: ['耦合能量误差', ['eE = 100 |Q₁,actual − Q₁₂|/max(|Q₁₂|, 10 W)', 'Q₁,actual = ṁin Cp₁(Tbed,out − Tbed,in)'], ['Q₁₂ 为 UDF 外置换热器带符号的一次侧换热量，单位 W；eE 单位 %。']],
    hx_mass_error_pct: ['入口流量设定误差', ['em = 100 |ṁin − ṁset|/ṁset'], ['ṁset 为一次侧设定质量流量（kg/s）；em 单位 %，不是入口与出口之间的流量不平衡率。']],
    hx_backflow_fraction: ['逆向质量通量比例', ['frev = (ṁrev,in + ṁrev,out)/(ṁforward,in + ṁforward,out + ṁrev,in + ṁrev,out)'], ['各项为对应方向质量通量的非负幅值；frev 为 0–1 比例，百分数为 100 frev。', '该分母按质量通量汇总，不是出口回流面积百分比。']],
    hx_coupling_error: ['入口耦合温差', ['δT = Tbed,in,actual − Ttarget'], ['步末诊断采用实际采样入口温度减目标温度，单位 K；迭代调整阶段内部可采用施加边界值。']],
    hx_boundary_target_error_K: ['实际入口与目标温差', ['δTboundary = Tbed,in,report − Ttarget,UDF'], ['以独立床层入口报告减去 UDF 目标温度，单位 K；对齐原始步号与 flow-time。']],
    hx_eps: ['逆流换热器效能', ['Cmin = min(ṁ₁Cp₁, ṁ₂Cp₂)，Cr = Cmin/Cmax，NTU = UA/Cmin', 'ε = [1 − exp(−NTU(1 − Cr))]/[1 − Cr exp(−NTU(1 − Cr))]', 'Cr = 1 时 ε = NTU/(1 + NTU)'], ['ε 无量纲，UA 单位 W/K；流量和比热采用 UDF 模型参数。']],
    hx_Q12: ['外置换热器换热量', ['Q₁₂ = ε Cmin(T₁,in − T₂,in)，T₁,in = Tbed,out'], ['Q₁₂ 为一次侧在换热器内的带符号放热量（W）；因此充热通常为负，放热通常为正。']],
    hx_valid: ['UDF 有效标志', ['valid ∈ {−1, 0, 1}'], ['−1 为设置或采样非法；0 为缺少可用流动/启动待定；1 为有效流动采样。该值为状态码而非物理测量。']]
  };
  const key = c.diag === 'hx_q12' ? 'hx_Q12' : c.diag || 'hx_energy_error_pct';
  const d = defs[key];
  if (!d) return item('UDF 报告诊断', ['y(τᵢ) = 原始 UDF 诊断报告值'], ['未登记该诊断字段的重算公式，按报告原值展示。'], base);
  return item(d[0], d[1], [...variables, ...d[2]], base);
}
function matrix(c) {
  const defs = {
    heat: ['窗口床层热量', ['M(UA, ṁ₂) = Ebed[a,b]'], [integral, integrationNote]],
    average: ['窗口床层平均功率', ['M(UA, ṁ₂) = Ebed[a,b]·10⁶/(tcovered·1000)'], ['M 单位 kW，tcovered 单位 s；分母为窗口内有完整有效功率记录的覆盖时长。']],
    duration: ['记录时间跨度', ['M(UA, ṁ₂) = (tlast − tfirst)/60'], ['M 单位 min；此项取全记录首末跨度，包含内部缺口，不是求解耗时或充放热完成时间。']],
    spread: ['窗口末测点温差', ['M(UA, ṁ₂) = θmax(b) − θmin(b)'], ['M 单位 K，b 为该工况可用窗口末端；相邻有效记录内可线性插值，不跨缺步。', probeNote]],
    threshold: ['阈值交付热量', ['M(UA, ṁ₂) = 10⁻⁶ ∫Ωθ max(Pdel,0) dt'], ['仅适用于放热；Ωθ 为交付温度达到所选阈值的有效记录区间，按温度交点与功率零点分段积分。']]
  };
  const d = defs[c.matrixMetric] || defs.heat;
  return item(d[0], [...d[1], '色深 ∝ (M − Mmin)/(Mmax − Mmin)'],
    [...d[2], 'UA 为外置换热器传热能力（W/K），ṁ₂ 为其二次侧质量流量（kg/h）。'],
    ['颜色在当前可用工况的所选指标范围内归一化；不代表数据质量等级或最优性。缺失值不插值。']);
}
function legacy(c) {
  const formulas = c.phase === 'discharge' ? ['ηb,dis = Exdel[τfirst,tpeak]/Exrel[τfirst,tpeak]', 'tpeak = argmaxτ Ebed,dis(τ)'] :
    ['ηb,ch = Exgain[τfirst,240 min]/Exsrc[τfirst,240 min]', 'Exgain = ∫ |ṁ₁|[b(Tbed,in) − b(Tbed,out)] dt',
      ...(c.loop !== 'closed' ? ['Exsrc,open = ∫ |ṁ₁| b(Tbed,in) dt'] : []),
      ...(c.loop !== 'open' ? ['Exsrc,closed = ∫ ṁ₂[b(T₂,in) − b(T₂,out)] dt'] : [])];
  return item('历史边界㶲比', [B, ...formulas],
    ['放热 Exrel = ∫|ṁ₁|[b(Tbed,out) − b(Tbed,in)]dt；Exdel = ∫ṁ₂[b(T₂,out) − b(T₂,in)]dt。', '比值无量纲，图示百分数为 100η；放热积分止于床层累计释放热量峰值。'],
    ['沿用原 analysis/compare 输出字段与历史窗口；不按研究页当前窗口或缺口规则重算，不能与新指标无条件混合。', '充热全程 ηb,full 使用实际充热全程而非 240 min；该边界㶲比不是 PCM 储㶲效率或净循环效率。']);
}
const keys = Object.freeze(Object.keys(catalog));
function describe(key, input) {
  if (!Object.prototype.hasOwnProperty.call(catalog, key)) throw new RangeError('Unknown PBTES formula: ' + String(key));
  const c = context(input), d = catalog[key](c);
  if (c.axis === 'energy' && !['probe_heatmap','matrix','matrix_metric','legacy_efficiency','legacy_heat_energy','legacy_waterfall','cycle_net_input'].includes(key)) {
    d.formula.push('横轴 x = Ebed(τ)（MJ）');
    d.notes.push('能量横轴仅用于床层累计热量单调且各组共同覆盖的充热区间；仅改变横轴映射，不改变积分或温度定义。');
  }
  if (c.phase === 'cycle' && ['heat_energy','exergy_energy','window_summary'].includes(key)) d.notes.push('充热与放热分别以各自首个有效采样为积分起点；保留切换缺口，不将两条累计量拼为已验证净储能。');
  if (c.legacy && ['heat_power','boundary_temperature','pcm_mean','pcm_probes','temperature_difference'].includes(key)) d.notes.push('历史图沿用原 analysis/compare 的采样、流量与时间网格；公式说明不表示已按研究页的缺口规则重算。');
  if (c.window) {
    const label = typeof c.window === 'object' ? c.window.label : c.window;
    if (label != null) d.notes.push('当前显示窗口：' + String(label));
  }
  return d;
}
function render(key, ctx) {
  const d = describe(key, ctx);
  return '<section class="data-formula formula-panel" data-formula="' + escape(key) + '" aria-label="计算公式：' + escape(d.title) + '">' +
    '<div class="formula-heading">计算公式 · ' + escape(d.title) + '</div>' +
    '<div class="formula-main">' + d.formula.map(v => '<p>' + escape(v) + '</p>').join('') + '</div>' +
    '<details class="formula-details"><summary>变量、单位与适用边界</summary>' +
    '<ul class="formula-variables">' + d.variables.map(v => '<li>' + escape(v) + '</li>').join('') + '</ul>' +
    '<ul class="formula-notes">' + d.notes.map(v => '<li>' + escape(v) + '</li>').join('') + '</ul></details></section>';
}
global.PBTES_FORMULAS = Object.freeze({keys, describe, render, text: (key, ctx) => describe(key, ctx).formula.join('；')});
})(window);
