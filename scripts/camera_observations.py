#!/usr/bin/env python3
import json, os, subprocess, tempfile, math
from datetime import datetime, timezone

CAMERAS = [
  {"id":"plekhanova-4","name":"Плеханова, 4","url":"https://cdn08.vtomske.ru/cam/cam3/cam3.m3u8"},
  {"id":"tom-parus-admin","name":"Томь — Парус (резерв)","url":"https://admin.tomsk.ru/cam/cam4/cam4.m3u8"},
  {"id":"lenina-tihiy","name":"Ленина — Тихий","url":"https://cdn08.vtomske.ru/hls/stream1.m3u8"},
  {"id":"yuzhnaya","name":"Площадь Южная","url":"https://cdn08.vtomske.ru/hls/stream6.m3u8"},
  {"id":"tom-river-1","name":"Томь","url":"https://cdn08.vtomske.ru/hls/stream9.m3u8"},
  {"id":"tom-river-2","name":"Томь — камера 2","url":"https://cdn08.vtomske.ru/hls/stream2.m3u8"},
  {"id":"transportnaya","name":"Транспортная площадь","url":"https://cdn08.vtomske.ru/hls/stream8.m3u8"},
  {"id":"tomsk-admin-3","name":"Муниципальная камера 3 (резерв)","url":"https://admin.tomsk.ru/cam/cam3/cam3.m3u8"},
]

OUT="data/camera-observations.json"
AIRPORT_OUT="data/airport-observation.json"
AIRPORT_URL="https://aviationweather.gov/api/data/metar?ids=UNTT&format=json"

def capture(url, paths):
    attempts = [
        ["ffmpeg","-nostdin","-y","-loglevel","error","-rw_timeout","30000000",
         "-user_agent","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
         "-headers","Referer: https://geocam.ru/\r\nOrigin: https://geocam.ru\r\n",
         "-i",url,"-t","6","-vf","fps=1","-q:v","5",os.path.join(os.path.dirname(paths[0]),"frame-%02d.jpg")],
        ["ffmpeg","-nostdin","-y","-loglevel","error","-rw_timeout","30000000",
         "-http_persistent","0","-headers","Referer: https://geocam.ru\r\nOrigin: https://geocam.ru\r\n","-i",url,"-t","6","-vf","fps=1","-q:v","5",os.path.join(os.path.dirname(paths[0]),"frame-%02d.jpg")],
    ]
    for cmd in attempts:
        try:
            for p in paths:
                if os.path.exists(p):
                    os.remove(p)
            r=subprocess.run(cmd,timeout=45)
            found=sorted([os.path.join(os.path.dirname(paths[0]),x) for x in os.listdir(os.path.dirname(paths[0])) if x.startswith("frame-") and x.endswith(".jpg")])
            if r.returncode == 0 and found:
                for i,p in enumerate(found[:len(paths)]):
                    os.replace(p,paths[i])
                return len(found[:len(paths)])
        except Exception:
            pass
    return 0

def analyze(paths):
    try:
        from PIL import Image, ImageStat, ImageChops
        images=[Image.open(p).convert("RGB") for p in paths if os.path.exists(p)]
        if not images:
            return {"visual_confidence":0.0,"note":"Кадр не получен."}
        im=images[-1]
        w,h=im.size
        sky=im.crop((0,0,w,max(1,int(h*0.55)))).resize((64,32))
        stat=ImageStat.Stat(sky)
        r,g,b=stat.mean
        brightness=sum(stat.mean)/3
        blue=max(0.0,b-(r+g)/2)
        saturation=(max(stat.mean)-min(stat.mean))/max(1.0,brightness)
        cloud_index=max(0.0,min(100.0,68 - blue*1.2 + (0.45-saturation)*55))

        motion=[]
        for a,bimg in zip(images,images[1:]):
            aa=a.crop((0,0,w,max(1,int(h*0.65)))).resize((96,54)).convert("L")
            bb=bimg.crop((0,0,w,max(1,int(h*0.65)))).resize((96,54)).convert("L")
            diff=ImageStat.Stat(ImageChops.difference(aa,bb)).mean[0]
            motion.append(diff)
        motion_score=sum(motion)/len(motion) if motion else 0.0

        # This is deliberately a signal, not a definitive precipitation classifier.
        if len(images)>=2 and motion_score >= 8 and brightness < 125:
            precip_signal="возможны осадки"
        elif len(images)>=2 and motion_score < 4:
            precip_signal="осадки визуально не обнаружены"
        else:
            precip_signal="неуверенно"

        return {
          "frame_width": w, "frame_height": h,
          "brightness": round(brightness,1),
          "cloud_index": round(cloud_index,1),
          "temporal_motion": round(motion_score,2),
          "precipitation_signal": precip_signal,
          "visual_confidence": 0.45 if len(images)>=3 else 0.25,
          "note": "Визуальный сигнал по серии кадров; не заменяет метеодатчик."
        }
    except Exception as e:
        return {"visual_confidence":0.0,"note":f"analysis_error:{type(e).__name__}"}

def fetch_airport():
    import urllib.request
    try:
        req=urllib.request.Request(AIRPORT_URL,headers={
            "User-Agent":"Mika-pogoda/1.0 (Tomsk weather project)"
        })
        with urllib.request.urlopen(req,timeout=20) as r:
            rows=json.load(r)
        if not rows:
            raise RuntimeError("no METAR")
        m=rows[0]
        def num(key):
            v=m.get(key)
            return float(v) if isinstance(v,(int,float)) else None
        stamp=m.get("reportTime") or m.get("receiptTime")
        obs={
            "station":"UNTT",
            "name":"Томск · Богашёво",
            "source":"NOAA/NWS Aviation Weather Center · METAR",
            "status":"ok",
            "observed_at": stamp,
            "temp_c": num("temp"),
            "dewpoint_c": num("dewp"),
            "wind_dir_deg": m.get("wdir"),
            "wind_speed_kt": num("wspd"),
            "wind_gust_kt": num("wgst"),
            "visibility_mi": m.get("visib"),
            "pressure_hpa": num("altim") if num("altim") is not None else num("slp"),
            "weather":" ".join(str(m.get("wxString") or "").split()),
            "clouds":m.get("clouds") or [],
            "raw":m.get("rawOb") or m.get("raw") or ""
        }
        return obs
    except Exception as e:
        return {
            "station":"UNTT",
            "name":"Томск · Богашёво",
            "source":"NOAA/NWS Aviation Weather Center · METAR",
            "status":"offline",
            "observed_at":None,
            "error":type(e).__name__
        }

def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    results=[]
    stamp=datetime.now(timezone.utc).isoformat()
    with tempfile.TemporaryDirectory() as td:
        for c in CAMERAS:
            paths=[os.path.join(td,c["id"]+"-"+str(i)+".jpg") for i in range(1,4)]
            frames=capture(c["url"],paths)
            item={"id":c["id"],"name":c["name"],"source":"Geocam / vtomske.ru","status":"ok" if frames else "offline","captured_at":stamp,"frames_captured":frames}
            if frames:
                item.update(analyze(paths))
            results.append(item)
    with open(OUT,"w",encoding="utf-8") as f:
        json.dump(results,f,ensure_ascii=False,indent=2)
        f.write("\n")

    airport=fetch_airport()
    with open(AIRPORT_OUT,"w",encoding="utf-8") as f:
        json.dump(airport,f,ensure_ascii=False,indent=2)
        f.write("\n")

    print(json.dumps({"cameras":results,"airport":airport},ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
