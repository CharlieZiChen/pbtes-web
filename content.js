/* content.js — 部件知识库（名称、简介、功能、公式、口径），与 paper.tex / 放热数据分析 / 待办 一致 */
const F = (s)=>`<div class="formula">${s}</div>`;
const INFO = {
  system: {
    eyebrow:"SYSTEM / 总览", title:"闭式循环相变填充床储热系统", en:"Closed-loop packed-bed latent heat storage · Fluent + UDF",
    body: (m)=>`
      <div class="sec"><h4>简介</h4><p>系统由两级换热组成：<b>Fluent</b> 计算的填充床储热罐（换热器 1，空气 ↔ PCM 胶囊）和 <b>UDF</b> 计算的外置逆流换热器（换热器 2，一次侧空气 ↔ 二次侧热源/冷源）。一次侧 40 kg/h 空气在两者之间闭式循环，不向环境排放。</p>
      <p class="dim">充热时二次侧接 200 °C 热源，空气自 zone 8 进入床层；放热时二次侧改为 60 °C 冷源，一次侧流向反转，空气自 zone 9 进入。</p></div>
      <div class="sec"><h4>怎么演示</h4><ul class="list"><li>顶部切换 <b>充热 / 放热 / 开环</b>，三维场景、流向、热源与数据同步切换；在<b>数据库</b>视图按日期选任一工况即可回放。</li><li>底部时间轴播放真实计算数据：四个端点温度、床层功率与累计能量随时间变化，胶囊颜色按热前锋着色（示意）。</li><li>点击场景中的部件或左侧列表，查看名称、简介、在模型中的功能、公式与数据口径。</li></ul></div>
      <div class="sec"><h4>口径</h4><p class="dim">W = ṁ·c_p，c_p = 1007 J/(kg·K)，T₀ = 298.15 K；边界㶲用四端流体温度计算，不是 PCM 储㶲；E_bed 为一次侧边界累计吸热，含壁面散热。</p></div>`
  },
  tank: {
    eyebrow:"FLUENT · HX-1", title:"填充床储热罐", en:"Packed-bed PCM tank · Fluent 2-D axisymmetric domain",
    body: ()=>`
      <div class="sec"><h4>简介</h4><p>己二酸相变胶囊在圆柱罐内规则堆积：两层为一组、共四组。第一层 37 个 R = 65.5 mm 大球；第二层 24 大球 + 12 中球（R 52.5）+ 1 小球（R 47.5），有效孔隙率 0.493。二维轴对称，网格 460,707 节点（网格无关性已验证）。</p></div>
      <div class="sec"><h4>在模型中的功能</h4><p>Fluent 求解空气在多孔床内的流动与流固换热（局部非热平衡 LTNE），PCM 相变用等效热容法处理。它是系统里的<b>第一级换热器</b>：充热时从空气吸热熔化，放热时向空气放热凝固。</p>
      <p class="dim">床层单程 NTU ≈ 0.5：空气一次穿过只带走约四成温差，是放热品位损失的主要来源之一。</p></div>
      <div class="sec"><h4>公式</h4>
      ${F(`ε ρ<sub>f</sub> c<sub>p,f</sub> ∂T<sub>f</sub>/∂t + ∇·(ρ<sub>f</sub> c<sub>p,f</sub> <b>v</b> T<sub>f</sub>) = ∇·(k<sub>eff,f</sub> ∇T<sub>f</sub>) + h<sub>sf</sub>a<sub>sf</sub>(T<sub>s</sub> − T<sub>f</sub>)<br><span class="c">流体能量方程（LTNE）</span>`)}
      ${F(`(1−ε) ρ<sub>s</sub> c<sub>p,eff</sub>(T<sub>s</sub>) ∂T<sub>s</sub>/∂t = ∇·(k<sub>eff,s</sub> ∇T<sub>s</sub>) + h<sub>sf</sub>a<sub>sf</sub>(T<sub>f</sub> − T<sub>s</sub>)<br><span class="c">固相能量方程，c<sub>p,eff</sub> 在相变区内急剧增大</span>`)}
      ${F(`Q<sub>bed</sub> = ṁ<sub>1</sub> c<sub>p</sub> (T<sub>bed,in</sub> − T<sub>bed,out</sub>),&nbsp;&nbsp; E<sub>bed</sub>(t) = ∫<sub>0</sub><sup>t</sup> Q<sub>bed</sub> dτ<br><span class="c">一次侧边界吸热功率与累计吸热（含壁面散热）</span>`)}</div>
      <div class="sec"><h4>参数</h4><div class="kv"><div>阻力模型</div><div>Darcy–Forchheimer（Ergun）</div><div>求解器</div><div>压力基瞬态 · SIMPLE · 二阶迎风</div><div>时间步</div><div>160 s（3×3 矩阵）/ 80 s</div><div>边界</div><div>zone 8（id 8）· zone 9（id 9）</div><div>壁面</div><div>散热系数 k ≈ 0.22–0.25 W/K</div></div></div>
      <div class="sec"><h4>数据</h4><span class="tag">t_in_domain-rfile.out</span><span class="tag">fluid/solid-0.1/0.3/0.5</span><span class="tag">point-t1-s / t2-f / t3-f</span><span class="tag">total-0.1</span><p class="dim" style="margin-top:6px">三维模型中的胶囊颜色按"入口温度 + 移动热前锋"示意着色，用于演示；真实温度场见 Fluent 云图与测点数据。</p></div>`
  },
  pcm: {
    eyebrow:"MATERIAL", title:"相变胶囊 · 己二酸", en:"Adipic-acid PCM capsules · apparent heat capacity method",
    body: ()=>`
      <div class="sec"><h4>简介</h4><p>三种尺寸球形胶囊（R = 65.5 / 52.5 / 47.5 mm），忽略薄壁热阻与热容（Bi ≈ 0.003）。相变温度约 151.4 °C，潜热约 241 kJ/kg。</p></div>
      <div class="sec"><h4>在模型中的功能</h4><p>储存显热与潜热。充热时热前锋自入口向出口推进逐层熔化；放热时各测点在 157 °C（相变区上沿）出现凝固平台并依次通过——活塞式前锋。</p></div>
      <div class="sec"><h4>公式</h4>
      ${F(`∫<sub>T<sub>s</sub></sub><sup>T<sub>l</sub></sup> [c<sub>p,eff</sub>(T) − c<sub>p</sub>] dT = L ≈ 241 kJ/kg<br><span class="c">等效热容法：潜热折算为相变区（424.53–430.37 K）内的比热增量，6 点分段线性，误差 ≈ 2.1 %</span>`)}
      ${F(`E<sub>PCM</sub>(t) = ∫<sub>V</sub> ρ<sub>PCM</sub> [ ∫<sub>T<sub>ini</sub></sub><sup>T(x,t)</sup> c<sub>p,eff</sub>(θ)(1 − T<sub>0</sub>/θ) dθ ] dV<br><span class="c">严格 PCM 储㶲（需体积分，当前论文用边界㶲代替）</span>`)}</div>
      <div class="sec"><h4>物性</h4><div class="kv"><div>密度</div><div>1360 kg/m³（固）</div><div>导热系数</div><div>0.45 W/(m·K)</div><div>比热</div><div>1590（固）/ 2260（液）J/(kg·K)</div><div>相变温度</div><div>151.38 °C</div><div>潜热</div><div>≈ 241 kJ/kg</div></div></div>`
  },
  zone8: {
    eyebrow:"BOUNDARY · ZONE 8", title:"顶部边界 zone 8", en:"Boundary id 8 · velocity-inlet (charge) / pressure-outlet (discharge)",
    body: (m)=>`
      <div class="sec"><h4>简介</h4><p>储热罐顶部边界。充热时是<b>床层入口</b>（velocity-inlet，速度与温度由 UDF profile 给出）；放热时流向反转，改为 pressure-outlet，成为<b>床层出口</b>。</p></div>
      <div class="sec"><h4>在模型中的功能</h4><p>${m==='charge' ? '接收换热器一次侧出口的热空气，把 UDF 算出的入口温度与速度施加到床层。' : '床层放热后的热空气从此流出，UDF 读取此面的质量加权平均温度作为换热器一次侧入口温度。'}</p></div>
      <div class="sec"><h4>数据</h4><p>报告列 <span class="mono">t_in_domain</span> 始终指 zone 8 的面平均温度；放热时其物理意义变为床层出口，处理脚本按 <span class="mono">mass_flow</span> 符号映射。</p>
      ${F(`u<sub>in</sub> = ṁ<sub>1</sub> / (ρ<sub>in</sub> A<sub>in</sub>)<br><span class="c">UDF 由入口面平均密度实时求速度，保持 40 kg/h</span>`)}</div>`
  },
  zone9: {
    eyebrow:"BOUNDARY · ZONE 9", title:"底部边界 zone 9", en:"Boundary id 9 · pressure-outlet (charge) / velocity-inlet (discharge)",
    body: (m)=>`
      <div class="sec"><h4>简介</h4><p>储热罐底部边界。充热时为<b>床层出口</b>（pressure-outlet）；放热时改为 velocity-inlet，成为<b>床层入口</b>，接收换热器冷却后的空气。</p></div>
      <div class="sec"><h4>在模型中的功能</h4><p>${m==='charge' ? '床层吸热后的空气从此流出，UDF 读取其质量加权平均温度送入换热器。' : '接收换热器一次侧出口空气；实际入口温度由 ε–NTU 耦合计算，随床层出口和二次侧参数变化，见当前报告。'}</p></div>
      <div class="sec"><h4>数据</h4><p>报告列 <span class="mono">t_out_domain</span> 始终指 zone 9；首行 t = 0 为无效初始化记录需删除；温度原始单位 K。</p></div>`
  },
  loop: {
    eyebrow:"PRIMARY LOOP", title:"一次侧空气回路", en:"Primary air loop · ṁ₁ = 40 kg/h · closed, no exhaust",
    body: ()=>`
      <div class="sec"><h4>简介</h4><p>空气在床层与 UDF 换热器之间闭式循环。质量流量 40 kg/h = 0.01111 kg/s，热容流率 W₁ = 11.19 W/K。不存在向环境的排气——这是闭环相对开环的核心差别。</p></div>
      <div class="sec"><h4>在模型中的功能</h4><p>把床层出口状态经换热器反馈到床层入口，使入口温度成为动态边界而非人为固定值。管路与风机不建模，忽略管路热损与压降。</p></div>
      <div class="sec"><h4>公式</h4>
      ${F(`W<sub>1</sub> = ṁ<sub>1</sub> c<sub>p</sub> = 11.19 W/K<br>T<sub>in</sub><sup>n+1</sup> = 0.2 · T<sub>calc</sub> + 0.8 · T<sub>in</sub><sup>n</sup><br><span class="c">DEFINE_ADJUST 逐迭代亚松弛；是否收敛由实际入口与 HX 目标偏差判断，不能仅由迭代次数保证</span>`)}</div>
      <div class="sec"><h4>历史分析示例</h4><div class="note blue">原批次开环基准：入口恒 200 °C、出口直排。240 min 内开环吸热 3.976 MJ，外部热源㶲 5.94 MJ，其中约 4.6 MJ 随尾气排放（η_b 22.5 %）。这些固定数值不代表 2026-10 重测结果；当前数值见数据详情。</div></div>`
  },
  hx: {
    eyebrow:"UDF · HX-2", title:"外置逆流换热器（UDF）", en:"Counter-flow heat exchanger · epsilon-NTU model in DEFINE_ADJUST",
    body: (m)=>`
      <div class="sec"><h4>简介</h4><p>集总参数逆流换热器，参数为传热能力 UA、二次侧流量 ṁ₂ 与二次侧入口温度 T₂,in。一次侧入口 = 床层出口，一次侧出口 = 床层入口。它是系统的<b>第二级换热器</b>。</p></div>
      <div class="sec"><h4>在模型中的功能</h4><p>每个时间步（每次迭代）根据床层出口温度解出一次侧出口温度，决定回到床层的空气有多热/多冷，从而决定床层的驱动温差与充放热速率。</p></div>
      <div class="sec"><h4>公式</h4>
      ${F(`Q<sub>HX</sub> = W<sub>1</sub>(T<sub>1,in</sub> − T<sub>1,out</sub>) = W<sub>2</sub>(T<sub>2,out</sub> − T<sub>2,in</sub>) = UA · ΔT<sub>LMTD</sub><br>ΔT<sub>LMTD</sub> = (ΔT<sub>1</sub> − ΔT<sub>2</sub>) / ln(ΔT<sub>1</sub>/ΔT<sub>2</sub>)<br><span class="c">能量平衡 + 传热方程（当前 UDF 的求解目标）</span>`)}
      ${F(`ε = [1 − e<sup>−NTU(1−C<sub>r</sub>)</sup>] / [1 − C<sub>r</sub> e<sup>−NTU(1−C<sub>r</sub>)</sup>],&nbsp; NTU = UA / C<sub>min</sub>,&nbsp; C<sub>r</sub> = C<sub>min</sub>/C<sub>max</sub><br>C<sub>r</sub>=1时：ε=NTU/(1+NTU)<br>Q = ε C<sub>min</sub> (T<sub>1,in</sub> − T<sub>2,in</sub>)<br><span class="c">ε–NTU 闭式解：20260923版使用的同一逆流模型解析解</span>`)}
      ${F(`UA<sub>eff</sub> = Q<sub>HX</sub> / ΔT<sub>LMTD</sub><br><span class="c">用输出端温度反算，检验输入 UA 是否真正实现（两端温差 > 0.2 K、LMTD > 0.5 K 时可辨识）</span>`)}</div>
      <div class="sec"><h4>工况矩阵</h4><span class="tag b">UA 50 / 100 / 1000 W/K</span><span class="tag b">ṁ₂ 20 / 40 / 100 kg/h</span><span class="tag a">充热 T₂,in 200 °C</span><span class="tag a">放热 T₂,in 60 °C</span>
      <p class="dim" style="margin-top:6px">${m==='charge' ? '历史基准示例：UA = 100 W/K，ṁ₂ = 40 kg/h（W₂ = W₁），效能理论 0.899，实测 UA_eff 100.0 W/K。' : '历史放热示例：UA = 1000 W/K，ṁ₂ = 100 kg/h；旧算法的一次侧出口曾被限幅在 T₂,in + 0.05 K，新版已取消此限幅。'}</p></div>
      <div class="sec"><h4>求解器版本与历史数据</h4><div class="note">旧 Newton 求解器在热容率不等时可能振荡或返回超出换热上限的温度；高 UA 的 0.05 K 限幅也不等于严格收敛。20260923 版已改用 ε–NTU 闭式解，并记录版本、实际入口偏差、流量与回流诊断。旧数据仍按原始结果保留；新的九组工况需通过 Fluent 实机验收后用于验证结论。</div></div>`
  },
  secondary: {
    eyebrow:"SECONDARY SIDE", title: "二次侧热源 / 冷源", en:"External source (200 °C) or sink (60 °C) · ṁ₂",
    body: (m)=>`
      <div class="sec"><h4>简介</h4><p>${m==='charge' ? '充热时二次侧为 200 °C 恒温热源，在换热器中放热后以 T₂,out 离开，按论文口径视为回热源再加热而非排放。' : '放热时二次侧为 60 °C 恒温冷源，在换热器中被加热到 T₂,out，这股温升就是系统交付出去的产品热。'}</p></div>
      <div class="sec"><h4>在模型中的功能</h4><p>T₂,in 为 UDF 常量；T₂,out 由能量平衡算出并写入 <span class="mono">report-t2-out</span>。二次侧流量决定热容比，进而决定交付/供热温度。</p></div>
      <div class="sec"><h4>公式</h4>
      ${F(`T<sub>2,out</sub> = T<sub>2,in</sub> + Q<sub>HX</sub> / W<sub>2</sub>,&nbsp; W<sub>2</sub> = ṁ<sub>2</sub> c<sub>p</sub><br>${m==='charge' ? '' : 'T<sub>2,out</sub> − 60 = (W<sub>1</sub>/W<sub>2</sub>)(T<sub>bed,out</sub> − T<sub>bed,in</sub>)<br>'}<span class="c">在同一换热量下，二次侧热容率越大，其温度变化越小；W₁/W₂并不总等于标准Cᵣ</span>`)}
      ${F(`e<sub>f</sub>(T) = c<sub>p</sub>[(T − T<sub>0</sub>) − T<sub>0</sub> ln(T/T<sub>0</sub>)],&nbsp; T<sub>0</sub> = 298.15 K<br>${m==='charge' ? 'E<sub>src</sub> = ∫ ṁ<sub>2</sub>[e<sub>f</sub>(T<sub>2,in</sub>) − e<sub>f</sub>(T<sub>2,out</sub>)] dt,&nbsp; η<sub>b</sub> = E<sub>gain</sub>/E<sub>src</sub>' : 'E<sub>del</sub> = ∫ ṁ<sub>2</sub>[e<sub>f</sub>(T<sub>2,out</sub>) − e<sub>f</sub>(T<sub>2,in</sub>)] dt,&nbsp; η<sub>b,dis</sub> = E<sub>del</sub>/E<sub>rel</sub>'}<br><span class="c">边界㶲与边界㶲效率（小论文口径）</span>`)}</div>
      <div class="sec"><h4>比较方法</h4><ul class="list">${m==='charge' ? '<li>固定 UA 比较二次侧流量，再固定流量比较 UA；热源投入与床层捕获㶲应使用同一时间窗口。</li><li>流量对热容率比和换热器效能的影响需结合当前报告诊断判断，不能直接沿用旧求解器的数值分支结论。</li>' : '<li>同时比较交付温度、累计放热与产品㶲；相同温升不意味着相同交付热量。</li><li>不同充热终态的放热记录分别展示；在 checkpoint 连续性未核实前，不计算本批次完整循环效率。</li>'}</ul></div>`
  },
  wall: {
    eyebrow:"BOUNDARY · WALL", title:"壁面散热", en:"Wall heat loss to ambient · k ≈ 0.22–0.25 W/K",
    body: ()=>`
      <div class="sec"><h4>简介</h4><p>模型固有的罐壁向 20 °C 环境的散热。由所有工况的稳态尾段识别：充热平台进出口恒差 3.5 K（39–41 W）；放热尾段床层停在 58.5 °C、空气反向补 8–9 W。</p></div>
      <div class="sec"><h4>在模型中的功能</h4><p>决定充热后期的"平台"和放热的长尾。它使 E_bed 不等于储存量，使放热累计曲线在峰值后下降。</p></div>
      <div class="sec"><h4>公式</h4>${F(`Q<sub>wall</sub> ≈ k<sub>wall</sub> (T̄<sub>bed</sub> − 20 °C),&nbsp; k<sub>wall</sub> ≈ 0.23 W/K<br>E<sub>bed,net</sub> = E<sub>bed,air</sub> − ∫ Q<sub>wall</sub> dt<br><span class="c">hx1000 mdot100 充热 1872 min：空气侧 7.76 MJ，壁损 4.50 MJ，净储能 3.26 MJ</span>`)}</div>
      <div class="sec"><h4>对分析的影响</h4><ul class="list"><li>累计放热应同时保留峰值与终值；尾段负功率会使终值下降，不能把绝对值积分当作净放热。</li><li>壁损修正采用简化估计；所得净储能不是全域焓积分，不能据此直接认定相变完成。</li><li>长时平台需结合胶囊内部温度、场量与终点记录判断。上方固定尾段数值及公式示例来自历史批次。</li></ul></div>`
  },
  udf: {
    eyebrow:"UDF · CONTROL", title:"UDF 控制逻辑", en:"Charge / discharge NTU UDF · solver version 20260923",
    body: ()=>`
      <div class="sec"><h4>简介</h4><p>C 语言 UDF，把储热罐出口温度、换热器传热计算和入口边界实时耦合。宏开关 <span class="mono">ENABLE_CLOSED_LOOP</span> 在开环（固定入口温度）与闭环之间切换。</p></div>
      <div class="sec"><h4>每次迭代做什么</h4><ul class="list"><li>对出口正向质量流量加权取温度，并单独记录回流。</li><li>由 ε–NTU 闭式解得到一次侧目标温度、二次侧出口温度与有符号换热量。</li><li>亚松弛 0.2 后更新入口温度；由入口密度与面积计算速度，以保持 40 kg/h。</li><li>时间步末重新取实际场计算诊断，不再推进入口边界；hx_valid=1 只表示代数与输入有效。</li></ul></div>
      <div class="sec"><h4>关键宏</h4><div class="kv"><div>INLET / OUTLET_ZONE_ID</div><div>8 / 9（放热反转为 9 / 8）</div><div>M_DOT_1_SET</div><div>40/3600 kg/s</div><div>HX_UA · M_DOT_2</div><div>W/K · kg/s（100 kg/h = 0.027778）</div><div>T_IN_2_C</div><div>200（充）/ 60（放）</div><div>TEMP_RELAX</div><div>0.2</div><div>GEOMETRY_FACTOR</div><div>r2默认三维1.0；二维轴对称需核对每弧度换算，并与Fluent原生全域流量报告比较</div></div></div>
      <div class="sec"><h4>续算与验收</h4><div class="note">充热末态保存 case/data，反转入口与出口后读取该场并重置 UDF 状态，保留床层温度场。阶段详情显示诊断验收结果；首批需完成 6 核短算检查。操作见《UDF_NTU_验证与操作手册_20260923.md》。</div></div>`
  },
  metrics: {
    eyebrow:"METRICS", title:"监测与评价指标", en:"Report files · first-law and boundary-exergy metrics",
    body: (m)=>`
      <div class="sec"><h4>四端温度</h4><div class="kv"><div>床层入口 / 出口</div><div>t_in_domain-rfile.out（zone 8 / zone 9）</div><div>二次侧入口 / 出口</div><div>report_t2_in-rfile.out</div><div>流量</div><div>mass_flow-rfile.out（符号 = 流向）</div></div></div>
      <div class="sec"><h4>第一定律</h4>${F(`Q<sub>bed</sub> = W<sub>1</sub>(T<sub>bed,in</sub> − T<sub>bed,out</sub>)<br>E<sub>bed</sub>(t<sub>k</sub>) = Σ ½(Q<sub>k</sub> + Q<sub>k−1</sub>) Δt<br>t<sub>190</sub>：床层<b>出口</b>到 190 °C 的时间（脚本口径 time_T1out_190C）<br>t<sub>50</sub> / t<sub>90</sub>：累计放热达峰值 50 % / 90 % 的时刻`)}</div>
      <div class="sec"><h4>换热器实现度</h4>${F(`UA<sub>eff</sub> = |Q<sub>HX</sub>|/|ΔT<sub>LMTD</sub>|，&nbsp; ε<sub>actual</sub> = |W<sub>1</sub>(T<sub>1,in</sub> − T<sub>1,out</sub>)|/[C<sub>min</sub>|T<sub>1,in</sub> − T<sub>2,in</sub>|]<br><span class="c">标准效能使用较小热容率；20 kg/h 时不能直接用一次侧温降比。历史分析需重新计算才使用此口径。</span>`)}</div>
      <div class="sec"><h4>边界㶲</h4>${F(`e<sub>f</sub>(T) = c<sub>p</sub>[(T − T<sub>0</sub>) − T<sub>0</sub> ln(T/T<sub>0</sub>)]<br>充热 η<sub>b</sub> = E<sub>gain</sub>/E<sub>src</sub>；放热 η<sub>b,dis</sub> = E<sub>del</sub>/E<sub>rel</sub>；全周期 η<sub>rt</sub> = E<sub>del,dis</sub>/E<sub>src,chg</sub><br><span class="c">hx1000：4.4 % + 69.1 %（床层内部）+ 4.3 % + 22.2 %（交付）</span>`)}</div>
      <div class="sec"><h4>容易读错</h4><ul class="list"><li>累计放热终值与峰值的意义不同，均需保留有符号功率。</li><li>登记的 UA、实际可辨识 UA_eff 与理论效能应区分；旧 hx50 的数值分支结论不能用于本批次。</li><li>效能接近 1 时 LMTD 很小，UA 难以反算，不能仅凭此认定参数已验证。</li><li>重测批次保留切换后的有效采样；稳定诊断采用阶段时间超过 8 min 的记录。历史分析曾跳过前 3 步，口径不同。</li><li>边界㶲利用率未扣除风机/泵功，不等于系统净效率。</li></ul></div>`
  }
};
const COMPONENTS = [
  {id:"tank", name:"填充床储热罐", n:"HX-1", color:"var(--amber)"},
  {id:"pcm", name:"相变胶囊 PCM", n:"MAT", color:"var(--amber-lt)"},
  {id:"zone8", name:"顶部边界 zone 8", n:"BC", color:"var(--muted)"},
  {id:"zone9", name:"底部边界 zone 9", n:"BC", color:"var(--muted)"},
  {id:"loop", name:"一次侧回路", n:"LOOP", color:"var(--brand-lt)"},
  {id:"hx", name:"UDF 换热器", n:"HX-2", color:"var(--brand)"},
  {id:"secondary", name:"二次侧热源 / 冷源", n:"SRC", color:"var(--green)"},
  {id:"wall", name:"壁面散热", n:"LOSS", color:"var(--muted)"},
  {id:"udf", name:"UDF 控制逻辑", n:"CODE", color:"var(--purple)"},
  {id:"metrics", name:"监测与评价指标", n:"DATA", color:"var(--purple)"},
];
window.PBTES_CONTENT = { INFO, COMPONENTS };
