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

def probe_url(url):
    """Return a small, safe network diagnosis for an HLS URL."""
    import urllib.parse
    host=urllib.parse.urlsplit(url).netloc
    result={"url":url,"host":host,"http_status":None,"error":None,"kind":"unknown"}
    try:
        p=subprocess.run(
            ["curl","-L","-sS","-o","/dev/null","-D","-","--max-time","15",
             "-A","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
             "-e","https://geocam.ru/",url],
            capture_output=True,text=True,timeout=20
        )
        headers=p.stdout or ""
        lines=[x.strip() for x in headers.splitlines() if x.strip()]
        statuses=[x for x in lines if x.upper().startswith("HTTP/")]
        if statuses:
            import re
            m=re.search(r"HTTP/\S+\s+(\d+)",statuses[-1])
            if m: result["http_status"]=int(m.group(1))
        if p.returncode==0:
            if result["http_status"] in (200,206):
                result["kind"]="reachable"
            elif result["http_status"]==403:
                result["kind"]="forbidden"
            elif result["http_status"]==404:
                result["kind"]="not_found"
            elif result["http_status"]:
                result["kind"]="http_error"
        else:
            err=(p.stderr or "").strip().splitlines()
            result["error"]=err[-1][:240] if err else f"curl_exit_{p.returncode}"
            result["kind"]="network_error"
    except subprocess.TimeoutExpired:
        result["error"]="curl_timeout"
        result["kind"]="timeout"
    except Exception as e:
        result["error"]=type(e).__name__
        result["kind"]="probe_error"
    return result

def classify_ffmpeg(stderr, returncode=None):
    text=(stderr or "").lower()
    if "403 forbidden" in text or "access denied" in text:
        return "http_403"
    if "404 not found" in text or "server returned 404" in text:
        return "http_404"
    if "timed out" in text or "connection timed out" in text or "operation timed out" in text:
        return "timeout"
    if "connection refused" in text:
        return "connection_refused"
    if "could not resolve host" in text or "name or service not known" in text:
        return "dns"
    if "tls" in text or "ssl" in text or "certificate" in text:
        return "tls"
    if "invalid data" in text or "failed to parse" in text:
        return "invalid_hls"
    return f"ffmpeg_exit_{returncode}" if returncode is not None else "unknown"

def capture(url, paths):
    attempts = [
        ["ffmpeg","-nostdin","-y","-loglevel","error","-rw_timeout","30000000",
         "-user_agent","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
         "-headers","Referer: https://geocam.ru/\r\nOrigin: https://geocam.ru/\r\n",
         "-i",url,"-t","6","-vf","fps=1","-q:v","5",
         os.path.join(os.path.dirname(paths[0]),"frame-%02d.jpg")],
        ["ffmpeg","-nostdin","-y","-loglevel","error","-rw_timeout","30000000",
         "-http_persistent","0","-headers","Referer: https://geocam.ru/\r\nOrigin: https://geocam.ru/\r\n",
         "-i",url,"-t","6","-vf","fps=1","-q:v","5",
         os.path.join(os.path.dirname(paths[0]),"frame-%02d.jpg")],
    ]
    errors=[]
    for cmd in attempts:
        try:
            for p in paths:
                if os.path.exists(p):
                    os.remove(p)
            r=subprocess.run(cmd,capture_output=True,text=True,timeout=45)
            found=sorted([os.path.join(os.path.dirname(paths[0]),x)
                          for x in os.listdir(os.path.dirname(paths[0]))
                          if x.startswith("frame-") and x.endswith(".jpg")])
            if r.returncode == 0 and found:
                for i,p in enumerate(found[:len(paths)]):
                    os.replace(p,paths[i])
                return len(found[:len(paths)]), None, ""
            errors.append({"kind":classify_ffmpeg(r.stderr,r.returncode),
                           "detail":(r.stderr or "").strip().splitlines()[-1][:240] if (r.stderr or "").strip() else ""})
        except subprocess.TimeoutExpired:
            errors.append({"kind":"ffmpeg_timeout","detail":"ffmpeg process timeout"})
        except Exception as e:
            errors.append({"kind":"capture_exception","detail":type(e).__name__})
    return 0, (errors[0]["kind"] if errors else "unknown"), (errors[0]["detail"] if errors else "")

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
            probe_https=probe_url(c["url"])
            http_url=c["url"].replace("https://","http://",1)
            probe_http=probe_url(http_url)

            capture_url=c["url"]
            transport="https"
            if probe_https.get("kind")!="reachable" and probe_http.get("kind")=="reachable":
                capture_url=http_url
                transport="http"

            if probe_https.get("kind") not in ("reachable","forbidden") and probe_http.get("kind") not in ("reachable","forbidden"):
                frames=0
                capture_error=probe_https.get("kind") or probe_http.get("kind") or "network_unreachable"
                capture_detail=probe_https.get("error") or probe_http.get("error") or "Both HTTP and HTTPS probes failed"
            else:
                frames,capture_error,capture_detail=capture(capture_url,paths)

            item={
                "id":c["id"],
                "name":c["name"],
                "source":"Geocam / vtomske.ru",
                "status":"ok" if frames else "offline",
                "captured_at":stamp if frames else None,
                "checked_at":stamp,
                "frames_captured":frames,
                "diagnostic":{
                    "selected_transport":transport,
                    "https":probe_https,
                    "http":probe_http,
                    "ffmpeg_error":capture_error,
                    "ffmpeg_detail":capture_detail
                }
            }
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
