const LAT=56.4977,LON=84.9744;let weather=null,models={},map,radarSource;
const $=id=>document.getElementById(id),mm=h=>(h*.75006156).toFixed(0);
const CAMERA_SOURCES=[
{id:"plekhanova-4",name:"Плеханова, 4",stream:"http://cdn08.vtomske.ru/cam/cam3/cam3.m3u8",kind:"hls"},
{id:"lenina-tihiy",name:"Ленина — Тихий",stream:"http://cdn08.vtomske.ru/hls/stream1.m3u8",kind:"hls"},
{id:"yuzhnaya",name:"Площадь Южная",stream:"http://cdn08.vtomske.ru/hls/stream6.m3u8",kind:"hls"},
{id:"tom-river-1",name:"Томь",stream:"http://cdn08.vtomske.ru/hls/stream9.m3u8",kind:"hls"},
{id:"tom-river-2",name:"Томь — камера 2",stream:"http://cdn08.vtomske.ru/hls/stream2.m3u8",kind:"hls"},
{id:"transportnaya",name:"Транспортная площадь",stream:"http://cdn08.vtomske.ru/hls/stream8.m3u8",kind:"hls"}
];
let cameraObservations=[];
const MODEL_CONFIG={ecmwf_ifs:{name:"ECMWF IFS",short:"ECMWF"},icon_global:{name:"DWD ICON",short:"ICON"},ncep_gfs_global:{name:"NOAA GFS",short:"GFS"},cmc_gem_gdps:{name:"GEM",short:"GEM"}};
const wmo=c=>({0:"Ясно",1:"Преимущественно ясно",2:"Переменная облачность",3:"Пасмурно",45:"Туман",48:"Изморозь",51:"Морось",53:"Морось",55:"Морось",61:"Дождь",63:"Дождь",65:"Сильный дождь",71:"Снег",73:"Снег",75:"Сильный снег",80:"Ливни",81:"Ливни",82:"Сильные ливни",95:"Гроза"})[c]||"Погода";
const icon=c=>c===0?"☀":c<4?"⛅":c>=95?"⛈":c>=70?"❄":c>=50?"🌧":"☁";
const api=(model)=>`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&models=${model}&current=temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_gusts_10m&hourly=temperature_2m,precipitation,precipitation_probability,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTomsk&forecast_days=7`;
async function getModel(model){try{const r=await fetch(api(model));if(!r.ok)throw Error(r.status);return await r.json()}catch(e){return null}}
function median(a){const v=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!v.length)return null;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2}
function consensusTemp(){const vals=Object.values(models).map(x=>x?.current?.temperature_2m);const med=median(vals);const spread=vals.filter(Number.isFinite).length>1?Math.max(...vals.filter(Number.isFinite))-Math.min(...vals.filter(Number.isFinite)):99;const confidence=vals.filter(Number.isFinite).length<3?"Низкая":spread<=1?"Высокая":spread<=2.5?"Средняя":"Низкая";return{temp:med,spread,confidence}}
function renderModels(){const rows=Object.entries(MODEL_CONFIG).map(([id,c])=>{const m=models[id],t=m?.current?.temperature_2m,p=m?.current?.precipitation;return `<div class="modelRow"><b>${c.name}</b><span>${t==null?"нет данных":Math.round(t)+"°"}</span><small>${p==null?"—":p+" мм"}</small></div>`}).join("");$("models").innerHTML=rows}
function renderConsensus(){const q=consensusTemp();$("confidence").textContent=q.confidence;$("consensusText").textContent=q.temp==null?"Недостаточно данных":`Ансамбль из ${Object.values(models).filter(Boolean).length} моделей: около ${Math.round(q.temp)}°. Разброс ${q.spread.toFixed(1)}°.`;$("sourceSummary").textContent="ECMWF · ICON · GFS · GEM";renderModels()}
async function loadWeather(){const ids=Object.keys(MODEL_CONFIG);const results=await Promise.all(ids.map(getModel));ids.forEach((id,i)=>{models[id]=results[i]});const base=models.ecmwf_ifs||models.icon_global||models.ncep_gfs_global;if(!base){$("consensusText").textContent="Источники временно недоступны";return}weather=base;const c=base.current;const q=consensusTemp();$("temp").textContent=(q.temp==null?"—":Math.round(q.temp))+"°";$("feels").textContent="Ансамбль · Ощущается "+Math.round(c.apparent_temperature)+"° · "+wmo(c.weather_code);$("weatherIcon").textContent=icon(c.weather_code);$("rain").textContent=c.precipitation+" мм";$("cloud").textContent=c.cloud_cover+"%";$("wind").textContent=Math.round(c.wind_speed_10m)+" км/ч";$("gust").textContent=Math.round(c.wind_gusts_10m)+" км/ч";$("pressure").textContent=mm(c.surface_pressure)+" мм";$("pressureBig").textContent=mm(c.surface_pressure)+" мм рт. ст.";renderConsensus();renderHours();renderDays();renderChart()}
function renderHours(){const h=weather.hourly,now=weather.current.time,idx=Math.max(0,h.time.indexOf(now));$("hours").innerHTML=h.time.slice(idx,idx+12).map((t,i)=>`<div class="hour"><span>${t.slice(11,16)}</span><b>${icon(h.weather_code[idx+i])}</b><strong>${Math.round(h.temperature_2m[idx+i])}°</strong><small class="muted">${h.precipitation_probability[idx+i]}%</small></div>`).join("");let n=-1;for(let i=idx;i<h.time.length;i++)if(h.precipitation_probability[i]>=40){n=i;break}$("nextRain").textContent=n<0?"не ожидается":n===idx?"сейчас":h.time[n].slice(11,16)}
function renderDays(){const d=weather.daily;$("days").innerHTML=d.time.map((t,i)=>`<div class="day"><b>${i===0?"Сегодня":new Date(t).toLocaleDateString("ru-RU",{weekday:"short",day:"numeric"})}</b><span>${icon(d.weather_code[i])} ${wmo(d.weather_code[i])}</span><span>${Math.round(d.temperature_2m_min[i])}…${Math.round(d.temperature_2m_max[i])}°</span></div>`).join("")}
function renderChart(){const p=weather.hourly.surface_pressure.slice(0,24),mn=Math.min(...p),mx=Math.max(...p),pts=p.map((v,i)=>((i/(p.length-1))*360)+","+(145-(v-mn)/(mx-mn||1)*125)).join(" ");$("chart").innerHTML=`<polyline class="line" points="${pts}"/>`;const d=p[p.length-1]-p[0];$("pressureTrend").textContent=d>0.5?"Растёт":d<-0.5?"Падает":"Почти без изменений"}
async function loadKp(){try{const d=await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json").then(r=>r.json()),row=d[d.length-1],kp=Number(row[1]);$("kp").textContent=kp.toFixed(1);$("stormLevel").textContent=kp>=5?"G"+Math.min(5,Math.floor(kp-4)):"Спокойно / без G-бури"}catch(e){$("kp").textContent="—";$("stormLevel").textContent="Нет данных"}}
function get2gisKey(){return (localStorage.getItem("mika-2gis-key")||"").trim()}
function setMapStatus(text,show=true){const el=$("mapStatus");if(el){el.textContent=text;el.hidden=!show}}
function addRadarSource(tile,addLayer){if(!map||!window.mapgl)return;if(radarSource){try{radarSource.destroy()}catch(e){}radarSource=null}radarSource=new mapgl.RasterTileSource(map,{url:(x,y,z)=>tile.replace("{z}",z).replace("{x}",x).replace("{y}",y),attribution:"RainViewer",attributes:{mikaRadar:"rainviewer"}});if(addLayer&&!document.getElementById("mika-radar-layer-added")){map.addLayer({id:"mika-rainviewer-layer",filter:["match",["sourceAttr","mikaRadar"],["rainviewer"],true,false],type:"raster",style:{opacity:.75}});document.body.insertAdjacentHTML("beforeend",'<span id="mika-radar-layer-added" hidden></span>')}}
function init2gis(tile){const key=get2gisKey();if(!key){setMapStatus("Для карты 2ГИС введи API-ключ в разделе «Источники».");return false}if(!window.mapgl){setMapStatus("2ГИС загружается…");setTimeout(()=>init2gis(tile),250);return false}if(map)return true;map=new mapgl.Map("radar",{center:[LON,LAT],zoom:9,key});map.on("styleload",()=>{setMapStatus("",false);addRadarSource(tile,true)});return true}
async function loadRadar(){try{const d=await fetch("https://api.rainviewer.com/public/weather-maps.json").then(r=>r.json()),frame=d.radar?.past?.at(-1);if(!frame)return;const tile=d.host+"/v2/radar/"+frame.path+"/256/{z}/{x}/{y}/2/1_1.png";$("radarTime").textContent=new Date(frame.time*1000).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});if(!get2gisKey()){setMapStatus("Карта 2ГИС готова — нужен API-ключ.",true);return}if(!map){init2gis(tile)}else{addRadarSource(tile,false);setMapStatus("",false)}}catch(e){$("radarTime").textContent="радар недоступен";setMapStatus("Не удалось загрузить радар.",true)}}
function setup2gisSettings(){const input=$("dgisKey"),btn=$("saveDgisKey");if(!input||!btn)return;input.value=get2gisKey();btn.onclick=()=>{const key=input.value.trim();if(key)localStorage.setItem("mika-2gis-key",key);else localStorage.removeItem("mika-2gis-key");location.reload()}}

function openScreen(id){document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));$(id).classList.add("active");document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));const nav=document.querySelector('nav button[data-screen="'+id+'"]');if(nav)nav.classList.add("active");if(id==="map"){setTimeout(()=>map?.resize(),100);loadRadar()}}
$("settingsToggle")?.addEventListener("click",()=>{$("settings").hidden=!$("settings").hidden});
$("closeSettings")?.addEventListener("click",()=>{$("settings").hidden=true});
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{openScreen(b.dataset.screen)});document.querySelector("nav button").classList.add("active");$("refresh").onclick=()=>{loadWeather();loadKp();if(map)loadRadar()};loadWeather();loadKp();if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js");

async function loadCameraObservations(){
  try{
    const r=await fetch("./data/camera-observations.json?"+Date.now(),{cache:"no-store"});
    if(!r.ok)throw Error(r.status);
    cameraObservations=await r.json();
  }catch(e){
    cameraObservations=[];
  }
  renderCameraAnalysis();
}

function renderCameraAnalysis(){
  const el=$("cameraAnalysis");
  if(!el)return;
  const ok=cameraObservations.filter(x=>x && x.status==="ok");
  if(!ok.length){
    el.innerHTML='<div class="muted">Камеры подключены. Жду первые наблюдения со сборщика.</div>';
    return;
  }
  const cloud=ok.map(x=>x.cloud_index).filter(Number.isFinite);
  const avg=cloud.length?Math.round(cloud.reduce((a,b)=>a+b,0)/cloud.length):null;
  const weather=avg===null?"нет визуальной оценки":avg<25?"по камерам преимущественно ясно":avg<60?"по камерам переменная облачность":"по камерам преимущественно облачно";
  const fresh=ok.map(x=>x.captured_at).filter(Boolean).sort().at(-1);
  el.innerHTML=`<div><b>Камер в анализе: ${ok.length}/${CAMERA_SOURCES.length}</b></div><div class="cameraSignal">📷 ${weather}</div><small class="muted">${avg===null?"":`Визуальный индекс облачности: ${avg}% · `}${fresh?"обновлено "+new Date(fresh).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}):""}</small>`;
}

loadCameraObservations();setup2gisSettings();

function updateClock(){const now=new Date();const time=new Intl.DateTimeFormat("ru-RU",{timeZone:"Asia/Tomsk",hour:"2-digit",minute:"2-digit"}).format(now);const date=new Intl.DateTimeFormat("ru-RU",{timeZone:"Asia/Tomsk",day:"2-digit",month:"2-digit",year:"numeric",weekday:"long"}).format(now);const el=$("clock");if(el)el.textContent=time+" "+date;}updateClock();setInterval(updateClock,1000);