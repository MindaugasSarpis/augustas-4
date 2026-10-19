"""Bake the SVG layers in build/layers/ to WebP images in assets/.

Usage: <venv-with-playwright>/bin/python build/bake.py [chromium-executable]
Each layer SVG carries its own width/height (pixels) and viewBox (local units);
index.html knows the matching viewBox origin and pixels-per-unit for every layer.
"""
import glob
import os
import sys

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAYERS = os.path.join(ROOT, "build", "layers")
ASSETS = os.path.join(ROOT, "assets")
os.makedirs(ASSETS, exist_ok=True)

FONT_FILE = os.path.join(ROOT, "build", "fonts", "Baloo2-800.woff2")   # OFL; same face the page loads from Google Fonts


def bake_svg(browser, name, lossless=False):
    svg = open(os.path.join(LAYERS, f"{name}.svg"), encoding="utf-8").read()
    w = int(svg.split('width="')[1].split('"')[0])
    h = int(svg.split('height="')[1].split('"')[0])
    import base64
    font_b64 = base64.b64encode(open(FONT_FILE, "rb").read()).decode()
    html = (f'<!doctype html><style>@font-face{{font-family:"Baloo 2";font-weight:800;src:url(data:font/woff2;base64,{font_b64}) format("woff2")}}'
            f'html,body{{margin:0;background:transparent}}svg{{display:block}}</style>{svg}')
    path = os.path.join(LAYERS, f"_{name}.html")
    open(path, "w", encoding="utf-8").write(html)
    page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
    page.goto("file://" + path)
    page.wait_for_load_state("networkidle")
    page.evaluate("""document.fonts.load('800 20px "Baloo 2"')""")
    page.wait_for_function("document.fonts.check('800 20px \"Baloo 2\"')", timeout=15000)
    page.wait_for_timeout(300)
    png = os.path.join(LAYERS, f"_{name}.png")
    page.screenshot(path=png, omit_background=True)
    page.close()
    os.remove(path)
    im = Image.open(png).convert("RGBA")
    out = os.path.join(ASSETS, f"{name}.webp")
    im.save(out, quality=92, method=6, lossless=lossless)
    os.remove(png)
    print(f"{name}: {im.size[0]}x{im.size[1]} -> {os.path.getsize(out)//1024} KB")


def bake_stars(size=2000, count=1600, seed=4):
    rng = np.random.default_rng(seed)
    img = np.zeros((size, size, 3), np.float32)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    for _ in range(count):
        x, y = rng.uniform(0, size, 2)
        mag = rng.random()
        r = 0.6 + 2.6 * mag ** 4          # a few bright ones, many faint
        tint = rng.choice([(1, 1, 1), (1, 1, 1), (0.8, 0.88, 1), (1, 0.92, 0.8)])
        ix, iy = int(x), int(y)
        s = int(r * 4) + 2
        y0, y1, x0, x1 = max(iy - s, 0), min(iy + s + 1, size), max(ix - s, 0), min(ix + s + 1, size)
        d2 = (xs[y0:y1, x0:x1] - x) ** 2 + (ys[y0:y1, x0:x1] - y) ** 2
        g = np.exp(-d2 / (2 * (r * 0.55) ** 2)) * (0.35 + 0.65 * mag)
        img[y0:y1, x0:x1] += g[..., None] * np.array(tint, np.float32)
    # faint nebula haze
    hy, hx = size * 0.35, size * 0.6
    haze = np.exp(-(((xs - hx) * 0.6) ** 2 + ((ys - hy) * 1.6 - (xs - hx) * 0.9) ** 2) / (2 * (size * 0.22) ** 2))
    img += haze[..., None] * np.array([0.06, 0.07, 0.14], np.float32)
    rgb = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    out = os.path.join(ASSETS, "stars.webp")
    Image.fromarray(rgb, "RGB").save(out, quality=80, method=6)
    print(f"stars: {size}x{size} -> {os.path.getsize(out)//1024} KB")


if __name__ == "__main__":
    exe = sys.argv[1] if len(sys.argv) > 1 else None
    bake_stars()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        for name in ["station", "lab", "kid", "face", "visor"]:
            bake_svg(browser, name)
        browser.close()
