import { useState, useRef, useCallback, useEffect } from "react";

function sharpenCanvas(src) {
  const tmp = document.createElement("canvas");
  tmp.width = src.width; tmp.height = src.height;
  const ctx = tmp.getContext("2d");
  ctx.drawImage(src, 0, 0);
  const id = ctx.getImageData(0, 0, tmp.width, tmp.height);
  const d = id.data, w = tmp.width, h = tmp.height;
  const out = new Uint8ClampedArray(d);
  const k = [0,-1,0,-1,5,-1,0,-1,0];
  for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++) {
    const i=(y*w+x)*4;
    for (let c=0;c<3;c++) {
      let v=0;
      for (let ky=-1;ky<=1;ky++) for (let kx=-1;kx<=1;kx++)
        v += d[((y+ky)*w+(x+kx))*4+c]*k[(ky+1)*3+(kx+1)];
      out[i+c]=Math.min(255,Math.max(0,v));
    }
    out[i+3]=d[i+3];
  }
  id.data.set(out); ctx.putImageData(id,0,0); return tmp;
}
function contrastCanvas(src, factor=1.4) {
  const tmp = document.createElement("canvas");
  tmp.width=src.width; tmp.height=src.height;
  const ctx=tmp.getContext("2d");
  ctx.filter=`contrast(${factor*100}%) brightness(105%)`;
  ctx.drawImage(src,0,0); return tmp;
}
function canvasToBase64(c) { return c.toDataURL("image/jpeg",0.95).split(",")[1]; }
function sliceImage(img, nx=2, ny=2) {
  const tw=Math.floor(img.naturalWidth/nx), th=Math.floor(img.naturalHeight/ny);
  const tiles=[];
  for(let row=0;row<ny;row++) for(let col=0;col<nx;col++){
    const c=document.createElement("canvas");
    c.width=tw; c.height=th;
    c.getContext("2d").drawImage(img, col*tw, row*th, tw, th, 0,0,tw,th);
    tiles.push({ b64:canvasToBase64(contrastCanvas(sharpenCanvas(c))), tx:(col/nx)*100, ty:(row/ny)*100, tw:100/nx, th:100/ny, col, row });
  }
  return tiles;
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}
function drawMarkers(canvas, img, objects, selectedIdx, showGrid=false, gridN=2, colorMode="red") {
  if(!canvas||!img) return;
  const ctx=canvas.getContext("2d");
  canvas.width=img.naturalWidth; canvas.height=img.naturalHeight;
  ctx.drawImage(img,0,0);
  const baseColor=colorMode==="green"?"#00cc44":colorMode==="blue"?"#0088ff":"#cc0000";
  const selColor=colorMode==="green"?"#00ff66":colorMode==="blue"?"#00aaff":"#ff2020";
  if(showGrid){
    ctx.strokeStyle="rgba(255,100,0,0.2)"; ctx.lineWidth=1; ctx.setLineDash([6,6]);
    for(let i=1;i<gridN;i++){
      ctx.beginPath();ctx.moveTo(canvas.width*i/gridN,0);ctx.lineTo(canvas.width*i/gridN,canvas.height);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,canvas.height*i/gridN);ctx.lineTo(canvas.width,canvas.height*i/gridN);ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  objects.forEach((obj,i)=>{
    if(!obj.bbox) return;
    const x=(obj.bbox.x/100)*canvas.width, y=(obj.bbox.y/100)*canvas.height;
    const bw=(obj.bbox.w/100)*canvas.width, bh=(obj.bbox.h/100)*canvas.height;
    const isSel=selectedIdx===i, alpha=selectedIdx===null||isSel?1:0.4;
    const cs=Math.min(bw,bh,24);
    ctx.save(); ctx.globalAlpha=alpha;
    if(isSel){ctx.shadowColor=selColor;ctx.shadowBlur=20;}
    ctx.fillStyle=isSel?`rgba(${colorMode==="green"?"0,200,60":colorMode==="blue"?"0,100,200":"200,20,20"},0.22)`:`rgba(${colorMode==="green"?"0,150,40":colorMode==="blue"?"0,80,160":"200,10,10"},0.1)`;
    ctx.fillRect(x,y,bw,bh);
    if(isSel)ctx.setLineDash([8,4]);
    ctx.strokeStyle=isSel?selColor:baseColor; ctx.lineWidth=isSel?2.5:1.5;
    ctx.strokeRect(x,y,bw,bh); ctx.setLineDash([]); ctx.shadowBlur=0;
    ctx.strokeStyle=isSel?selColor:baseColor; ctx.lineWidth=isSel?3:2;
    [[x,y+cs,x,y,x+cs,y],[x+bw-cs,y,x+bw,y,x+bw,y+cs],[x,y+bh-cs,x,y+bh,x+cs,y+bh],[x+bw-cs,y+bh,x+bw,y+bh,x+bw,y+bh-cs]]
    .forEach(([x1,y1,x2,y2,x3,y3])=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x3,y3);ctx.stroke();});
    const cx=x+bw/2,cy=y+bh/2,cz=isSel?8:5;
    ctx.strokeStyle=isSel?selColor:baseColor; ctx.lineWidth=isSel?2:1.5;
    ctx.beginPath();ctx.moveTo(cx-cz,cy);ctx.lineTo(cx+cz,cy);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,cy-cz);ctx.lineTo(cx,cy+cz);ctx.stroke();
    ctx.fillStyle=isSel?selColor:baseColor;
    ctx.beginPath();ctx.arc(cx,cy,isSel?4:2.5,0,Math.PI*2);ctx.fill();
    if(obj.confidence){
      const conf=Math.round(obj.confidence*100),badgeW=36,badgeH=14;
      ctx.fillStyle=conf>70?"rgba(0,160,60,0.85)":conf>40?"rgba(180,100,0,0.85)":"rgba(160,0,0,0.85)";
      roundRect(ctx,x+bw-badgeW-2,y+2,badgeW,badgeH,3);ctx.fill();
      ctx.fillStyle="#fff";ctx.font="bold 9px 'Courier New'";ctx.fillText(`${conf}%`,x+bw-badgeW+2,y+12);
    }
    const isMissing=obj.status==="MISSING";
    const label=isMissing?`! MISSING: ${obj.item}`:`#${String(i+1).padStart(2,"0")} ${obj.item}`;
    const fs=Math.max(10,Math.min(14,canvas.width/60));
    ctx.font=`bold ${fs}px 'Courier New', monospace`;
    const tw2=ctx.measureText(label).width, lh=fs+10;
    const lx=Math.min(x,canvas.width-tw2-16), ly=y-lh-3<0?y+bh+3:y-lh-3;
    if(colorMode==="red") ctx.fillStyle=isSel?"rgba(230,20,20,0.96)":"rgba(150,0,0,0.88)";
    else if(colorMode==="green") ctx.fillStyle=isMissing?"rgba(200,100,0,0.96)":isSel?"rgba(0,180,60,0.96)":"rgba(0,120,40,0.88)";
    else ctx.fillStyle=isSel?"rgba(0,100,220,0.96)":"rgba(0,80,160,0.88)";
    roundRect(ctx,lx,ly,tw2+16,lh,3);ctx.fill();
    ctx.globalAlpha=1;ctx.fillStyle="#fff";ctx.fillText(label,lx+8,ly+fs+1);
    ctx.restore();
  });
}

function useMagnifier(canvasRef, imgRef, zoom=4, radius=80) {
  const lensRef=useRef();
  const [lensPos,setLensPos]=useState(null);
  const handleMouseMove=useCallback((e)=>{
    const c=canvasRef.current; if(!c||!imgRef.current) return;
    const rect=c.getBoundingClientRect();
    const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    const ix=mx*(c.width/rect.width), iy=my*(c.height/rect.height);
    setLensPos({mx,my,ix,iy});
    const lens=lensRef.current; if(!lens) return;
    const lctx=lens.getContext("2d"), d=radius*2;
    lens.width=d; lens.height=d; lctx.save();
    lctx.beginPath();lctx.arc(radius,radius,radius,0,Math.PI*2);lctx.clip();
    lctx.drawImage(c,ix-radius/zoom,iy-radius/zoom,d/zoom,d/zoom,0,0,d,d);
    lctx.strokeStyle="rgba(255,50,50,0.9)";lctx.lineWidth=1.5;
    lctx.beginPath();lctx.moveTo(0,radius);lctx.lineTo(d,radius);lctx.stroke();
    lctx.beginPath();lctx.moveTo(radius,0);lctx.lineTo(radius,d);lctx.stroke();
    lctx.strokeStyle="#cc0000";lctx.lineWidth=2;
    lctx.beginPath();lctx.arc(radius,radius,radius-1,0,Math.PI*2);lctx.stroke();
    lctx.restore();
  },[zoom,radius]);
  const handleMouseLeave=useCallback(()=>setLensPos(null),[]);
  return {lensRef,lensPos,handleMouseMove,handleMouseLeave};
}

async function callClaude(content, maxTokens=2400) {
  const res=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:maxTokens,messages:[{role:"user",content}]})
  });
  const data=await res.json();
  if(data.error) throw new Error(data.error.message||"API error");
  return data.content?.map(b=>b.text||"").join("").replace(/```json|```/g,"").trim()||"";
}
function parseJSON(t){try{return JSON.parse(t);}catch{return [];}}

function CornerBrackets({color="#cc0000",size=12}){
  const s=p=>({position:"absolute",width:size,height:size,...p,borderColor:color,borderStyle:"solid",borderWidth:0});
  return(<><div style={{...s({top:4,left:4}),borderTopWidth:2,borderLeftWidth:2}}/><div style={{...s({top:4,right:4}),borderTopWidth:2,borderRightWidth:2}}/><div style={{...s({bottom:4,left:4}),borderBottomWidth:2,borderLeftWidth:2}}/><div style={{...s({bottom:4,right:4}),borderBottomWidth:2,borderRightWidth:2}}/></>);
}

function buildObjectPrompt(refData,query,extra=""){
  return `You are an expert forensic image analyst.\n${refData?"FIRST image=REFERENCE. SECOND image=TARGET. Find ALL instances of reference including partial/occluded.":query.trim()?`Find every instance of: "${query}". Include partial ones.`:"Identify EVERY object, text, person including small or hidden ones."}\n${extra}\nReturn JSON array: [{item,location,description,confidence(0-1),bbox:{x,y,w,h}(%0-100)}]\nOnly raw JSON array.`;
}
function buildFacePrompt(refData,extra=""){
  return refData
    ?`Expert facial recognition. FIRST=REFERENCE FACE, SECOND=TARGET SCENE.\nMatch by: eye spacing, nose shape, jaw line, face shape. Account for angles/lighting/accessories. Only confidence>0.3.\nReturn JSON: [{item("FACE MATCH"/"POSSIBLE MATCH"),location,description,matchReason,confidence,bbox:{x,y,w,h}(%0-100)}]\n${extra}\nOnly raw JSON array.`
    :`Detect ALL faces. Return JSON: [{item("FACE #N"),location,description,confidence,bbox:{x,y,w,h}(%0-100)}]\n${extra}\nOnly raw JSON array.`;
}
function buildPCBPrompt(extra=""){
  return `Expert PCB QC. FIRST=REFERENCE(complete), SECOND=TARGET(may have missing parts).\nFind components on reference MISSING from target. Check all component types.\nReturn JSON of ONLY missing: [{item,location,description,status:"MISSING",confidence,bbox:{x,y,w,h}(%of TARGET 0-100)}]\nIf nothing missing return [].\n${extra}\nOnly raw JSON array.`;
}

export default function App() {
  const [appMode,setAppMode]=useState("object");
  const [targetImg,setTargetImg]=useState(null);
  const [targetData,setTargetData]=useState(null);
  const [refImg,setRefImg]=useState(null);
  const [refData,setRefData]=useState(null);
  const [results,setResults]=useState(null);
  const [loading,setLoading]=useState(false);
  const [loadingMsg,setLoadingMsg]=useState("");
  const [error,setError]=useState(null);
  const [selectedIdx,setSelectedIdx]=useState(null);
  const [query,setQuery]=useState("");
  const [scanMode,setScanMode]=useState("deep");
  const [showGrid,setShowGrid]=useState(false);
  const [magActive,setMagActive]=useState(false);
  const [cameraActive,setCameraActive]=useState(false);
  const [progress,setProgress]=useState(0);
  const [scanLog,setScanLog]=useState([]);
  const [showLog,setShowLog]=useState(false);
  const [pcbSummary,setPcbSummary]=useState(null);
  const [mobilePanel,setMobilePanel]=useState("target");
  const [isMobile,setIsMobile]=useState(false);

  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<768);
    check(); window.addEventListener("resize",check);
    return()=>window.removeEventListener("resize",check);
  },[]);

  const targetFileRef=useRef(),refFileRef=useRef(),videoRef=useRef(),captureCanvas=useRef();
  const displayCanvas=useRef(),imgElRef=useRef(null),streamRef=useRef();
  const {lensRef,lensPos,handleMouseMove,handleMouseLeave}=useMagnifier(displayCanvas,imgElRef,5,90);
  const [,setTick]=useState(0);
  useEffect(()=>{const id=setInterval(()=>setTick(t=>t+1),1000);return()=>clearInterval(id);},[]);
  const ts=()=>{const n=new Date();return`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}:${String(n.getSeconds()).padStart(2,"0")}`;};

  const MC={
    object:{icon:"◈",label:"OBJECT FINDER",accent:"#cc0000",tLabel:"TARGET",tSub:"Image to search",rLabel:"REFERENCE",rSub:"Object to find",markerColor:"red"},
    face:  {icon:"◉",label:"FACE MATCH",   accent:"#0088ff",tLabel:"SCENE",  tSub:"Photo to search",rLabel:"REF FACE",rSub:"Person to match",markerColor:"blue"},
    pcb:   {icon:"⊞",label:"PCB COMPARE",  accent:"#00aa44",tLabel:"CHECK BOARD",tSub:"Board to inspect",rLabel:"COMPLETE BOARD",rSub:"Reference board",markerColor:"green"},
  };
  const mc=MC[appMode];

  useEffect(()=>{
    if(results&&imgElRef.current)
      drawMarkers(displayCanvas.current,imgElRef.current,results,selectedIdx,showGrid,scanMode==="ultra"?3:2,mc.markerColor);
  },[selectedIdx,results,showGrid]);

  const loadBase64=(file,cb)=>{const r=new FileReader();r.onload=e=>cb(e.target.result,e.target.result.split(",")[1]);r.readAsDataURL(file);};
  const setTarget=(src,b64)=>{
    setTargetImg(src);setTargetData(b64);setResults(null);setError(null);setSelectedIdx(null);setScanLog([]);setPcbSummary(null);
    const img=new window.Image();
    img.onload=()=>{imgElRef.current=img;const c=displayCanvas.current;if(c){c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext("2d").drawImage(img,0,0);}};
    img.src=src;
    if(window.innerWidth<768) setMobilePanel("canvas");
  };
  const handleTargetFile=f=>{if(!f||!f.type.startsWith("image/"))return;loadBase64(f,(s,b)=>setTarget(s,b));};
  const handleRefFile=f=>{if(!f||!f.type.startsWith("image/"))return;loadBase64(f,(s,b)=>{setRefImg(s);setRefData(b);});};
  const startCamera=async()=>{try{const st=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});streamRef.current=st;videoRef.current.srcObject=st;videoRef.current.play();setCameraActive(true);}catch{setError("Camera access denied.");}};
  const stopCamera=()=>{streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setCameraActive(false);};
  const captureFrame=()=>{const c=captureCanvas.current,v=videoRef.current;c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0);const url=c.toDataURL("image/jpeg",0.95);setTarget(url,url.split(",")[1]);stopCamera();};
  const getEnhancedB64=(imgEl)=>{
    const c=document.createElement("canvas");c.width=imgEl.naturalWidth;c.height=imgEl.naturalHeight;
    c.getContext("2d").drawImage(imgEl,0,0);return canvasToBase64(contrastCanvas(sharpenCanvas(c),1.35));
  };

  const analyze=async()=>{
    if(!canScan||loading) return;
    setLoading(true);setError(null);setResults(null);setSelectedIdx(null);setScanLog([]);setProgress(0);setPcbSummary(null);
    const log=[];
    const addLog=m=>{log.push(m);setScanLog([...log]);};
    const setP=p=>setProgress(p);

    try{
      const imgEl=imgElRef.current;
      const enhB64=getEnhancedB64(imgEl);

      if(appMode==="pcb"){
        const refImgEl=new window.Image();
        await new Promise(res=>{refImgEl.onload=res;refImgEl.src=refImg;});
        const refB64=getEnhancedB64(refImgEl);
        addLog("Comparing boards...");setLoadingMsg("PCB ANALYSIS");setP(20);
        const mk=(b64,ex)=>[
          {type:"image",source:{type:"base64",media_type:"image/jpeg",data:refB64}},
          {type:"text",text:"[REFERENCE COMPLETE PCB]"},
          {type:"image",source:{type:"base64",media_type:"image/jpeg",data:b64}},
          {type:"text",text:`[TARGET BOARD]\n\n${buildPCBPrompt(ex||"")}`}
        ];
        let missing=parseJSON(await callClaude(mk(enhB64)));
        addLog(`First pass: ${missing.length} missing.`);setP(55);
        if(scanMode!=="quick"){
          for(const tile of sliceImage(imgEl,2,2)){
            const te=`Tile ${tile.tx.toFixed(0)}-${(tile.tx+tile.tw).toFixed(0)}%x${tile.ty.toFixed(0)}-${(tile.ty+tile.th).toFixed(0)}%. x_full=${tile.tx.toFixed(1)}+(x*${tile.tw.toFixed(1)}/100),y_full=${tile.ty.toFixed(1)}+(y*${tile.th.toFixed(1)}/100)`;
            parseJSON(await callClaude(mk(tile.b64,te))).forEach(o=>{
              if(!o.bbox||(o.confidence||0)<0.35)return;
              if(!missing.find(e=>e.bbox&&Math.abs(e.bbox.x-o.bbox.x)<12&&Math.abs(e.bbox.y-o.bbox.y)<12))missing.push(o);
            });
            addLog(`Tile [${tile.col+1},${tile.row+1}] scanned.`);
          }
        }
        missing=missing.filter(o=>o.bbox&&(o.confidence||0.5)>0.3).sort((a,b)=>(b.confidence||0)-(a.confidence||0));
        missing.forEach(o=>o.status="MISSING");
        setP(100);addLog(`Done: ${missing.length} missing part(s).`);
        setResults(missing);setPcbSummary({total:missing.length,highConf:missing.filter(o=>(o.confidence||0)>0.7).length});
        const img=new window.Image();img.onload=()=>{imgElRef.current=img;drawMarkers(displayCanvas.current,img,missing,null,false,2,"green");};img.src=targetImg;
        if(window.innerWidth<768) setMobilePanel("results");
        return;
      }

      const buildContent=(b64,tile,extra="")=>{
        const imgData=tile?tile.b64:b64;
        const prompt=appMode==="face"?buildFacePrompt(refData,extra):buildObjectPrompt(refData,query,extra);
        const tag=tile?"[TILE]":"[TARGET]";
        return refData
          ?[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:refData}},{type:"text",text:appMode==="face"?"[REFERENCE FACE]":"[REFERENCE]"},{type:"image",source:{type:"base64",media_type:"image/jpeg",data:imgData}},{type:"text",text:`${tag}\n\n${prompt}`}]
          :[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:imgData}},{type:"text",text:prompt}];
      };

      addLog(`Starting ${appMode} scan...`);setLoadingMsg(appMode==="face"?"FACE SCAN":"SCANNING");setP(10);
      let all=[];

      if(scanMode==="quick"){
        all=parseJSON(await callClaude(buildContent(enhB64,null)));
        setP(100);addLog(`Quick: ${all.length} found.`);
      } else {
        const gridN=scanMode==="ultra"?3:2,tiles=sliceImage(imgEl,gridN,gridN),total=tiles.length+1;let done=0;
        addLog(`${scanMode.toUpperCase()}: ${total} zones`);
        all.push(...parseJSON(await callClaude(buildContent(enhB64,null,"Full-frame pass."))));
        done++;setP(Math.round((done/total)*90));addLog(`Full-frame: ${all.length}`);
        for(const tile of tiles){
          const te=`Tile ${tile.tx.toFixed(0)}-${(tile.tx+tile.tw).toFixed(0)}%x${tile.ty.toFixed(0)}-${(tile.ty+tile.th).toFixed(0)}%. x_full=${tile.tx.toFixed(1)}+(x*${tile.tw.toFixed(1)}/100),y_full=${tile.ty.toFixed(1)}+(y*${tile.th.toFixed(1)}/100)`;
          const to=parseJSON(await callClaude(buildContent(null,tile,te))).filter(o=>{
            if(!o.bbox||(o.confidence||0)<0.25)return false;
            return !all.some(ex=>ex.bbox&&Math.abs(ex.bbox.x-o.bbox.x)<8&&Math.abs(ex.bbox.y-o.bbox.y)<8);
          });
          all.push(...to);done++;setP(Math.round((done/total)*90));addLog(`[${tile.col+1},${tile.row+1}]: +${to.length}`);
        }
        const deduped=[];
        all.forEach(o=>{if(!o.bbox)return;const d=deduped.find(e=>e.bbox&&Math.abs(e.bbox.x-o.bbox.x)<7&&Math.abs(e.bbox.y-o.bbox.y)<7);if(!d)deduped.push(o);else if((o.confidence||0)>(d.confidence||0))Object.assign(d,o);});
        all=deduped.sort((a,b)=>(b.confidence||0)-(a.confidence||0));
        setP(100);addLog(`Done: ${all.length}`);
      }

      all=all.filter(o=>o.bbox&&(o.confidence||0.5)>0.25);
      setResults(all);setShowGrid(scanMode!=="quick");
      const img=new window.Image();
      img.onload=()=>{imgElRef.current=img;drawMarkers(displayCanvas.current,img,all,null,scanMode!=="quick",scanMode==="ultra"?3:2,mc.markerColor);};
      img.src=targetImg;
      if(window.innerWidth<768) setMobilePanel("results");
    }catch(e){setError("Scan failed: "+e.message);}
    setLoading(false);setLoadingMsg("");
  };

  const canScan=appMode==="pcb"?(targetData&&refData):appMode==="face"?!!targetData:(targetData&&(refData||query.trim()));
  const clearAll=()=>{
    setResults(null);setSelectedIdx(null);setError(null);setScanLog([]);setProgress(0);setPcbSummary(null);
    if(imgElRef.current){const c=displayCanvas.current;if(c){c.width=imgElRef.current.naturalWidth;c.height=imgElRef.current.naturalHeight;c.getContext("2d").drawImage(imgElRef.current,0,0);}}
  };
  const handleCanvasClick=e=>{
    if(!results||!displayCanvas.current)return;
    const rect=displayCanvas.current.getBoundingClientRect();
    const px=(e.clientX-rect.left)/rect.width,py=(e.clientY-rect.top)/rect.height;
    const hit=results.findIndex(r=>{if(!r.bbox)return false;return px>=r.bbox.x/100&&px<=(r.bbox.x+r.bbox.w)/100&&py>=r.bbox.y/100&&py<=(r.bbox.y+r.bbox.h)/100;});
    setSelectedIdx(hit===-1?null:selectedIdx===hit?null:hit);
    if(hit!==-1&&window.innerWidth<768) setMobilePanel("results");
  };
  const confColor=c=>c>0.7?"#00cc44":c>0.4?"#ff8800":"#cc2020";

  const sharedStyles=`
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
    @keyframes scanBar{0%{top:-4px;opacity:0}15%{opacity:1}85%{opacity:1}100%{top:100%;opacity:0}}
    @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
    *{box-sizing:border-box;}
    body{margin:0;padding:0;}
    ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#330000}
    input,button{-webkit-tap-highlight-color:transparent;font-family:'Courier New',monospace;}
    .rcard:hover,.rcard:active{background:#0d0303!important}
    .ibtn-g:hover{background:#111!important;border-color:#333!important}
    .mode-tab{transition:all 0.2s;cursor:pointer;border:none;background:transparent;}
    .scan-btn{transition:all 0.2s;cursor:pointer;border:1px solid #222;background:transparent;}
    .scan-btn.active{background:#0d0000!important;border-color:#cc0000!important;color:#ff4040!important}
  `;

  /* ── MOBILE ── */
  if(isMobile) return (
    <div style={{height:"100dvh",background:"#060606",color:"#ddd0a8",fontFamily:"'Courier New',monospace",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{sharedStyles}</style>
      {/* Header */}
      <div style={{background:"#090909",borderBottom:"1px solid #161616",padding:"8px 12px",flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:15,fontWeight:"bold",color:mc.accent,letterSpacing:2}}>{mc.icon} {mc.label}</div>
          <div style={{fontSize:8,color:"#444",animation:loading?"pulse 1s infinite":"none"}}>{loading?`◉ ${loadingMsg}...`:ts()}</div>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:6}}>
          {[["object","◈ OBJ"],["face","◉ FACE"],["pcb","⊞ PCB"]].map(([m,lbl])=>(
            <button key={m} onClick={()=>{if(m!==appMode){setAppMode(m);clearAll();setRefImg(null);setRefData(null);setQuery("");}}}
              style={{flex:1,padding:"6px 0",background:"transparent",border:`1px solid ${appMode===m?MC[m].accent:"#1a1a1a"}`,color:appMode===m?MC[m].accent:"#444",fontSize:9,letterSpacing:1,cursor:"pointer"}}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:4}}>
          {[["target","SETUP"],["canvas","CANVAS"],["results",`RESULTS${results?` (${results.length})`:""}`]].map(([p,lbl])=>(
            <button key={p} onClick={()=>setMobilePanel(p)}
              style={{flex:1,padding:"5px 0",background:mobilePanel===p?"#0d0000":"transparent",border:`1px solid ${mobilePanel===p?mc.accent:"#1a1a1a"}`,color:mobilePanel===p?mc.accent:"#444",fontSize:8,letterSpacing:1,cursor:"pointer"}}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      {loading&&<div style={{height:2,background:"#111",flexShrink:0}}><div style={{height:"100%",background:mc.accent,width:`${progress}%`,transition:"width 0.3s ease"}}/></div>}

      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {mobilePanel==="target"&&(
          <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:10}}>
            <div>
              <div style={{fontSize:8,color:mc.accent,letterSpacing:2,marginBottom:5}}>{mc.tLabel} — {mc.tSub}</div>
              <div style={{position:"relative",height:165,border:"1px solid #1a1a1a",background:"#090909",overflow:"hidden",borderRadius:3}}
                onClick={()=>!cameraActive&&targetFileRef.current.click()}
                onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleTargetFile(e.dataTransfer.files[0]);}}>
                <CornerBrackets color={mc.accent}/>
                <video ref={videoRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:cameraActive?"block":"none"}}/>
                {targetImg&&!cameraActive&&<img src={targetImg} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}}/>}
                {!targetImg&&!cameraActive&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#222"}}>
                  <div style={{fontSize:36,marginBottom:6}}>📷</div>
                  <div style={{fontSize:9,letterSpacing:2}}>TAP TO SELECT IMAGE</div>
                </div>}
                {loading&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
                  <div style={{position:"relative",width:36,height:36,border:`1px solid ${mc.accent}`,overflow:"hidden"}}>
                    <div style={{position:"absolute",left:0,right:0,height:3,background:`linear-gradient(90deg,transparent,${mc.accent},transparent)`,animation:"scanBar 0.8s linear infinite"}}/>
                  </div>
                  <div style={{fontSize:8,color:mc.accent,letterSpacing:2,animation:"pulse 0.6s infinite"}}>{loadingMsg}</div>
                </div>}
              </div>
              <input ref={targetFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleTargetFile(e.target.files[0])}/>
              <canvas ref={captureCanvas} style={{display:"none"}}/>
              <div style={{display:"flex",gap:6,marginTop:6}}>
                <button onClick={cameraActive?captureFrame:startCamera}
                  style={{flex:1,padding:"9px 0",background:"transparent",border:`1px solid ${cameraActive?"#cc0000":"#1e1e1e"}`,color:cameraActive?"#cc0000":"#555",fontSize:9,letterSpacing:2,cursor:"pointer"}}>
                  {cameraActive?"◉ CAPTURE":"📷 CAMERA"}
                </button>
                {cameraActive&&<button onClick={stopCamera} style={{padding:"9px 14px",background:"transparent",border:"1px solid #1e1e1e",color:"#555",fontSize:9,cursor:"pointer"}}>✕</button>}
              </div>
            </div>
            <div>
              <div style={{fontSize:8,color:mc.accent,letterSpacing:2,marginBottom:5}}>{mc.rLabel} — {mc.rSub}{appMode!=="pcb"?" (OPTIONAL)":""}</div>
              <div style={{position:"relative",height:130,border:`1px solid ${refImg?"#222":"#131313"}`,background:"#090909",overflow:"hidden",borderRadius:3}}
                onClick={()=>refFileRef.current.click()}
                onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleRefFile(e.dataTransfer.files[0]);}}>
                <CornerBrackets color={mc.accent}/>
                {refImg?<img src={refImg} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}}/>
                  :<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#1e1e1e"}}>
                    <div style={{fontSize:26,marginBottom:4}}>{mc.icon}</div>
                    <div style={{fontSize:8,letterSpacing:2}}>TAP TO SELECT</div>
                  </div>}
              </div>
              <input ref={refFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleRefFile(e.target.files[0])}/>
              {refImg&&<button onClick={()=>{setRefImg(null);setRefData(null);}}
                style={{width:"100%",marginTop:5,padding:"6px 0",background:"transparent",border:"1px solid #1c1c1c",color:"#555",fontSize:8,letterSpacing:2,cursor:"pointer"}}>✕ REMOVE</button>}
            </div>
            {appMode==="object"&&<div>
              <div style={{fontSize:8,color:"#2a2a2a",letterSpacing:2,marginBottom:4}}>TEXT QUERY (optional)</div>
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. red bag, missing component..."
                style={{width:"100%",background:"#0b0b0b",border:"1px solid #1c1c1c",color:"#ddd0a8",padding:"9px",fontSize:13,outline:"none",borderRadius:2}}/>
            </div>}
            {appMode!=="pcb"&&<div>
              <div style={{fontSize:8,color:"#2a2a2a",letterSpacing:2,marginBottom:4}}>SCAN MODE</div>
              <div style={{display:"flex",gap:4}}>
                {[["quick","▶ QUICK"],["deep","◈ DEEP"],["ultra","◉ ULTRA"]].map(([m,lbl])=>(
                  <button key={m} onClick={()=>setScanMode(m)}
                    style={{flex:1,padding:"8px 0",background:scanMode===m?"#0d0000":"transparent",border:`1px solid ${scanMode===m?"#cc0000":"#1a1a1a"}`,color:scanMode===m?"#ff4040":"#444",fontSize:8,letterSpacing:1,cursor:"pointer"}}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>}
            <button onClick={analyze} disabled={!canScan||loading}
              style={{width:"100%",padding:15,background:"transparent",border:`2px solid ${canScan?mc.accent:"#181818"}`,color:canScan?mc.accent:"#2a2a2a",fontSize:11,letterSpacing:3,cursor:canScan?"pointer":"not-allowed",borderRadius:2,marginTop:4}}>
              {loading?"■ SCANNING...":appMode==="pcb"?"⊞ COMPARE BOARDS":appMode==="face"?"◉ SCAN FACES":"▶ IDENTIFY & MARK"}
            </button>
            {results&&<button onClick={clearAll}
              style={{width:"100%",padding:9,background:"transparent",border:"1px solid #181818",color:"#444",fontSize:8,letterSpacing:3,cursor:"pointer",borderRadius:2}}>
              ✕ CLEAR RESULTS
            </button>}
          </div>
        )}
        {mobilePanel==="canvas"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {pcbSummary&&<div style={{padding:"6px 12px",background:"#030a06",borderBottom:"1px solid #0a2010",fontSize:9,color:pcbSummary.total>0?"#ff6600":"#00cc44",flexShrink:0}}>
              {pcbSummary.total===0?"✓ ALL COMPONENTS PRESENT":` ⚠ ${pcbSummary.total} MISSING (${pcbSummary.highConf} confirmed)`}
            </div>}
            <div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",padding:8,background:"#040404"}}>
              {targetImg
                ?<canvas ref={displayCanvas} onClick={handleCanvasClick} style={{maxWidth:"100%",maxHeight:"100%",display:"block",border:"1px solid #161616",cursor:results?"crosshair":"default",touchAction:"manipulation"}}/>
                :<div style={{textAlign:"center",color:"#1a1a1a"}}>
                  <div style={{fontSize:48,marginBottom:10}}>{mc.icon}</div>
                  <div style={{fontSize:9,letterSpacing:2}}>LOAD IMAGE IN SETUP TAB</div>
                </div>}
            </div>
            {results&&<div style={{padding:"6px 12px",borderTop:"1px solid #131313",fontSize:8,color:mc.accent,flexShrink:0,textAlign:"center"}}>
              TAP A MARKER TO SEE DETAILS IN RESULTS TAB
            </div>}
          </div>
        )}
        {mobilePanel==="results"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"6px 12px",borderBottom:"1px solid #0e0e0e",display:"flex",justifyContent:"space-between",flexShrink:0}}>
              <div style={{fontSize:8,color:"#444",letterSpacing:2}}>{appMode==="pcb"?"MISSING PARTS":appMode==="face"?"FACE LOG":"OBJECT LOG"}</div>
              {results&&<div style={{fontSize:8,color:mc.accent}}>{results.length} FOUND</div>}
            </div>
            <div style={{flex:1,overflowY:"auto"}}>
              {error&&<div style={{margin:10,padding:10,border:"1px solid #550000",color:"#ff5555",fontSize:9,lineHeight:1.6,borderRadius:2}}>⚠ {error}</div>}
              {loading&&<div style={{padding:16,color:"#444",fontSize:8,lineHeight:1.9}}>
                <div style={{color:mc.accent,marginBottom:8,animation:"pulse 0.8s infinite"}}>◉ SCANNING...</div>
                {scanLog.map((l,i)=><div key={i} style={{color:i===scanLog.length-1?"#775555":"#2a2a2a",marginBottom:3}}>▶ {l}</div>)}
              </div>}
              {!results&&!loading&&!error&&<div style={{padding:24,color:"#1a1a1a",textAlign:"center",lineHeight:3,fontSize:9,letterSpacing:1}}>
                <div style={{fontSize:36,marginBottom:8}}>{mc.icon}</div>LOAD IMAGES IN SETUP<br/>THEN PRESS SCAN
              </div>}
              {results&&results.length===0&&<div style={{padding:24,textAlign:"center",color:mc.accent,fontSize:10,letterSpacing:1,lineHeight:2}}>
                <div style={{fontSize:32,marginBottom:8}}>✓</div>
                {appMode==="pcb"?"ALL COMPONENTS PRESENT":appMode==="face"?"NO MATCHING FACES":"NO OBJECTS FOUND"}
              </div>}
              {results&&results.map((r,i)=>(
                <div key={i} className="rcard" onClick={()=>{setSelectedIdx(selectedIdx===i?null:i);setMobilePanel("canvas");}}
                  style={{padding:"11px 14px",borderBottom:"1px solid #0e0e0e",cursor:"pointer",background:selectedIdx===i?"#0d0303":"transparent",borderLeft:`3px solid ${selectedIdx===i?mc.accent:"transparent"}`,animation:`fadeUp 0.2s ease ${i*0.03}s both`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                    <div style={{fontSize:13,fontWeight:"bold",color:selectedIdx===i?mc.accent:r.status==="MISSING"?"#ff6600":"#aaa",flex:1,marginRight:8,wordBreak:"break-word"}}>{r.item}</div>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      {r.confidence!=null&&<div style={{fontSize:9,color:confColor(r.confidence),border:`1px solid ${confColor(r.confidence)}`,padding:"2px 5px"}}>{Math.round(r.confidence*100)}%</div>}
                      {r.status==="MISSING"&&<div style={{fontSize:8,background:"#1a0800",color:"#ff6600",padding:"2px 6px",border:"1px solid #441800"}}>MISS</div>}
                    </div>
                  </div>
                  <div style={{fontSize:9,color:"#555",letterSpacing:1,marginBottom:3}}>⊕ {r.location}</div>
                  <div style={{fontSize:9,color:"#777",lineHeight:1.5}}>{r.description}</div>
                  {r.matchReason&&<div style={{marginTop:5,fontSize:9,color:"#0077bb"}}>🔍 {r.matchReason}</div>}
                  <div style={{fontSize:8,color:"#333",marginTop:5}}>↗ TAP TO VIEW ON CANVAS</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* ── DESKTOP ── */
  return (
    <div style={{height:"100vh",background:"#060606",color:"#ddd0a8",fontFamily:"'Courier New',monospace",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{sharedStyles}</style>
      <div style={{background:"#080808",borderBottom:"1px solid #161616",flexShrink:0}}>
        <div style={{padding:"8px 18px 0",display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <div>
              <div style={{fontSize:8,color:"#2a2a2a",letterSpacing:4}}>FORENSIC VISION SYSTEM v4.0</div>
              <div style={{fontSize:17,fontWeight:"bold",color:mc.accent,letterSpacing:3}}>{mc.icon} {mc.label}</div>
            </div>
            <div style={{width:1,height:28,background:"#1a1a1a",marginBottom:4}}/>
            <div style={{display:"flex",gap:0,alignItems:"flex-end"}}>
              {[["object","◈ OBJECT"],["face","◉ FACE"],["pcb","⊞ PCB"]].map(([m,lbl])=>(
                <button key={m} className="mode-tab"
                  onClick={()=>{if(m!==appMode){setAppMode(m);clearAll();setRefImg(null);setRefData(null);setQuery("");}}}
                  style={{padding:"6px 16px",borderBottom:`2px solid ${appMode===m?MC[m].accent:"transparent"}`,color:appMode===m?MC[m].accent:"#444",fontSize:9,letterSpacing:2,fontWeight:appMode===m?"bold":"normal"}}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div style={{textAlign:"right",fontSize:9,color:"#333",lineHeight:1.8,paddingBottom:6}}>
            <div style={{color:results?mc.accent:"#444",animation:loading?"pulse 2s infinite":"none"}}>{loading?`◉ ${loadingMsg||"SCANNING"}...`:results?`◉ ${results.length} RESULTS`:""}</div>
            <div style={{animation:"blink 1s infinite",color:"#222"}}>{ts()}</div>
          </div>
        </div>
        <div style={{padding:"5px 18px",display:"flex",alignItems:"center",gap:12,borderTop:"1px solid #0f0f0f"}}>
          {appMode!=="pcb"&&<>
            <div style={{fontSize:8,color:"#2a2a2a",letterSpacing:2}}>SCAN MODE</div>
            <div style={{display:"flex",gap:4}}>
              {[["quick","▶ QUICK","1 pass"],["deep","◈ DEEP","4 zones"],["ultra","◉ ULTRA","10 zones"]].map(([m,label,sub])=>(
                <button key={m} className={`scan-btn${scanMode===m?" active":""}`} onClick={()=>setScanMode(m)}
                  style={{padding:"3px 10px",color:scanMode===m?"#ff4040":"#444",fontSize:8,letterSpacing:1}}>
                  <div>{label}</div><div style={{fontSize:7,color:scanMode===m?"#aa2020":"#333"}}>{sub}</div>
                </button>
              ))}
            </div>
            <div style={{width:1,height:20,background:"#1a1a1a"}}/>
          </>}
          <button className="ibtn-g" onClick={()=>setMagActive(v=>!v)}
            style={{padding:"3px 10px",background:"transparent",border:`1px solid ${magActive?"#333":"#1c1c1c"}`,color:magActive?"#999":"#333",fontSize:8,letterSpacing:1,cursor:"pointer"}}>
            🔍 {magActive?"MAG ON":"MAG OFF"}
          </button>
          {results&&<button className="ibtn-g" onClick={()=>{setShowGrid(v=>!v);if(imgElRef.current)drawMarkers(displayCanvas.current,imgElRef.current,results,selectedIdx,!showGrid,2,mc.markerColor);}}
            style={{padding:"3px 10px",background:"transparent",border:`1px solid ${showGrid?"#333":"#1c1c1c"}`,color:showGrid?"#999":"#333",fontSize:8,letterSpacing:1,cursor:"pointer"}}>
            ⊞ {showGrid?"GRID ON":"GRID OFF"}
          </button>}
          {results&&<button className="ibtn-g" onClick={()=>setShowLog(v=>!v)}
            style={{padding:"3px 10px",background:"transparent",border:"1px solid #1c1c1c",color:"#444",fontSize:8,letterSpacing:1,cursor:"pointer"}}>
            ≡ LOG
          </button>}
        </div>
      </div>

      {loading&&<div style={{height:2,background:"#111",flexShrink:0}}><div style={{height:"100%",background:mc.accent,width:`${progress}%`,transition:"width 0.4s ease"}}/></div>}

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* LEFT */}
        <div style={{width:215,borderRight:"1px solid #131313",display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"7px 12px",borderBottom:"1px solid #131313"}}>
            <div style={{fontSize:8,color:mc.accent,letterSpacing:3,marginBottom:1}}>01 // {mc.tLabel}</div>
            <div style={{fontSize:9,color:"#555"}}>{mc.tSub}</div>
          </div>
          <div style={{padding:8,flexShrink:0}}>
            <div style={{position:"relative",height:140,cursor:"pointer",border:"1px solid #1a1a1a",background:"#090909",overflow:"hidden"}}
              onClick={()=>!cameraActive&&targetFileRef.current.click()}
              onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleTargetFile(e.dataTransfer.files[0]);}}>
              <CornerBrackets color={mc.accent}/>
              <video ref={videoRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:cameraActive?"block":"none"}}/>
              {targetImg&&!cameraActive&&<img src={targetImg} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}}/>}
              {!targetImg&&!cameraActive&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#1e1e1e"}}>
                <div style={{fontSize:22,marginBottom:4}}>▣</div><div style={{fontSize:8,letterSpacing:2}}>DROP / CLICK</div>
              </div>}
              {loading&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}>
                <div style={{position:"relative",width:30,height:30,border:`1px solid ${mc.accent}`,overflow:"hidden"}}>
                  <div style={{position:"absolute",left:0,right:0,height:3,background:`linear-gradient(90deg,transparent,${mc.accent},transparent)`,animation:"scanBar 0.8s linear infinite"}}/>
                </div>
                <div style={{fontSize:7,color:mc.accent,letterSpacing:2,animation:"pulse 0.6s infinite"}}>{loadingMsg||"SCANNING"}</div>
              </div>}
            </div>
            <input ref={targetFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleTargetFile(e.target.files[0])}/>
            <canvas ref={captureCanvas} style={{display:"none"}}/>
          </div>
          <div style={{padding:"0 8px",display:"flex",gap:5,flexShrink:0}}>
            <button className="ibtn-g" onClick={cameraActive?captureFrame:startCamera}
              style={{flex:1,padding:"5px 0",background:"transparent",border:`1px solid ${cameraActive?"#cc0000":"#1e1e1e"}`,color:cameraActive?"#cc0000":"#444",fontSize:7,letterSpacing:2,cursor:"pointer"}}>
              {cameraActive?"◉ CAPTURE":"▶ CAMERA"}
            </button>
            {cameraActive&&<button className="ibtn-g" onClick={stopCamera} style={{padding:"5px 8px",background:"transparent",border:"1px solid #1e1e1e",color:"#555",fontSize:7,cursor:"pointer"}}>✕</button>}
          </div>
          <div style={{flex:1}}/>
          {appMode==="object"&&<div style={{padding:"8px",borderTop:"1px solid #131313"}}>
            <div style={{fontSize:8,color:"#2a2a2a",letterSpacing:2,marginBottom:4}}>// TEXT QUERY (optional)</div>
            <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyze()} placeholder="e.g. red bag, person..."
              style={{width:"100%",background:"#0b0b0b",border:"1px solid #1c1c1c",color:"#ddd0a8",padding:"5px 8px",fontSize:9,outline:"none"}}/>
          </div>}
          {appMode==="face"&&!refData&&<div style={{padding:"8px 12px",borderTop:"1px solid #131313"}}><div style={{fontSize:8,color:"#0055aa",lineHeight:1.7}}>ℹ No reference = detect all faces</div></div>}
          {appMode==="pcb"&&!refData&&<div style={{padding:"8px 12px",borderTop:"1px solid #131313"}}><div style={{fontSize:8,color:"#006633",lineHeight:1.7}}>⊞ Load complete PCB on right panel</div></div>}
          <div style={{padding:"8px"}}>
            <button onClick={analyze} disabled={!canScan||loading}
              style={{width:"100%",padding:10,background:"transparent",border:`2px solid ${canScan?mc.accent:"#181818"}`,color:canScan?mc.accent:"#2a2a2a",fontSize:9,letterSpacing:3,cursor:canScan?"pointer":"not-allowed",transition:"all 0.2s"}}>
              {loading?"■ SCANNING...":appMode==="pcb"?"⊞ COMPARE BOARDS":appMode==="face"?"◉ SCAN FACES":"▶ IDENTIFY & MARK"}
            </button>
          </div>
          {results&&<div style={{padding:"0 8px 8px"}}>
            <button className="ibtn-g" onClick={clearAll} style={{width:"100%",padding:6,background:"transparent",border:"1px solid #181818",color:"#444",fontSize:7,letterSpacing:3,cursor:"pointer"}}>✕ CLEAR</button>
          </div>}
        </div>

        {/* CENTER */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:"#040404"}}>
          <div style={{padding:"5px 14px",borderBottom:"1px solid #131313",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
            <div style={{fontSize:8,color:"#333",letterSpacing:2}}>// DETECTION CANVAS</div>
            {results&&<div style={{fontSize:8,color:mc.accent}}>◉ {results.length} {appMode==="pcb"?"MISSING":appMode==="face"?"FACES":"OBJECTS"} — CLICK TO INSPECT</div>}
          </div>
          {pcbSummary&&<div style={{padding:"5px 14px",background:"#030a06",borderBottom:"1px solid #0a2010",fontSize:9,color:pcbSummary.total>0?"#ff6600":"#00cc44",flexShrink:0}}>
            {pcbSummary.total===0?"✓ ALL COMPONENTS PRESENT":` ⚠ ${pcbSummary.total} MISSING (${pcbSummary.highConf} high confidence)`}
          </div>}
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",overflow:"auto",padding:12,position:"relative"}}
            onMouseLeave={()=>{if(magActive)handleMouseLeave();}}>
            {targetImg?<div style={{position:"relative"}}>
              <canvas ref={displayCanvas} onClick={handleCanvasClick}
                onMouseMove={magActive?handleMouseMove:undefined}
                onMouseLeave={magActive?handleMouseLeave:undefined}
                style={{maxWidth:"100%",maxHeight:"calc(100vh - 170px)",display:"block",border:"1px solid #161616",cursor:results?"crosshair":"default"}}/>
              {magActive&&lensPos&&<div style={{position:"fixed",left:lensPos.mx+22,top:lensPos.my-90,zIndex:100,pointerEvents:"none",filter:"drop-shadow(0 4px 16px rgba(0,0,0,0.9))"}}>
                <canvas ref={lensRef} width={180} height={180} style={{borderRadius:"50%",display:"block"}}/>
                <div style={{textAlign:"center",fontSize:8,color:mc.accent,marginTop:4,letterSpacing:2}}>×5 ZOOM</div>
              </div>}
            </div>:<div style={{textAlign:"center",color:"#141414"}}>
              <div style={{fontSize:52,marginBottom:10}}>{mc.icon}</div>
              <div style={{fontSize:9,letterSpacing:3}}>LOAD TARGET IMAGE</div>
            </div>}
          </div>
          {showLog&&scanLog.length>0&&<div style={{height:85,borderTop:"1px solid #131313",overflowY:"auto",background:"#050505",padding:"4px 0",flexShrink:0}}>
            {scanLog.map((l,i)=><div key={i} style={{padding:"2px 14px",fontSize:8,color:i===scanLog.length-1?"#aa3333":"#333",letterSpacing:1}}>▶ {l}</div>)}
          </div>}
        </div>

        {/* RIGHT */}
        <div style={{width:250,borderLeft:"1px solid #131313",display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"7px 12px",borderBottom:"1px solid #131313"}}>
            <div style={{fontSize:8,color:mc.accent,letterSpacing:3,marginBottom:1}}>02 // {mc.rLabel}</div>
            <div style={{fontSize:9,color:"#555"}}>{mc.rSub}</div>
          </div>
          <div style={{padding:8,flexShrink:0}}>
            <div style={{position:"relative",height:148,cursor:"pointer",border:`1px solid ${refImg?"#1f1f1f":"#131313"}`,background:"#090909",overflow:"hidden"}}
              onClick={()=>refFileRef.current.click()}
              onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleRefFile(e.dataTransfer.files[0]);}}>
              <CornerBrackets color={mc.accent}/>
              {refImg?<img src={refImg} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}}/>
                :<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#1e1e1e"}}>
                  <div style={{fontSize:22,marginBottom:4}}>{mc.icon}</div><div style={{fontSize:8,letterSpacing:2}}>DROP / CLICK</div>
                </div>}
            </div>
            <input ref={refFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleRefFile(e.target.files[0])}/>
          </div>
          {refImg&&<div style={{padding:"0 8px 8px",display:"flex",gap:5}}>
            <button className="ibtn-g" onClick={()=>refFileRef.current.click()} style={{flex:1,padding:"4px 0",background:"transparent",border:"1px solid #1c1c1c",color:"#555",fontSize:7,letterSpacing:2,cursor:"pointer"}}>↺ CHANGE</button>
            <button className="ibtn-g" onClick={()=>{setRefImg(null);setRefData(null);}} style={{padding:"4px 8px",background:"transparent",border:"1px solid #1c1c1c",color:"#555",fontSize:7,cursor:"pointer"}}>✕</button>
          </div>}
          <div style={{borderTop:"1px solid #131313",flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"5px 12px",borderBottom:"1px solid #0e0e0e",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div style={{fontSize:8,color:"#333",letterSpacing:2}}>{appMode==="pcb"?"MISSING PARTS":appMode==="face"?"FACE LOG":"OBJECT LOG"}</div>
              {results&&<div style={{fontSize:8,color:mc.accent}}>{results.length} FOUND</div>}
            </div>
            <div style={{flex:1,overflowY:"auto"}}>
              {error&&<div style={{margin:10,padding:10,border:"1px solid #550000",color:"#ff5555",fontSize:9,lineHeight:1.6}}>⚠ {error}</div>}
              {!results&&!loading&&!error&&<div style={{padding:16,color:"#1a1a1a",textAlign:"center",lineHeight:2.5,fontSize:8,letterSpacing:1}}>
                <div style={{fontSize:26,marginBottom:8}}>{mc.icon}</div>LOAD IMAGES<br/>PRESS SCAN
              </div>}
              {loading&&<div style={{padding:16,color:"#444",fontSize:8,lineHeight:1.9}}>
                <div style={{color:mc.accent,marginBottom:8,animation:"pulse 0.8s infinite"}}>◉ SCANNING...</div>
                {scanLog.map((l,i)=><div key={i} style={{color:i===scanLog.length-1?"#775555":"#2a2a2a",marginBottom:3}}>▶ {l}</div>)}
              </div>}
              {results&&results.length===0&&<div style={{padding:20,textAlign:"center",color:mc.accent,fontSize:9,letterSpacing:1,lineHeight:2}}>
                <div style={{fontSize:26,marginBottom:8}}>✓</div>
                {appMode==="pcb"?"ALL COMPONENTS PRESENT":appMode==="face"?"NO FACES FOUND":"NONE FOUND"}
              </div>}
              {results&&results.map((r,i)=>(
                <div key={i} className="rcard" onClick={()=>setSelectedIdx(selectedIdx===i?null:i)}
                  style={{padding:"8px 12px",borderBottom:"1px solid #0e0e0e",cursor:"pointer",background:selectedIdx===i?"#080808":"transparent",borderLeft:`3px solid ${selectedIdx===i?mc.accent:"transparent"}`,animation:`fadeUp 0.2s ease ${i*0.03}s both`,transition:"all 0.15s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3}}>
                    <div style={{fontSize:10,fontWeight:"bold",color:selectedIdx===i?mc.accent:r.status==="MISSING"?"#ff6600":"#999",flex:1,marginRight:6,wordBreak:"break-word"}}>{r.item}</div>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      {r.confidence!=null&&<div style={{fontSize:8,color:confColor(r.confidence),border:`1px solid ${confColor(r.confidence)}`,padding:"1px 4px"}}>{Math.round(r.confidence*100)}%</div>}
                      {r.status==="MISSING"?<div style={{fontSize:7,background:"#1a0800",color:"#ff6600",padding:"1px 5px",border:"1px solid #441800"}}>MISS</div>
                        :<div style={{fontSize:7,background:selectedIdx===i?"#111":"#100000",color:selectedIdx===i?mc.accent:"#660000",padding:"1px 4px",border:`1px solid ${selectedIdx===i?mc.accent:"#220000"}`}}>#{String(i+1).padStart(2,"0")}</div>}
                    </div>
                  </div>
                  <div style={{fontSize:8,color:"#444",letterSpacing:1,marginBottom:3}}>⊕ {r.location}</div>
                  <div style={{fontSize:8,color:"#666",lineHeight:1.4}}>{r.description}</div>
                  {r.matchReason&&selectedIdx===i&&<div style={{marginTop:5,fontSize:8,color:"#0077bb",lineHeight:1.5,borderTop:"1px solid #0a1520",paddingTop:5}}>🔍 {r.matchReason}</div>}
                  {r.details&&selectedIdx===i&&<div style={{marginTop:5,fontSize:8,color:"#555",lineHeight:1.5,borderTop:"1px solid #1a0808",paddingTop:5}}>{r.details}</div>}
                </div>
              ))}
            </div>
            {results&&<div style={{padding:"5px 12px",borderTop:"1px solid #0e0e0e",fontSize:8,color:selectedIdx!==null?mc.accent:"#2a2a2a"}}>
              {selectedIdx!==null?`▶ ${results[selectedIdx]?.item}`:"CLICK TO SELECT"}
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
