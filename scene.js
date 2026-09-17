/* scene.js — Three.js 场景：填充床（Fluent HX-1）+ UDF 换热器（HX-2）+ 一次/二次侧管路 + 粒子 + 悬浮标签
   依赖：three.min.js、OrbitControls.js（本地）。对外接口：window.createScene(opts) → Scene */
(function(){
"use strict";

window.createScene = function createScene(opts){
  const { canvas, stage, labelsEl, onPick, fmt } = opts;
  const renderer=new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); renderer.outputEncoding=THREE.sRGBEncoding; renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000,0);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(30,1,0.05,60);
  const controls=new THREE.OrbitControls(camera, canvas); controls.enableDamping=true; controls.dampingFactor=0.08; controls.minDistance=1.8; controls.maxDistance=9; controls.maxPolarAngle=1.5;
  function resetView(){ camera.position.set(3.6,2.05,6.1); controls.target.set(0.3,0.62,0); controls.update(); }
  resetView();

  scene.add(new THREE.HemisphereLight(0xffffff,0xdce4f0,0.55));
  const key=new THREE.DirectionalLight(0xffffff,0.72); key.position.set(3,6,4); key.castShadow=true; key.shadow.mapSize.set(2048,2048); key.shadow.camera.near=1; key.shadow.camera.far=20; key.shadow.camera.left=key.shadow.camera.bottom=-4; key.shadow.camera.right=key.shadow.camera.top=4; key.shadow.bias=-0.0004; key.shadow.radius=4; scene.add(key);
  const fill=new THREE.DirectionalLight(0xdfe8ff,0.22); fill.position.set(-4,2,-3); scene.add(fill);
  const rim=new THREE.DirectionalLight(0xffffff,0.15); rim.position.set(0,3,-6); scene.add(rim);

  (function ground(){
    const c=document.createElement("canvas"); c.width=c.height=128; const g=c.getContext("2d"); g.fillStyle="#ffffff"; g.fillRect(0,0,128,128); g.fillStyle="#dce4f0"; g.beginPath(); g.arc(64,64,2.2,0,Math.PI*2); g.fill();
    const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(26,26); tex.anisotropy=8;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(14,14), new THREE.MeshStandardMaterial({map:tex, color:0xffffff, roughness:1, metalness:0})); m.rotation.x=-Math.PI/2; m.position.y=-0.5; m.receiveShadow=true; scene.add(m);
    const sh=new THREE.Mesh(new THREE.PlaneGeometry(14,14), new THREE.ShadowMaterial({opacity:0.07})); sh.rotation.x=-Math.PI/2; sh.position.y=-0.499; sh.receiveShadow=true; scene.add(sh);
  })();

  const M = {
    metal:new THREE.MeshStandardMaterial({color:0xC9D4E5, metalness:0.85, roughness:0.28}),
    metalDark:new THREE.MeshStandardMaterial({color:0x9AA8BF, metalness:0.9, roughness:0.32}),
    pipe:new THREE.MeshPhysicalMaterial({color:0xDCE4F0, metalness:0.1, roughness:0.2, transparent:true, opacity:0.42, clearcoat:0.8, clearcoatRoughness:0.2, depthWrite:false}),
    glass:new THREE.MeshPhysicalMaterial({color:0xEAF1FB, metalness:0.05, roughness:0.12, transmission:0.78, thickness:0.02, ior:1.04, transparent:true, opacity:1, side:THREE.DoubleSide, clearcoat:1, clearcoatRoughness:0.12, depthWrite:false}),
    glassPlain:new THREE.MeshPhysicalMaterial({color:0xF4F8FF, metalness:0, roughness:0.15, transparent:true, opacity:0.22, side:THREE.DoubleSide, clearcoat:0.6, depthWrite:false}),
    pcm:new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.45, metalness:0.0}),
    hxShell:new THREE.MeshPhysicalMaterial({color:0xF3F6FB, metalness:0.55, roughness:0.22, clearcoat:0.8, clearcoatRoughness:0.15}),
    hxBand:new THREE.MeshStandardMaterial({color:0x1264FF, metalness:0.4, roughness:0.4}),
    soft:new THREE.MeshStandardMaterial({color:0xF8FAFC, roughness:0.9}),
  };
  const pick=[]; function clickable(mesh,id){ mesh.userData.id=id; pick.push(mesh); return mesh; }

  /* ---- tank ---- */
  const TANK={x:-0.95, R:0.53, y0:0, H:1.25, packY0:0.10};
  const tank=new THREE.Group(); scene.add(tank);
  const shell=new THREE.Mesh(new THREE.CylinderGeometry(TANK.R,TANK.R,TANK.H,96,1,true), M.glass); shell.position.set(TANK.x,TANK.y0+TANK.H/2,0); tank.add(clickable(shell,"tank"));
  function ring(y,r,h,mat){ const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,96), mat); m.position.set(TANK.x,y,0); m.castShadow=true; tank.add(clickable(m,"tank")); return m; }
  ring(TANK.y0+0.035,TANK.R+0.025,0.07,M.metal); ring(TANK.y0+TANK.H-0.035,TANK.R+0.025,0.07,M.metal); ring(TANK.y0+0.62,TANK.R+0.012,0.03,M.metalDark);
  [0.35,2.45,3.9].forEach(a=>{ const st=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,TANK.H-0.1,12),M.metalDark); st.position.set(TANK.x+Math.cos(a)*(TANK.R+0.02),TANK.y0+TANK.H/2,Math.sin(a)*(TANK.R+0.02)); st.castShadow=true; tank.add(clickable(st,"tank")); });
  (function domes(){
    const g=new THREE.SphereGeometry(TANK.R,96,32,0,Math.PI*2,0,Math.PI/2);
    const top=new THREE.Mesh(g,M.metal); top.scale.set(1,0.32,1); top.position.set(TANK.x,TANK.y0+TANK.H,0); top.castShadow=true; tank.add(clickable(top,"tank"));
    const bot=new THREE.Mesh(g,M.metal); bot.scale.set(1,-0.32,1); bot.position.set(TANK.x,TANK.y0,0); bot.castShadow=true; tank.add(clickable(bot,"tank"));
    const nz=new THREE.CylinderGeometry(0.055,0.055,0.14,32);
    const n1=new THREE.Mesh(nz,M.metalDark); n1.position.set(TANK.x,TANK.y0+TANK.H+0.2,0); tank.add(clickable(n1,"zone8"));
    const n2=new THREE.Mesh(nz,M.metalDark); n2.position.set(TANK.x,TANK.y0-0.2,0); tank.add(clickable(n2,"zone9"));
    const fl=new THREE.CylinderGeometry(0.085,0.085,0.03,32);
    const f1=new THREE.Mesh(fl,M.metal); f1.position.set(TANK.x,TANK.y0+TANK.H+0.27,0); tank.add(clickable(f1,"zone8"));
    const f2=new THREE.Mesh(fl,M.metal); f2.position.set(TANK.x,TANK.y0-0.27,0); tank.add(clickable(f2,"zone9"));
    const ped=new THREE.Mesh(new THREE.CylinderGeometry(TANK.R+0.14,TANK.R+0.18,0.05,96),M.soft); ped.position.set(TANK.x,-0.475,0); ped.receiveShadow=true; tank.add(ped);
    for(let i=0;i<3;i++){ const a=i*2*Math.PI/3+0.5; const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.45,16),M.metalDark); leg.position.set(TANK.x+Math.cos(a)*(TANK.R-0.05),-0.23,Math.sin(a)*(TANK.R-0.05)); leg.castShadow=true; tank.add(leg); }
  })();

  /* ---- PCM capsules ---- */
  const spheres=[];
  (function buildPacking(){
    const a=0.131; const hp=[];
    for(let q=-3;q<=3;q++) for(let r=-3;r<=3;r++){ const s=-q-r; if(Math.abs(s)>3) continue; hp.push({x:a*(q+r/2), z:a*(Math.sqrt(3)/2*r), ring:Math.max(Math.abs(q),Math.abs(r),Math.abs(s))}); }
    for(let k=0;k<8;k++){ const y=TANK.y0+TANK.packY0+0.0655+k*a; const typeB=(k%2===1);
      hp.forEach(p=>{ let r=0.0655; if(typeB){ if(p.ring===0) r=0.0475; else if(p.ring===2) r=0.0525; } spheres.push({x:TANK.x+p.x, z:p.z, y:y-(0.0655-r), r, k, ring:p.ring}); }); }
  })();
  const inst=new THREE.InstancedMesh(new THREE.SphereGeometry(1,28,20), M.pcm, spheres.length); inst.castShadow=true; inst.receiveShadow=true;
  const _m=new THREE.Matrix4(), _q=new THREE.Quaternion(), _s=new THREE.Vector3(), _p=new THREE.Vector3(), _c=new THREE.Color();
  spheres.forEach((s,i)=>{ _p.set(s.x,s.y,s.z); _s.set(s.r,s.r,s.r); _m.compose(_p,_q,_s); inst.setMatrixAt(i,_m); inst.setColorAt(i,_c.set(0x7fa3ff)); });
  inst.instanceMatrix.needsUpdate=true; tank.add(clickable(inst,"pcm"));
  const sphColorNow=spheres.map(()=>new THREE.Color(0x7fa3ff));
  const STOPS=[[20,0x5B8DEF],[60,0x7FA3FF],[105,0xE6EEFA],[150,0xF1C97A],[200,0xB97708]].map(([t,c])=>[t,new THREE.Color(c).convertSRGBToLinear()]);
  function tempColor(T,out){ if(!(T>-100)) T=60; if(T<=STOPS[0][0]) return out.copy(STOPS[0][1]); for(let i=1;i<STOPS.length;i++){ if(T<=STOPS[i][0]){ const f=(T-STOPS[i-1][0])/(STOPS[i][0]-STOPS[i-1][0]); return out.copy(STOPS[i-1][1]).lerp(STOPS[i][1],f);} } return out.copy(STOPS[STOPS.length-1][1]); }
  const sig=(x)=>1/(1+Math.exp(-x));

  /* ---- HX-2 ---- */
  const HX={cx:1.35, cy:0.62, len:0.92, r:0.19};
  const hx=new THREE.Group(); scene.add(hx);
  (function buildHX(){
    const body=new THREE.Mesh(new THREE.CylinderGeometry(HX.r,HX.r,HX.len,64), M.hxShell); body.rotation.z=Math.PI/2; body.position.set(HX.cx,HX.cy,0); body.castShadow=true; hx.add(clickable(body,"hx"));
    const capG=new THREE.SphereGeometry(HX.r,48,24,0,Math.PI*2,0,Math.PI/2);
    const c1=new THREE.Mesh(capG,M.hxShell); c1.rotation.z=-Math.PI/2; c1.scale.set(1,0.45,1); c1.position.set(HX.cx+HX.len/2,HX.cy,0); c1.castShadow=true; hx.add(clickable(c1,"hx"));
    const c2=new THREE.Mesh(capG,M.hxShell); c2.rotation.z=Math.PI/2; c2.scale.set(1,0.45,1); c2.position.set(HX.cx-HX.len/2,HX.cy,0); c2.castShadow=true; hx.add(clickable(c2,"hx"));
    [-0.3,0,0.3].forEach(dx=>{ const b=new THREE.Mesh(new THREE.CylinderGeometry(HX.r+0.012,HX.r+0.012,0.035,64), dx===0?M.hxBand:M.metal); b.rotation.z=Math.PI/2; b.position.set(HX.cx+dx,HX.cy,0); hx.add(clickable(b,"hx")); });
    [-0.28,0.28].forEach(dx=>{ const s=new THREE.Mesh(new THREE.BoxGeometry(0.08,HX.cy-HX.r+0.5-0.04,0.26),M.soft); s.position.set(HX.cx+dx,(HX.cy-HX.r-0.5)/2,0); s.castShadow=true; hx.add(s); });
    const nz=new THREE.CylinderGeometry(0.045,0.045,0.12,24);
    const nIn=new THREE.Mesh(nz,M.metalDark); nIn.position.set(HX.cx+0.3,HX.cy+HX.r+0.04,0); hx.add(clickable(nIn,"secondary"));
    const nOut=new THREE.Mesh(nz,M.metalDark); nOut.position.set(HX.cx-0.3,HX.cy-HX.r-0.04,0); hx.add(clickable(nOut,"secondary"));
    const plate=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.16,0.012), new THREE.MeshStandardMaterial({color:0x1264FF, roughness:0.5})); plate.position.set(HX.cx,HX.cy,HX.r+0.006); hx.add(clickable(plate,"udf"));
  })();

  /* ---- pipes ---- */
  const P = {
    top:[ [TANK.x,TANK.y0+TANK.H+0.34,0],[TANK.x,1.95,0],[HX.cx+HX.len/2+0.55,1.95,0],[HX.cx+HX.len/2+0.55,HX.cy,0],[HX.cx+HX.len/2+0.09,HX.cy,0] ],
    bottom:[ [TANK.x,TANK.y0-0.34,0],[TANK.x,-0.30,0],[HX.cx-HX.len/2-0.5,-0.30,0],[HX.cx-HX.len/2-0.5,HX.cy,0],[HX.cx-HX.len/2-0.09,HX.cy,0] ],
    secIn:[ [HX.cx+0.3,1.45,0],[HX.cx+0.3,HX.cy+HX.r+0.1,0] ],
    secOut:[ [HX.cx-0.3,HX.cy-HX.r-0.1,0],[HX.cx-0.3,-0.12,0] ],
  };
  function roundedPath(pts){ const v=pts.map(p=>new THREE.Vector3(...p)); const out=[v[0]];
    for(let i=1;i<v.length-1;i++){ const a=v[i-1],b=v[i],c=v[i+1]; const d1=b.clone().sub(a).normalize(), d2=c.clone().sub(b).normalize(); out.push(b.clone().sub(d1.multiplyScalar(0.12))); out.push(b.clone()); out.push(b.clone().add(d2.multiplyScalar(0.12))); }
    out.push(v[v.length-1]); return new THREE.CatmullRomCurve3(out,false,"catmullrom",0.2); }
  const curves={};
  Object.entries(P).forEach(([k,pts])=>{ const cur=roundedPath(pts); curves[k]=cur; const r=k.startsWith("sec")?0.03:0.04; const m=new THREE.Mesh(new THREE.TubeGeometry(cur,120,r,20,false), M.pipe); m.castShadow=true; scene.add(clickable(m, k.startsWith("sec")?"secondary":"loop")); });
  const src=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.16,0.3), new THREE.MeshStandardMaterial({color:0xffffff, metalness:0.2, roughness:0.35})); src.position.set(HX.cx+0.3,1.53,0); src.castShadow=true; scene.add(clickable(src,"secondary"));
  const srcBand=new THREE.Mesh(new THREE.BoxGeometry(0.44,0.03,0.32), M.hxBand); srcBand.position.set(HX.cx+0.3,1.47,0); scene.add(srcBand);
  const sink=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.12,0.3), new THREE.MeshStandardMaterial({color:0xffffff, metalness:0.2, roughness:0.35})); sink.position.set(HX.cx-0.3,-0.2,0); sink.castShadow=true; scene.add(clickable(sink,"secondary"));

  /* ---- particles ---- */
  const PART={top:44,bottom:44,secIn:9,secOut:9}; const partGeo=new THREE.SphereGeometry(0.026,12,10); const parts={};
  Object.keys(P).forEach(k=>{ const n=PART[k]; const im=new THREE.InstancedMesh(partGeo, new THREE.MeshBasicMaterial({color:0xffffff}), n); im.renderOrder=2; im.userData.phase=Array.from({length:n},(_,i)=>i/n); scene.add(im); parts[k]=im; });

  /* ---- wall loss arrows ---- */
  const wallGroup=new THREE.Group(); scene.add(wallGroup);
  (function(){ const cone=new THREE.ConeGeometry(0.03,0.09,16); const mat=new THREE.MeshStandardMaterial({color:0x8490A3, transparent:true, opacity:0.55}); for(let i=0;i<5;i++){ const g=new THREE.Group(); const c=new THREE.Mesh(cone,mat); c.rotation.z=-Math.PI/2; c.position.x=TANK.R+0.14; c.userData.id="wall"; pick.push(c); g.add(c); g.position.set(TANK.x,0.35+((i*0.19)%0.7),0); g.rotation.y=-0.9+i*0.45; g.userData.base=g.position.y; wallGroup.add(g); } })();

  /* ---- labels ---- */
  let hxLabel=()=>"";
  const anchors=[
    {id:"tank", pos:new THREE.Vector3(TANK.x-TANK.R-0.05,TANK.y0+0.95,0.15), cls:()=>"hot", t:()=>"填充床储热罐 · Fluent HX-1", v:()=>"ε 0.493 · 己二酸 PCM · 8 层"},
    {id:"zone8", pos:new THREE.Vector3(TANK.x,TANK.y0+TANK.H+0.3,0), cls:(m)=>"hot", t:(m)=>m==="charge"?"床层入口 · zone 8":"床层出口 · zone 8", v:(s,m)=>fmt(m==="charge"?s.Tin:s.Tout)+" °C"},
    {id:"zone9", pos:new THREE.Vector3(TANK.x,TANK.y0-0.3,0), cls:(m)=>m==="charge"?"warm":"cold", t:(m)=>m==="charge"?"床层出口 · zone 9":"床层入口 · zone 9", v:(s,m)=>fmt(m==="charge"?s.Tout:s.Tin)+" °C", below:true},
    {id:"hx", pos:new THREE.Vector3(HX.cx-0.05,HX.cy+HX.r+0.02,0.12), cls:()=>"cold", t:()=>"UDF 换热器 · HX-2", v:()=>hxLabel()},
    {id:"secondary", pos:new THREE.Vector3(HX.cx+0.3,1.62,0), cls:(m)=>m==="charge"?"hot":"cold", t:(m)=>m==="charge"?"T₂,in · 热源":"T₂,in · 冷源", v:(s)=>fmt(s.T2in)+" °C", hideIfNoT2:true},
    {id:"secondary", pos:new THREE.Vector3(HX.cx-0.3,-0.26,0), cls:(m)=>m==="charge"?"hot":"cool", t:(m)=>m==="charge"?"T₂,out · 回热源":"T₂,out · 交付", v:(s)=>fmt(s.T2out)+" °C", below:true, hideIfNoT2:true},
    {id:"wall", pos:new THREE.Vector3(TANK.x+TANK.R+0.22,0.42,0.1), cls:()=>"gray", t:()=>"壁面散热", v:()=>"k ≈ 0.23 W/K → 20 °C", small:true, below:true},
    {id:"udf", pos:new THREE.Vector3(HX.cx,HX.cy-HX.r-0.02,0.2), cls:()=>"purple", t:()=>"UDF · DEFINE_ADJUST", v:()=>"LMTD-Newton → ε–NTU（待办）", small:true, below:true},
  ];
  anchors.forEach(a=>{ const el=document.createElement("div"); el.className="chip"+(a.small?" small":""); el.innerHTML='<span class="bar"></span><span class="t"></span><span class="v"></span>'; el.onclick=()=>onPick(a.id); labelsEl.appendChild(el); a.el=el; });
  const _v=new THREE.Vector3();
  function updateLabels(s,mode){
    const w=stage.clientWidth,h=stage.clientHeight;
    anchors.forEach(a=>{ if(a.hideIfNoT2 && !(s.T2in>-100)){ a.el.style.display="none"; return; }
      _v.copy(a.pos).project(camera); const vis=_v.z<1; a.el.style.display=vis?"block":"none"; if(!vis) return;
      a.el.style.left=((_v.x*0.5+0.5)*w)+"px"; a.el.style.top=((-_v.y*0.5+0.5)*h)+"px";
      a.el.style.transform=a.below?"translate(-50%,14px)":"translate(-50%,calc(-100% - 14px))";
      a.el.className="chip"+(a.small?" small":"")+" "+a.cls(mode)+(a.below?" below":"");
      a.el.querySelector(".t").textContent=a.t(mode); a.el.querySelector(".v").textContent=a.v(s,mode); });
  }

  /* ---- picking ---- */
  const ray=new THREE.Raycaster(), mouse=new THREE.Vector2(); let downAt=null;
  canvas.addEventListener("pointerdown",e=>{downAt=[e.clientX,e.clientY];});
  canvas.addEventListener("pointerup",e=>{ if(!downAt) return; const dx=e.clientX-downAt[0], dy=e.clientY-downAt[1]; downAt=null; if(dx*dx+dy*dy>25) return;
    const r=canvas.getBoundingClientRect(); mouse.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1); ray.setFromCamera(mouse,camera);
    const hits=ray.intersectObjects(pick,false); if(hits.length) onPick(hits[0].object.userData.id); });
  canvas.addEventListener("pointermove",e=>{ const r=canvas.getBoundingClientRect(); mouse.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1); ray.setFromCamera(mouse,camera); canvas.style.cursor=ray.intersectObjects(pick,false).length?"pointer":"grab"; });

  let glass=true; function toggleGlass(){ glass=!glass; shell.material=glass?M.glass:M.glassPlain; }
  function resize(){ const w=stage.clientWidth,h=stage.clientHeight; if(!w||!h) return; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(stage); resize();

  const tmpC=new THREE.Color(), tmpC2=new THREE.Color(), cIn=new THREE.Color(), cOut=new THREE.Color();
  /* s: {Tin,Tout,T2in,T2out,Q,E,progress}; mode: charge|discharge|open */
  function frame(s, mode, dt, now){
    const charging = mode!=="discharge";
    const T0=charging?20:197; const Tin=(s.Tin>-100)?s.Tin:(charging?200:60); const p=Math.max(0,Math.min(1,s.progress||0));
    const sf=p*9.5-0.8;
    for(let i=0;i<spheres.length;i++){ const sp=spheres[i]; const dist=charging?(7-sp.k):sp.k; const w=sig((sf-dist)/0.9); let T=T0+(Tin-T0)*w; T-=(sp.ring/3)*3.0*(charging?1:-0.6);
      tempColor(T,tmpC); sphColorNow[i].lerp(tmpC,Math.min(1,dt*6)); inst.setColorAt(i,sphColorNow[i]); }
    inst.instanceColor.needsUpdate=true;
    const speed=0.16*(0.6+Math.min(1,Math.abs(s.Q||0)/900));
    const dirTop=charging?-1:1, dirBot=charging?1:-1;
    const colTop=tempColor(charging?s.Tin:s.Tout,tmpC), colBot=tempColor(charging?s.Tout:s.Tin,tmpC2);
    const hasT2 = s.T2in>-100;
    function advance(k,dir,col,spd,visible){ const im=parts[k]; im.visible=visible; if(!visible) return; const cur=curves[k]; im.material.color.copy(col).convertLinearToSRGB(); im.userData.phase=im.userData.phase.map(ph=>((ph+dir*spd*dt)%1+1)%1); im.userData.phase.forEach((ph,i)=>{ const pt=cur.getPointAt(ph); _m.makeTranslation(pt.x,pt.y,pt.z); im.setMatrixAt(i,_m); }); im.instanceMatrix.needsUpdate=true; }
    advance("top",dirTop,colTop,speed,true); advance("bottom",dirBot,colBot,speed,true);
    advance("secIn",1,tempColor(s.T2in,cIn),speed*0.9,hasT2); advance("secOut",1,tempColor(s.T2out,cOut),speed*0.9,hasT2);
    src.visible=srcBand.visible=sink.visible=hasT2; hx.visible=hasT2 || mode!=="open";
    wallGroup.children.forEach((g,i)=>{ g.position.y=g.userData.base+0.06*Math.sin(now/900+i); });
    srcBand.material.color.set(charging?0xB97708:0x1264FF);
    controls.update(); renderer.render(scene,camera); updateLabels(s,mode);
  }
  return { resetView, toggleGlass, frame, setHXLabel:(fn)=>{hxLabel=fn;}, resize };
};
})();
