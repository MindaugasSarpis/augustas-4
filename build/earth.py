"""Render Earth as a lit orthographic globe from NASA Blue Marble textures.

Usage: python3 -I build/earth.py <land.jpg> <clouds.jpg> <out.webp>
Textures (public domain, NASA Visible Earth):
  land:   https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x5400x2700.jpg
  clouds: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
Output is 1400x1400 RGBA; the globe radius is 600 px (world radius 300 at 2 px/unit).
"""
import sys
import numpy as np
from PIL import Image

land_path, cloud_path, out_path = sys.argv[1:4]
N, RPX, SS = 1400, 600, 2            # output size, globe radius, supersampling
LAT0, LON0 = np.radians(42.0), np.radians(22.0)   # Europe faces the viewer
L = np.array([-0.5, 0.62, 0.6]); L /= np.linalg.norm(L)   # sun: upper left, in front

land = np.asarray(Image.open(land_path).convert("RGB"), dtype=np.float32) / 255
cloud = np.asarray(Image.open(cloud_path).convert("L"), dtype=np.float32) / 255
TH, TW = land.shape[:2]
CH, CW = cloud.shape

n = N * SS
r = RPX * SS
ys, xs = np.mgrid[0:n, 0:n]
X = (xs + 0.5 - n / 2) / r
Y = -(ys + 0.5 - n / 2) / r
rho = np.sqrt(X * X + Y * Y)
inside = rho < 1.0
rho_c = np.clip(rho, 1e-9, 1.0)
Z = np.sqrt(np.clip(1 - rho_c * rho_c, 0, 1))

# inverse orthographic projection -> lat/lon
c = np.arcsin(rho_c)
lat = np.arcsin(np.cos(c) * np.sin(LAT0) + Y * np.sin(c) * np.cos(LAT0) / rho_c)
lon = LON0 + np.arctan2(X * np.sin(c), rho_c * np.cos(c) * np.cos(LAT0) - Y * np.sin(c) * np.sin(LAT0))
u = ((lon + np.pi) / (2 * np.pi)) % 1.0
v = (np.pi / 2 - lat) / np.pi
tex = land[np.clip((v * TH).astype(int), 0, TH - 1), np.clip((u * TW).astype(int), 0, TW - 1)]
cl = cloud[np.clip((v * CH).astype(int), 0, CH - 1), np.clip((u * CW).astype(int), 0, CW - 1)]

# ocean mask for specular
ocean = (tex[..., 2] > tex[..., 0] + 0.08) & (tex[..., 2] > tex[..., 1] + 0.03)

# clouds: lighten with a soft shadow offset slightly down-right
cl_a = np.clip(cl * 1.15, 0, 1) ** 1.3
shadow = np.roll(np.roll(cl_a, 6 * SS, axis=0), 4 * SS, axis=1) * 0.35
surf = tex * (1 - shadow)[..., None]
surf = surf * (1 - cl_a)[..., None] + np.array([0.97, 0.98, 1.0]) * cl_a[..., None]

# lighting
nrm = np.stack([X, Y, Z], axis=-1)
diff = np.clip((nrm * L).sum(-1), 0, 1)
shade = 0.06 + 0.94 * diff ** 0.85
H = L + np.array([0, 0, 1.0]); H /= np.linalg.norm(H)
spec = np.clip((nrm * H).sum(-1), 0, 1) ** 70 * 0.55 * ocean * (1 - cl_a * 0.8)
rgb = surf * shade[..., None] + spec[..., None]

# atmosphere rim on the lit side + bluish scattering towards the limb
fres = (1 - Z) ** 2.2
atmo_col = np.array([0.5, 0.72, 1.0])
rgb = rgb + atmo_col * (fres * (0.15 + 0.6 * diff))[..., None]
rgb = np.clip(rgb, 0, 1)

# alpha: disc, plus an outer glow ring
alpha = inside.astype(np.float32)
limb_dir = np.stack([X / rho_c, Y / rho_c, np.zeros_like(X)], -1)
limb_lit = np.clip((limb_dir * L).sum(-1) * 0.7 + 0.5, 0.05, 1)
glow = np.exp(-np.clip(rho - 1, 0, None) / 0.035) * 0.75 * limb_lit
outside = ~inside
alpha[outside] = glow[outside]
rgb[outside] = atmo_col

out = np.concatenate([rgb, alpha[..., None]], -1)
# premultiply-free downsample: average color weighted by alpha
out = out.reshape(N, SS, N, SS, 4)
a = out[..., 3]
w = a.sum((1, 3)) + 1e-6
col = (out[..., :3] * a[..., None]).sum((1, 3)) / w[..., None]
a_m = a.mean((1, 3))
img = np.concatenate([col, a_m[..., None]], -1)
img = (np.clip(img, 0, 1) * 255).astype(np.uint8)
im = Image.fromarray(img, "RGBA").rotate(-12, resample=Image.BICUBIC)   # a touch of axial tilt
im.save(out_path, quality=90, method=6)
print("wrote", out_path, im.size)
