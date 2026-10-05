const LAT=56.4977,LON=84.9744;let weather=null,models={},map,radarSource;
const $=id=>document.getElementById(id),mm=h=>(h*.75006156).toFixed(0);
const CAMERA_SOURCES=[
{id:"plekhanova-4",name:"Плеханова, 4",stream:"http://cdn08.vtomske.ru/cam/cam3/cam3.m3u8",kind:"hls"},
{id:"tom-parus-admin",name:"Томь — Парус",stream:"http://admin.tomsk.ru/cam/cam4/cam4.m3u8",kind:"hls"},
{id:"lenina-tihiy",name:"Ленина — Тихий",stream:"http://cdn08.vtomske.ru/hls/stream1.m3u8",kind:"hls"},
{id:"yuzhnaya",name:"Площадь Южная",stream:"http://cdn08.vtomske.ru/hls/stream6.m3u8",kind:"hls"},
{id:"tom-river-1",name:"Томь",stream:"http://cdn08.vtomske.ru/hls/stream9.m3u8",kind:"hls"},
{id:"tom-river-2",name:"Томь — камера 2",stream:"http://cdn08.vtomske.ru/hls/stream2.m3u8",kind:"hls"},
{id:"transportnaya",name:"Транспортная площадь",stream:"http://cdn08.vtomske.ru/hls/stream8.m3u8",kind:"hls"},
{id:"tomsk-admin-3",name:"Муниципальная камера 3",stream:"http://admin.tomsk.ru/cam/cam3/cam3.m3u8",kind:"hls"}
];
let cameraObservations=[];let airportObservation=null;
const MODEL_CONFIG={ecmwf_ifs:{name:"ECMWF IFS",short:"ECMWF"},icon_global:{name:"DWD ICON",short:"ICON"},ncep_gfs_global:{name:"NOAA GFS",short:"GFS"},cmc_gem_gdps:{name:"GEM",short:"GEM"}};
const wmo=c=>({0:"Ясно",1:"Преимущественно ясно",2:"Переменная облачность",3:"Пасмурно",45:"Туман",48:"Изморозь",51:"Морось",53:"Морось",55:"Морось",61:"Дождь",63:"Дождь",65:"Сильный дождь",71:"Снег",73:"Снег",75:"Сильный снег",80:"Ливни",81:"Ливни",82:"Сильные ливни",95:"Гроза"})[c]||"Погода";
const icon=c=>c===0?"☀":c<4?"⛅":c>=95?"⛈":c>=70?"❄":c>=50?"🌧":"☁";
const api=(model)=>`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&models=${model}&current=temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_gusts_10m&hourly=temperature_2m,precipitation,precipitation_probability,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTomsk&past_days=1&forecast_days=7`;
const nowIdx=()=>{const t=weather.current.time.slice(0,13);return Math.max(0,weather.hourly.time.findIndex(x=>x.startsWith(t)))};
async function getModel(model){try{const r=await fetch(api(model));if(!r.ok)throw Error(r.status);return await r.json()}catch(e){return null}}
function median(a){const v=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!v.length)return null;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2}
function consensusTemp(){const vals=Object.values(models).map(x=>x?.current?.temperature_2m);const med=median(vals);const spread=vals.filter(Number.isFinite).length>1?Math.max(...vals.filter(Number.isFinite))-Math.min(...vals.filter(Number.isFinite)):99;const confidence=vals.filter(Number.isFinite).length<3?"Низкая":spread<=1?"Высокая":spread<=2.5?"Средняя":"Низкая";return{temp:med,spread,confidence}}
function renderModels(){const rows=Object.entries(MODEL_CONFIG).map(([id,c])=>{const m=models[id],t=m?.current?.temperature_2m,p=m?.current?.precipitation;return `<div class="modelRow"><b>${c.name}</b><span>${t==null?"нет данных":Math.round(t)+"°"}</span><small>${p==null?"—":p+" мм"}</small></div>`}).join("");$("models").innerHTML=rows}
function renderConsensus(){const q=consensusTemp();$("confidence").textContent=q.confidence;$("consensusText").textContent=q.temp==null?"Недостаточно данных":`Ансамбль из ${Object.values(models).filter(Boolean).length} моделей: около ${Math.round(q.temp)}°. Разброс ${q.spread.toFixed(1)}°.`+(cameraNote()?" "+cameraNote():"");$("sourceSummary").textContent="ECMWF · ICON · GFS · GEM";renderModels()}
async function loadWeather(){const ids=Object.keys(MODEL_CONFIG);const results=await Promise.all(ids.map(getModel));ids.forEach((id,i)=>{models[id]=results[i]});const base=models.ecmwf_ifs||models.icon_global||models.ncep_gfs_global;if(!base){$("consensusText").textContent="Источники временно недоступны";return}weather=base;const c=base.current;const q=consensusTemp();$("temp").textContent=(q.temp==null?"—":Math.round(q.temp))+"°";$("feels").textContent="Ансамбль · Ощущается "+Math.round(c.apparent_temperature)+"° · "+wmo(c.weather_code);$("weatherIcon").textContent=icon(c.weather_code);$("rain").textContent=c.precipitation+" мм";$("cloud").textContent=c.cloud_cover+"%";$("wind").textContent=Math.round(c.wind_speed_10m)+" км/ч";$("gust").textContent=Math.round(c.wind_gusts_10m)+" км/ч";$("pressure").textContent=mm(c.surface_pressure)+" мм";$("pressureBig").textContent=mm(c.surface_pressure)+" мм рт. ст.";renderConsensus();applyConsensus();renderHours();renderDays();renderChart()}
function applyConsensus(){const r=(k,f)=>{const v=median(Object.values(models).map(m=>m?.current?.[k]));return v==null?"—":f(v)};
$("rain").textContent=r("precipitation",v=>v.toFixed(1)+" мм");$("cloud").textContent=r("cloud_cover",v=>Math.round(v)+"%");$("wind").textContent=r("wind_speed_10m",v=>Math.round(v)+" км/ч");$("gust").textContent=r("wind_gusts_10m",v=>Math.round(v)+" км/ч");$("pressure").textContent=r("surface_pressure",v=>mm(v)+" мм");$("pressureBig").textContent=r("surface_pressure",v=>mm(v)+" мм рт. ст.")}
function renderHours(){const h=weather.hourly,now=weather.current.time,idx=nowIdx();$("hours").innerHTML=h.time.slice(idx,idx+12).map((t,i)=>`<div class="hour"><span>${t.slice(11,16)}</span><b>${icon(h.weather_code[idx+i])}</b><strong>${Math.round(h.temperature_2m[idx+i])}°</strong><small class="muted">${h.precipitation_probability[idx+i]}%</small></div>`).join("");const av=Object.values(models).filter(m=>m?.hourly),need=Math.max(1,Math.ceil(av.length/2));let n=-1;for(let i=idx;i<Math.min(h.time.length,idx+48);i++){if(av.filter(m=>m.hourly.precipitation[i]>=0.1).length>=need){n=i;break}}$("nextRain").textContent=n<0?"48 ч без осадков":n===idx?"сейчас":"через ~"+(n-idx)+" ч ("+h.time[n].slice(11,16)+")"}
function renderDays(){const d=weather.daily;$("days").innerHTML=d.time.map((t,i)=>i===0?"":`<div class="day"><b>${i===1?"Сегодня":new Date(t).toLocaleDateString("ru-RU",{weekday:"short",day:"numeric"})}</b><span>${icon(d.weather_code[i])} ${wmo(d.weather_code[i])}</span><span>${Math.round(d.temperature_2m_min[i])}…${Math.round(d.temperature_2m_max[i])}°</span></div>`).join("")}
function renderChart(){const h=weather.hourly,now=nowIdx(),i0=Math.max(0,now-24),i1=Math.min(h.time.length-1,now+12),p=h.surface_pressure.slice(i0,i1+1).map(v=>v*.75006156),mn=Math.min(...p),mx=Math.max(...p),X=i=>i/(p.length-1)*360,Y=v=>140-(v-mn)/(mx-mn||1)*120,pts=p.map((v,i)=>X(i).toFixed(1)+","+Y(v).toFixed(1)).join(" "),nx=X(now-i0);$("chart").innerHTML=`<line x1="${nx}" y1="5" x2="${nx}" y2="145" stroke="#8e98a8" stroke-dasharray="3 3"/><polyline class="line" points="${pts}"/>`;const d=(h.surface_pressure[now]-h.surface_pressure[Math.max(0,now-3)])*.75006156;$("pressureTrend").textContent=(Math.abs(d)<.5?"Почти без изменений":d>0?"Растёт":"Падает")+" · "+(d>0?"+":"")+d.toFixed(1)+" мм за 3 ч · диапазон "+mn.toFixed(0)+"–"+mx.toFixed(0)+" мм · пунктир — сейчас"}
async function loadKp(){try{const d=await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json").then(r=>r.json()),row=d[d.length-1],kp=Number(row[1]);$("kp").textContent=kp.toFixed(1);$("stormLevel").textContent=kp>=5?"G"+Math.min(5,Math.floor(kp-4)):"Спокойно / без G-бури"}catch(e){$("kp").textContent="—";$("stormLevel").textContent="Нет данных"}}
let radarFrames=[],radarIdx=0,radarTimer=null,radarData=null,mapReady=false;
function setMapStatus(text,show=true){const el=$("mapStatus");if(el){el.textContent=text;el.hidden=!show}}
function initMap(){if(map)return;if(!window.maplibregl){setMapStatus("Карта загружается…");setTimeout(initMap,300);return}map=new maplibregl.Map({container:"radar",style:"https://tiles.openfreemap.org/styles/liberty",center:[LON,LAT],zoom:7});map.addControl(new maplibregl.NavigationControl({showCompass:false}));map.on("load",()=>{mapReady=true;setMapStatus("",false);if(radarData)setRadar(radarData)})}
function clearRadar(){clearInterval(radarTimer);radarTimer=null;$("radarPlay").textContent="▶";radarFrames.forEach((_,i)=>{if(map.getLayer("rv-"+i))map.removeLayer("rv-"+i);if(map.getSource("rv-"+i))map.removeSource("rv-"+i)});radarFrames=[]}
function showFrame(i){radarIdx=i;radarFrames.forEach((_,k)=>map.setPaintProperty("rv-"+k,"raster-opacity",k===i?.7:0));const f=radarFrames[i];$("radarTime").textContent=new Date(f.time*1000).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Tomsk"})+(f.nowcast?" · прогноз":"")}
function setRadar(d){clearRadar();const past=d.radar?.past||[],now=d.radar?.nowcast||[];radarFrames=past.concat(now.map(f=>({...f,nowcast:true})));if(!radarFrames.length){$("radarTime").textContent="радар недоступен";return}radarFrames.forEach((f,i)=>{map.addSource("rv-"+i,{type:"raster",tiles:[d.host+f.path+"/256/{z}/{x}/{y}/2/1_1.png"],tileSize:256,maxzoom:7});map.addLayer({id:"rv-"+i,type:"raster",source:"rv-"+i,paint:{"raster-opacity":0,"raster-fade-duration":0}})});showFrame(Math.max(0,past.length-1))}
async function loadRadar(){try{radarData=await fetch("https://api.rainviewer.com/public/weather-maps.json").then(r=>r.json());initMap();if(mapReady)setRadar(radarData)}catch(e){$("radarTime").textContent="радар недоступен";setMapStatus("Не удалось загрузить радар.",true)}}
$("radarPlay")?.addEventListener("click",()=>{if(!radarFrames.length)return;const b=$("radarPlay");if(radarTimer){clearInterval(radarTimer);radarTimer=null;b.textContent="▶"}else{b.textContent="⏸";radarTimer=setInterval(()=>showFrame((radarIdx+1)%radarFrames.length),600)}});

function openScreen(id){document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));$(id).classList.add("active");document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));const nav=document.querySelector('nav button[data-screen="'+id+'"]');if(nav)nav.classList.add("active");if(id==="map"){setTimeout(()=>map?.resize(),100);loadRadar()}}
$("settingsToggle")?.addEventListener("click",()=>{$("settings").hidden=!$("settings").hidden});
$("closeSettings")?.addEventListener("click",()=>{$("settings").hidden=true});
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{openScreen(b.dataset.screen)});document.querySelector("nav button").classList.add("active");$("refresh").onclick=()=>{loadWeather();loadKp();loadAirportObservation();loadCameraObservations();if(map)loadRadar()};loadWeather();loadKp();if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js");

async function loadCameraObservations(){
  try{
    const r=await fetch("./data/camera-observations.json?"+Date.now(),{cache:"no-store"});
    if(!r.ok)throw Error(r.status);
    cameraObservations=await r.json();
  }catch(e){
    cameraObservations=[];
  }
  renderCameraAnalysis();renderTrustAnalysis();if(weather)renderConsensus();
}

async function loadAirportObservation(){
  try{
    const r=await fetch("./data/airport-observation.json?"+Date.now(),{cache:"no-store"});
    if(!r.ok)throw Error(r.status);
    airportObservation=await r.json();
  }catch(e){airportObservation=null;}
  renderAirportObservation();
}

function renderAirportObservation(){
  const el=$("airportObservation");
  if(!el)return;
  const o=airportObservation;
  if(!o||o.status!=="ok"||!Number.isFinite(o.temp_c)){
    el.innerHTML='<div><b>Нет свежего METAR</b></div><small class="muted">Аэропортовое наблюдение временно недоступно.</small>';
    return;
  }
  const temp=Math.round(o.temp_c);
  const wind=Number.isFinite(o.wind_speed_kt)?Math.round(o.wind_speed_kt*1.852):null;
  const gust=Number.isFinite(o.wind_gust_kt)?Math.round(o.wind_gust_kt*1.852):null;
  const pressure=Number.isFinite(o.pressure_hpa)?mm(o.pressure_hpa):null;
  const vis=typeof o.visibility_mi==="number"?Math.round(o.visibility_mi*1.60934)+" км":(o.visibility_mi?String(o.visibility_mi):"—");
  const q=consensusTemp();
  const delta=Number.isFinite(q.temp)&&Number.isFinite(o.temp_c)?o.temp_c-q.temp:null;
  const seen=o.observed_at?new Date(o.observed_at):null;
  const when=seen&&!Number.isNaN(seen.getTime())?seen.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Tomsk"}):"—";
  el.innerHTML=`<div class="obsMain"><div><span class="muted">Температура</span><b class="obsTemp">${temp}°</b></div><div><span class="muted">METAR</span><b>${when}</b></div></div><div class="airportGrid"><span>Точка <b>UNTT</b></span><span>Ветер <b>${wind==null?"—":wind+" км/ч"}${gust!=null?" · "+gust+" пор.":""}</b></span><span>Давление <b>${pressure==null?"—":pressure+" мм"}</b></span><span>Видимость <b>${vis}</b></span>${o.weather?'<span>Явления <b>'+o.weather+'</b></span>':""}</div><div class="cameraSignal">${delta==null?"":(delta>0?"Аэропорт теплее моделей на ":"Аэропорт холоднее моделей на ")+Math.abs(delta).toFixed(1)+"°"}</div><small class="muted">Фактическое наблюдение в Богашёво, не прогноз. Источник: NOAA/NWS AWC.</small>`;
}

function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,v))}
function freshnessScore(ts){
  const t=Date.parse(ts||"");
  if(!Number.isFinite(t))return 0;
  const age=Math.max(0,(Date.now()-t)/60000);
  if(age<=20)return 100;
  if(age<=45)return 90;
  if(age<=90)return 75;
  if(age<=180)return 55;
  return 30;
}
function sourceLabel(score){return score>=85?"Высокое":score>=65?"Хорошее":score>=45?"Среднее":"Низкое"}
function modelTrustScore(id,ensemble,airportFresh){
  const m=models[id],t=m?.current?.temperature_2m;
  if(!Number.isFinite(t))return null;
  let score=35;
  if(Object.keys(models).filter(k=>Number.isFinite(models[k]?.current?.temperature_2m)).length>=4)score+=15;
  else if(Object.keys(models).filter(k=>Number.isFinite(models[k]?.current?.temperature_2m)).length>=3)score+=10;
  if(ensemble.spread<=1)score+=35;
  else if(ensemble.spread<=2.5)score+=25;
  else if(ensemble.spread<=4)score+=15;
  if(airportFresh){
    const at=Number(airportObservation?.temp_c);
    const d=Math.abs(t-at);
    score+=(d<=0.5?15:d<=1.5?10:d<=3?5:d<=5?-5:-15);
  }
  return Math.round(clamp(score));
}
function renderTrustAnalysis(){
  const el=$("trustAnalysis");
  if(!el)return;
  const validModels=Object.keys(MODEL_CONFIG).filter(id=>Number.isFinite(models[id]?.current?.temperature_2m));
  const ensemble=consensusTemp();
  const airportTemp=Number(airportObservation?.temp_c);
  const airportFresh=airportObservation?.status==="ok"&&Number.isFinite(airportTemp)&&freshnessScore(airportObservation.observed_at)>=75;
  const airportFreshness=airportFresh?freshnessScore(airportObservation.observed_at):0;

  let modelScore=35+(validModels.length>=4?15:validModels.length>=3?10:0);
  modelScore+=ensemble.spread<=1?35:ensemble.spread<=2.5?25:ensemble.spread<=4?15:5;
  if(airportFresh){
    const delta=Math.abs(airportTemp-ensemble.temp);
    modelScore+=(delta<=0.5?10:delta<=1.5?6:delta<=3?2:delta<=5?-5:-12);
  }
  modelScore=Math.round(clamp(modelScore));

  let airportScore=airportFresh?Math.round(70+airportFreshness*0.2):0;
  if(airportFresh&&Number.isFinite(ensemble.temp)){
    const delta=Math.abs(airportTemp-ensemble.temp);
    airportScore+=delta<=1?10:delta<=2.5?7:delta<=4?3:-5;
  }
  airportScore=Math.round(clamp(airportScore,0,95));

  const now=Date.now();
  const cams=cameraObservations.filter(x=>x?.status==="ok"&&x.captured_at&&Number.isFinite(Date.parse(x.captured_at))&&now-Date.parse(x.captured_at)<=25*60*1000);
  const visual=cams.map(x=>x.visual_confidence).filter(Number.isFinite);
  const visualAvg=visual.length?visual.reduce((a,b)=>a+b,0)/visual.length:0;
  const cameraSignals=cams.map(x=>x.precipitation_signal).filter(Boolean);
  const cameraRain=cameraSignals.includes("возможны осадки");
  const cameraDry=cameraSignals.length>0&&cameraSignals.every(x=>x==="осадки визуально не обнаружены");
  const modelRain=validModels.length?Object.values(models).map(m=>m?.current?.precipitation).filter(Number.isFinite).filter(v=>v>=0.1).length>=Math.ceil(validModels.length/2):false;
  let cameraScore=cams.length?25+Math.min(35,cams.length*10)+visualAvg*25:0;
  if(cams.length&&(cameraRain===modelRain||cameraDry===!modelRain))cameraScore+=15;
  else if(cams.length&&(cameraRain||cameraDry))cameraScore-=8;
  cameraScore=Math.round(clamp(cameraScore));

  let winner="Ансамблю моделей";
  let winnerScore=modelScore;
  let reason="Модели сейчас согласованы между собой.";
  if(airportScore>=modelScore+5){
    winner="Аэропорту UNTT";
    winnerScore=airportScore;
    reason=airportFresh?"Есть свежее инструментальное наблюдение, поэтому для текущего состояния ему доверяем больше модели.":"";
  }else if(!airportFresh&&modelScore<55){
    winner="Данных пока недостаточно";
    winnerScore=modelScore;
    reason="Нет свежего METAR и модели заметно расходятся.";
  }
  if(cams.length){
    const cameraPhrase=cameraRain===modelRain&&cameraRain?"Камеры дополнительно подтверждают осадки.":cameraDry===!modelRain?"Камеры дополнительно подтверждают отсутствие осадков.":"Камеры не дают однозначного подтверждения.";
    reason+=(reason?" ":"")+cameraPhrase;
  }

  const airportRow=airportFresh
    ? `<div class="trustRow"><span>✈️ Аэропорт UNTT</span><b>${airportScore}</b><small>${sourceLabel(airportScore)} · ${Math.round(airportFreshness)}% свежести · ${airportTemp.toFixed(1)}°</small></div>`
    : `<div class="trustRow"><span>✈️ Аэропорт UNTT</span><b>—</b><small>${airportObservation?.status==="ok"?"METAR устарел":"Нет свежего наблюдения"}</small></div>`;
  const ensembleRow=`<div class="trustRow"><span>🧩 Ансамбль</span><b>${modelScore}</b><small>${sourceLabel(modelScore)} · ${validModels.length} моделей · разброс ${Number.isFinite(ensemble.spread)?ensemble.spread.toFixed(1):"—"}°</small></div>`;
  const cameraRow=cams.length
    ? `<div class="trustRow"><span>📷 Камеры</span><b>${cameraScore}</b><small>${sourceLabel(cameraScore)} · ${cams.length} свеж. · визуальная уверенность ${Math.round(visualAvg*100)}%</small></div>`
    : `<div class="trustRow"><span>📷 Камеры</span><b>—</b><small>Нет свежих кадров</small></div>`;
  const modelRows=validModels.map(id=>{
    const sc=modelTrustScore(id,ensemble,airportFresh);
    const cfg=MODEL_CONFIG[id];
    const t=models[id].current.temperature_2m;
    const d=airportFresh?Math.abs(t-airportTemp):null;
    return `<div class="trustRow"><span>🌐 ${cfg.short}</span><b>${sc}</b><small>${sourceLabel(sc)} · ${Math.round(t)}°${d==null?"":" · Δ до UNTT "+d.toFixed(1)+"°"}</small></div>`;
  }).join("");
  el.innerHTML=`<div class="trustWinner"><span class="muted">Сейчас больше доверяю</span><strong>${winner}</strong><b>${winnerScore}/100</b></div><div class="cameraSignal">${reason}</div><div class="trustRows">${airportRow}${ensembleRow}${cameraRow}${modelRows}</div><small class="muted">Эвристический рейтинг 0–100 для текущего состояния: свежесть + согласованность + сравнение с независимым наблюдением. Это не историческая статистическая точность.</small>`;
}
\nfunction renderCameraAnalysis(){
  const el=$("cameraAnalysis");
  if(!el)return;
  const total=cameraObservations.length;
  const now=Date.now();
  const ok=cameraObservations.filter(x=>x && x.status==="ok" && x.captured_at && Number.isFinite(Date.parse(x.captured_at)) && (now-Date.parse(x.captured_at))<=25*60*1000);
  const stale=cameraObservations.filter(x=>x && x.status==="ok" && x.captured_at && (now-Date.parse(x.captured_at))>25*60*1000);
  if(!ok.length){
    el.innerHTML=`<div><b>Свежих наблюдений: 0/${total}</b></div><div class="cameraSignal">📷 Камеры временно не подтверждают обстановку</div><small class="muted">${stale.length?"Последние кадры устарели.":"Жду свежий кадр со сборщика."}</small>`;
    return;
  }
  const cloud=ok.map(x=>x.cloud_index).filter(Number.isFinite);
  const avg=cloud.length?Math.round(cloud.reduce((a,b)=>a+b,0)/cloud.length):null;
  const weather=avg===null?"нет визуальной оценки":avg<25?"по камерам преимущественно ясно":avg<60?"по камерам переменная облачность":"по камерам преимущественно облачно";
  const precip=ok.map(x=>x.precipitation_signal).filter(Boolean);
  const precipText=precip.includes("возможны осадки")?"возможны осадки":precip.length&&precip.every(x=>x==="осадки визуально не обнаружены")?"осадки не обнаружены":"сигнал осадков неуверенный";
  const fresh=ok.map(x=>x.captured_at).filter(Boolean).sort().at(-1);
  el.innerHTML=`<div><b>Свежих камер в анализе: ${ok.length}/${total}</b></div><div class="cameraSignal">📷 ${weather}</div><div class="cameraSignal">🌧 ${precipText}</div><small class="muted">${avg===null?"":`Визуальный индекс облачности: ${avg}% · `}${fresh?"обновлено "+new Date(fresh).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}):""}</small>`;
}

loadCameraObservations();loadAirportObservation();

function updateClock(){const now=new Date();const time=new Intl.DateTimeFormat("ru-RU",{timeZone:"Asia/Tomsk",hour:"2-digit",minute:"2-digit"}).format(now);const date=new Intl.DateTimeFormat("ru-RU",{timeZone:"Asia/Tomsk",day:"2-digit",month:"2-digit",year:"numeric",weekday:"long"}).format(now);const el=$("clock");if(el)el.textContent=time+" "+date;}updateClock();setInterval(updateClock,1000);
function cameraNote(){const now=Date.now(),ok=cameraObservations.filter(x=>x&&x.status==="ok"&&now-Date.parse(x.captured_at)<=25*60*1000);if(!ok.length)return"";const s=ok.map(x=>x.precipitation_signal);return s.includes("возможны осадки")?"Камеры: возможны осадки.":s.every(x=>x==="осадки визуально не обнаружены")?"Камеры: осадков не видно.":""}
