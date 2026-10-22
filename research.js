/* Report-based research workspace. No solver, network, or simulated field data. */
(function () {
'use strict';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite = v => v !== null && v !== undefined && Number.isFinite(Number(v));
const fmt = (v, n = 2) => {if(!finite(v))return '—';const s=Number(v).toFixed(n);return n?s.replace(/\.?0+$/, ''):s;};
const scaled = (v,n) => finite(v)?Number(v)*n:null;
const colors = ['#1264FF','#B97708','#0C9B70','#7157C9','#D04D63','#079AA8','#637C48','#A56E96','#5A7193','#BD682A'];
const phaseCN = p => p === 'discharge' ? '放热' : '充热';
const conditionSort = (a,b) => a === 'OPEN' ? -1 : b === 'OPEN' ? 1 : a.localeCompare(b, undefined, {numeric:true});
const nice = r => { const p = Math.pow(10, Math.floor(Math.log10(r || 1))); const q = r / p; return (q<1.5?1:q<3?2:q<7?5:10)*p; };
const ticks = (a,b,n) => { const d=nice((b-a)/n); const out=[]; for(let v=Math.ceil(a/d)*d;v<=b+1e-8;v+=d)out.push(+v.toFixed(8));return out; };
let data, records=[], originals=[], byRecord={}, conditions=[], mounted=false, serial=0, chartExports=new Map(),viewWindow='',rendering=false;
const state = {tab:'stages',phase:'charge',selected:new Set(),group:'',axis:'time',window:'common',start:null,end:null,threshold:100,probeRecord:'',probe:'all',pair:'',matrixMetric:'heat',diag:'hx_energy_error_pct'};
const root = () => document.querySelector('#researchRoot');
function normalize(record) {
  return ((record.research||{}).stages||[]).map((r,i) => {
    const old=(record.stages||[]).find(s=>s.stage_id===r.stage_id)||(record.stages||[])[i]||{};
    const phase=r.phase||record.phase||(old.mode==='discharge'?'discharge':'charge');
    return {record,r,id:r.stage_id||old.stage_id||record.case_id,recordId:record.case_id,condition:record.condition_id||'UNKNOWN',phase,
      loop:r.loop||((record.params||{}).closed_loop===false?'open':'closed'),s:{...(old.series||{}),...(r.series||{})},m:r.metrics||{},gaps:r.gaps||[],labels:r.probe_labels||{},warnings:[...((record.quality||{}).notes||[]),...(r.assumptions||[])]};
  });
}
function setup() {
  data=(window.PBTES_LIBRARY||{}).research||{};
  records=(data.records||[]).flatMap(normalize); originals=records.filter(r=>!r.record.segment_only);
  byRecord=Object.fromEntries(records.map(r=>[r.recordId,r]));
  conditions=Array.from(new Set([...originals.map(r=>r.condition),...(data.pairs||[]).map(p=>p.condition_id)])).sort(conditionSort);
  if(!state.selected.size)conditions.forEach(c=>state.selected.add(c));
  if(!state.pair)state.pair=(data.pairs||[]).find(p=>p.status==='available')?.condition_id||conditions[0]||'';
}
const colorOf = c => colors[Math.max(0,conditions.indexOf(c))%colors.length];
const label = r => r.condition==='OPEN'?'开环':r.condition;
const values = (r,key) => Array.isArray(r.s[key])?r.s[key]:[];
const selectedRecords = () => originals.filter(r=>r.phase===state.phase&&state.selected.has(r.condition));
function bounds(rows, forceAll=false) {
  const ranges=rows.map(r=>values(r,'tau_min').filter(finite)).filter(a=>a.length).map(a=>[a[0],a[a.length-1]]);
  if(!ranges.length)return {start:0,end:0,mode:'empty',label:'无可用记录'};
  let a,b;
  const mode=forceAll?'all':state.window;
  if(mode==='all'){a=Math.min(...ranges.map(r=>r[0]));b=Math.max(...ranges.map(r=>r[1]));}
  else {a=Math.max(...ranges.map(r=>r[0]));b=Math.min(...ranges.map(r=>r[1]));if(state.phase==='charge')b=Math.min(240,b);}
  if(mode==='custom'){if(finite(state.start))a=Number(state.start);if(finite(state.end))b=Number(state.end);}
  return {start:a,end:b,mode,label:mode==='all'?'全部有效记录（各自窗口）':`${mode==='custom'?'自定义':'共同'}窗口 ${fmt(a)}–${fmt(b)} min`};
}
function broken(r,i) {
  return (r.gaps||[]).some(g=>g.after_index===i||g.before_index===i+1||
    (finite(g.after_step)&&values(r,'step')[i]===g.after_step));
}
// Clip complete sample intervals only. Never interpolate across a declared gap.
function samples(r,b,key) {
  const ts=values(r,'tau_min'),ys=values(r,key),out=[];
  for(let i=0;i<ts.length;i++) {
    if(!finite(ts[i])||!finite(ys[i])){out.push(null);continue;}
    if(i>0&&broken(r,i-1))out.push(null);
    if(ts[i]>=b.start&&ts[i]<=b.end)out.push({t:ts[i],y:ys[i],i});
    if(i+1<ts.length&&!broken(r,i)&&finite(ts[i+1])&&finite(ys[i+1])&&ts[i+1]>ts[i]) {
      for(const edge of [b.start,b.end])if(edge>ts[i]&&edge<ts[i+1])out.push({t:edge,y:ys[i]+(ys[i+1]-ys[i])*(edge-ts[i])/(ts[i+1]-ts[i]),i,interp:true});
    }
  }
  // Points were inserted within their source interval; sorting would bridge gaps.
  return out;
}
function lookup(r,key,t) {
  const x=values(r,'tau_min'),y=values(r,key);
  for(let i=0;i<x.length;i++) {
    if(Math.abs(x[i]-t)<1e-8)return finite(y[i])?y[i]:null;
    if(i+1<x.length&&t>x[i]&&t<x[i+1])return !broken(r,i)&&finite(y[i])&&finite(y[i+1])?y[i]+(y[i+1]-y[i])*(t-x[i])/(x[i+1]-x[i]):null;
  }
  return null;
}
function timeAtEnergy(r,b,energy) {
  const points=samples(r,b,'bed_energy_MJ');let prev=null;
  for(const p of points){if(!p){prev=null;continue;}if(Math.abs(p.y-energy)<1e-8)return p.t;
    if(prev&&energy>prev.y&&energy<p.y)return prev.t+(p.t-prev.t)*(energy-prev.y)/(p.y-prev.y);prev=p;}
  return null;
}
function rowBounds(r,b) {
  const t=values(r,'tau_min'),out={...b,start:Math.max(b.start,t[0]??0),end:Math.min(b.end,t[t.length-1]??0)};
  if(b.energy){const a=timeAtEnergy(r,out,b.energy.start),z=timeAtEnergy(r,out,b.energy.end);if(finite(a)&&finite(z)){out.start=a;out.end=z;}}
  return out;
}
function integrate(r,key,b,threshold=null,positive=threshold!==null) {
  b=rowBounds(r,b);
  const t=values(r,'tau_min'),physical=values(r,'flow_time_min'),q=values(r,key),T=values(r,'delivery_outlet_C').length?values(r,'delivery_outlet_C'):values(r,r.loop==='open'?'bed_out_C':'t2out_C');
  let energy=0,net=0,duration=0,coverage=0,hotDuration=0,first=null,last=null;
  for(let i=0;i<t.length-1;i++) {
    if(broken(r,i)||![t[i],t[i+1],q[i],q[i+1]].every(finite)||t[i+1]<=t[i])continue;
    const left=Math.max(t[i],b.start),right=Math.min(t[i+1],b.end);if(!(right>left))continue;
    const at=(a,u)=>a[i]+(a[i+1]-a[i])*(u-t[i])/(t[i+1]-t[i]);
    let cuts=[left,right];
    if(threshold!==null){
      if(![T[i],T[i+1]].every(finite))continue;
      for(const [a,level] of [[T,threshold],...(positive?[[q,0]]:[])])if(a[i+1]!==a[i]){const crossing=t[i]+(level-a[i])*(t[i+1]-t[i])/(a[i+1]-a[i]);if(crossing>left&&crossing<right)cuts.push(crossing);}
      cuts.sort((a,b)=>a-b);
    }
    coverage+=right-left;
    for(let j=0;j<cuts.length-1;j++){
      const a=cuts[j],z=cuts[j+1],mid=(a+z)/2,scale=finite(physical[i])&&finite(physical[i+1])?(physical[i+1]-physical[i])/(t[i+1]-t[i])*60:60,dt=(z-a)*scale;
      if(threshold!==null&&at(T,mid)<threshold)continue;
      net+=(at(q,a)+at(q,z))/2*dt;hotDuration+=dt/60;
      if(positive&&at(q,mid)<=0)continue;
      energy+=(at(q,a)+at(q,z))/2*dt;duration+=dt/60;
      if(first===null)first=a;last=z;
    }
  }
  return {MJ:coverage?energy/1e6:null,net_MJ:coverage?net/1e6:null,duration,hotDuration,coverage,first,last,average_W:duration>0?energy/(duration*60):null};
}
function useful(r,b) {
  if(r.phase!=='discharge')return null;
  const h=integrate(r,'delivered_heat_W',b,state.threshold),ex=integrate(r,'delivered_exergy_W',b,state.threshold);
  return {...h,exergy_MJ:ex.MJ,net_exergy_MJ:ex.net_MJ,exergy_covered_min:ex.coverage};
}
function energyDomain(rows,b) {
  if(rows.some(r=>r.phase!=='charge')||!rows.length)return null;
  const runs=rows.map(r=>samples(r,b,'bed_energy_MJ').filter(Boolean));
  if(!runs.every(s=>s.length>1&&s.every((p,i)=>!i||p.y>=s[i-1].y-1e-8)))return null;
  const start=Math.max(...runs.map(s=>s[0].y)),end=Math.min(...runs.map(s=>s.at(-1).y));
  if(!(end>start)||!rows.every(r=>finite(timeAtEnergy(r,b,start))&&finite(timeAtEnergy(r,b,end))))return null;
  return {start,end};
}
const axisAllowed=(rows,b)=>energyDomain(rows,b)!==null;
function chartLine(r,key,b,opt={}) {
  let points=samples(r,rowBounds(r,b),key).map(p=>p?{x:state.axis==='energy'&&!opt.forceTime?lookup(r,'bed_energy_MJ',p.t):p.t,y:p.y*(opt.scale??1)}:null);
  return {name:opt.name||label(r),color:opt.color||colorOf(r.condition),points,dash:opt.dash,width:opt.width||1.7};
}
function download(text,name,type) {
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function svgChart(lines,{unit='',xlabel='阶段历时 (min)',bands=[],hline=null}={}) {
  lines=lines.filter(l=>(l.points||[]).some(p=>p&&finite(p.x)&&finite(p.y)));
  const pts=lines.flatMap(l=>l.points.filter(p=>p&&finite(p.x)&&finite(p.y)));
  if(!pts.length)return {html:'<div class="r-blank">当前选择没有可读取的数据。</div>',svg:null};
  const W=720,H=282,L=62,R=20,T=29,B=47,iw=W-L-R,ih=H-T-B,fullH=H+Math.ceil(lines.length/2)*17+8;
  const bandY=bands.flatMap(b=>(b.points||[]).flatMap(p=>p?[p.min,p.max].filter(finite):[]));
  let x0=Math.min(...pts.map(p=>p.x)),x1=Math.max(...pts.map(p=>p.x)),y0=Math.min(...pts.map(p=>p.y),...bandY),y1=Math.max(...pts.map(p=>p.y),...bandY);
  if(x1<=x0)x1=x0+1;if(y1-y0<1e-8){y0-=.5;y1+=.5;}else{const pad=(y1-y0)*.08;y0-=pad;y1+=pad;}
  if(finite(hline)){y0=Math.min(y0,hline);y1=Math.max(y1,hline);}
  const X=x=>L+(x-x0)/(x1-x0)*iw,Y=y=>T+ih-(y-y0)/(y1-y0)*ih;
  let s=`<svg class="r-chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${fullH}" role="img" aria-label="${esc(unit)}"><rect width="${W}" height="${fullH}" fill="white"/><style>text{font:11px Arial,sans-serif;fill:#56657B}.r-axis-label{fill:#101827}</style>`;
  ticks(y0,y1,5).forEach(v=>s+=`<path d="M${L} ${Y(v)}H${W-R}" stroke="#e9eef6" fill="none"/><text x="${L-8}" y="${Y(v)+4}" text-anchor="end">${esc(fmt(v))}</text>`);
  ticks(x0,x1,7).forEach(v=>s+=`<text x="${X(v)}" y="${H-B+19}" text-anchor="middle">${esc(fmt(v))}</text>`);
  s+=`<path d="M${L} ${T}V${H-B}H${W-R}" fill="none" stroke="#b9c7dc"/><text x="${L}" y="16" class="r-axis-label">${esc(unit)}</text><text x="${L+iw/2}" y="${H-8}" text-anchor="middle" class="r-axis-label">${esc(xlabel)}</text>`;
  bands.forEach(b=>{
    let block=[];const flush=()=>{if(block.length>1){const upper=block.map(p=>`${X(p.x)},${Y(p.max)}`),lower=block.slice().reverse().map(p=>`${X(p.x)},${Y(p.min)}`);s+=`<polygon points="${upper.concat(lower).join(' ')}" fill="${b.color}" opacity="0.10"/>`;}block=[];};
    b.points.forEach(p=>{if(!p||![p.x,p.min,p.max].every(finite))flush();else block.push(p);});flush();
  });
  if(finite(hline))s+=`<path d="M${L} ${Y(hline)}H${W-R}" stroke="#b9c7dc" stroke-dasharray="5 4" fill="none"/>`;
  lines.forEach(l=>{
    let d='',pen=false;l.points.forEach(p=>{if(!p||!finite(p.x)||!finite(p.y)){pen=false;return;}d+=(pen?'L':'M')+X(p.x).toFixed(2)+' '+Y(p.y).toFixed(2);pen=true;});
    s+=`<path d="${d}" fill="none" stroke="${l.color}" stroke-width="${l.width||1.7}" ${l.dash?'stroke-dasharray="5 4"':''} stroke-linejoin="round"/>`;
  });
  lines.forEach((l,i)=>{const x=L+(i%2)*(iw/2),y=H+10+Math.floor(i/2)*17;s+=`<path d="M${x} ${y-3}h17" stroke="${l.color}" fill="none" stroke-width="2" ${l.dash?'stroke-dasharray="5 4"':''}/><text x="${x+23}" y="${y}" style="font:10px Arial,sans-serif">${esc(l.name)}</text>`;});
  s+='</svg>';
  return {html:s,svg:s};
}
function wrappedText(text,width=118) {
  const out=[];let line='',n=0;
  for(const c of String(text)){const w=c.charCodeAt(0)>255?2:1;if(n+w>width){out.push(line);line='';n=0;}line+=c;n+=w;}
  if(line)out.push(line);return out;
}
function exportGraphic(svg,title,caption) {
  const vb=svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);if(!vb)return svg;
  const W=Number(vb[1]),H=Number(vb[2]),rs=state.tab==='pairs'?[]:selectedRecords();
  const windowNote=viewWindow||(state.tab==='pairs'?'报告历史关联；原始 flow-time；checkpoint 未核验':bounds(rs).label);
  const notes=wrappedText(windowNote+'。'+caption,Math.floor(W/6));
  const metadata={dataset:'retest-2026-10',view:state.tab,phase:state.tab==='pairs'?'charge/discharge':state.phase,conditions:state.tab==='pairs'?[state.pair]:[...state.selected],threshold_C:state.threshold,axis:state.tab==='pairs'?'flow_time':state.axis,window:windowNote,checkpoint_verified:false};
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H+47+notes.length*14}" role="img"><title>${esc(title)}</title><desc>${esc(caption)}</desc><metadata>${esc(JSON.stringify(metadata))}</metadata><rect width="${W}" height="${H+47+notes.length*14}" fill="white"/><text x="20" y="23" style="font:600 14px Arial,sans-serif;fill:#101827">${esc(title)}</text><g transform="translate(0 32)">${svg.slice(svg.indexOf('>')+1,svg.lastIndexOf('</svg>'))}</g>${notes.map((line,i)=>`<text x="20" y="${H+49+i*14}" style="font:9px Arial,sans-serif;fill:#56657B">${esc(line)}</text>`).join('')}</svg>`;
}
function card(title,body,caption='',wide=false,svg=null) {
  const id='r-chart-'+(++serial);if(svg)chartExports.set(id,{title,svg:exportGraphic(svg,title,caption)});
  return `<article class="r-card${wide?' wide':''}"><div class="r-card-head"><h2>${esc(title)}</h2>${svg?`<button data-svg="${id}" title="下载矢量图">↓ SVG</button>`:''}</div>${body}${caption?`<p class="r-caption">${esc(caption)}</p>`:''}</article>`;
}
const axisLabel = () => state.axis==='energy'?'床层累计吸热量 (MJ)':'阶段历时 (min)';
function plotCard(title,lines,unit,caption='',opt={}) {const c=svgChart(lines,{unit,xlabel:opt.xlabel||axisLabel(),...opt});return card(title,c.html,caption,opt.wide,c.svg);}
const inversionHint='边界温度反推状态；末期小温差可能使反演病态。不等于全段HX失败或全段ε=1。';
const table = (heads,rows) => `<div class="r-table-wrap"><table class="r-table"><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td${String(v).includes('不可辨识')?` title="${esc(inversionHint)}"`:''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
function comparisonLabel(c) {
  if(c.label||c.title)return c.label||c.title;
  const id=c.cmp_id||'',m=id.match(/__(ua\d+|m\d+)_/);
  return `${phaseCN(c.phase||c.mode)} · ${c.type==='open_closed'?'开环与闭环':m?.[1].startsWith('ua')?'固定 UA='+m[1].slice(2)+' W/K · 流量变化':m?'固定 ṁ₂='+m[1].slice(1)+' kg/h · UA 变化':c.type_cn||id}`;
}
function renderToolbar() {
  const comparisons=data.comparisons||[];
  return `<div class="r-toolbar"><nav class="r-tabs" aria-label="研究分析类型">${[['stages','阶段与参数比较'],['pairs','充热—放热记录'],['matrix','闭环 3×3 矩阵']].map(([id,text])=>`<button data-r-tab="${id}" class="${state.tab===id?'on':''}">${text}</button>`).join('')}</nav>
  <div class="r-filters">${state.tab!=='pairs'?`<label>阶段<select id="r-phase"><option value="charge" ${state.phase==='charge'?'selected':''}>充热</option><option value="discharge" ${state.phase==='discharge'?'selected':''}>放热</option></select></label>`:''}
  ${state.tab==='stages'?`<label>参数组<select id="r-group"><option value="">自选工况</option>${comparisons.map((c,i)=>`<option value="${i}" ${state.group===String(i)?'selected':''}>${esc(comparisonLabel(c))}</option>`).join('')}</select></label><label>横轴<select id="r-axis"><option value="time" ${state.axis==='time'?'selected':''}>阶段历时</option><option value="energy" ${state.axis==='energy'?'selected':''}>相同床层累计吸热量 · 仅充热</option></select></label>`:''}
  ${state.tab!=='pairs'?`<label>比较窗口<select id="r-window"><option value="common" ${state.window==='common'?'selected':''}>共同可用窗口${state.phase==='charge'?' · ≤240 min':''}</option><option value="all" ${state.window==='all'?'selected':''}>各自全部记录</option><option value="custom" ${state.window==='custom'?'selected':''}>自定义窗口</option></select></label>${state.window==='custom'?`<label>起始<input id="r-start" type="number" min="0" step="1" value="${state.start??0}">min</label><label>截止<input id="r-end" type="number" min="0" step="1" value="${state.end??240}">min</label>`:''}`:''}
  <label>供热温度阈值<input id="r-threshold" type="number" min="20" max="250" step="1" value="${state.threshold}">°C</label><button class="btn r-export-all" id="r-csv">↓ 当前数据 CSV</button></div>
  ${state.tab==='stages'?`<div class="r-conditions">${conditions.map(c=>`<label class="r-check"><input data-r-condition="${esc(c)}" type="checkbox" ${state.selected.has(c)?'checked':''}><span style="color:${colorOf(c)}">●</span>${esc(c==='OPEN'?'开环':c)}</label>`).join('')}<button class="btn" id="r-all">全选</button><button class="btn" id="r-none">清空</button></div>`:''}</div>`;
}
function renderStages() {
  const rows=selectedRecords();let b=bounds(rows);let note='';
  if(state.axis==='energy'){
    const common=energyDomain(rows,b);
    if(!common){state.axis='time';note='所选阶段不能使用相同热量横轴：仅支持累计吸热量单调增加且存在共同可达热量范围的充热段。已切回时间轴。';}
    else{b.energy=common;b.label=`相同累计床层吸热量 ${fmt(common.start)}–${fmt(common.end)} MJ`;note='各工况只比较共同可达的热量范围；对应历时分别确定，窗口积分也按该热量范围计算。';}
  }
  if(!rows.length)return '<div class="r-note">请选择至少一个有报告的工况。</div>';
  if(b.end<=b.start)return '<div class="r-note warn">所选阶段没有共同可用窗口，请调整起止时间或选择“各自全部记录”。</div>';
  viewWindow=b.label;
  const gapCount=rows.reduce((n,r)=>n+r.gaps.length,0),missing=state.selected.has('UA100_M100')&&state.phase==='discharge';
  let html=`<div class="r-note">${esc(b.label)}。积分从首个有效记录开始；不外推起始区间，不跨缺步积分。${b.energy?'':b.mode==='all'?'各工况时长不同，全程指标用于记录查看，不用于直接排名。':'所有比较量在同一窗口重新积分。'}${missing?' UA100_M100 放热缺失，不补造曲线。':''}${note?' '+esc(note):''}</div>`;
  html+=`<div class="r-summary"><div class="r-stat"><span>选中工况 / 可读阶段</span><strong>${state.selected.size} / ${rows.length}</strong></div><div class="r-stat"><span>阶段</span><strong>${phaseCN(state.phase)}</strong></div><div class="r-stat"><span>窗口终点</span><strong>${fmt(b.energy?b.energy.end:b.end)} <small>${b.energy?'MJ':'min'}</small></strong></div><div class="r-stat"><span>报告缺口 / 完成状态</span><strong>${gapCount} <small>· 未核验</small></strong></div></div><div class="r-grid">`;
  const bands=rows.map(r=>({color:colorOf(r.condition),points:samples(r,rowBounds(r,b),'pcm_mean_C').map(p=>p?{x:state.axis==='energy'?lookup(r,'bed_energy_MJ',p.t):p.t,min:lookup(r,'pcm_min_C',p.t),max:lookup(r,'pcm_max_C',p.t)}:null)}));
  html+=plotCard('01 · 胶囊内部测点温度',rows.map(r=>chartLine(r,'pcm_mean_C',b)),'温度 (°C)','实线为现有 PCM 测点算术均值，浅色包络为最小—最大值；不是全域体积平均温度或液相率。',{bands});
  html+=plotCard('02 · 测点温度离散程度',rows.flatMap(r=>[chartLine(r,'pcm_spread_K',b,{name:label(r)+' ΔT'}),chartLine(r,'pcm_std_C',b,{name:label(r)+' σ',dash:true})]),'温差 / 标准差 (K)','ΔT = 最高测点温度 − 最低测点温度；σ 为现有测点总体标准差。表征测点间差异，不代表全域均匀性。');
  const boundary=rows.flatMap(r=>[chartLine(r,'bed_in_C',b,{name:label(r)+' 床层入口',dash:true}),chartLine(r,'bed_out_C',b,{name:label(r)+' 床层出口'}),...(state.phase==='discharge'&&r.loop!=='open'?[chartLine(r,'t2out_C',b,{name:label(r)+' 交付出口',width:1})]:[])]);
  html+=plotCard('03 · 床层与交付边界温度',boundary,'温度 (°C)','床层入口 / 出口按流向识别；闭环放热的交付温度为外置换热器二次侧出口，开环为床层出口。');
  html+=plotCard('04 · 瞬时热功率',rows.flatMap(r=>[chartLine(r,'bed_power_W',b,{scale:.001,name:label(r)+' 床层'}),chartLine(r,state.phase==='charge'?'source_heat_W':'delivered_heat_W',b,{scale:.001,name:label(r)+(state.phase==='charge'?' 外部热源':' 交付'),dash:true})]),'热功率 (kW)','床层边界功率与外部热源 / 交付功率分别保留；放热床层功率采用正向释放约定，尾段可能转负。');
  html+=plotCard('05 · 累计床层热量与外部热量',rows.flatMap(r=>[chartLine(r,'bed_energy_MJ',b,{name:label(r)+' 床层'}),chartLine(r,state.phase==='charge'?'source_heat_MJ':'delivered_heat_MJ',b,{name:label(r)+(state.phase==='charge'?' 热源':' 交付'),dash:true})]),'累计热量 (MJ)','曲线沿用阶段首条有效记录为积分起点；下方窗口表按所选窗口重新积分。缺口区间不作为已覆盖能量。');
  const exkey=state.phase==='charge'?'source_exergy_MJ':'delivered_exergy_MJ';
  html+=plotCard('06 · 边界累计热㶲',rows.flatMap(r=>[chartLine(r,exkey,b,{name:label(r)+(state.phase==='charge'?' 热源':' 交付')}),...(values(r,'bed_exergy_MJ').length?[chartLine(r,'bed_exergy_MJ',b,{name:label(r)+' 床层边界',dash:true})]:[])]),'累计热㶲 (MJ)','按报告边界温度、恒定比热及参考环境计算的流动热㶲。未扣除辅机耗功，不作为系统净效率。');
  const responseRows=rows.map(r=>{const q=integrate(r,'bed_power_W',b),h=integrate(r,state.phase==='charge'?'source_heat_W':'delivered_heat_W',b),ex=integrate(r,state.phase==='charge'?'source_exergy_W':'delivered_exergy_W',b),rb=rowBounds(r,b),status=(r.record.stages||[])[0]?.metrics?.data_status||'完成状态未核验';return [label(r),status,`${fmt(rb.start)}–${fmt(rb.end)}`,fmt(q.duration),fmt(q.MJ),fmt(scaled(q.average_W,.001)),fmt(h.MJ),fmt(ex.MJ)];});
  html+=card('07 · 所选窗口积分与平均功率',table(['工况','报告状态','对应历时 min','覆盖 min','床层热量 MJ','床层均功率 kW',state.phase==='charge'?'热源热量 MJ':'交付热量 MJ',state.phase==='charge'?'热源热㶲 MJ':'交付热㶲 MJ'],responseRows),b.label+'；均功率 = 窗口有效区间积分热量 / 有效覆盖时间。不同覆盖率须同时检查。',true);
  if(state.phase==='discharge'){
    const ur=rows.map(r=>{const u=useful(r,b);return [label(r),fmt(state.threshold,0),fmt(u.duration),fmt(u.MJ),fmt(u.exergy_MJ),fmt(u.net_MJ),fmt(u.net_exergy_MJ),fmt(u.first),fmt(u.last)];});
    html+=card('08 · 达到供热阈值的有效交付',table(['工况','阈值 °C','正供热时长 min','正向交付热量 MJ','正向交付热㶲 MJ','净交付热量 MJ','净交付热㶲 MJ','首时刻 min','末时刻 min'],ur),'先筛选交付出口温度 ≥ 阈值的有效区间；热量与热㶲分别对正功率积分，净值保留负功率。供热时长与首末时刻按正热功率确定；线性求交点、不跨缺口。首末时刻间可能有间断。',true);
  }else{
    const rr=rows.flatMap(r=>(r.m.response_times||[]).map(v=>[label(r),fmt(v.threshold_C,0),fmt(v.pcm_mean_min),fmt(v.pcm_all_min),fmt(v.bed_out_min)]));
    html+=card('08 · 温度响应时刻',rr.length?table(['工况','阈值 °C','测点均值 min','所有测点 min','床层出口 min'],rr):'<div class="r-blank">当前阶段没有预计算的响应时刻。</div>','响应时刻依据阶段原始有效记录，不代表相变完成；“所有测点”仅指现有测点，不等同于全域。',true);
  }
  const active=rows.find(r=>r.id===state.probeRecord)||rows[0];state.probeRecord=active.id;
  const probeKeys=Object.keys(active.s).filter(k=>/^pcm_probe_\d+_C$/.test(k));
  if(state.probe!=='all'&&!probeKeys.includes(state.probe))state.probe='all';
  const probeLines=(state.probe==='all'?probeKeys:[state.probe]).map((k,i)=>chartLine(active,k,b,{name:active.labels[k]||k,color:colors[i%colors.length]}));
  const pchart=svgChart(probeLines,{unit:'温度 (°C)',xlabel:axisLabel()});
  html+=card('09 · 原始 PCM 测点',`<div class="r-filters"><label>工况<select id="r-probe-record">${rows.map(r=>`<option value="${esc(r.id)}" ${r.id===active.id?'selected':''}>${esc(label(r))}</option>`).join('')}</select></label><label>测点<select id="r-probe"><option value="all">全部测点</option>${probeKeys.map(k=>`<option value="${esc(k)}" ${state.probe===k?'selected':''}>${esc(active.labels[k]||k)}</option>`).join('')}</select></label></div>${pchart.html}`,'保持报告原始 surface 名；下标及文件列序不等同于空间位置。',true,pchart.svg);
  html+=heatmapCard(active,rowBounds(active,b),probeKeys);
  const diagNames={hx_energy_error_pct:'耦合能量误差 (%)',hx_mass_error_pct:'质量流量误差 (%)',hx_backflow_fraction:'回流面积比例 (0–1)',hx_coupling_error:'入口耦合温差 (K)',hx_eps:'换热器效能 ε',hx_q12:'换热量 (W)',hx_Q12:'换热量 (W)',hx_valid:'UDF 有效标志'};
  const diagOpt=Object.entries(diagNames).filter(([key])=>rows.some(r=>values(r,key).some(finite)));
  if(!diagOpt.some(([k])=>k===state.diag))state.diag=diagOpt[0]?.[0]||'hx_energy_error_pct';
  const dc=svgChart(rows.filter(r=>r.loop!=='open').map(r=>chartLine(r,state.diag,b)),{unit:diagNames[state.diag]||state.diag,xlabel:axisLabel()});
  html+=card('11 · UDF 换热器诊断',`<div class="r-filters"><label>诊断量<select id="r-diag">${diagOpt.map(([k,v])=>`<option value="${k}" ${state.diag===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label></div>${dc.html}`,'HX 能量误差只检验 UDF 边界耦合，不是整个床层能量守恒。hx_valid=1 不等于残差收敛或相变完成；缺失诊断不补值。',true,dc.svg);
  html+='</div><details class="r-assumptions"><summary>查看选中阶段的报告状态与来源警告</summary>'+rows.map(r=>`<div class="r-source-row"><strong>${esc(label(r))} · ${phaseCN(r.phase)}</strong><p>报告状态：${esc((r.record.stages||[])[0]?.metrics?.data_status||'未判定')}；阶段完成：未经完成判据核验。</p><p>源记录：<code>${esc(r.record.source_case_id||r.record.raw_case_id||r.recordId)}</code></p><ul>${[...new Set((r.record.quality||{}).notes||[])].map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div>`).join('')+'</details>';return html;
}
function heatmapCard(r,b,keys) {
  const ts=values(r,'tau_min'),valid=ts.map((t,i)=>t>=b.start&&t<=b.end?i:-1).filter(i=>i>=0);
  if(!valid.length||!keys.length)return card('10 · 测点编号—时间热图','<div class="r-blank">没有可用测点。</div>');
  const W=1440,H=keys.length*23+95,L=290,R=65,T=24,B=55,iw=W-L-R,ih=H-T-B;
  const t0=b.start,t1=b.end;const all=keys.flatMap(k=>valid.map(i=>values(r,k)[i]).filter(finite));if(!all.length)return card('10 · 测点编号—时间热图','<div class="r-blank">没有可用测点。</div>');const lo=Math.min(...all),hi=Math.max(...all);
  const shade=v=>{const f=Math.max(0,Math.min(1,(v-lo)/(hi-lo||1)));const a=f<.5?[82,135,236]:[232,185,103],z=f<.5?[238,243,251]:[185,119,8],u=f<.5?f*2:(f-.5)*2;return '#'+a.map((c,i)=>Math.round(c+(z[i]-c)*u).toString(16).padStart(2,'0')).join('');};
  let svg=`<svg class="r-chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="测点编号时间热图"><rect width="${W}" height="${H}" fill="white"/>`;
  keys.forEach((k,j)=>{
    svg+=`<text x="${L-10}" y="${T+j*23+16}" text-anchor="end" style="font:11px Arial;fill:#56657B">${esc(r.labels[k]||k)}</text>`;
    valid.forEach(i=>{let next=i+1<ts.length&&!broken(r,i)?Math.min(ts[i+1],b.end):ts[i];const x=L+(ts[i]-t0)/(t1-t0)*iw,w=(next-ts[i])/(t1-t0)*iw;if(w>0&&finite(values(r,k)[i]))svg+=`<rect x="${x.toFixed(2)}" y="${T+j*23}" width="${Math.max(.5,w).toFixed(2)}" height="21" fill="${shade(values(r,k)[i])}"><title>${esc(r.labels[k]||k)} · ${fmt(ts[i])} min · ${fmt(values(r,k)[i])} °C</title></rect>`;});
  });
  ticks(t0,t1,8).forEach(t=>svg+=`<text x="${L+(t-t0)/(t1-t0)*iw}" y="${H-30}" text-anchor="middle" style="font:11px Arial;fill:#56657B">${fmt(t)}</text>`);
  svg+=`<text x="${L+iw/2}" y="${H-8}" text-anchor="middle" style="font:12px Arial;fill:#101827">阶段历时 (min)</text><defs><linearGradient id="r-heat-${serial}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${shade(lo)}"/><stop offset=".5" stop-color="${shade((lo+hi)/2)}"/><stop offset="1" stop-color="${shade(hi)}"/></linearGradient></defs><rect x="${W-43}" y="${T}" width="12" height="${ih}" fill="url(#r-heat-${serial})"/><text x="${W-4}" y="${T+8}" text-anchor="end" style="font:10px Arial">${fmt(hi,0)}</text><text x="${W-4}" y="${T+ih}" text-anchor="end" style="font:10px Arial">${fmt(lo,0)}</text><text x="${W-27}" y="${T-9}" text-anchor="middle" style="font:11px Arial">°C</text></svg>`;
  return card('10 · 测点编号—时间热图',svg,`${label(r)}；纵轴为报告通道排列，不是高度或坐标，不是真实温度云图。缺步区间留白；每个色块对应一个已记录采样区间。横轴固定为时间。`,true,svg);
}
function resolvePairRecord(pair,phase) {
  return byRecord[pair[phase+'_record_id']]||records.find(r=>r.id===pair[phase+'_stage_id'])||null;
}
function renderPairs() {
  viewWindow='报告历史关联；原始 flow-time；checkpoint 未核验';
  const pairs=data.pairs||[],p=pairs.find(p=>p.condition_id===state.pair)||pairs[0];if(!p)return '<div class="r-note">没有报告历史配对记录。</div>';
  const c=resolvePairRecord(p,'charge'),d=resolvePairRecord(p,'discharge');
  let html=`<div class="r-card r-pair-tools"><label>工况 <select id="r-pair">${pairs.map(v=>`<option value="${esc(v.condition_id)}" ${v===p?'selected':''}>${esc(v.condition_id==='OPEN'?'开环':v.condition_id)} · ${v.status==='available'?'报告可读':v.status==='missing'?'阶段缺失':'需核查'}</option>`).join('')}</select></label><span class="r-badge">报告历史关联 · checkpoint 未核验</span></div><div class="r-note warn">充热与放热来自同一份放热报告的历史分段，按原始 flow-time 展示。两段之间保留真实缺口并断线；报告关联不等于已验证的连续运行周期，不生成循环效率或相变完成结论。</div>`;
  if(!c||!d)return html+card('阶段记录缺失','<div class="r-blank">该工况缺少可用的报告历史前缀或放热段，不能组成全过程记录。</div>',(p.warnings||[]).join('；'),true);
  const make=(r,key,name,color,scale=1)=>({name,color,points:values(r,'flow_time_min').map((x,i)=>i>0&&broken(r,i-1)?[null,{x,y:finite(values(r,key)[i])?values(r,key)[i]*scale:null}]:[{x,y:finite(values(r,key)[i])?values(r,key)[i]*scale:null}]).flat(),dash:r.phase==='discharge'});
  html+='<div class="r-grid">';
  const pairPlot=(title,lines,unit,caption)=>plotCard(title,lines,unit,caption,{xlabel:'原始 flow-time (min)',wide:true});
  html+=pairPlot('01 · 胶囊内部温度全过程记录',[make(c,'pcm_mean_C','充热 · 测点均值','#B97708'),make(d,'pcm_mean_C','放热 · 测点均值','#1264FF'),make(c,'pcm_min_C','充热 · 最低测点','#E3A83A'),make(c,'pcm_max_C','充热 · 最高测点','#BD682A'),make(d,'pcm_min_C','放热 · 最低测点','#7FA3FF'),make(d,'pcm_max_C','放热 · 最高测点','#7157C9')],'温度 (°C)','全过程只包含真实报告中的两个阶段；没有用独立充热文件替换历史前段或人为平移时间。测点均值及范围均不等于全域温度。');
  html+=pairPlot('02 · 床层与交付边界全过程',[make(c,'bed_in_C','充热 · 床层入口','#B97708'),make(c,'bed_out_C','充热 · 床层出口','#E3A83A'),make(d,'bed_in_C','放热 · 床层入口','#1264FF'),make(d,'bed_out_C','放热 · 床层出口','#7FA3FF'),...(d.loop!=='open'?[make(d,'t2out_C','放热 · 二次侧交付','#0C9B70')]:[])],'温度 (°C)','两段采用各自实际流向的入口 / 出口；实线为充热，虚线为放热。');
  html+=pairPlot('03 · 分阶段热功率',[make(c,'bed_power_W','充热 · 床层吸热','#B97708',.001),make(d,'bed_power_W','放热 · 床层释放','#1264FF',.001),make(d,'delivered_heat_W','放热 · 交付','#0C9B70',.001)],'热功率 (kW)','放热以正值表示床层释放；保留尾段负功率，不用全程绝对值替代净放热。');
  html+=pairPlot('04 · 分阶段累计热量',[make(c,'bed_energy_MJ','充热 · 累计吸热','#B97708'),make(d,'bed_energy_MJ','放热 · 累计释放','#1264FF'),make(d,'delivered_heat_MJ','放热 · 累计交付','#0C9B70')],'累计热量 (MJ)','每个阶段分别从首个有效采样积分。不把两个累计量拼成“净储能”曲线，也不把壁损估计当作全域焓。');
  const match=p.independent_charge_comparison||{},matchLabels={matched:'公共记录吻合（仅报告对照）',different_source:'独立充热与历史前段不一致',derived_from_same_history:'充热段由同一历史提取',missing:'缺少独立充热对照'};
  const ranges=[c,d].map(r=>[phaseCN(r.phase),fmt(values(r,'flow_time_min')[0]),fmt(values(r,'flow_time_min').at(-1)),values(r,'flow_time_min').length,r.recordId]);
  html+=card('05 · 阶段与来源证据',table(['阶段','flow-time 起 min','flow-time 止 min','样本数','分析记录 ID'],ranges)+`<div class="r-provenance"><p>关联方式：${p.pairing_type==='report_history'?'同份报告历史分段':esc(p.pairing_type||'报告历史')}；checkpoint：${p.checkpoint_verified?'已核验':'未核验'}；独立充热与历史前段：${esc(matchLabels[match.status]||match.status||'未比较')}。</p><p>公共样本：${fmt(match.common_samples,0)}；边界温度最大差：${fmt(match.max_abs_boundary_K)} K；PCM 测点最大差：${fmt(match.max_abs_pcm_K)} K。</p>${(p.warnings||[]).map(w=>`<p>• ${esc(w)}</p>`).join('')}<details class="r-evidence"><summary>查看原始报告 SHA-256 与缺口证据</summary><p>源记录：<code>${esc(p.source_case_id||'')}</code></p>${(p.source_files||[]).map(f=>`<p>${esc(f.name)}<br><code>${esc(f.sha256||'')}</code></p>`).join('')}<pre>${esc(JSON.stringify(p.gaps||[],null,2))}</pre></details></div>`,'同参数、时间步相近或测点温度接近，都不能单独证明 checkpoint 继承关系。',true);
  return html+'</div>';
}
function renderMatrix() {
  const rows=originals.filter(r=>r.phase===state.phase&&r.loop!=='open'),b=bounds(rows);
  viewWindow=b.label;
  const opts={heat:['窗口床层热量','MJ'],average:['窗口床层平均功率','kW'],duration:['有效记录时长','min'],spread:['窗口末测点温差','K'],threshold:['阈值交付热量','MJ']};
  let html=`<div class="r-card"><div class="r-filters"><label>矩阵指标<select id="r-matrix-metric">${Object.entries(opts).map(([k,v])=>`<option value="${k}" ${state.matrixMetric===k?'selected':''}>${v[0]}</option>`).join('')}</select></label></div><div class="r-note">横向为外置换热器二次侧流量 ṁ₂，纵向为外置换热器 UA。${esc(b.label)}。颜色只表示所选指标大小，不作为质量等级或最优结论。</div>`;
  const val=r=>{if(!r)return null;const q=integrate(r,'bed_power_W',b);return state.matrixMetric==='heat'?q.MJ:state.matrixMetric==='average'?scaled(q.average_W,.001):state.matrixMetric==='duration'?r.m.recorded_duration_min:state.matrixMetric==='spread'?lookup(r,'pcm_spread_K',rowBounds(r,b).end):r.phase==='discharge'?useful(r,b)?.MJ:null;};
  const vals=rows.map(val).filter(finite),v0=Math.min(...vals),v1=Math.max(...vals);
  html+='<div class="r-matrix"><div></div>'+[20,40,100].map(m=>`<div class="r-matrix-label">ṁ₂ ${m} kg/h</div>`).join('');
  [50,100,1000].forEach(ua=>{html+=`<div class="r-matrix-label">UA ${ua}<br>W/K</div>`;[20,40,100].forEach(m=>{const id=`UA${ua}_M${m}`,r=rows.find(r=>r.condition===id),v=val(r),f=finite(v)?(v-v0)/(v1-v0||1):0;html+=`<div class="r-matrix-cell ${r?'':'missing'}" ${finite(v)?`style="background:rgba(18,100,255,${.025+f*.18})"`:''}><button data-r-jump="${id}">${id}</button><strong>${fmt(v)} <small>${opts[state.matrixMetric][1]}</small></strong><small>${r?esc((r.record.quality||{}).completion_status||'完成状态未核验'):'放热报告缺失'}</small></div>`;});});
  html+='</div><div class="r-matrix-key"><span>较小</span><i></i><span>较大</span></div><p class="r-caption">时长指标为全记录跨度，其余热量及平均功率按上方窗口计算；阈值交付热量只适用于放热。缺失值不插值。</p></div>';
  return html;
}
function assumptions() {
  const a=Array.from(new Set([...(data.assumptions||[]),'温度采用现有报告测点；没有 case/data 与几何核验时，不给测点指定空间坐标。','全域 PCM 焓、液相率、SOC、压降及风机功耗不由当前报告直接提供。','图表保留有效数据及来源警告；UDF 诊断通过不能替代 Fluent 残差或物理模型验收。','“不可辨识（ε≈1）”是边界温度反推参数的状态，末期小温差也可能使反演病态；不等于全段 HX 失败或全段效能等于 1。']));
  return `<details class="r-assumptions"><summary>计算口径、限制与来源</summary><ul>${a.map(v=>`<li>${esc(typeof v==='string'?v:JSON.stringify(v))}</li>`).join('')}</ul>${(data.sources||[]).length?'<p>指标参考文献与适用范围：</p><ul>'+data.sources.map(s=>`<li>${esc(s.title)}（${esc(s.pages||'')}）<br>${esc(s.basis||'')}<br><code>${esc(s.file||'')}</code></li>`).join('')+'</ul>':''}</details>`;
}
function applyComparison(index) {
  const c=(data.comparisons||[])[index];if(!c)return false;
  state.group=String(index);const members=c.members||c.rows||c.eta?.rows||[];
  let selected=members.map(m=>records.find(r=>r.id===(m.stage_id||m.id))?.condition||m.condition_id).filter(Boolean);
  if(c.eta?.reference_open||c.type==='open_closed')selected.push('OPEN');
  if(c.conditions)selected=c.conditions.map(x=>typeof x==='string'?x:x.condition_id);
  if(selected.length)state.selected=new Set(selected);
  state.phase=c.phase||(c.mode==='discharge'?'discharge':'charge');state.window='common';state.start=null;state.end=null;
  if(state.phase==='discharge')state.axis='time';state.tab='stages';return true;
}
function bind() {
  const q=s=>root().querySelector(s),on=(id,fn)=>{const e=q(id);if(e)e.onchange=()=>{fn(e.value);render();};};
  root().querySelectorAll('[data-r-tab]').forEach(e=>e.onclick=()=>{state.tab=e.dataset.rTab;render();});
  root().querySelectorAll('[data-r-condition]').forEach(e=>e.onchange=()=>{e.checked?state.selected.add(e.dataset.rCondition):state.selected.delete(e.dataset.rCondition);state.group='';render();});
  on('#r-phase',v=>{state.phase=v;state.group='';state.start=null;state.end=null;if(state.window==='custom')state.window='common';if(v==='discharge')state.axis='time';});
  on('#r-window',v=>{const b=bounds(state.tab==='matrix'?originals.filter(r=>r.phase===state.phase&&r.loop!=='open'):selectedRecords());state.window=v;if(v==='custom'){if(!finite(state.start))state.start=b.start;if(!finite(state.end))state.end=b.end;}});on('#r-start',v=>state.start=Number(v));on('#r-end',v=>state.end=Number(v));
  on('#r-axis',v=>state.axis=v);on('#r-threshold',v=>{if(finite(v)&&Number(v)>=20&&Number(v)<=250)state.threshold=Number(v);});
  on('#r-pair',v=>state.pair=v);on('#r-probe-record',v=>state.probeRecord=v);on('#r-probe',v=>state.probe=v);on('#r-diag',v=>state.diag=v);on('#r-matrix-metric',v=>state.matrixMetric=v);
  on('#r-group',v=>{state.group=v;if(v!=='')applyComparison(Number(v));});
  const all=q('#r-all'),none=q('#r-none');if(all)all.onclick=()=>{state.selected=new Set(conditions);state.group='';render();};if(none)none.onclick=()=>{state.selected.clear();state.group='';render();};
  root().querySelectorAll('[data-r-jump]').forEach(e=>e.onclick=()=>{state.selected=new Set([e.dataset.rJump]);state.tab='stages';render();});
  root().querySelectorAll('[data-svg]').forEach(e=>e.onclick=()=>{const c=chartExports.get(e.dataset.svg);if(c)download(c.svg,'PBTES_'+state.phase+'_'+c.title.replace(/[ ·/]/g,'_')+'.svg','image/svg+xml;charset=utf-8');});
  if(q('#r-csv'))q('#r-csv').onclick=exportCSV;
}
function exportCSV() {
  const rows=[['dataset','condition','stage_id','phase','source_case_id','window','start_min','end_min','flow_time_min','tau_min','bed_energy_MJ','variable','original_probe_label','value','threshold_C']];
  let rs,b;
  if(state.tab==='pairs'){const p=(data.pairs||[]).find(p=>p.condition_id===state.pair);rs=p?[resolvePairRecord(p,'charge'),resolvePairRecord(p,'discharge')].filter(Boolean):[];b={start:-Infinity,end:Infinity,label:'原始报告全过程记录；checkpoint未核验'};}
  else {rs=state.tab==='matrix'?originals.filter(r=>r.phase===state.phase&&r.loop!=='open'):selectedRecords();b=bounds(rs);if(state.tab==='stages'&&state.axis==='energy'){const e=energyDomain(rs,b);if(e){b.energy=e;b.label=`相同累计床层吸热量 ${fmt(e.start)}–${fmt(e.end)} MJ`;}}}
  rs.forEach(r=>{
    const rb=rowBounds(r,b);
    const ts=values(r,'tau_min'),keys=Object.keys(r.s).filter(k=>Array.isArray(r.s[k])&&r.s[k].length===ts.length&&!['step','flow_time_min','tau_min'].includes(k));
    ts.forEach((t,i)=>{if(t<rb.start||t>rb.end)return;keys.forEach(k=>rows.push([r.record.dataset||'retest-2026-10',r.condition,r.id,r.phase,r.record.source_case_id||r.record.raw_case_id||r.recordId,b.label,finite(rb.start)?rb.start:'',finite(rb.end)?rb.end:'',values(r,'flow_time_min')[i],t,values(r,'bed_energy_MJ')[i],k,r.labels[k]||'',r.s[k][i]??'',state.threshold]));});
    if(state.tab!=='pairs'){
      const q=integrate(r,'bed_power_W',b),u=useful(r,b);const metrics={window_bed_heat_MJ:q.MJ,window_covered_min:q.duration,window_average_bed_power_W:q.average_W,...(b.energy?{common_energy_axis_start_MJ:b.energy.start,common_energy_axis_end_MJ:b.energy.end}:{}),...(u?{threshold_useful_heat_MJ:u.MJ,threshold_useful_exergy_MJ:u.exergy_MJ,threshold_net_heat_MJ:u.net_MJ,threshold_net_exergy_MJ:u.net_exergy_MJ,threshold_temperature_qualified_min:u.hotDuration,threshold_useful_duration_min:u.duration}:{})};
      for(const prefix of ['bed_exergy','source_heat','source_exergy','delivered_heat','delivered_exergy']){const v=integrate(r,prefix+'_W',b);metrics['window_'+prefix+'_MJ']=v.MJ;metrics['window_'+prefix+'_covered_min']=v.duration;metrics['window_'+prefix+'_average_W']=v.average_W;}
      Object.entries(metrics).forEach(([k,v])=>rows.push([r.record.dataset||'retest-2026-10',r.condition,r.id,r.phase,r.recordId,b.label,rb.start,rb.end,'','','',k,'',v??'',state.threshold]));
    }
    (r.gaps||[]).forEach(g=>rows.push([r.record.dataset||'retest-2026-10',r.condition,r.id,r.phase,r.recordId,b.label,'','','','','','GAP','',JSON.stringify(g),state.threshold]));
  });
  const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  download(csv,'PBTES_retest_2026-10_'+state.tab+'_'+state.phase+'.csv','text/csv;charset=utf-8');
}
function render() {
  if(!root()||rendering)return;rendering=true;
  try{
  if(!mounted)setup();mounted=true;serial=0;chartExports.clear();viewWindow='';
  const view=state.tab==='pairs'?renderPairs():state.tab==='matrix'?renderMatrix():renderStages();
  root().innerHTML=`<div class="research"><div class="r-heading"><div><div class="eyebrow">RESEARCH / 2026-10 RETEST</div><h1>从原始报告到可追溯的比较</h1><p>1 组开环 · 9 组闭环。阶段分析、参数比较与充放热历史记录；保持测点、边界和能量口径清晰。</p></div><span class="r-badge">${originals.length} / 20 阶段可读 · 静态数据快照</span></div>${renderToolbar()}${originals.length?view:'<div class="r-note warn">研究分析数据尚未导出。请运行项目导出流程生成 PBTES_LIBRARY.research，页面不会用示例数据替代。</div>'}${assumptions()}</div>`;
  bind();
  }finally{rendering=false;}
}
function mount(target=null) {
  if(!mounted){setup();mounted=true;}
  if(target){
    const comparison=(data.comparisons||[]).findIndex(c=>c.cmp_id===target),stage=records.find(r=>r.id===target||r.recordId===target);
    if(comparison>=0)applyComparison(comparison);
    else if(String(target).startsWith('pair:')){state.tab='pairs';state.pair=String(target).slice(5);}
    else if(stage){state.tab='stages';state.phase=stage.phase;state.selected=new Set([stage.condition]);state.group='';state.probeRecord=stage.id;state.window='all';if(stage.phase==='discharge')state.axis='time';}
  }
  render();
}
function openTarget(target) {
  const hash='#research/'+encodeURIComponent(target);if(location.hash===hash)mount(target);else location.hash=hash;
}
window.PBTES_RESEARCH={mount,render,exportCSV,openComparison:openTarget,openStage:openTarget,openPair:c=>openTarget('pair:'+c),_test:{integrate,useful,bounds,rowBounds,broken,samples,normalize,axisAllowed,energyDomain,timeAtEnergy,fmt,scaled,state,get records(){return records;}}};
})();
