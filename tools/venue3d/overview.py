"""Top-down overview of a site from 3DEP lidar and Sentinel-2, for choosing a pack's origin and facing.

  python3 tools/venue3d/overview.py <id> <lidar dataset> <lat> <lon> [half_m=400] [out.png]

Left: lidar surface, shaded, with buildings tinted orange, plants green and water blue. Right: Sentinel-2 true
colour. North is up; the grid is every 50 m (labelled every 100 m, east and north of the given point).
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_pack as B


def main(vid, ds, lat, lon, half=400.0, out=None):
    cfg = {'id': vid + '-overview', 'lidar': ds}
    fr = B.Frame(lat, lon, 0)
    res = max(0.5, round(half / 500 * 2) / 2)
    e, n, z, c, inten, _ = B.lidar(cfg, fr, half * 1.05, f'-{int(half)}', res * 1.5)
    dtm, dsm, ig, counts = B.rasterize(e, n, z, c, inten, half, res)
    chm = dsm - dtm
    gy, gx = np.gradient(dsm, res)
    shade = np.clip(0.75 + (-gx + gy) * 0.35, 0.25, 1.25)
    base = np.clip(0.35 + (dtm - np.percentile(dtm, 2)) / max(1, np.ptp(dtm)) * 0.3, 0, 1)
    img = np.stack([base] * 3, -1)
    bld = B.building_mask(dtm, dsm, counts, res, counts['bld'].sum() > 1000)
    veg = (chm > 1.5) & ~bld
    # Buildings by height: orange when low, through yellow, to magenta for towers over 60 m.
    t = np.clip(chm / 60, 0, 1)[..., None]
    tint = np.where(t < 0.3, [0.95, 0.55, 0.25] + (t / 0.3) * np.array([0.0, 0.4, 0.2]), [0.95, 0.95, 0.45] + ((t - 0.3) / 0.7) * np.array([0.0, -0.75, 0.5]))
    img[bld] = tint[bld]
    img[veg] = [0.3, 0.6, 0.3]
    img[counts['water'] > 0] = [0.3, 0.45, 0.85]
    img = np.clip(img * shade[..., None], 0, 1)
    E, N = B.grid(half, res)
    try:
        scenes = [s for s in (B.s2_scene(t, range(1, 13), (2024,), 15) for t in B.s2_tiles(fr, E[::20, ::20], N[::20, ::20])) if s]
        sat = np.clip(B.s2_colour(scenes, fr, E, N, res) * 4, 0, 1) ** (1 / 2.2)
    except Exception as ex:
        print('no sentinel:', ex)
        sat = np.zeros_like(img)
    both = np.concatenate([img, np.ones((img.shape[0], 8, 3)), sat], 1)
    im = Image.fromarray((both * 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    k = img.shape[0]
    for off in (0, k + 8):
        for m in range(-int(half) // 50 * 50, int(half) + 1, 50):
            p = int((m + half) / res)
            col = (255, 255, 255) if m == 0 else (200, 200, 200) if m % 100 == 0 else (120, 120, 120)
            d.line([(off + p, 0), (off + p, k)], fill=col, width=1)
            d.line([(off, k - 1 - p), (off + k, k - 1 - p)], fill=col, width=1)
            if m % 100 == 0:
                d.text((off + p + 2, 2), f'{m}E', fill=(255, 255, 0))
                d.text((off + 2, k - 1 - p + 2), f'{m}N', fill=(255, 255, 0))
    out = out or os.path.join(B.CACHE, f'{vid}-overview.png')
    im.save(out)
    print(out)


if __name__ == '__main__':
    a = sys.argv[1:]
    main(a[0], a[1], float(a[2]), float(a[3]), float(a[4]) if len(a) > 4 else 400.0, a[5] if len(a) > 5 else None)
