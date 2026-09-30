#!/usr/bin/env python3
import json, os, subprocess, tempfile, math
from datetime import datetime, timezone

CAMERAS = [
  {"id":"lenina-tihiy","name":"Ленина — Тихий","url":"http://cdn08.vtomske.ru/hls/stream1.m3u8"},
  {"id":"yuzhnaya","name":"Площадь Южная","url":"http://cdn08.vtomske.ru/hls/stream6.m3u8"},
  {"id":"tom-river-1","name":"Томь","url":"http://cdn08.vtomske.ru/hls/stream9.m3u8"},
  {"id":"tom-river-2","name":"Томь — камера 2","url":"http://cdn08.vtomske.ru/hls/stream2.m3u8"},
  {"id":"transportnaya","name":"Транспортная площадь","url":"http://cdn08.vtomske.ru/hls/stream8.m3u8"},
]

OUT="data/camera-observations.json"

def capture(url, path):
    cmd=["ffmpeg","-nostdin","-y","-loglevel","error","-rw_timeout","10000000",
         "-i",url,"-frames:v","1","-q:v","4",path]
    return subprocess.run(cmd,timeout=25).returncode == 0 and os.path.exists(path)

def analyze(path):
    try:
        from PIL import Image, ImageStat
        im=Image.open(path).convert("RGB")
        w,h=im.size
        # Upper portion is used as a conservative proxy for the visible sky.
        sky=im.crop((0,0,w,max(1,int(h*0.45)))).resize((64,32))
        stat=ImageStat.Stat(sky)
        r,g,b=stat.mean
        brightness=sum(stat.mean)/3
        # Blue dominance is a weak clear-sky cue; low saturation/brightness can indicate cloud.
        blue=max(0.0,b-(r+g)/2)
        saturation=(max(stat.mean)-min(stat.mean))/max(1.0,brightness)
        cloud_index=max(0.0,min(100.0,68 - blue*1.2 + (0.45-saturation)*55))
        return {
          "frame_width": w, "frame_height": h,
          "brightness": round(brightness,1),
          "cloud_index": round(cloud_index,1),
          "visual_confidence": 0.35,
          "note": "Визуальная оценка облачности по кадру; осадки пока не классифицируются."
        }
    except Exception as e:
        return {"visual_confidence":0.0,"note":f"analysis_error:{type(e).__name__}"}

def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    results=[]
    stamp=datetime.now(timezone.utc).isoformat()
    with tempfile.TemporaryDirectory() as td:
        for c in CAMERAS:
            path=os.path.join(td,c["id"]+".jpg")
            ok=capture(c["url"],path)
            item={"id":c["id"],"name":c["name"],"source":"pogoda.vtomske.ru / vtomske.ru","status":"ok" if ok else "offline","captured_at":stamp}
            if ok:
                item.update(analyze(path))
            results.append(item)
    with open(OUT,"w",encoding="utf-8") as f:
        json.dump(results,f,ensure_ascii=False,indent=2)
        f.write("\n")
    print(json.dumps(results,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
