/* app.js — 路由、数据适配、演示控制、数据库视图、详情抽屉 */
(function(){
"use strict";
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const fmt=(v,d=1)=>(v==null||!(v>-1e9))?"—":Number(v).toFixed(d);
const g=(v)=> v==null ? "—" : (Number.isInteger(v)? String(v) : (Math.abs(v)>=100? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/,"")));
const { INFO, COMPONENTS } = window.PBTES_CONTENT;
const LIB = window.PBTES_LIBRARY || {cases:[], cycles:[], comparisons:[]};
const MODE_CN={charge:"充热",discharge:"放热",open:"开环",cycle:"全周期"};
const MODE_K={charge:"chg",discharge:"dis",open:"open",cycle:"cyc"};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DATASETS=LIB.datasets||[];
const LEGACY_DATASET="legacy";
const datasetId=c=>c.dataset||LEGACY_DATASET;
const datasetLabel=id=>(DATASETS.find(d=>d.dataset_id===id)||{}).label||(id===LEGACY_DATASET?"历史数据（原有批次）":id);
const DEFAULT_DATASET=DATASETS.some(d=>d.dataset_id==="retest-2026-10")?"retest-2026-10":"";
const phaseOf=s=>s.c.phase||(s.mode==="open"?"charge":s.mode);
const isOpen=s=>s.mode==="open"||(s.c.params||{}).closed_loop===false;
const phaseLabel=s=>(isOpen(s)?"开环 · ":"闭环 · ")+(MODE_CN[phaseOf(s)]||phaseOf(s));
const hasValues=a=>Array.isArray(a)&&a.some(v=>v!=null&&Number.isFinite(v));
const playable=s=>!!s&&Array.isArray(s.st.series&&s.st.series.tau_min)&&s.st.series.tau_min.length>1&&hasValues(s.st.series.bed_in_C)&&hasValues(s.st.series.bed_out_C);
const qualityNotes=s=>Array.from(new Set([...(s.c.quality&&s.c.quality.notes||[]),...(s.st.metrics.quality_notes||[]),...(s.c.review_reasons||[]),...(s.c.warnings||[])].map(x=>typeof x==="string"?x:JSON.stringify(x))));
const PHASE_STATUS={recorded:"有记录",recorded_with_warnings:"有记录 · 需复核",missing:"缺失",incomplete:"不完整"};
const samplingNote="新批次保留完整采样，历史曲线可能降采样。";
const researchStage=s=>(LIB.research&&LIB.research.records||[]).filter(r=>!r.segment_only).flatMap(r=>r.research&&r.research.stages||[]).find(r=>r.stage_id===s.id);
const probeName=(s,k)=>(researchStage(s)?.probe_labels||{})[k]||("测点 "+parseInt(k.slice(10,12),10));
const timeAxisNote=s=>datasetId(s.c)==="retest-2026-10"?(phaseOf(s)==="discharge"?"横轴为放热历时，首条有效记录记为 0；原始绝对 flow-time 保留。":"横轴为原始 flow-time，不补齐首条记录前的时段。") : "横轴沿用历史阶段时间口径。";
function physicalTimes(s){ const S=s.st.series; return hasValues(S.flow_time_min)?S.flow_time_min:S.tau_min.map(v=>v+(s.st.metrics.t_start_s||0)/60); }

/* ---------------------------------------------------------------- 阶段索引 */
const STAGES=[]; // {c: case, st: stage, id, mode, date}
(LIB.cases||[]).forEach(c=>(c.stages||[]).forEach(st=>{ st.metrics=st.metrics||{}; st.series=st.series||{}; STAGES.push({c, st, id:st.stage_id, mode:st.mode, date:(c.run_datetime||"").slice(0,10)}); }));
const STAGE_BY_ID=Object.fromEntries(STAGES.map(s=>[s.id,s]));
const CYCLES=(LIB.cycles||[]).filter(c=>STAGE_BY_ID[c.charge_stage]&&STAGE_BY_ID[c.discharge_stage]);
const CYCLE_BY_ID=Object.fromEntries(CYCLES.map(c=>[c.cycle_id,c]));
const LINK_CN={same_run:"同一运行",restart:"续算衔接",params:"同参数（待确认）",explicit:"人工指定"};
const COMPARISONS=(LIB.comparisons||[]).filter(c=>c.members.every(m=>STAGE_BY_ID[m.stage_id]));
const CMP_BY_ID=Object.fromEntries(COMPARISONS.map(c=>[c.cmp_id,c]));
const TYPE_CN={replicate:"重复性 / 误差分析",param_ua:"同 UA · ṁ₂ 变化 → η_b",param_m2:"同 ṁ₂ · UA 变化 → η_b"};
const PALETTE=["#1264FF","#E3A83A","#12A56B","#8B5CF6","#E0475B","#0EA5B7","#B97708","#64748B"];
function cycleLabel(c){ return `cyc · ua${g(c.UA_W_K)} · m${g(c.mdot2_kg_h)}`; }
function statusClass(ds){ if(!ds) return "na"; if(ds.startsWith("参数吻合")) return "ok"; if(ds.startsWith("有效 UA 偏低")||ds.startsWith("待验收")) return "low"; if(ds.startsWith("疑似")||ds.startsWith("有效 UA 偏高")||ds==="UDF 诊断异常"||ds==="超出换热量物理上限") return "bad"; if(ds.startsWith("开环")) return "open"; return "na"; }
function stageLabel(s){ const c=s.c; const p=c.params||{}; const parts=[isOpen(s)?"开环"+(MODE_CN[phaseOf(s)]||""):(MODE_K[s.mode]||s.mode)];
  if(!isOpen(s)){ if(p.UA_W_K!=null) parts.push("ua"+g(p.UA_W_K)); if(p.mdot2_kg_h!=null) parts.push("m"+g(p.mdot2_kg_h)); const t2=(s.st.series.t2in_C||[]).find(v=>v!=null) ?? p.T2in_C; if(t2!=null) parts.push("t"+g(t2)); }
  return parts.join(" · "); }
function inDataset(id){ return !state.filters.dataset||id===state.filters.dataset; }
function scopedStages(){ return STAGES.filter(s=>inDataset(datasetId(s.c))); }
function cycleDataset(c){ return c.dataset||datasetId(STAGE_BY_ID[c.charge_stage].c); }
function cmpDataset(c){ return c.dataset||(c.members[0]&&STAGE_BY_ID[c.members[0].stage_id]?datasetId(STAGE_BY_ID[c.members[0].stage_id].c):LEGACY_DATASET); }
function scopedCycles(){ return CYCLES.filter(c=>inDataset(cycleDataset(c))); }
function scopedComparisons(){ return COMPARISONS.filter(c=>inDataset(cmpDataset(c))); }
function datasetSummary(){
  const d=DATASETS.find(x=>x.dataset_id===state.filters.dataset); if(!d) return "";
  const missing=(d.missing_stages||[]).map(x=>typeof x==="string"?x:`${x.condition_id} ${MODE_CN[x.phase]||x.phase}`);
  const inventory=(d.conditions||[]).map(c=>`<div class="condition-item"><b>${esc(c.label||c.condition_id)}</b><span class="condition-phases">${["charge","discharge"].map(p=>{const a=(c.phases||{})[p]||{status:"missing"};const text=MODE_CN[p]+" · "+(PHASE_STATUS[a.status]||a.status); return a.stage_id&&STAGE_BY_ID[a.stage_id]?`<a class="phase-link ${a.status==="recorded"?"":"warn"}" href="#library/${encodeURIComponent(a.stage_id)}" title="${esc((a.notes||[]).join("；"))}">${esc(text)}</a>`:`<span class="phase-link missing" title="${esc(a.reason||(a.notes||[]).join("；"))}">${esc(text)}</span>`;}).join("")}</span></div>`).join("");
  return `<div class="dataset-note"><b>${esc(d.label||d.dataset_id)}</b> · ${d.physical_cases||d.conditions&&d.conditions.length||0} 组工况 · ${d.available_stages||0}/${d.expected_stages||0} 个阶段可读${missing.length?` · 缺失：${esc(missing.join("、"))}`:""}${(d.quality_notes||[]).length?`<p>${d.quality_notes.map(esc).join("；")}</p>`:""}${inventory?`<details class="condition-inventory" open><summary>工况与阶段清单 · 点击查看记录</summary>${inventory}</details>`:""}</div>`;
}

/* ---------------------------------------------------------------- 回放数据适配 */
function toPlayback(s){
  const S=s.st.series, mode=s.mode; const n=(S.tau_min||[]).length;
  const E=(S.e_bed_MJ||Array(n).fill(null)).map(v=> v==null?null:(mode==="discharge"?-v:v));
  let Emax=0; if(mode==="discharge"){ E.forEach(v=>{ if(v!=null&&v>Emax) Emax=v; }); } else { for(let i=n-1;i>=0;i--){ if(E[i]!=null){Emax=E[i];break;} } }
  const T2in_now = (S.t2in_C||[]).find(v=>v!=null) ?? (s.c.params||{}).T2in_C ?? null;
  return { mode, open_loop:isOpen(s), id:s.id, label:stageLabel(s), case_id:s.c.case_id, date:s.date, dt_s:s.c.dt_s, metrics:s.st.metrics, params:s.c.params||{}, T2in_now,
    t:S.tau_min||[], Tin:S.bed_in_C||[], Tout:S.bed_out_C||[], T2in:S.t2in_C||null, T2out:S.t2out_C||null, Q:S.q_bed_W||Array(n).fill(null), E, Emax:Math.max(Emax,1e-6) };
}
function toCyclePlayback(c){
  const A=toPlayback(STAGE_BY_ID[c.charge_stage]), B=toPlayback(STAGE_BY_ID[c.discharge_stage]);
  const tsw=A.t[A.t.length-1]; const cat=(x,y)=> (x&&y)? x.concat(y) : null;
  const t=A.t.concat(B.t.map(v=>v+tsw)); const nA=A.t.length;
  // 累计能量：充热段为吸热(正)，放热段以充热末值为起点回落（净储能视角）
  const Eend=A.E[nA-1]||0; const E=A.E.concat(B.E.map(v=>v==null?null:Eend-v));
  const Emax=Math.max(1e-6,...E.filter(v=>v!=null));
  return { mode:"cycle", cycle:c, id:c.cycle_id, label:cycleLabel(c), case_id:c.charge_case===c.discharge_case?c.charge_case:(c.charge_case.slice(0,13)+" → "+c.discharge_case.slice(0,13)),
    date:A.date, dt_s:A.dt_s, metrics:c.metrics, params:A.params, T2in_now:A.T2in_now, T2in_dis:B.T2in_now, tsw, nA, u_sw:tsw/t[t.length-1],
    t, Tin:A.Tin.concat(B.Tin), Tout:A.Tout.concat(B.Tout), T2in:cat(A.T2in,B.T2in), T2out:cat(A.T2out,B.T2out), Q:A.Q.concat(B.Q.map(v=>v==null?null:-v)), E, Emax, A, B };
}
function modeAt(u){ const d=state.data; if(!d||d.mode!=="cycle") return d?d.mode:"charge"; return u<d.u_sw?"charge":"discharge"; }
function pickBaseline(mode){ const pool=STAGES.filter(x=>x.mode===mode&&playable(x)); const preferred=pool.filter(x=>datasetId(x.c)===DEFAULT_DATASET); return preferred.find(x=>(x.c.tags||[]).includes("baseline"))||preferred[0]||pool.find(x=>(x.c.tags||[]).includes("baseline"))||pool.slice().reverse()[0]||null; }

/* ---------------------------------------------------------------- 状态 */
const state={ view:"demo", mode:"charge", u:0, playing:false, speed:1, sel:"system", stageFor:{charge:null,discharge:null,open:null,cycle:null}, data:null, libSel:null, libTab:"stages", cmpSel:new Set(), adhoc:null,
  filters:{mode:"",ua:"",m2:"",status:"",dataset:DEFAULT_DATASET,project:"",date:"",q:""} };
["charge","discharge","open"].forEach(m=>{ const b=pickBaseline(m); if(b) state.stageFor[m]=b.id; });
{ const cycles=CYCLES.filter(c=>!DEFAULT_DATASET||cycleDataset(c)===DEFAULT_DATASET); if(cycles.length){ const pref=cycles.find(c=>!c.needs_confirmation&&c.link==="same_run")||cycles.find(c=>!c.needs_confirmation)||cycles[0]; state.stageFor.cycle=pref.cycle_id; } }

/* ---------------------------------------------------------------- 抽屉 */
function showInfo(id){
  state.sel=id; const it=INFO[id]; if(!it) return;
  $("#dEyebrow").textContent=it.eyebrow; $("#dTitle").textContent=it.title; $("#dEn").textContent=it.en;
  $("#dBody").innerHTML=it.body((state.mode==="open"||state.mode==="cycle")?modeAt(state.u):state.mode); $("#dActions").innerHTML=""; $("#dActions").classList.remove("on");
  if(id==="system"&&state.data){ const d=state.data, M=d.metrics, p=d.params; const pct=v=>v==null?"—":(100*v).toFixed(1)+" %";
    const wf=M.waterfall_full;
    const rows= d.open_loop ? [["数据",d.case_id],["模式","开环"+(d.mode==="discharge"?"放热":"充热")],["入口 / 排出",`${g(M.bed_in_start_C)} °C / 出口直排`],["时长",g(M.duration_min)+" min"],["阶段状态",PHASE_STATUS[M.phase_status]||M.phase_status||M.data_status||"—"],[d.mode==="discharge"?"峰值放热":"全程空气侧吸热",g(d.mode==="discharge"?M.E_rel_peak_MJ:M.E_bed_air_full_MJ)+" MJ"]]
      : d.mode==="cycle" ? [["数据",d.case_id],["配对方式",LINK_CN[d.cycle.link]||d.cycle.link],["换热器",`UA ${g(p.UA_W_K)} W/K · ṁ₂ ${g(p.mdot2_kg_h)} kg/h · T₂,in ${g(d.T2in_now)} → ${g(d.T2in_dis)} °C`],["净储能 / 峰值放热",g(M.E_net_stored_MJ)+" / "+g(M.E_rel_peak_MJ)+" MJ"],["可回收比例",pct(M.recoverable_fraction)],["η_b 全程充 / 放",pct(M.eta_b_charge_full??d.A.metrics.eta_b_full)+" / "+pct(M.eta_b_dis)],["η_rt（全充热程）",wf?pct(wf.eta_rt):"—"]]
      : d.mode==="charge" ? [["数据",d.case_id],["换热器",`UA ${g(p.UA_W_K)} W/K · ṁ₂ ${g(p.mdot2_kg_h)} kg/h · T₂,in ${g(d.T2in_now)} °C`],["出口到 190 °C",M.t190_bed_out_min!=null?g(M.t190_bed_out_min)+" min":"未到"],["E_bed 0–240 min",g(M.E_bed_240_MJ)+" MJ"],["η_b 0–240",pct(M.eta_b_240)],["UA_eff / 状态",(M.UA_eff_median_W_K!=null?g(M.UA_eff_median_W_K)+" W/K · ":"")+(M.data_status||"—")]]
      : d.mode==="discharge" ? [["数据",d.case_id],["换热器",`UA ${g(p.UA_W_K)} W/K · ṁ₂ ${g(p.mdot2_kg_h)} kg/h · T₂,in ${g(d.T2in_now)} °C`],["峰值放热",g(M.E_rel_peak_MJ)+" MJ @ "+g(M.t_peak_min)+" min"],["放出 90 %",g(M.t90_min)+" min"],["T₂,out 最高",g(M.T2out_max_C)+" °C"],["η_b,dis / 状态",pct(M.eta_b_dis)+" · "+(M.data_status||"—")]]
      : [["数据",d.case_id],["入口",`恒 ${g(M.bed_in_start_C)} °C，出口直排`],["出口到 190 °C",g(M.t190_bed_out_min)+" min"],["E_bed 0–240 min",g(M.E_bed_240_MJ)+" MJ"],["η_b 0–240",pct(M.eta_b_240)]];
    const sec=document.createElement("div"); sec.className="sec"; sec.innerHTML=`<h4>当前数据 · 关键结果</h4><div class="kv">${rows.map(([k,v])=>`<div>${k}</div><div>${v}</div>`).join("")}</div>`;
    const first=$("#dBody .sec"); first.parentNode.insertBefore(sec, first.nextSibling); }
  $$("#legend .pill").forEach(p=>p.classList.toggle("on",p.dataset.id===id));
}
$("#dClose").onclick=()=>{ if(state.view==="library"){ state.libSel=null; go("library"); renderLibrary(); showLibraryHome(); } else showInfo("system"); };
$("#btnOverview").onclick=()=>{ go("demo"); showInfo("system"); };
COMPONENTS.forEach(c=>{ const b=document.createElement("button"); b.className="pill"; b.dataset.id=c.id; b.innerHTML=`<span class="dot" style="background:${c.color}"></span>${c.name}<span class="n">${c.n}</span>`; b.onclick=()=>showInfo(c.id); $("#legend").appendChild(b); });

/* ---------------------------------------------------------------- 模式与数据 */
const MODE_TEXT={
  charge:{eyebrow:"01 / CHARGING · 充热", title:"二次侧热源，空气自上而下穿过床层", path:"zone 8 → 床层 → zone 9 → <b>HX 一次侧</b> → zone 8 &nbsp;|&nbsp; 二次侧热源 → HX → T₂,out 回热源"},
  discharge:{eyebrow:"02 / DISCHARGING · 放热", title:"二次侧冷源，流向反转，空气自下而上穿过床层", path:"zone 9 → 床层 → zone 8 → <b>HX 一次侧</b> → zone 9 &nbsp;|&nbsp; 冷源 → HX → T₂,out 交付"},
  cycle:{eyebrow:"03 / FULL CYCLE · 充放周期", title:"同一组参数下充热与放热连续回放", path:"充热：热源 → HX → 床层（自上而下） &nbsp;→&nbsp; <b>切换</b> &nbsp;→&nbsp; 放热：冷源 → HX → 床层（自下而上）"},
  open:{eyebrow:"00 / OPEN LOOP · 开环基准", title:"入口恒温 200 °C，出口直排，无二次侧换热器", path:"200 °C → zone 8 → 床层 → zone 9 → <b>排放</b>"} };
function loadCycle(cid, opts={}){
  const c=CYCLE_BY_ID[cid]; if(!c||!playable(STAGE_BY_ID[c.charge_stage])||!playable(STAGE_BY_ID[c.discharge_stage])) return;
  state.stageFor.cycle=cid; state.mode="charge"; state.data=toCyclePlayback(c); state.u=0; state.playing=false; updatePlayIcon();
  $("#modeSeg").classList.add("auto"); const d=state.data, p=d.params, M=d.metrics, t=MODE_TEXT.cycle;
  $("#mcEyebrow").textContent=t.eyebrow; $("#mcTitle").textContent=t.title; $("#mcPath").innerHTML=t.path;
  $("#mcDesc").textContent=`换热器 UA ${g(p.UA_W_K)} W/K，二次侧 ${g(p.mdot2_kg_h)} kg/h；充热 ${g(M.charge_duration_min)} min（T₂,in ${g(d.T2in_now)} °C）→ 放热 ${g(M.discharge_duration_min)} min（T₂,in ${g(d.T2in_dis)} °C）；配对：${LINK_CN[c.link]||c.link}${c.needs_confirmation?"，待人工确认":""}。`;
  $("#tlCase").textContent=d.case_id;
  $("#curLabel").innerHTML=`<b>${cycleLabel(c)}</b> · ${d.date} · <span class="link-badge ${c.link}">${LINK_CN[c.link]||c.link}</span>`;
  const mk=$("#tlMark"); mk.style.display="block"; mk.style.left=(d.u_sw*100)+"%";
  Scene.setHXLabel(()=>`UA ${g(p.UA_W_K)} W/K · ṁ₂ ${g(p.mdot2_kg_h)} kg/h`);
  syncModeSeg(); if(!opts.keepInfo) showInfo(state.sel);
}
function syncModeSeg(){ const m=modeAt(state.u); $$("#modeSeg button").forEach(b=>b.classList.toggle("on",b.dataset.mode===m)); }
function loadStage(stageId, opts={}){
  const s=STAGE_BY_ID[stageId]; if(!playable(s)) return; $("#modeSeg").classList.remove("auto"); $("#tlMark").style.display="none";
  state.stageFor[s.mode]=stageId; state.mode=s.mode; state.data=toPlayback(s); state.u=0; state.playing=false; updatePlayIcon();
  $$("#modeSeg button").forEach(b=>b.classList.toggle("on",b.dataset.mode===s.mode));
  let t=MODE_TEXT[s.mode]||MODE_TEXT.charge; const p=state.data.params; const M=state.data.metrics;
  if(isOpen(s)){ const dis=phaseOf(s)==="discharge", inlet=(s.st.series.bed_in_C||[]).find(v=>v!=null); t={eyebrow:`OPEN LOOP / ${dis?"DISCHARGING · 开环放热":"CHARGING · 开环充热"}`,title:`入口 ${g(inlet)} °C，空气穿过床层后直接排出`,path:dis?`${g(inlet)} °C → zone 9 → 床层 → zone 8 → <b>排放</b>`:`${g(inlet)} °C → zone 8 → 床层 → zone 9 → <b>排放</b>`}; }
  $("#mcEyebrow").textContent=t.eyebrow; $("#mcTitle").textContent=t.title; $("#mcPath").innerHTML=t.path;
  const descParts=[];
  if(!isOpen(s)) descParts.push(`换热器 UA ${g(p.UA_W_K)} W/K，二次侧 ${g(p.mdot2_kg_h)} kg/h、${g(state.data.T2in_now)} °C`);
  descParts.push(`一次侧 ${g(p.mdot1_kg_h||40)} kg/h，Δt ${g(state.data.dt_s)} s，时长 ${g(M.duration_min)} min`);
  if(M.data_status) descParts.push(`数据状态：${M.data_status}`);
  $("#mcDesc").textContent=descParts.join("；")+"。";
  $("#tlCase").textContent=`${s.c.case_id}`;
  $("#curLabel").innerHTML=`<b>${stageLabel(s)}</b> · ${s.date} · <span class="status-badge ${statusClass(M.data_status)}"><span class="d"></span>${M.data_status||"—"}</span>`;
  Scene.setHXLabel(()=> isOpen(s)?"开环：无换热器":`UA ${g(p.UA_W_K)} W/K · ṁ₂ ${g(p.mdot2_kg_h)} kg/h`);
  if(!opts.keepInfo) showInfo(state.sel);
}
$$("#modeSeg button").forEach(b=>b.onclick=()=>{ const m=b.dataset.mode;
  if(state.data&&state.data.mode==="cycle"&&(m==="charge"||m==="discharge")){ state.u = m==="charge"?0:state.data.u_sw+1e-4; state.playing=false; updatePlayIcon(); return; }
  const sid=state.stageFor[m]; if(sid) loadStage(sid); else { go("library"); setFilter("mode",m); } });
$("#btnCycle").onclick=()=>{ if(state.stageFor.cycle) loadCycle(state.stageFor.cycle); else { go("library"); setLibTab("cycles"); } };

/* ---------------------------------------------------------------- 时间轴 */
const tl=$("#tl");
function lerpArr(a,i,f){ if(!a) return null; const x=a[i], y=a[i+1]; if(x==null||y==null) return x!=null?x:(y!=null?y:null); return x+(y-x)*f; }
function sample(u){ const d=state.data; if(!d) return {t:0,Tin:null,Tout:null,T2in:null,T2out:null,Q:0,E:0,progress:0};
  const n=d.t.length, T=d.t, x=u*T[n-1]; let lo=0, hi=n-2; while(lo<hi){ const m=(lo+hi+1)>>1; if(T[m]<=x) lo=m; else hi=m-1; } const i=lo; const dtl=T[i+1]-T[i]; const f=dtl>1e-9?Math.min(1,Math.max(0,(x-T[i])/dtl)):1;
  const E=lerpArr(d.E,i,f)||0; return {mode:modeAt(u),t:lerpArr(d.t,i,f),Tin:lerpArr(d.Tin,i,f),Tout:lerpArr(d.Tout,i,f),T2in:lerpArr(d.T2in,i,f),T2out:lerpArr(d.T2out,i,f),Q:lerpArr(d.Q,i,f)||0,E,progress:cycleProgress(d,u,E)}; }
function cycleProgress(d,u,E){ if(d.mode!=="cycle") return E/d.Emax; const Eend=d.A.E[d.A.E.length-1]||0; return u<d.u_sw ? E/d.A.Emax : (Eend-E)/d.B.Emax; }
tl.oninput=()=>{state.u=tl.value/1000; state.playing=false; updatePlayIcon();};
function updatePlayIcon(){ $("#icoPlay").innerHTML=state.playing?'<path d="M3 2h3.5v12H3zM9.5 2H13v12H9.5z"/>':'<path d="M4 2.5v11l9-5.5z"/>'; }
$("#btnPlay").onclick=()=>{ if(state.u>=0.999) state.u=0; state.playing=!state.playing; updatePlayIcon(); };
$$("#speed button").forEach(b=>b.onclick=()=>{state.speed=+b.dataset.s; $$("#speed button").forEach(x=>x.classList.toggle("on",x===b));});
function updateReadouts(s){
  $("#tlTime").textContent=`t = ${fmt(s.t)} min`; tl.value=Math.round(state.u*1000); tl.style.setProperty("--p",(state.u*100)+"%");
  const set=(id,val,cls)=>{ const el=$(id+" .v"); el.textContent=val; el.classList.toggle("na",val==="—"); $(id).className="ro "+(cls||""); };
  const live=modeAt(state.u); if(state.data.mode==="cycle"&&live!==state.mode){ state.mode=live; syncModeSeg(); if(state.sel!=="system") showInfo(state.sel); }
  const hot=live!=="discharge"; const cyc=state.data.mode==="cycle";
  set("#roTin",fmt(s.Tin)+" °C",hot?"hot":"cold"); set("#roTout",fmt(s.Tout)+" °C",hot?"warm":"hot");
  set("#roT2out",(s.T2out>-100)?fmt(s.T2out)+" °C":"—",hot?"hot":"cold");
  set("#roQ",(live==="discharge"?"−":"+")+fmt(Math.abs(s.Q),0)+" W",""); set("#roE",fmt(s.E,3)+" MJ","");
  $("#roE .t").textContent=cyc?"空气侧累计净吸热（充−放）":(live==="discharge"?"累计放热 E_rel":"累计吸热 E_bed"); $("#roQ .t").textContent=live==="discharge"?"床层放热功率":"床层吸热功率 Q_bed";
  if(cyc) $("#tlTime").textContent+= live==="charge"?"  ·  充热":"  ·  放热 (+"+fmt(s.t-state.data.tsw)+")";
}

/* ---------------------------------------------------------------- 场景 */
const Scene=window.createScene({ canvas:$("#c3d"), stage:$("#stage"), labelsEl:$("#labels"), onPick:(id)=>{ if(state.view!=="demo") go("demo"); showInfo(id); }, fmt });
$("#btnView").onclick=Scene.resetView; $("#btnGlass").onclick=Scene.toggleGlass;
let last=performance.now();
function frame(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  if(state.view==="demo"&&state.data){
    if(state.playing){ const span=state.data.t[state.data.t.length-1]||1; const minPerSec=span/40*state.speed; state.u+=(minPerSec*dt)/span; if(state.u>=1){state.u=1;state.playing=false;updatePlayIcon();} }
    const s=sample(state.u); updateReadouts(s); Scene.frame(s,s.mode,dt,now);
  }
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- 路由 */
function go(view, arg){ location.hash = view==="research" ? "#research" : view==="library" ? ("#library"+(arg?"/"+arg:"")) : "#demo"; }
function route(){
  const h=location.hash||"#demo"; const [_,view,arg]=h.match(/^#(\w+)(?:\/(.+))?$/)||[null,"demo",null];
  state.view=(view==="research")?"research":(view==="library")?"library":"demo";
  $("#view-demo").classList.toggle("on",state.view==="demo"); $("#view-library").classList.toggle("on",state.view==="library");
  if($("#view-research")) $("#view-research").classList.toggle("on",state.view==="research");
  $("#app").classList.toggle("research-mode",state.view==="research");
  $("#footer").classList.toggle("hidden",state.view!=="demo"); $("#demoTools").style.display=state.view==="demo"?"":"none";
  $$("#tabs button").forEach(b=>b.classList.toggle("on",b.dataset.view===state.view));
  if(state.view==="research"){ $("#app").classList.remove("cmpwide"); window.PBTES_RESEARCH&&window.PBTES_RESEARCH.mount(arg?decodeURIComponent(arg):null); return; }
  if(state.view==="library"){ if(arg){ const a=decodeURIComponent(arg);
      if(a.startsWith("cycle/")){ const cid=a.slice(6); if(CYCLE_BY_ID[cid]){ state.libTab="cycles"; state.libSel=cid; renderLibrary(); showCycleDetail(cid); return; } }
      if(a.startsWith("cmp/")){ const id=a.slice(4); if(id==="adhoc"&&state.adhoc){ state.libTab="compare"; state.libSel="adhoc"; renderLibrary(); showCompareDetail(state.adhoc); return; } if(CMP_BY_ID[id]){ state.libTab="compare"; state.libSel=id; renderLibrary(); showCompareDetail(CMP_BY_ID[id]); return; } }
      if(STAGE_BY_ID[a]){ state.libTab="stages"; state.libSel=a; renderLibrary(); showStageDetail(a); return; } }
    renderLibrary(); if(!state.libSel) showLibraryHome(); }
  else { $("#app").classList.remove("cmpwide"); Scene.resize(); showInfo(state.sel); }
}
window.addEventListener("hashchange",route);
$$("#tabs button").forEach(b=>b.onclick=()=>go(b.dataset.view));
$("#btnPickData").onclick=()=>go("library");
window.addEventListener("keydown",e=>{ if(e.target.tagName==="INPUT"||e.target.tagName==="SELECT") return;
  if(e.code==="Space"&&state.view==="demo"){e.preventDefault();$("#btnPlay").click();} if(e.key==="1") go("demo"); if(e.key==="2") go("library");
  if(e.key==="r"||e.key==="R") Scene.resetView(); if(e.key==="g"||e.key==="G") Scene.toggleGlass(); if(e.key==="?") showInfo("system"); if(e.key==="Escape"&&state.view==="library"){ state.libSel=null; renderLibrary(); showLibraryHome(); } });

/* ---------------------------------------------------------------- 数据库视图 */
function setLibTab(t){ state.libTab=t; state.libSel=null; renderLibrary(); showLibraryHome(); }
$$("#libTabs button").forEach(b=>b.onclick=()=>setLibTab(b.dataset.tab));
function uniq(arr){ return Array.from(new Set(arr.filter(v=>v!=null))).sort((a,b)=>a-b); }
function setFilter(k,v){ state.filters[k]=v; const el=$("#f-"+k); if(el) el.value=v; renderLibrary(); }
function buildFilters(){
  const uas=uniq(STAGES.map(s=>s.c.params&&s.c.params.UA_W_K)), m2s=uniq(STAGES.map(s=>s.c.params&&s.c.params.mdot2_kg_h));
  const datasets=Array.from(new Set(STAGES.map(s=>datasetId(s.c)))).sort((a,b)=>a===DEFAULT_DATASET?-1:b===DEFAULT_DATASET?1:a.localeCompare(b));
  const projects=Array.from(new Set(STAGES.map(s=>s.c.project).filter(Boolean))).sort();
  const statuses=Array.from(new Set(STAGES.map(s=>s.st.metrics.data_status).filter(Boolean)));
  const opt=(vals,fmtf)=>'<option value="">全部</option>'+vals.map(v=>`<option value="${v}">${fmtf?fmtf(v):v}</option>`).join("");
  $("#f-ua").innerHTML=opt(uas,v=>g(v)+" W/K"); $("#f-m2").innerHTML=opt(m2s,v=>g(v)+" kg/h"); $("#f-status").innerHTML=opt(statuses); $("#f-dataset").innerHTML=opt(datasets,datasetLabel); $("#f-project").innerHTML=opt(projects);
  ["mode","ua","m2","status","dataset","project","date","q"].forEach(k=>{ const el=$("#f-"+k); el.value=state.filters[k]; el.oninput=el.onchange=()=>{ state.filters[k]=el.value; if(k==="dataset"){ state.cmpSel.clear(); state.libSel=null; } renderLibrary(); if(k==="dataset") showLibraryHome(); }; });
  $("#f-clear").onclick=()=>{ Object.keys(state.filters).forEach(k=>state.filters[k]=""); ["mode","ua","m2","status","dataset","project","date","q"].forEach(k=>{$("#f-"+k).value="";}); state.libSel=null; renderLibrary(); showLibraryHome(); };
}
function filtered(){
  const f=state.filters; return STAGES.filter(s=>{ const p=s.c.params||{};
    if(f.mode&&(f.mode==="open"?!isOpen(s):phaseOf(s)!==f.mode)) return false; if(f.ua&&String(p.UA_W_K)!==f.ua) return false; if(f.m2&&String(p.mdot2_kg_h)!==f.m2) return false;
    if(f.status&&s.st.metrics.data_status!==f.status) return false; if(f.dataset&&datasetId(s.c)!==f.dataset) return false; if(f.project&&s.c.project!==f.project) return false;
    if(f.date&&!(s.c.run_datetime||"").startsWith(f.date)) return false;
    if(f.q){ const hay=(s.c.case_id+" "+(s.c.condition_id||"")+" "+(s.c.note||"")+" "+(s.c.tags||[]).join(" ")+" "+stageLabel(s)).toLowerCase(); if(!hay.includes(f.q.toLowerCase())) return false; }
    return true; }).sort((a,b)=>(b.c.run_datetime||"").localeCompare(a.c.run_datetime||""));
}
function renderLibrary(){
  const scope=scopedStages();
  $$("#libTabs button").forEach(b=>b.classList.toggle("on",b.dataset.tab===state.libTab)); $("#nStages").textContent=scope.length; $("#nCycles").textContent=scopedCycles().length;
  $("#nCmps").textContent=scopedComparisons().length+(state.adhoc&&inDataset(cmpDataset(state.adhoc))?"+1":""); $("#app").classList.toggle("cmpwide",state.view==="library"&&state.libTab==="compare");
  $("#libFilters").style.display=""; $("#libFilters").classList.toggle("dataset-only",state.libTab!=="stages"); $("#selbar").classList.toggle("on",state.libTab==="stages"&&state.cmpSel.size>0); updateSelbar();
  if(state.libTab==="cycles") return renderCycles();
  if(state.libTab==="compare") return renderComparisons();
  const list=$("#liblist"), rows=filtered(), dataset=DATASETS.find(d=>d.dataset_id===state.filters.dataset), sourceCount=new Set(scope.map(s=>s.c.case_id)).size;
  $("#libCount").textContent=`${rows.length} / ${scope.length} 个阶段 · ${dataset&&dataset.physical_cases!=null?dataset.physical_cases+" 组工况":sourceCount+" 份来源记录"} · 生成 ${LIB.generated_at||"—"}`;
  const dsSummary=datasetSummary();
  if(!STAGES.length){ list.innerHTML=`<div class="empty">库为空。请在 Mac 上运行 <code>python3 pbtes.py analyze --all</code> 与 <code>python3 pbtes.py export-web</code> 生成 <code>library.js</code>。</div>`; return; }
  if(!rows.length){ list.innerHTML=dsSummary+`<div class="empty">没有符合过滤条件的阶段。</div>`; return; }
  const groups={}; rows.forEach(s=>{ (groups[s.date]=groups[s.date]||[]).push(s); });
  let html=dsSummary; let idx=0;
  Object.keys(groups).sort().reverse().forEach(day=>{
    html+=`<section class="daygroup"><h3>${day}</h3>`;
    groups[day].forEach(s=>{ idx++; const c=s.c, M=s.st.metrics, p=c.params||{};
      const steps=`${M.first_step ?? c.first_step ?? "?"}→${M.last_step ?? c.last_step ?? "?"}`; const dur=g(M.recorded_duration_min??M.duration_min);
      const key= s.mode==="charge" ? (M.t190_bed_out_min!=null?`t₁₉₀ ${g(M.t190_bed_out_min)} min · E₂₄₀ ${g(M.E_bed_240_MJ)} MJ`:`E ${g(M.E_bed_air_full_MJ)} MJ`)
               : s.mode==="discharge" ? `峰值 ${g(M.E_rel_peak_MJ)} MJ · t₉₀ ${g(M.t90_min)} min`
               : `t₁₉₀ ${g(M.t190_bed_out_min)} min · η_b ${M.eta_b_240!=null?(100*M.eta_b_240).toFixed(1)+" %":"—"}`;
      const ua=M.UA_eff_median_W_K!=null?`UA_eff ${g(M.UA_eff_median_W_K)}`:(M.eps_actual_median!=null?`ε ${M.eps_actual_median.toFixed(3)}`:"");
      const tags=(c.tags||[]).filter(t=>t!=="legacy").map(t=>`<span class="tag ${t==="baseline"?"b":""}">${t}</span>`).join("")+(c.legacy?'<span class="tag">旧数据</span>':'')+(c.params_source==="override"?'<span class="tag a">参数=覆盖</span>':'')+(c.stages.length>1?'<span class="tag">同运行 '+c.stages.length+' 段</span>':'');
      html+=`<div class="stage-row ${state.libSel===s.id?"sel":""}" data-id="${s.id}">
        <div>${isOpen(s)||!playable(s)?"":`<input type="checkbox" class="selbox" data-id="${s.id}" ${state.cmpSel.has(s.id)?"checked":""} title="选入同批次对比">`}</div>
        <div class="idx">${String(idx).padStart(2,"0")}</div>
        <div><span class="mode-pill ${isOpen(s)?"open":s.mode}">${isOpen(s)?"开环":""}${MODE_CN[phaseOf(s)]||MODE_K[s.mode]}</span></div>
        <div class="par">${esc(stageLabel(s).replace(/^\w+ · /,""))}<small>${esc(datasetLabel(datasetId(c)))} · ${esc(c.condition_id||c.project||"")} / ${esc(c.design_point_dir||"")}${c.restart_from_step?" · from"+c.restart_from_step:""}</small><div class="tagline">${tags}${M.phase_status?`<span class="tag ${M.phase_status==="recorded"?"":"a"}">${PHASE_STATUS[M.phase_status]||M.phase_status}</span>`:""}${qualityNotes(s).length?`<span class="tag a" title="${esc(qualityNotes(s).join("；"))}">来源 / 诊断提示 ${qualityNotes(s).length}</span>`:""}</div></div>
        <div class="mono">${steps} · Δt ${g(c.dt_s)} s<br>${dur} min</div>
        <div class="mono">${key}<br>${ua}</div>
        <div><span class="status-badge ${statusClass(M.data_status)}"><span class="d"></span>${M.data_status||"—"}</span></div>
        <div class="acts"><button class="primary" data-act="play" ${playable(s)?"":"disabled"}>回放</button><button data-act="detail">详情</button></div>
      </div>`; });
    html+=`</section>`; });
  list.innerHTML=html;
  list.querySelectorAll(".stage-row").forEach(r=>{ r.onclick=(e)=>{ if(e.target.classList.contains("selbox")){ toggleSel(e.target.dataset.id,e.target.checked); return; } const act=e.target.dataset&&e.target.dataset.act; const sid=r.dataset.id;
    if(act==="play"){ loadStage(sid,{keepInfo:true}); go("demo"); return; } state.libSel=sid; go("library",encodeURIComponent(sid)); }; });
}
function wfBar(wf){ if(!wf) return '<span class="dim">无㶲瀑布（缺对应窗口数据）</span>'; const P=wf.pct;
  return `<div class="wfbar" title="以 E_src 为 100 %"><span class="wf-hxc" style="width:${P.HX_charge}%"></span><span class="wf-bed" style="width:${P.bed_internal}%"></span><span class="wf-hxd" style="width:${P.HX_discharge}%"></span><span class="wf-del" style="width:${P.delivered}%"></span></div>`; }
const WF_LEGEND='<div class="wflegend"><span><i class="wf-hxc"></i>换热器·充 E_D</span><span><i class="wf-bed"></i>床层内部 + 壁损 + 未放出</span><span><i class="wf-hxd"></i>换热器·放 E_D</span><span><i class="wf-del"></i>交付 E_del</span></div>';
function renderCycles(){
  const list=$("#liblist"), cycles=scopedCycles(); $("#libCount").textContent=`${cycles.length} 个配对周期 · 生成 ${LIB.generated_at||"—"}`;
  if(!cycles.length){ list.innerHTML=datasetSummary()+`<div class="empty">当前批次没有已登记的充放热配对。各阶段可在上方清单或「阶段」页分别查看；同参数记录不等同于已验证的连续周期，需先核验充热 checkpoint 与放热初始场的来源。</div>`; return; }
  let html=datasetSummary(); cycles.forEach((c,i)=>{ const M=c.metrics, wf=M.waterfall_full; const cs=STAGE_BY_ID[c.charge_stage], ds=STAGE_BY_ID[c.discharge_stage];
    html+=`<div class="cycle-row ${state.libSel===c.cycle_id?"sel":""}" data-id="${c.cycle_id}">
      <div class="idx">${String(i+1).padStart(2,"0")}</div>
      <div><span class="link-badge ${c.link}">${LINK_CN[c.link]||c.link}</span></div>
      <div class="par">UA ${g(c.UA_W_K)} W/K · ṁ₂ ${g(c.mdot2_kg_h)} kg/h<small>${esc(datasetLabel(cycleDataset(c)))}<br>充 ${cs.date} ${c.charge_case.slice(14)}<br>放 ${ds.date} ${c.discharge_case.slice(14)}</small></div>
      <div class="mono">净储能 ${g(M.E_net_stored_MJ)} MJ<br>峰值放热 ${g(M.E_rel_peak_MJ)} MJ · 可回收 ${M.recoverable_fraction!=null?(100*M.recoverable_fraction).toFixed(0)+" %":"—"}</div>
      <div>${wfBar(wf)}<div class="mono" style="margin-top:4px">η_rt（全程） ${wf?(100*wf.eta_rt).toFixed(1)+" %":"—"} · η_b 充 ${(M.eta_b_charge_full??cs.st.metrics.eta_b_full)!=null?(100*(M.eta_b_charge_full??cs.st.metrics.eta_b_full)).toFixed(0):"—"} / 放 ${M.eta_b_dis!=null?(100*M.eta_b_dis).toFixed(0):"—"} %</div></div>
      <div class="acts"><button class="primary" data-act="play">连续回放</button><button data-act="detail">详情</button></div></div>`; });
  html+=`<p class="dim" style="margin-top:10px;font-size:12px">回放采用阶段相对时间拼接。配对关系、步号匹配或同参数不能单独证明初始场连续；完整周期结论仍需 case/data 与 checkpoint 来源核验。</p>`;
  list.innerHTML=html;
  list.querySelectorAll(".cycle-row").forEach(r=>{ r.onclick=(e)=>{ const act=e.target.dataset&&e.target.dataset.act; const cid=r.dataset.id;
    if(act==="play"){ loadCycle(cid,{keepInfo:true}); go("demo"); return; } state.libSel=cid; go("library","cycle/"+encodeURIComponent(cid)); }; });
}
function showCycleDetail(cid){
  const c=CYCLE_BY_ID[cid]; if(!c) return; const M=c.metrics; const cs=STAGE_BY_ID[c.charge_stage], ds=STAGE_BY_ID[c.discharge_stage]; const d=toCyclePlayback(c);
  $("#dEyebrow").textContent=`CYCLE / ${LINK_CN[c.link]||c.link}`; $("#dTitle").textContent=`UA ${g(c.UA_W_K)} W/K · ṁ₂ ${g(c.mdot2_kg_h)} kg/h 充放周期`; $("#dEn").textContent=c.cycle_id;
  const kv=(pairs)=>`<div class="kv dense">${pairs.filter(([k,v])=>v!=null&&v!=="").map(([k,v])=>`<div>${k}</div><div>${v}</div>`).join("")}</div>`; const pct=v=>v==null?null:(100*v).toFixed(1)+" %";
  const temps=svgLine([{x:d.t,y:d.Tin,color:"#B97708",w:1.8},{x:d.t,y:d.Tout,color:"#E3A83A"},...(d.T2in?[{x:d.t,y:d.T2in,color:"#1264FF",dash:true},{x:d.t,y:d.T2out,color:"#7FA3FF"}]:[])],{title:"四端温度 (°C) · 切换 @ "+g(d.tsw)+" min",xlabel:"min"});
  const ee=svgLine([{x:d.t,y:d.E,color:"#1264FF",w:1.8}],{title:"累计空气侧净输入（未扣壁损）(MJ)",xlabel:"min",ymin:0});
  const wfRows=(lab,wf)=> wf? [[`E_src（${lab}）`,g(wf.E_src_MJ)+" MJ = 100 %"],["− 换热器·充 E_D",g(wf.HX_charge_destroyed_MJ)+" MJ · "+wf.pct.HX_charge.toFixed(1)+" %"],["− 床层内部 / 壁损 / 未放出",g(wf.bed_internal_MJ)+" MJ · "+wf.pct.bed_internal.toFixed(1)+" %"],["− 换热器·放 E_D",g(wf.HX_discharge_destroyed_MJ)+" MJ · "+wf.pct.HX_discharge.toFixed(1)+" %"],["= 交付 E_del",g(wf.delivered_MJ)+" MJ · "+wf.pct.delivered.toFixed(1)+" %"],["η_rt = E_del / E_src",pct(wf.eta_rt)]] : [];
  $("#dBody").innerHTML=`
    <div class="sec"><h4>配对</h4>${kv([["数据批次",datasetLabel(cycleDataset(c))],["方式",(LINK_CN[c.link]||c.link)+(c.needs_confirmation?"（待人工确认）":"")],["充热",`<a href="#library/${encodeURIComponent(c.charge_stage)}">${c.charge_case}</a>`],["放热",`<a href="#library/${encodeURIComponent(c.discharge_stage)}">${c.discharge_case}</a>`],["数据状态",`充 ${c.charge_status||"—"} / 放 ${c.discharge_status||"—"}`],["续算",ds.c.restart_from_step?`放热从第 ${ds.c.restart_from_step} 步续算，充热末步 ${cs.c.last_step}`:null]])}<div class="note">阶段曲线按相对时间拼接；当前配对信息不代替 checkpoint、case/data 的连续性核验。</div></div>
    <div class="sec"><h4>能量</h4>${kv([["充热 空气侧吸热 / 壁损",g(M.E_bed_air_charge_MJ)+" / "+g(M.E_wall_charge_MJ)+" MJ"],["净储能 E_net",g(M.E_net_stored_MJ)+" MJ"],["峰值放热 E_rel,peak",g(M.E_rel_peak_MJ)+" MJ @ "+g(M.t_peak_min)+" min"],["可回收比例 E_rel,peak / E_net",pct(M.recoverable_fraction)],["闭合度 (E_rel,peak + 壁损_放) / E_net",pct(M.closure_peak_plus_wall_over_net)],["床层均温 充末 → 放始",g(M.T_bed_end_charge_C)+" → "+g(M.T_bed_start_discharge_C)+" °C"],["时长 充 / 放",g(M.charge_duration_min)+" / "+g(M.discharge_duration_min)+" min"],["t₁₉₀（充）/ t₉₀（放）",g(M.t190_min)+" / "+g(M.t90_dis_min)+" min"],["T₂,out 放热最高",g(M.T2out_max_C)+" °C"]])}</div>
    <div class="sec"><h4>㶲瀑布（全充热程 → 放热峰值）</h4>${wfBar(M.waterfall_full)}${WF_LEGEND}${kv(wfRows("全充热程",M.waterfall_full))}<p class="dim" style="margin-top:6px">η_b 全程充 ${pct(M.eta_b_charge_full??cs.st.metrics.eta_b_full)||"—"} · η_b 放 ${pct(M.eta_b_dis)||"—"}；使用实际充热全程的热源㶲作为往返效率分母。</p>${M.waterfall_240?`<p class="dim" style="margin-top:8px">历史 240 min 分母口径：${pct(M.waterfall_240.eta_rt)}。若充热超过 240 min，此比值仅供旧论文对照，不能代表完整周期效率。</p>`:""}</div>
    <div class="sec"><h4>曲线</h4>${legend([{color:"#B97708",label:"床层入口"},{color:"#E3A83A",label:"床层出口"},...(d.T2in?[{color:"#1264FF",label:"T₂,in"},{color:"#7FA3FF",label:"T₂,out"}]:[])])}${temps}${ee}</div>`;
  $("#dActions").innerHTML=`<button class="primary" id="actPlay">连续回放</button><button id="actCopy">复制 cycle_id</button>`; $("#dActions").classList.add("on");
  $("#actPlay").onclick=()=>{ loadCycle(cid,{keepInfo:true}); go("demo"); };
  $("#actCopy").onclick=()=>{ navigator.clipboard&&navigator.clipboard.writeText(c.cycle_id); $("#actCopy").textContent="已复制"; setTimeout(()=>$("#actCopy").textContent="复制 cycle_id",1200); };
}
/* ---------------------------------------------------------------- 对比：选择 */
function toggleSel(id,on){ if(on) state.cmpSel.add(id); else state.cmpSel.delete(id); $("#selbar").classList.toggle("on",state.cmpSel.size>0); updateSelbar(); }
function updateSelbar(){ const ids=Array.from(state.cmpSel); const ms=ids.map(id=>STAGE_BY_ID[id]).filter(Boolean);
  const a=ms.length>=2?admit(ms.map(memberOf)):null;
  $("#selInfo").innerHTML=`已选 <b>${ms.length}</b> 个阶段${ms.length?"：":""}${ms.map(s=>`<span class="tag">${stageLabel(s)}</span>`).join("")}${a?(a.ok?` <span class="verdict good">可对比 · ${TYPE_CN[a.type]}</span>`:` <span class="verdict reject">不可对比 · ${a.reason}</span>`):(ms.length<2?' <span class="dim">再选至少一个</span>':"")}`;
  $("#selCompare").disabled=!(a&&a.ok); }
$("#selClear").onclick=()=>{ state.cmpSel.clear(); renderLibrary(); };
$("#selCompare").onclick=()=>{ const ms=Array.from(state.cmpSel).map(id=>STAGE_BY_ID[id]).filter(Boolean); const c=buildAdhoc(ms); if(!c) return; state.adhoc=c; state.libTab="compare"; state.libSel="adhoc"; go("library","cmp/adhoc"); };

/* ---------------------------------------------------------------- 对比：准入与即时计算（新批次完整采样，历史曲线可能降采样） */
function memberOf(s){ const p=s.c.params||{}, M=s.st.metrics; const t2=(s.st.series.t2in_C||[]).find(v=>v!=null) ?? p.T2in_C;
  return { stage_id:s.id, case_id:s.c.case_id, dataset:datasetId(s.c), open_loop:isOpen(s), index:s.st.index||0, mode:s.mode, run_datetime:s.c.run_datetime, project:s.c.project, dt_s:s.c.dt_s, restart_from_step:s.c.restart_from_step, t_start_s:M.t_start_s, legacy:!!s.c.legacy,
    UA_W_K:p.UA_W_K??null, mdot2_kg_h:p.mdot2_kg_h??null, mdot1_kg_h:p.mdot1_kg_h||40, T2in_C:t2==null?null:Math.round(t2), Cr:p.Cr, NTU:p.NTU, eps_theory:p.eps_theory,
    data_status:M.data_status, reliable:/^(参数吻合|不可辨识)/.test(M.data_status||""), metrics:M, _s:s }; }
function admit(ms){
  if(ms.length<2) return {ok:false,reason:"至少需要两个阶段"};
  if(new Set(ms.map(m=>m.dataset)).size>1) return {ok:false,reason:"请在同一数据批次内对比，历史数据与重测数据分别统计"};
  if(ms.some(m=>m.open_loop||m.mode==="open")) return {ok:false,reason:"开环阶段无 UA / ṁ₂，使用同批次开环基准参考线"};
  const modes=new Set(ms.map(m=>m.mode)); if(modes.size>1) return {ok:false,reason:"模式不同（"+Array.from(modes).map(m=>MODE_CN[m]).join(" / ")+"）"};
  const t2=new Set(ms.map(m=>m.T2in_C)); if(t2.size>1) return {ok:false,reason:"T₂,in 不同（"+Array.from(t2).map(g).join(" / ")+" °C）"};
  const m1=new Set(ms.map(m=>m.mdot1_kg_h)); if(m1.size>1) return {ok:false,reason:"一次侧 ṁ₁ 不同"};
  const ua=new Set(ms.map(m=>m.UA_W_K)), m2=new Set(ms.map(m=>m.mdot2_kg_h)); if(ua.has(null)||m2.has(null)) return {ok:false,reason:"有成员缺少 UA 或 ṁ₂"};
  const U=Array.from(ua).sort((a,b)=>a-b), M2=Array.from(m2).sort((a,b)=>a-b), T=Array.from(t2)[0];
  if(ua.size===1&&m2.size===1) return {ok:true,type:"replicate",varying:null,reason:`全部参数相同：UA ${g(U[0])} W/K · ṁ₂ ${g(M2[0])} kg/h · T₂,in ${g(T)} °C`};
  if(ua.size===1) return {ok:true,type:"param_ua",varying:"mdot2_kg_h",reason:`UA 相同（${g(U[0])} W/K），ṁ₂ 变化：${M2.map(g).join(" / ")} kg/h`};
  if(m2.size===1) return {ok:true,type:"param_m2",varying:"UA_W_K",reason:`ṁ₂ 相同（${g(M2[0])} kg/h），UA 变化：${U.map(g).join(" / ")} W/K`};
  return {ok:false,reason:"UA 与 ṁ₂ 同时不同，不满足准入（需全部相同，或仅其中一个不同）"};
}
function interp(x,y,q){ // x ascending, y may contain null
  const xs=[],ys=[]; for(let i=0;i<x.length;i++){ if(x[i]!=null&&y[i]!=null){xs.push(x[i]);ys.push(y[i]);} } if(xs.length<2) return q.map(()=>null);
  return q.map(v=>{ if(v<xs[0]||v>xs[xs.length-1]) return null; let lo=0,hi=xs.length-1; while(hi-lo>1){const m=(lo+hi)>>1; if(xs[m]<=v) lo=m; else hi=m;} const f=(v-xs[lo])/((xs[hi]-xs[lo])||1); return ys[lo]+(ys[hi]-ys[lo])*f; }); }
function stat(d){ const v=d.filter(x=>x!=null); if(!v.length) return null; let mx=0,imx=0,s2=0,sa=0,sb=0; v.forEach((x,i)=>{ if(Math.abs(x)>mx){mx=Math.abs(x);imx=i;} s2+=x*x; sa+=Math.abs(x); sb+=x; }); return {rmse:Math.sqrt(s2/v.length),mae:sa/v.length,max_abs:mx,imx,bias:sb/v.length,n:v.length}; }
function buildAdhoc(stages){
  const ms=stages.map(memberOf); const a=admit(ms); if(!a.ok){ alert("不能对比："+a.reason); return null; }
  const c={cmp_id:"adhoc",dataset:ms[0].dataset,type:a.type,type_cn:TYPE_CN[a.type],admission:a.reason,mode:ms[0].mode,T2in_C:ms[0].T2in_C,adhoc:true,created_at:new Date().toISOString().slice(0,16).replace("T"," "),
    members:ms.map(m=>({stage_id:m.stage_id,case_id:m.case_id,run_datetime:m.run_datetime,project:m.project,dt_s:m.dt_s,UA_W_K:m.UA_W_K,mdot2_kg_h:m.mdot2_kg_h,T2in_C:m.T2in_C,data_status:m.data_status,reliable:m.reliable,legacy:m.legacy}))};
  if(a.type==="replicate"){
    const sorted=ms.slice().sort((x,y)=>(x.run_datetime||"").localeCompare(y.run_datetime||"")); const ref=sorted[0];
    const physical=ms.every(m=>m.index===0&&!m.restart_from_step); const sign=ms[0].mode==="discharge"?-1:1;
    const T=m=>physical?physicalTimes(m._s):m._s.st.series.tau_min;
    const t0=Math.max(...ms.map(m=>T(m)[0])), t1=Math.min(...ms.map(m=>{const t=T(m); return t[t.length-1];})); const N=200; const grid=Array.from({length:N},(_,i)=>t0+(t1-t0)*i/(N-1));
    const VARS=[["bed_out_C","床层出口温度","K"],["bed_in_C","床层入口温度","K"],["t2out_C","T₂,out","K"],["q_bed_W","Q_bed","W"],["e_bed_MJ","E_bed 累计","MJ"]];
    const R={}; VARS.forEach(([v])=>{ if(ref._s.st.series[v]) R[v]=interp(T(ref),ref._s.st.series[v],grid); });
    const Eend=m=>{ const e=interp(T(m),m._s.st.series.e_bed_MJ,[t1])[0]; return e==null?null:e*sign; }; const eref=Eend(ref);
    const ek=ms[0].mode==="charge"?"eta_b_240":"eta_b_dis";
    const keys=ms[0].mode==="charge"?[["t190_bed_out_min","min"],["E_bed_240_MJ","MJ"],["eta_b_240",""],["UA_eff_median_W_K","W/K"],["eps_actual_median",""]]:[["E_rel_peak_MJ","MJ"],["t_peak_min","min"],["t90_min","min"],["eta_b_dis",""],["T2out_max_C","°C"],["UA_eff_median_W_K","W/K"]];
    const rows=sorted.map(m=>{ const row={stage_id:m.stage_id,is_ref:m===ref,series:{},metrics:{}}; const S=m._s.st.series, tm=T(m);
      VARS.forEach(([v,cn,unit])=>{ if(!S[v]||!R[v]) return; const y=interp(tm,S[v],grid); const d=y.map((val,i)=>(val==null||R[v][i]==null)?null:val-R[v][i]); const st=stat(d); if(!st) return; row.series[v]={name:cn,unit,rmse:st.rmse,mae:st.mae,max_abs:st.max_abs,t_max_abs_min:grid[st.imx],bias:st.bias}; });
      const e=Eend(m); row.E_at_common_end_MJ=e; row.metrics.E_at_common_end_MJ={value:e,ref:eref,delta:(e!=null&&eref!=null)?e-eref:null,rel_pct:(e!=null&&eref)?100*(e-eref)/eref:null};
      keys.forEach(([k,unit])=>{ const x=m.metrics[k], y=ref.metrics[k]; row.metrics[k]={value:x,ref:y,unit,delta:(x!=null&&y!=null)?x-y:null,rel_pct:(x!=null&&y)?100*(x-y)/y:null}; });
      row.identical_to_ref=!row.is_ref&&Object.keys(row.series).length>0&&Object.values(row.series).every(v=>v.max_abs<1e-9); return row; });
    const others=rows.filter(r=>!r.is_ref); const mxT=Math.max(0,...others.map(r=>(r.series.bed_out_C||{}).max_abs||0)), mxE=Math.max(0,...others.map(r=>Math.abs(r.metrics[ek].delta||0))), mxQ=Math.max(0,...others.map(r=>Math.abs(r.metrics.E_at_common_end_MJ.rel_pct||0)));
    const [verdict,level]= (mxT<=2&&mxE<=0.01&&mxQ<=3)?["重复性良好","good"]:(mxT<=5&&mxE<=0.03&&mxQ<=10)?["小幅差异","minor"]:["显著差异","major"];
    const notes=[]; const same=rows.filter(r=>r.identical_to_ref); if(same.length) notes.push("与基准在公共时长内逐点完全相同（很可能是同一运行的不同截取 / 续存副本）："+same.map(r=>r.stage_id.slice(0,22)).join("、"));
    if(new Set(ms.map(m=>m.dt_s)).size>1) notes.push("时间步长不同（"+ms.map(m=>g(m.dt_s)).join(" / ")+" s）：差异含时间离散误差"); if(new Set(ms.map(m=>m.data_status)).size>1) notes.push("数据状态不同："+ms.map(m=>m.data_status).join(" / ")); if(ms.some(m=>m.restart_from_step)) notes.push("含续算运行，起点前 3 步已跳过");
    c.error={ref:ref.stage_id,time_base:physical?"physical":"stage_relative",common_start_min:t0,common_end_min:t1,grid_step_min:(t1-t0)/(N-1),rows,verdict,level,criteria:{max_abs_dT_out_K:mxT,max_abs_d_eta_b:mxE,max_abs_dE_rel_pct:mxQ},thresholds:{good:"ΔT_out ≤ 2 K · Δη_b ≤ 1 pt · ΔE ≤ 3 %",minor:"≤ 5 K · ≤ 3 pt · ≤ 10 %"},notes};
  } else {
    const v=a.varying; const sorted=ms.slice().sort((x,y)=>x[v]-y[v]); const ek=ms[0].mode==="charge"?"eta_b_240":"eta_b_dis";
    const rows=sorted.map(m=>({stage_id:m.stage_id,x:m[v],UA_W_K:m.UA_W_K,mdot2_kg_h:m.mdot2_kg_h,Cr:m.Cr,NTU:m.NTU,eps_theory:m.eps_theory,eta_b:m.metrics[ek],reliable:m.reliable,data_status:m.data_status,detail:m.metrics}));
    const rel=rows.filter(r=>r.reliable&&r.eta_b!=null); let trend=null; const xn={UA_W_K:"UA",mdot2_kg_h:"ṁ₂"}[v];
    if(rel.length>=2){ const d=rel.slice(1).map((r,i)=>r.eta_b-rel[i].eta_b); const p=x=>(100*x).toFixed(1);
      if(d.every(x=>x>0)) trend=`η_b 随 ${xn} 单调上升（${p(rel[0].eta_b)} → ${p(rel[rel.length-1].eta_b)} %）`; else if(d.every(x=>x<0)) trend=`η_b 随 ${xn} 单调下降（${p(rel[0].eta_b)} → ${p(rel[rel.length-1].eta_b)} %）`; else { let i=0; rel.forEach((r,k)=>{ if(r.eta_b>rel[i].eta_b) i=k; }); trend=`η_b 非单调，最高在 ${xn} = ${g(rel[i].x)}（${p(rel[i].eta_b)} %）`; }
      trend+=`；可靠成员间极差 ${(100*(Math.max(...rel.map(r=>r.eta_b))-Math.min(...rel.map(r=>r.eta_b)))).toFixed(1)} pt`; }
    let ro=null; if(ms[0].mode==="charge"){ const o=STAGES.find(s=>s.mode==="open"&&datasetId(s.c)===ms[0].dataset&&Math.abs((s.st.metrics.bed_in_start_C||0)-(ms[0].T2in_C||200))<10); if(o) ro={stage_id:o.id,case_id:o.c.case_id,eta_b_240:o.st.metrics.eta_b_240,t190_bed_out_min:o.st.metrics.t190_bed_out_min,E_bed_240_MJ:o.st.metrics.E_bed_240_MJ}; }
    c.eta={varying:v,eta_key:ek,rows,trend,excluded_from_trend:rows.filter(r=>!r.reliable).map(r=>r.stage_id),reference_open:ro};
  }
  return c;
}

/* ---------------------------------------------------------------- 对比：列表与详情 */
function cmpSummary(c){ if(c.type==="replicate"){ const e=c.error; return `<span class="verdict ${e.level}">${e.verdict}</span> <span class="mono dim">ΔT_out ${g(e.criteria.max_abs_dT_out_K)} K · Δη_b ${(100*(e.criteria.max_abs_d_eta_b||0)).toFixed(2)} pt · ΔE ${g(e.criteria.max_abs_dE_rel_pct)} %</span>`; } return `<span class="dim">${c.eta.trend||"可靠成员不足，无趋势"}</span>`; }
function renderComparisons(){
  const list=$("#liblist"), saved=scopedComparisons(), adhoc=state.adhoc&&inDataset(cmpDataset(state.adhoc))?state.adhoc:null; const all=(adhoc?[adhoc]:[]).concat(saved); $("#libCount").textContent=`${saved.length} 个已保存对比${adhoc?" + 1 个即时":""} · 生成 ${LIB.generated_at||"—"}`;
  if(!all.length){ list.innerHTML=datasetSummary()+`<div class="empty">当前批次暂无对比。在「阶段」标签勾选同一批次的 2 个以上闭环阶段后，可即时比较单一参数的影响。</div>`; return; }
  const groups=[["replicate","重复性 / 误差分析"],["param_m2","同 ṁ₂ · UA 变化 → η_b"],["param_ua","同 UA · ṁ₂ 变化 → η_b"]]; let html=datasetSummary();
  if(adhoc){ html+=`<section class="daygroup"><h3>即时对比（未保存）</h3>${cmpRow(adhoc,0)}</section>`; }
  groups.forEach(([t,cn])=>{ const rows=saved.filter(c=>c.type===t); if(!rows.length) return; html+=`<section class="daygroup"><h3>${cn} <span class="k" style="font-family:var(--mono);font-size:10px;color:var(--muted)">${rows.length}</span></h3>`; rows.forEach((c,i)=>{ html+=cmpRow(c,i+1); }); html+=`</section>`; });
  html+=`<p class="dim" style="margin-top:10px;font-size:12px">准入规则：只允许 ① 全部参数相同（重复性 / 误差分析）② 仅 UA 或仅 ṁ₂ 不同（η_b 对比）。η_b 趋势只统计状态为「参数吻合 / 不可辨识」的可靠成员。</p>`;
  list.innerHTML=html;
  list.querySelectorAll(".cmp-row").forEach(r=>{ r.onclick=()=>{ const id=r.dataset.id; state.libSel=id; go("library","cmp/"+encodeURIComponent(id)); }; });
}
function cmpRow(c,i){ const mem=c.members.map(m=>{ const s=STAGE_BY_ID[m.stage_id]; return s?`<span class="tag">${stageLabel(s).replace(/^\w+ · /,"")}<small style="color:var(--muted)"> · ${(m.run_datetime||"").slice(5,10)}</small></span>`:""; }).join("");
  return `<div class="cmp-row ${state.libSel===c.cmp_id?"sel":""}" data-id="${c.cmp_id}"><div class="idx">${c.adhoc?"★":String(i).padStart(2,"0")}</div><div><span class="type-badge ${c.type}">${c.type_cn}</span></div><div class="par">${c.admission}<div class="tagline" style="margin-top:4px">${mem}</div></div><div>${cmpSummary(c)}</div><div class="acts"><button data-act="detail">详情</button></div></div>`; }
function svgBars(rows,o){
  const W=o.width||356,H=o.height||176,ml=40,mr=10,mt=28,mb=30; const iw=W-ml-mr, ih=H-mt-mb; const n=rows.length; const bw=Math.min(46,iw/n*0.6); const ymin=o.ymin??0, ymax=o.ymax??1;
  const Y=v=>mt+ih-(v-ymin)/(ymax-ymin)*ih, X=i=>ml+iw*(i+0.5)/n;
  let svg=`<svg class="svgchart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><text class="ttl" x="${ml}" y="12">${o.title||""}</text>`;
  [0,0.25,0.5,0.75,1].forEach(f=>{ const v=ymin+(ymax-ymin)*f; svg+=`<line class="grid" x1="${ml}" x2="${W-mr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${ml-4}" y="${Y(v)+3}" text-anchor="end">${Math.round(100*v)}</text>`; });
  if(o.refLine!=null){ svg+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(o.refLine)}" y2="${Y(o.refLine)}" stroke="#8490A3" stroke-width="1.2" stroke-dasharray="4 3"/><text x="${W-mr}" y="${Y(o.refLine)-3}" text-anchor="end" style="fill:var(--text2)">${o.refLabel||""}</text>`; }
  rows.forEach((r,i)=>{ const v=r.eta_b; if(v==null){ svg+=`<text x="${X(i)}" y="${Y(ymin)-4}" text-anchor="middle">—</text>`; } else { svg+=`<rect x="${X(i)-bw/2}" y="${Y(Math.max(ymin,v))}" width="${bw}" height="${Math.max(0,Y(ymin)-Y(Math.max(ymin,v)))}" rx="3" fill="${r.reliable?"#1264FF":"#c8d3e6"}"/><text x="${X(i)}" y="${Y(Math.max(ymin,v))-4}" text-anchor="middle" style="fill:var(--ink)">${(100*v).toFixed(1)}</text>`; }
    svg+=`<text x="${X(i)}" y="${H-16}" text-anchor="middle" style="fill:var(--ink)">${g(r.x)}</text>`; });
  svg+=`<line class="ax" x1="${ml}" x2="${W-mr}" y1="${mt+ih}" y2="${mt+ih}"/><text x="${W-mr}" y="${H-4}" text-anchor="end" style="fill:var(--text2)">${o.xlabel||""}</text>`;
  return svg+"</svg>";
}
function showCompareDetail(c){
  const ms=c.members.map((m,i)=>({m,s:STAGE_BY_ID[m.stage_id],color:PALETTE[i%PALETTE.length]})); const kv=(pairs)=>`<div class="kv dense">${pairs.filter(([k,v])=>v!=null&&v!=="").map(([k,v])=>`<div>${k}</div><div>${v}</div>`).join("")}</div>`;
  const pct=v=>v==null?"—":(100*v).toFixed(1)+" %"; const sgn=(v,nd=2)=>v==null?"—":`<span class="${v<0?"dneg":v>0?"dpos":""}">${v>0?"+":""}${Number(v).toFixed(nd)}</span>`;
  $("#dEyebrow").textContent=`COMPARE / ${{replicate:"REPLICATE · 误差分析",param_ua:"PARAMETRIC · ṁ₂ 变化",param_m2:"PARAMETRIC · UA 变化"}[c.type]}${c.adhoc?" · 即时（未保存）":""}`; $("#dTitle").textContent=c.admission.replace(/^全部参数相同：/,"").replace(/^(UA|ṁ₂) 相同（/,"$1 = ").replace(/），/,"，"); $("#dEn").textContent=c.cmp_id+(c.created_at?" · "+c.created_at:"");
  const memTable=`<div class="tblwrap"><table class="mini"><tr><th></th><th>阶段</th><th>日期</th><th>Δt</th><th>状态</th></tr>${ms.map(({m,s,color})=>`<tr class="${m.reliable?"":"unrel"}"><td><i class="swatch" style="background:${color}"></i></td><td><a href="#library/${encodeURIComponent(m.stage_id)}">${m.case_id.slice(0,13)}</a> <span class="dim">${(m.case_id.split("_").slice(5).join("_")||"").slice(0,26)}</span></td><td>${(m.run_datetime||"").slice(0,10)}</td><td>${g(m.dt_s)} s</td><td><span class="status-badge ${statusClass(m.data_status)}"><span class="d"></span>${m.data_status||"—"}</span></td></tr>`).join("")}</table></div>`;
  let body=`<div class="sec"><h4>准入</h4><p><span class="type-badge ${c.type}">${c.type_cn}</span></p><p class="dim" style="margin-top:6px">${c.admission}</p></div><div class="sec"><h4>成员 ${ms.length}</h4>${memTable}</div>`;
  if(c.type==="replicate"){
    const e=c.error; const refM=ms.find(x=>x.m.stage_id===e.ref); const isDis=c.mode==="discharge"; const ek=isDis?"eta_b_dis":"eta_b_240";
    const others=e.rows.filter(r=>!r.is_ref);
    const tbl=`<table class="mini"><tr><th>vs 基准</th><th>ΔT_out max</th><th>RMSE</th><th>ΔT_in max</th><th>ΔT₂,out max</th><th>ΔE 末端</th><th>Δη_b</th><th>${isDis?"Δt_peak":"Δt₁₉₀"}</th></tr>${others.map(r=>{ const so=r.series.bed_out_C||{}, si=r.series.bed_in_C||{}, s2=r.series.t2out_C||{}; const x=ms.find(y=>y.m.stage_id===r.stage_id);
      return `<tr><td><i class="swatch" style="background:${x?x.color:"#999"}"></i>${(r.stage_id||"").slice(0,13)}${r.identical_to_ref?' <span class="tag">逐点相同</span>':""}</td><td>${g(so.max_abs)} K<br><span class="dim">@${g(so.t_max_abs_min)} min</span></td><td>${g(so.rmse)} K</td><td>${g(si.max_abs)} K</td><td>${s2.max_abs!=null?g(s2.max_abs)+" K":"—"}</td><td>${sgn(r.metrics.E_at_common_end_MJ.rel_pct)} %</td><td>${sgn(r.metrics[ek].delta==null?null:100*r.metrics[ek].delta)} pt</td><td>${sgn(r.metrics[isDis?"t_peak_min":"t190_bed_out_min"].delta,1)} min</td></tr>`; }).join("")}</table>`;
    // 曲线：床层出口叠加 + 相对基准的差值
    const physical=e.time_base==="physical"; const T=x=>physical?physicalTimes(x.s):x.s.st.series.tau_min;
    const over=svgLine(ms.map(x=>({x:T(x),y:x.s.st.series.bed_out_C,color:x.color,w:x.m.stage_id===e.ref?2:1.4,dash:x.m.stage_id!==e.ref&&false})),{title:"床层出口温度叠加 (°C)",xlabel:"min"});
    const grid=Array.from({length:160},(_,i)=>e.common_start_min+(e.common_end_min-e.common_start_min)*i/159); const R=refM?interp(T(refM),refM.s.st.series.bed_out_C,grid):null;
    const dser=R?ms.filter(x=>x.m.stage_id!==e.ref).map(x=>{ const y=interp(T(x),x.s.st.series.bed_out_C,grid); return {x:grid,y:y.map((v,i)=>(v==null||R[i]==null)?null:v-R[i]),color:x.color}; }):[];
    const dchart=dser.length?svgLine(dser.concat([{x:grid,y:grid.map(()=>0),color:"#8490A3",dash:true,w:1}]),{title:"床层出口温度差 ΔT_out = 成员 − 基准 (K)",xlabel:"min"}):"";
    body+=`<div class="sec"><h4>判定</h4><p><span class="verdict ${e.level}">${e.verdict}</span></p>${kv([["基准",refM?`<i class="swatch" style="background:${refM.color}"></i>${refM.s?stageLabel(refM.s).replace(/^\w+ · /,""):e.ref}（最早运行）`:e.ref],["公共时长",`${g(e.common_start_min)} → ${g(e.common_end_min)} min · 网格 ${g(e.grid_step_min)} min · ${physical?"物理时间对齐":"阶段相对时间"}`],["最大 |ΔT_out|",g(e.criteria.max_abs_dT_out_K)+" K"],["最大 |Δη_b|",(100*(e.criteria.max_abs_d_eta_b||0)).toFixed(2)+" pt"],["最大 |ΔE| 公共末端",g(e.criteria.max_abs_dE_rel_pct)+" %"],["阈值",`良好：${e.thresholds.good}；小幅：${e.thresholds.minor}`]])}${e.notes.length?`<div class="note" style="margin-top:8px">${e.notes.join("<br>")}</div>`:""}</div>
      <div class="sec"><h4>误差统计（相对基准）</h4><div class="tblwrap">${tbl}</div><p class="dim" style="margin-top:6px">ΔE 末端 = 两者在公共末端时刻的累计能量相对差；Δη_b 用各自窗口（充热 0–240 min / 放热到峰值）。</p></div>
      <div class="sec"><h4>曲线</h4>${over}${dchart}</div>`;
  } else {
    const r=c.eta; const xn={UA_W_K:"UA (W/K)",mdot2_kg_h:"ṁ₂ (kg/h)"}[r.varying]; const isDis=c.mode==="discharge";
    const vals=r.rows.map(x=>x.eta_b).filter(v=>v!=null); const ymin=Math.max(0,Math.floor((Math.min(...vals,(r.reference_open?r.reference_open.eta_b_240:1))-0.1)*10)/10);
    const bars=svgBars(r.rows,{title:(isDis?"η_b,dis":"η_b 0–240 min")+" (%)",xlabel:xn,ymin,ymax:1,refLine:r.reference_open?r.reference_open.eta_b_240:null,refLabel:r.reference_open?"开环 "+(100*r.reference_open.eta_b_240).toFixed(1)+" %":""});
    const tbl=isDis?`<table class="mini"><tr><th>${xn}</th><th>η_b,dis</th><th>E_rel / E_del</th><th>峰值放热</th><th>t₉₀</th><th>T₂,out max</th><th>UA_eff</th></tr>${r.rows.map(x=>{ const d=x.detail||{}; return `<tr class="${x.reliable?"":"unrel"}"><td>${g(x.x)}</td><td><b>${pct(x.eta_b)}</b></td><td>${g(d.Ex_rel_MJ)} / ${g(d.Ex_del_MJ)} MJ</td><td>${g(d.E_rel_peak_MJ)} MJ @ ${g(d.t_peak_min)}</td><td>${g(d.t90_min)} min</td><td>${g(d.T2out_max_C)} °C</td><td>${g(d.UA_eff_median_W_K)}</td></tr>`; }).join("")}</table>`
      :`<table class="mini"><tr><th>${xn}</th><th>η_b</th><th>E_src / E_gain / E_D</th><th>t₁₉₀</th><th>E₂₄₀</th><th>C_r / NTU / ε</th><th>UA_eff</th></tr>${r.rows.map(x=>{ const d=x.detail||{}; return `<tr class="${x.reliable?"":"unrel"}"><td>${g(x.x)}</td><td><b>${pct(x.eta_b)}</b></td><td>${g(d.Ex_src_240_MJ)} / ${g(d.Ex_gain_240_MJ)} / ${g(d.Ex_D_HX_240_MJ)}</td><td>${d.t190_bed_out_min!=null?g(d.t190_bed_out_min)+" min":"未到"}</td><td>${g(d.E_bed_240_MJ)} MJ</td><td>${g(x.Cr)} / ${g(x.NTU)} / ${g(x.eps_theory)}</td><td>${g(d.UA_eff_median_W_K)}</td></tr>`; }).join("")}</table>`;
    body+=`<div class="sec"><h4>η_b 对比</h4>${bars}<p style="margin-top:6px"><b>${r.trend||"可靠成员不足，无趋势"}</b></p>${r.excluded_from_trend.length?`<p class="dim" style="margin-top:4px">灰色柱不计入趋势（状态非「参数吻合 / 不可辨识」）：${r.excluded_from_trend.map(id=>id.slice(0,13)).join("、")}</p>`:""}${r.reference_open?`<p class="dim" style="margin-top:4px">虚线为开环基准 <a href="#library/${encodeURIComponent(r.reference_open.stage_id)}">${r.reference_open.case_id.slice(0,13)}</a>：η_b ${pct(r.reference_open.eta_b_240)}，t₁₉₀ ${g(r.reference_open.t190_bed_out_min)} min。</p>`:""}</div>
      <div class="sec"><h4>成员指标</h4><div class="tblwrap">${tbl}</div></div>
      <div class="sec"><h4>如何读</h4><p class="dim">η_b = E_gain / E_src（充热，至240 min）或 E_del / E_rel（放热，到峰值）；仅描述相应边界的㶲变化，未扣辅机耗功，也不代表PCM储㶲效率。观测差异需结合初始场、时间窗口、阶段终点与UDF诊断状态解释。</p></div>`;
    if(c.alternates&&Object.keys(c.alternates).length){ body+=`<div class="sec"><h4>同参数的其他运行（未选为代表）</h4><p class="dim">${Object.entries(c.alternates).map(([k,v])=>`${k.slice(0,13)} ← ${v.map(x=>x.slice(0,13)).join("、")}`).join("<br>")}</p></div>`; }
  }
  if(c.adhoc){ const ids=c.members.map(m=>m.stage_id); body+=`<div class="sec"><h4>保存为正式对比</h4><p class="dim">${samplingNote}即时比较使用网页已载入的数据；运行下面命令可基于原报告计算并保存，再执行 <code>export-web</code>：</p><div class="cli">python3 pbtes.py compare ${ids.map(x=>'"'+x+'"').join(" ")}</div></div>`; }
  if(c.dataset==="retest-2026-10") body=`<div class="sec"><a class="btn primary" href="#research/${encodeURIComponent(c.cmp_id)}">完整指标比较 · 温度 / 功率 / 热量 / 交付 / 㶲</a><p class="dim">按共同时间窗口计算，保留诊断和缺失状态。</p></div>`+body;
  $("#dBody").innerHTML=body;
  $("#dActions").innerHTML=`<button class="primary" id="actPlayFirst">回放第一个成员</button><button id="actCopy">复制 ${c.adhoc?"命令":"cmp_id"}</button>`; $("#dActions").classList.add("on");
  $("#actPlayFirst").onclick=()=>{ loadStage(c.members[0].stage_id,{keepInfo:true}); go("demo"); };
  $("#actCopy").onclick=()=>{ const txt=c.adhoc?`python3 pbtes.py compare ${c.members.map(m=>'"'+m.stage_id+'"').join(" ")}`:c.cmp_id; navigator.clipboard&&navigator.clipboard.writeText(txt); $("#actCopy").textContent="已复制"; setTimeout(()=>$("#actCopy").textContent="复制 "+(c.adhoc?"命令":"cmp_id"),1200); };
}
function showLibraryHome(){
  const stages=scopedStages();
  $("#dEyebrow").textContent="LIBRARY / 数据库"; $("#dTitle").textContent=state.libTab==="cycles"?"选择一个配对查看详情":state.libTab==="compare"?"选择一个对比查看详情":"选择一个阶段查看详情"; $("#dEn").textContent=`${state.filters.dataset?datasetLabel(state.filters.dataset):"全部批次"} · ${stages.length} stages · ${scopedCycles().length} cycles · ${scopedComparisons().length} comparisons`;
  const byStatus={}; stages.forEach(s=>{ const k=s.st.metrics.data_status||"—"; byStatus[k]=(byStatus[k]||0)+1; });
  $("#dBody").innerHTML=`<div class="sec"><h4>当前批次</h4><p>${esc(state.filters.dataset?datasetLabel(state.filters.dataset):"全部批次")}</p><p class="dim">可切换「数据集」查看原有历史数据。各批次单独生成对比，充放热阶段的记录状态与计算完成状态分别标注。</p></div><div class="sec"><h4>数据状态分布</h4><div class="kv">${Object.entries(byStatus).map(([k,v])=>`<div><span class="status-badge ${statusClass(k)}"><span class="d"></span>${esc(k)}</span></div><div>${v}</div>`).join("")}</div></div>
    <div class="sec"><h4>状态含义</h4><ul class="list"><li><b>参数吻合</b>：UA_eff / 输入 UA 在 0.8–1.25 之间，仅表示所列边界反推检查符合阈值。</li><li><b>有效 UA 偏低</b>：需结合实际边界、加载 UDF 和数值状态核查；历史数值分支见对应记录。</li><li><b>不可辨识（ε≈1）</b>：边界温差过小等情况使 UA 反推病态；不表示全阶段实际 ε 等于 1，也不直接证明 UDF 失效。输入参数仍需投算源码、加载库与 HX 诊断核验。</li><li><b>开环基准</b>：入口恒温、出口直排。</li></ul></div>
    <div class="sec"><h4>口径</h4><p class="dim">W = ṁ·c_p，c_p = 1007 J/(kg·K)，T₀ = 298.15 K。历史分析保留原指标；重测研究比较采用共同记录窗口，并分别显示放热累计峰值和终值，不补未记录的初始区间。胶囊内部温度来自 point-t1-s，测点均值不等同于全域体积平均温度。新批次日期按文件 mtime 归档；${samplingNote}报告记录不单独证明相变完成或周期连续性。</p></div>`;
  $("#dActions").innerHTML=""; $("#dActions").classList.remove("on");
}

/* ---------------------------------------------------------------- SVG 图 */
function svgLine(series, o){
  const W=o.width||356, H=o.height||150, ml=40, mr=10, mt=20, mb=24; const iw=W-ml-mr, ih=H-mt-mb;
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  series=series.filter(s=>Array.isArray(s.x)&&Array.isArray(s.y));
  series.forEach(s=>s.x.forEach((x,i)=>{ const y=s.y[i]; if(y==null||x==null||!Number.isFinite(x)||!Number.isFinite(y)) return; xmin=Math.min(xmin,x); xmax=Math.max(xmax,x); ymin=Math.min(ymin,y); ymax=Math.max(ymax,y); }));
  if(!(xmax>xmin)) return "";
  if(o.ymin!=null) ymin=Math.min(ymin,o.ymin); if(ymax-ymin<1e-9){ ymax=ymin+1; } const pad=(ymax-ymin)*0.06; ymin-=pad; ymax+=pad;
  const X=x=>ml+(x-xmin)/(xmax-xmin)*iw, Y=y=>mt+ih-(y-ymin)/(ymax-ymin)*ih;
  const ticks=(a,b,n)=>{ const step=niceStep((b-a)/n); const out=[]; for(let v=Math.ceil(a/step)*step; v<=b+1e-9; v+=step) out.push(+v.toFixed(6)); return out; };
  let svg=`<svg class="svgchart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg+=`<text class="ttl" x="${ml}" y="12">${o.title||""}</text>`;
  ticks(ymin,ymax,4).forEach(v=>{ svg+=`<line class="grid" x1="${ml}" x2="${W-mr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${ml-4}" y="${Y(v)+3}" text-anchor="end">${g(v)}</text>`; });
  ticks(xmin,xmax,5).forEach(v=>{ svg+=`<text x="${X(v)}" y="${H-8}" text-anchor="middle">${g(v)}</text>`; });
  svg+=`<line class="ax" x1="${ml}" x2="${W-mr}" y1="${mt+ih}" y2="${mt+ih}"/><line class="ax" x1="${ml}" x2="${ml}" y1="${mt}" y2="${mt+ih}"/>`;
  svg+=`<text x="${W-mr}" y="${H-8}" text-anchor="end" style="fill:var(--text2)">${o.xlabel||""}</text>`;
  series.forEach(s=>{ let d="",pen=false; s.x.forEach((x,i)=>{ const y=s.y[i]; if(s.breaks&&s.breaks.has(i)) pen=false; if(y==null||x==null||!Number.isFinite(x)||!Number.isFinite(y)){pen=false;return;} d+=(pen?"L":"M")+X(x).toFixed(1)+" "+Y(y).toFixed(1); pen=true; }); svg+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.w||1.6}" ${s.dash?'stroke-dasharray="4 3"':""}/>`; });
  return svg+"</svg>";
}
function niceStep(raw){ const p=Math.pow(10,Math.floor(Math.log10(raw))); const r=raw/p; return (r<1.5?1:r<3?2:r<7?5:10)*p; }
function legend(items){ return `<div class="chart-legend">${items.map(i=>`<span><i style="background:${i.color}"></i>${i.label}</span>`).join("")}</div>`; }
function pcmChartSection(s){
  const S=s.st.series, probes=Array.from({length:12},(_,i)=>"pcm_probe_"+String(i+1).padStart(2,"0")+"_C").filter(k=>hasValues(S[k]));
  if(!hasValues(S.pcm_mean_C)&&!probes.length) return `<div class="sec"><h4>胶囊内部温度</h4><p class="dim">此阶段没有可读取的胶囊内部测点记录，不能用床层出口温度代替。</p></div>`;
  return `<div class="sec"><h4>胶囊内部温度</h4><label class="chart-control" for="pcmMetric">显示<select id="pcmMetric">${hasValues(S.pcm_mean_C)?'<option value="summary">测点均值与最小 / 最大值</option>':""}${probes.length?'<option value="all">全部内部测点</option>':""}${probes.map(k=>`<option value="${k}">${esc(probeName(s,k))}</option>`).join("")}</select></label><div id="pcmChart"></div><p class="dim">point-t1-s 测点温度（°C）；均值与范围均基于现有测点，不代表全域温度或液相率。${timeAxisNote(s)}${samplingNote}</p></div>`;
}
function renderPcmChart(s){
  const el=$("#pcmMetric"), target=$("#pcmChart"); if(!el||!target) return; const R=researchStage(s), S=R?R.series:s.st.series, x=S.tau_min||[], breaks=new Set((R?.gaps||[]).map(g=>g.before_index));
  const series=el.value==="summary"?[["pcm_mean_C","测点均值","#1264FF",false],["pcm_min_C","测点最小值","#7FA3FF",true],["pcm_max_C","测点最大值","#B97708",true]]:el.value==="all"?Array.from({length:12},(_,i)=>{const k="pcm_probe_"+String(i+1).padStart(2,"0")+"_C";return [k,esc(probeName(s,k)),PALETTE[i%PALETTE.length],false];}):[[el.value,esc(probeName(s,el.value)),"#1264FF",false]];
  const available=series.filter(([k])=>hasValues(S[k])); target.innerHTML=legend(available.map(([k,label,color])=>({label,color})))+svgLine(available.map(([k,label,color,dash])=>({x,y:S[k],color,dash,breaks,w:k==="pcm_mean_C"?2:1.4})),{title:"胶囊内部温度 (°C)",xlabel:"min"});
  el.onchange=()=>renderPcmChart(s);
}

/* ---------------------------------------------------------------- 阶段详情 */
function showStageDetail(sid){
  const s=STAGE_BY_ID[sid]; if(!s) return; const c=s.c, M=s.st.metrics, p=c.params||{}, S=s.st.series, dc=c.data_check||{}, R=researchStage(s), RS=R?R.series:S, breaks=new Set((R?.gaps||[]).map(g=>g.before_index));
  renderLibrary();
  $("#dEyebrow").textContent=`CASE / ${phaseLabel(s)} · ${datasetLabel(datasetId(c))}`; $("#dTitle").textContent=stageLabel(s).replace(/^\w+ · /,"");
  $("#dEn").textContent=c.case_id;
  const kv=(pairs)=>`<div class="kv dense">${pairs.filter(([k,v])=>v!==undefined&&v!==null&&v!=="").map(([k,v])=>`<div>${k}</div><div>${v}</div>`).join("")}</div>`;
  const pct=v=>v==null?null:(100*v).toFixed(1)+" %";
  const diag=!isOpen(s)&&(p.solver_version||M.hx_diagnostics_present)?`<div class="sec"><h4>UDF 诊断检查</h4>${kv([["求解器版本",p.solver_version],["几何换算系数",p.geometry_factor],["检查状态 / 稳定样本数",(M.hx_diagnostics_status||"未检查")+" / "+(M.hx_diagnostics_stable_points??0)],["耦合误差最大值",M.hx_coupling_abs_max_K!=null?fmt(M.hx_coupling_abs_max_K,5)+" K":null],["实际入口与目标最大偏差",M.hx_boundary_target_abs_max_K!=null?fmt(M.hx_boundary_target_abs_max_K,5)+" K":null],["流量误差最大值",M.hx_mass_error_abs_max_pct!=null?fmt(M.hx_mass_error_abs_max_pct,3)+" %":null],["能量误差最大值（全段）",M.hx_energy_error_abs_max_pct!=null?fmt(M.hx_energy_error_abs_max_pct,3)+" %":null],["能量误差最大值（稳定段）",M.hx_energy_error_stable_abs_max_pct!=null?fmt(M.hx_energy_error_stable_abs_max_pct,3)+" %":null],["稳定段能量误差 > 0.5% 点数",M.hx_energy_bad_count],["回流比例最大值",M.hx_backflow_max_fraction!=null?fmt(100*M.hx_backflow_max_fraction,4)+" %":null]])}<p class="dim">阶段有效时间超过 8 min 后逐点检查：耦合误差 ≤ 0.05 K、流量与能量误差 ≤ 0.5%、回流比例 ≤ 0.1%；版本、闭环状态和有效标志须一致。统计基于原始采样；HX 检查通过不等于阶段完成或物理模型验收。</p></div>`:"";
  const temps=svgLine([{x:RS.tau_min,y:RS.bed_in_C,color:"#B97708",w:1.8,breaks},{x:RS.tau_min,y:RS.bed_out_C,color:"#E3A83A",breaks},...(hasValues(RS.t2in_C)?[{x:RS.tau_min,y:RS.t2in_C,color:"#1264FF",dash:true,breaks},{x:RS.tau_min,y:RS.t2out_C,color:"#7FA3FF",breaks}]:[])],{title:"四端温度 (°C)",xlabel:"min"});
  const power=R?RS.bed_power_W:(S.q_bed_W||[]).map(v=>v==null?null:(s.mode==="discharge"?-v:v));
  const energy=R?RS.bed_energy_MJ:(S.e_bed_MJ||[]).map(v=>v==null?null:(s.mode==="discharge"?-v:v));
  const qe=svgLine([{x:RS.tau_min,y:power.map(v=>v==null?null:v/1000),color:"#101827",breaks}],{title:(s.mode==="discharge"?"床层放热功率 (kW)":"床层吸热功率 Q_bed (kW)"),xlabel:"min",ymin:0});
  const ee=svgLine([{x:RS.tau_min,y:energy,color:"#1264FF",w:1.8,breaks},...(!R?[{x:S.tau_min,y:S.e_wall_MJ,color:"#8490A3",dash:true}]:[])],{title:(s.mode==="discharge"?"累计放热":"累计吸热")+(R?" · 有符号记录积分 (MJ)":" 与壁损估计 (MJ)"),xlabel:"min",ymin:0});
  const notes=qualityNotes(s), q=c.quality||{}, diagnostics=q.diagnostics||{};
  const quality=`<div class="sec"><h4>阶段记录与质量</h4>${kv([["批次",esc(datasetLabel(datasetId(c)))],["工况 / 阶段",esc(c.condition_id||c.case_id)+" / "+phaseLabel(s)],["记录状态",PHASE_STATUS[M.phase_status||q.status]||M.phase_status||q.status||"历史记录"],["UDF 来源",esc(q.udf_source_status||"未单独标注")],["诊断记录",esc(diagnostics.status||"")],["诊断文件",diagnostics.file?esc(diagnostics.file):null]])}${notes.length?`<div class="note"><ul class="list">${notes.map(n=>`<li>${esc(n)}</li>`).join("")}</ul></div>`:""}<p class="dim">有记录表示报告可读取；是否完成充放热、相变是否完成及充放热初始场衔接，仍需结合终点与 checkpoint 证据判断。</p></div>`;
  let metricRows;
  if(s.mode==="charge") metricRows=[["出口到 190 °C",M.t190_bed_out_min!=null?g(M.t190_bed_out_min)+" min":"未到"],["E_bed 0–240 min",g(M.E_bed_240_MJ)+" MJ"],["E_bed 全程（空气侧）",g(M.E_bed_air_full_MJ)+" MJ"],["壁损估计 / 净储能",g(M.E_wall_est_MJ)+" / "+g(M.E_bed_net_est_MJ)+" MJ"],["η_b 0–240 / 全程",(pct(M.eta_b_240)||"—")+" / "+(pct(M.eta_b_full)||"—")],["E_src / E_gain 0–240",M.Ex_src_240_MJ!=null?g(M.Ex_src_240_MJ)+" / "+g(M.Ex_gain_240_MJ)+" MJ":null]];
  else if(s.mode==="discharge") metricRows=[["峰值放热（时刻）",g(M.E_rel_peak_MJ)+" MJ @ "+g(M.t_peak_min)+" min"],["放出 50 % / 90 %",g(M.t50_min)+" / "+g(M.t90_min)+" min"],["出口到 100 / 80 / 65 °C",[M.t_bedout_below_100C_min,M.t_bedout_below_80C_min,M.t_bedout_below_65C_min].map(g).join(" / ")+" min"],["峰值前壁损",g(M.E_wall_to_peak_MJ)+" MJ"],["η_b,dis（到峰值）",pct(M.eta_b_dis)],["E_rel / E_del / E_D",M.Ex_rel_MJ!=null?[M.Ex_rel_MJ,M.Ex_del_MJ,M.Ex_D_HX_MJ].map(g).join(" / ")+" MJ":null],["T₂,out 最高 / 能量加权",M.T2out_max_C!=null?g(M.T2out_max_C)+" / "+g(M.T2out_energy_weighted_C)+" °C":null]];
  else metricRows=[["出口到 190 °C",g(M.t190_bed_out_min)+" min"],["E_bed 0–240 min",g(M.E_bed_240_MJ)+" MJ"],["入口流㶲 / 排烟㶲 0–240",g(M.Ex_src_240_MJ)+" / "+g(M.Ex_exhaust_240_MJ)+" MJ"],["η_b 0–240",pct(M.eta_b_240)]];
  if(R){
    const rm=R.metrics;
    metricRows=[["床层累计净换热（末值）",g(rm.bed_energy_end_MJ)+" MJ"],["床层累计净换热（峰值 / 时刻）",g(rm.bed_energy_peak_MJ)+" MJ / "+g(rm.bed_energy_peak_time_min)+" min"],["有效积分时间 / 平均功率",g(rm.bed_energy_covered_min)+" min / "+g(rm.bed_average_power_W)+" W"],["末端 PCM 测点均温 / 极差",g(rm.pcm_mean_C_end)+" °C / "+g(rm.pcm_spread_K_end)+" K"],["缺口 / 未积分跨度",g(rm.gap_count)+" / "+g(rm.gap_duration_min)+" min"],...(s.mode==="discharge"?[["交付净热量 / 温度㶲（末值）",g(rm.delivered_heat_end_MJ)+" / "+g(rm.delivered_exergy_end_MJ)+" MJ"]]:[["外部热源热量 / 温度㶲（末值）",g(rm.source_heat_end_MJ)+" / "+g(rm.source_exergy_end_MJ)+" MJ"]])];
  }
  $("#dBody").innerHTML=`
    <div class="sec"><h4>参数与诊断状态</h4><p><span class="status-badge ${statusClass(M.data_status)}"><span class="d"></span><b>${M.data_status||"—"}</b></span></p><p class="dim">${M.status_reason||""}</p></div>
    ${quality}
    <div class="sec"><h4>来源</h4>${kv([["来源归档时间",c.run_datetime],["时间依据",(c.run_datetime_basis||(c.source&&c.source.run_datetime_basis))==="file_mtime"?"文件 mtime，仅用于归档排序":esc(c.run_datetime_basis||(c.source&&c.source.run_datetime_basis)||"历史记录，依据未单独标注")],["项目 / 设计点",(c.project||"")+" / "+(c.design_point_dir||"")],["主机",c.source&&c.source.host],["来源目录",c.source&&c.source.fluent_dir?esc(c.source.fluent_dir):null],["UDF 源",c.source&&c.source.udf?esc(c.source.udf):null],["续算起点",c.restart_from_step?"第 "+c.restart_from_step+" 步":null],[".h5",(c.source&&c.source.h5_files||[]).join(", ")||null],["参数来源",{udf:"libudf/src",data:"数据反推",override:"覆盖文件",manual:"人工/文件夹名"}[c.params_source]||c.params_source],["备注",c.note||null],["标签",(c.tags||[]).join(", ")||null]])}</div>
    <div class="sec"><h4>参数</h4>${kv([["UA",p.UA_W_K!=null?g(p.UA_W_K)+" W/K":null],["ṁ₂ / T₂,in",p.mdot2_kg_h!=null?g(p.mdot2_kg_h)+" kg/h / "+g(p.T2in_C)+" °C":null],["ṁ₁",g(p.mdot1_kg_h||40)+" kg/h"],["W₁ / W₂",p.W1_W_K!=null?g(p.W1_W_K)+" / "+g(p.W2_W_K)+" W/K":null],["C_r / NTU / ε 理论",p.NTU!=null?g(p.Cr)+" / "+g(p.NTU)+" / "+g(p.eps_theory):null],["流向",s.st.reversed_flow?"zone 9 进（反转）":"zone 8 进"],["Δt / 步数",g(c.dt_s)+" s / "+(c.first_step??"?")+"→"+(c.last_step??"?")],["数据反推",dc&&dc.mdot1_kg_h?`ṁ₁ ${g(dc.mdot1_kg_h)}${dc.mdot2_kg_h?" · ṁ₂≈"+g(dc.mdot2_kg_h):""}${dc.UA_eff_W_K!=null?(dc.UA_identifiable?" · UA_eff≈"+g(dc.UA_eff_W_K):" · UA≥"+g(dc.UA_eff_W_K)+"(ε≈1)"):""}`:null]])}</div>
    <div class="sec"><h4>阶段指标</h4>${kv([["原始 flow-time 起止",g(M.t_start_s)+" → "+g(M.t_end_s)+" s"],["有效记录跨度 / 点数",g(M.recorded_duration_min??M.duration_min)+" min / "+(M.n_points??(S.tau_min||[]).length)],["起始 入口 / 出口",g(M.bed_in_start_C)+" / "+g(M.bed_out_start_C)+" °C"],["末端 入口 / 出口",g(M.bed_in_end_C)+" / "+g(M.bed_out_end_C)+" °C"],...metricRows,["UA_eff 中位数 / 比值",M.UA_eff_median_W_K!=null?g(M.UA_eff_median_W_K)+" W/K / "+g(M.UA_eff_ratio):null],["ε 实际 / 理论",M.eps_actual_median!=null?M.eps_actual_median.toFixed(3)+" / "+g(M.eps_theory):null],["两侧能量不平衡中位数",M.energy_imbalance_median_pct!=null?M.energy_imbalance_median_pct.toFixed(2)+" %":null],["尾段边界功率（非壁损实测）",g(M.q_bed_tail_W)+" W"]])}</div>
    ${diag}
    ${pcmChartSection(s)}
    <div class="sec"><h4>边界与能量曲线</h4><p class="dim">${timeAxisNote(s)}${samplingNote}${R?"功率保留符号；累计量从首条记录开始，不跨缺步积分；曲线在缺口处断开。正值分别表示床层吸热或释热，负值表示反向传热。壁损和辅机未计入。":""}</p>${legend([{color:"#B97708",label:"床层入口"},{color:"#E3A83A",label:"床层出口"},...(hasValues(S.t2in_C)?[{color:"#1264FF",label:"T₂,in"},{color:"#7FA3FF",label:"T₂,out"}]:[])])}${temps}${qe}${legend([{color:"#1264FF",label:s.mode==="discharge"?"累计放热":"累计吸热"},...(!R?[{color:"#8490A3",label:"壁损估计"}]:[])])}${ee}${!playable(s)?'<p class="note">当前阶段缺少可回放的边界温度记录，回放已禁用。</p>':""}</div>
    <div class="sec"><h4>文件</h4><p class="dim">${(c.files||[]).length} 个 .out：${(c.files||[]).slice(0,8).map(f=>f.name).join("、")}${(c.files||[]).length>8?" …":""}</p></div>`;
  renderPcmChart(s);
  $("#dActions").innerHTML=`<button class="primary" id="actPlay" ${playable(s)?"":"disabled"}>在演示中回放</button>${datasetId(c)==="retest-2026-10"?`<a class="btn" href="#research/${encodeURIComponent(sid)}">研究指标与配对</a>`:""}<button id="actCopy">复制 case_id</button>`; $("#dActions").classList.add("on");
  $("#actPlay").onclick=()=>{ loadStage(sid,{keepInfo:true}); go("demo"); };
  $("#actCopy").onclick=()=>{ navigator.clipboard&&navigator.clipboard.writeText(c.case_id); $("#actCopy").textContent="已复制"; setTimeout(()=>$("#actCopy").textContent="复制 case_id",1200); };
}

/* ---------------------------------------------------------------- 启动 */
buildFilters();
const init=state.stageFor.charge||state.stageFor.discharge||(STAGES[0]&&STAGES[0].id);
if(init) loadStage(init,{keepInfo:true}); else { $("#curLabel").innerHTML="<b>库为空</b> · 运行 export-web"; }
showInfo("system"); route(); requestAnimationFrame(frame);
})();
