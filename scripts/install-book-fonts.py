"""Fetch original, unmodified, OFL-licensed font files from official repositories.

Run with Python 3. Uses no account credentials and preserves existing font files.
"""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "public/fonts/print"
RAW = "https://raw.githubusercontent.com/"
sources = []
for weight in ["Thin", "Light", "DemiLight", "Regular", "Medium", "Bold", "Black"]:
    sources.append((f"NotoSansSC-{weight}.otf", f"notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-{weight}.otf"))
for weight in ["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "Black"]:
    sources.append((f"NotoSerifSC-{weight}.otf", f"notofonts/noto-cjk/main/Serif/SubsetOTF/SC/NotoSerifSC-{weight}.otf"))
for weight in ["Light", "Regular", "Medium"]:
    sources.append((f"LXGWWenKai-{weight}.ttf", f"lxgw/LxgwWenKai/main/fonts/TTF/LXGWWenKai-{weight}.ttf"))
for directory, family in [("zcoolkuaile", "ZCOOLKuaiLe"), ("zcoolxiaowei", "ZCOOLXiaoWei"), ("zcoolqingkehuangyou", "ZCOOLQingKeHuangYou"), ("mashanzheng", "MaShanZheng"), ("longcang", "LongCang"), ("liujianmaocao", "LiuJianMaoCao"), ("zhimangxing", "ZhiMangXing")]:
    sources.append((f"{family}-Regular.ttf", f"google/fonts/main/ofl/{directory}/{family}-Regular.ttf"))
    sources.append((f"{family}-OFL.txt", f"google/fonts/main/ofl/{directory}/OFL.txt"))
sources.extend([("NotoSerif-OFL.txt", "notofonts/noto-cjk/main/Serif/LICENSE"), ("Noto-CJK-OFL.txt", "notofonts/noto-cjk/main/Sans/LICENSE"), ("LXGWWenKai-OFL.txt", "lxgw/LxgwWenKai/main/OFL.txt")])

def fetch(item):
    name, ref = item
    dest = DEST / name
    if not dest.exists():
        req = urllib.request.Request(RAW + ref, headers={"User-Agent": "KidBook-Studio-Fonts"})
        with urllib.request.urlopen(req, timeout=150) as response:
            data = response.read()
        if name.endswith((".ttf", ".otf")) and data[:4] not in [b"OTTO", b"\x00\x01\x00\x00", b"true"]:
            raise ValueError("Invalid font: " + name)
        tmp = dest.with_suffix(dest.suffix + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(dest)
    data = dest.read_bytes()
    return {"file": name, "source": RAW + ref, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}

if __name__ == "__main__":
    DEST.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        manifest = list(pool.map(fetch, sources))
    (DEST / "font-sources.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps({"downloaded": len(manifest), "fontFiles": sum(x["file"].endswith((".ttf", ".otf")) for x in manifest)}))
