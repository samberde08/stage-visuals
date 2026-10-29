"""Build a venue pack (app/venues3d/<id>/) from public survey data.

  python3 tools/venue3d/build_pack.py tools/venue3d/red-rocks.json

A pack is the real site around one venue, in the scene's frame (origin at downstage centre, y up, metres, the
audience looking along -z):

  core-height.png   the ground near the venue, from USGS 3DEP lidar: 0.5 m grid, height in R*256+G centimetres
                    above manifest.core.min, baked sky visibility (ambient occlusion) in B
  core-albedo.jpg   ground colour: the survey's own point colour where it has one, otherwise Sentinel-2 true colour
                    (10 m) sharpened with the lidar's return intensity
  core-water.png    where there is water (lidar water returns and Sentinel-2's water index)
  mid-*/far-*       the land out to a few km and to the horizon, from the AWS Terrain Tiles and Sentinel-2
  manifest.json     where it all goes, plus what was measured from the lidar: buildings (footprints and heights),
                    trees, and for an amphitheatre its stage roof and seating rows; and credits

Two kinds of site:
  amphi   a permanent bowl: the stage roof found in the lidar fixes the origin, and the rows are measured
  site    anything else (festival fields, parks, rooftops): the origin and facing come from the config, the
          venue's own area (`clear`) is levelled and cleared, and everything around it is the real place

Everything is fetched from open data buckets on AWS that need no account. Downloads are cached in
tools/venue3d/.cache/. Needs numpy, scipy, pillow, pyproj, rasterio, laspy[lazrs], scikit-image, shapely, mgrs.
"""
import io, json, math, os, re, sys, urllib.request
import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy import ndimage
from scipy.interpolate import LinearNDInterpolator
from scipy.spatial import Delaunay

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, '.cache')
S2 = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/'


def get(url):
    path = os.path.join(CACHE, re.sub(r'[^\w.-]', '_', url.split('://', 1)[1]))[:250]
    if os.path.exists(path):
        return open(path, 'rb').read()
    for i in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                b = r.read()
            break
        except Exception:
            if i == 3:
                raise
    os.makedirs(CACHE, exist_ok=True)
    open(path, 'wb').write(b)
    return b


class Frame:
    """Local metres east/north of the venue origin, and the scene's x/z (audience faces -z)."""

    def __init__(self, lat, lon, facing):
        self.lat, self.lon, self.facing = lat, lon, facing
        aeqd = f'+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m'
        self.to_ll = Transformer.from_crs(aeqd, 4326, always_xy=True)
        self.from_ll = Transformer.from_crs(4326, aeqd, always_xy=True)

    def ll(self, e, n):
        return self.to_ll.transform(e, n)


def grid(half, res):
    """Vertex grid, north row first: (E, N) arrays of shape (k, k), k = 2 * half / res + 1."""
    k = int(round(2 * half / res)) + 1
    xs = -half + np.arange(k) * res
    return np.meshgrid(xs, -xs)


def enc_height(h, ao=None):
    lo = float(np.floor(h.min()))
    cm = np.clip(np.round((h - lo) * 100), 0, 65535).astype(np.uint32)
    img = np.zeros(h.shape + (3,), np.uint8)
    img[..., 0] = cm >> 8
    img[..., 1] = cm & 255
    img[..., 2] = 255 if ao is None else np.clip(ao * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(img), lo


def srgb(lin):
    lin = np.clip(lin, 0, 1)
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)


def to_scene(fr, e, n):
    f = math.radians(fr.facing)
    return e * math.cos(f) - n * math.sin(f), -(e * math.sin(f) + n * math.cos(f))


def from_scene(fr, x, z):
    f = math.radians(fr.facing)
    return x * math.cos(f) - z * math.sin(f), -x * math.sin(f) - z * math.cos(f)


# ---------- Lidar ----------

def lidar(cfg, fr, half, tag='', spacing=None):
    """Points around the origin from the EPT copy of 3DEP: local east, north, height, class, intensity, colour."""
    cache = os.path.join(CACHE, f"{cfg['id']}-lidar{tag}.npz")
    if not os.path.exists(cache):
        sys.path.insert(0, HERE)
        from fetch_lidar import main as fetch
        os.makedirs(CACHE, exist_ok=True)
        fetch(cfg['lidar'], fr.lat, fr.lon, half, cache, spacing)
    d = np.load(cache)
    e, n = d['e'], d['n']
    keep = (d['c'] != 7) & (d['c'] != 18)  # low and high noise
    # Some surveys file the roofs of tall towers as high noise. Real noise (birds, haze) is scattered; a roof is a
    # dense sheet, so high-noise points with plenty of neighbours in their 2 m cell are kept.
    hi = d['c'] == 18
    if hi.sum() > 1000:
        key = np.floor(e[hi] / 2).astype(np.int64) * 100003 + np.floor(n[hi] / 2).astype(np.int64)
        _, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
        idx = np.nonzero(hi)[0]
        keep[idx[cnt[inv] >= 4]] = True
    rgb = d['rgb'][keep] if 'rgb' in d and d['rgb'].shape[1] == 3 else None
    if rgb is not None and not rgb.any():
        rgb = None  # the survey has colour fields but never filled them
    return e[keep], n[keep], d['z'][keep], d['c'][keep], d['i'][keep].astype(np.float32), rgb


def cell_index(e, n, half, res):
    k = int(round(2 * half / res)) + 1
    ix = np.round((e + half) / res).astype(int)
    iy = np.round((half - n) / res).astype(int)
    ok = (ix >= 0) & (ix < k) & (iy >= 0) & (iy < k)
    return k, ix, iy, ok


def rasterize(e, n, z, c, inten, half, res):
    """Ground (DTM), first surface (DSM), ground intensity, and per-cell counts of building, plant and water returns."""
    E, N = grid(half, res)
    k = E.shape[0]
    g = (c == 2) | (c == 9)
    sel = g & (np.abs(e) < half + 8) & (np.abs(n) < half + 8)
    # Thin very dense ground before triangulating: one point per quarter cell is plenty.
    se, sn, sz = e[sel], n[sel], z[sel]
    q = np.round(se / (res / 2)).astype(np.int64) * 1000003 + np.round(sn / (res / 2)).astype(np.int64)
    _, first = np.unique(q, return_index=True)
    se, sn, sz = se[first], sn[first], sz[first]
    dtm = LinearNDInterpolator(Delaunay(np.stack([se, sn], 1)), sz)(E, N).astype(np.float32)
    dtm = np.where(np.isnan(dtm), np.nanmedian(dtm), dtm)
    k, ix, iy, ok = cell_index(e, n, half, res)
    ix, iy, zz, ii, cc = ix[ok], iy[ok], z[ok], inten[ok], c[ok]
    dsm = np.full((k, k), -1e9, np.float32)
    np.maximum.at(dsm, (iy, ix), zz)
    empty = dsm < -1e8
    # Sparse surveys leave many cells without a return: fill them from the nearest cell that has one (up to 1.5 m
    # away) rather than dropping them to the ground, which would riddle every roof with holes.
    dist, near = ndimage.distance_transform_edt(empty, return_indices=True)
    dsm = np.where(empty & (dist * res <= 1.5), dsm[tuple(near)], dsm)
    dsm = np.where(dsm < -1e8, dtm, np.maximum(dsm, dtm))
    # Fill single-cell dropouts in the canopy so trees and roofs read as solid.
    dsm = np.maximum(dsm, np.minimum(ndimage.maximum_filter(dsm, 3), ndimage.median_filter(dsm, 3)))
    s = np.zeros((k, k), np.float32); cnt = np.zeros((k, k), np.float32)
    gi = cc == 2
    np.add.at(s, (iy[gi], ix[gi]), ii[gi]); np.add.at(cnt, (iy[gi], ix[gi]), 1)
    m = cnt > 0
    near = ndimage.distance_transform_edt(~m, return_distances=False, return_indices=True)
    inten_g = (s / np.maximum(cnt, 1))[tuple(near)]
    counts = {}
    for name, cls in (('bld', (6,)), ('veg', (3, 4, 5)), ('water', (9,))):
        a = np.zeros((k, k), np.int32)
        w = np.isin(cc, cls)
        np.add.at(a, (iy[w], ix[w]), 1)
        counts[name] = a
    return dtm, dsm, inten_g, counts


def raster_rgb(e, n, rgb, half, res):
    """Mean point colour per cell (linear 0..1), holes filled from the nearest coloured cell."""
    k, ix, iy, ok = cell_index(e, n, half, res)
    acc = np.zeros((k, k, 3), np.float64); cnt = np.zeros((k, k))
    np.add.at(acc, (iy[ok], ix[ok]), rgb[ok].astype(np.float64))
    np.add.at(cnt, (iy[ok], ix[ok]), 1)
    m = cnt > 0
    near = ndimage.distance_transform_edt(~m, return_distances=False, return_indices=True)
    col = (acc / np.maximum(cnt, 1)[..., None])[tuple(near)]
    scale = 65535.0 if rgb.max() > 255 else 255.0
    v = np.clip(col / scale, 0, 1)
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def sky_visibility(h, res, dirs=16, reach=48.0):
    """Fraction of the sky dome visible from each cell (horizon-based ambient occlusion)."""
    vis = np.zeros_like(h)
    steps = [res * 1.5 * 1.45 ** i for i in range(40) if res * 1.5 * 1.45 ** i < reach]
    for a in np.linspace(0, 2 * np.pi, dirs, endpoint=False):
        best = np.zeros_like(h)
        for d in steps:
            dx, dy = math.cos(a) * d / res, -math.sin(a) * d / res
            sh = ndimage.shift(h, (-dy, -dx), order=1, mode='nearest')
            best = np.maximum(best, (sh - h) / d)
        vis += 1 - np.sin(np.arctan(best))
    return vis / dirs


# ---------- Sentinel-2 imagery and terrain tiles ----------

def s2_tiles(fr, E, N):
    import mgrs
    lon, lat = fr.ll(E, N)
    m = mgrs.MGRS()
    tiles = []
    for la, lo in zip(np.ravel(lat)[::max(1, lat.size // 400)], np.ravel(lon)[::max(1, lat.size // 400)]):
        t = m.toMGRS(float(la), float(lo), MGRSPrecision=0)
        if t not in tiles:
            tiles.append(t)
    return tiles


def s2_scene(tile, months, years=(2024, 2023), max_cloud=5):
    """The clearest full scene of an MGRS tile in the given months: (prefix, date)."""
    best = None
    for y in years:
        for mo in months:
            pre = f'sentinel-s2-l2a-cogs/{int(tile[:2])}/{tile[2]}/{tile[3:]}/{y}/{mo}/'
            xml = get(f'{S2}?list-type=2&prefix={pre}&delimiter=/').decode()
            for p in re.findall(r'<Prefix>(' + re.escape(pre) + r'[^<]+/)</Prefix>', xml):
                name = p.rstrip('/').split('/')[-1]
                try:
                    j = json.loads(get(f'{S2}{p}{name}.json'))
                except Exception:
                    continue
                pr = j['properties']
                cloud, nod = pr.get('eo:cloud_cover', 100), pr.get('s2:nodata_pixel_percentage', 100)
                score = cloud + nod * 0.5
                if cloud <= max_cloud and (best is None or score < best[0]):
                    best = (score, p, pr.get('datetime', '')[:10])
        if best and best[0] < 2:
            break
    return best and (best[1], best[2])


def s2_sample(scenes, fr, E, N, out_res, band='TCI'):
    """Sentinel-2 band(s) sampled at local (E, N), filled scene by scene where the earlier ones have no data."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import from_bounds
    lon, lat = fr.ll(E, N)
    if not scenes:
        raise ValueError('no clear Sentinel-2 scene found')
    out = None
    for pre, _ in scenes:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif'):
            with rasterio.open(f'{S2}{pre}{band}.tif') as src:
                utm = Transformer.from_crs(4326, src.crs, always_xy=True)
                x, y = utm.transform(lon, lat)
                pad = 40
                w = from_bounds(x.min() - pad, y.min() - pad, x.max() + pad, y.max() + pad, src.transform)
                scale = max(1, out_res / 10)
                shape = (src.count, max(8, int(w.height / scale)), max(8, int(w.width / scale)))
                a = src.read(window=w, out_shape=shape, boundless=True, fill_value=0, resampling=Resampling.average).astype(np.float32)
                wt = src.window_transform(w)
        col = (x - wt.c) / wt.a * shape[2] / w.width - 0.5
        row = (y - wt.f) / wt.e * shape[1] / w.height - 0.5
        v = np.stack([ndimage.map_coordinates(a[b], [row, col], order=1 if out_res >= 10 else 3, mode='constant', cval=0) for b in range(a.shape[0])], -1)
        valid = ndimage.map_coordinates((a.min(0) > 0).astype(np.float32), [row, col], order=0, mode='constant', cval=0) > 0.5
        if out is None:
            out, have = np.zeros_like(v), np.zeros(valid.shape, bool)
        put = valid & ~have
        out[put] = v[put]; have |= valid
    if not have.all():
        # Anything no scene covers takes the colour of the nearest covered point.
        near = ndimage.distance_transform_edt(~have, return_distances=False, return_indices=True)
        out = out[tuple(near)]
    return out


def s2_colour(scenes, fr, E, N, out_res):
    # TCI maps reflectance 0..0.2 (L2A digital numbers 0..2000) onto 1..255.
    return s2_sample(scenes, fr, E, N, out_res, 'TCI') / 255 * 0.2


def s2_water(scenes, fr, E, N, out_res):
    """Open water from the normalised difference water index (green against near infrared)."""
    g = s2_sample(scenes, fr, E, N, out_res, 'B03')[..., 0]
    nir = s2_sample(scenes, fr, E, N, out_res, 'B08')[..., 0]
    # Scenes from processing baseline 04.00 (2022 on) carry a +1000 offset.
    off = 1000 if scenes[0][1] >= '2022-01-25' else 0
    g, nir = g - off, nir - off
    ndwi = (g - nir) / np.maximum(g + nir, 1)
    return ndwi > 0.05


def terrarium(fr, E, N, z):
    lon, lat = fr.ll(E, N)
    n2 = 2 ** z
    tx = (lon + 180) / 360 * n2
    ty = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / np.pi) / 2 * n2
    x0, x1, y0, y1 = int(tx.min()), int(tx.max()), int(ty.min()), int(ty.max())
    mos = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.float32)
    for X in range(x0, x1 + 1):
        for Y in range(y0, y1 + 1):
            a = np.asarray(Image.open(io.BytesIO(get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{X}/{Y}.png'))).convert('RGB')).astype(np.float32)
            mos[(Y - y0) * 256:(Y - y0 + 1) * 256, (X - x0) * 256:(X - x0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return ndimage.map_coordinates(mos, [(ty - y0) * 256 - 0.5, (tx - x0) * 256 - 0.5], order=1, mode='nearest')


# ---------- Amphitheatre: stage roof and seating ----------

def seating(cfg, fr, dtm, dsm, half, res):
    """Rows: arcs about a focus behind the stage, each row's real height (it may lean a little across the bowl,
    as the lidar shows), and the span each row covers between the trees and rock that line the bowl."""
    s = cfg['seating']
    F, rd, n_rows, r0, cx = s['focus'], s['rowDepth'], s['rows'], s['firstRow'], s.get('centreX', 0)
    f = math.radians(fr.facing)

    def samp(img, x, z):
        e = x * math.cos(f) - z * math.sin(f)
        n = -x * math.sin(f) - z * math.cos(f)
        return ndimage.map_coordinates(img, [(half - n) / res, (e + half) / res], order=1, mode='nearest')
    chm = dsm - dtm
    th = np.radians(np.arange(-60, 60.01, 0.25))

    def arc(r):
        return cx + (F + r) * np.sin(th), -F + (F + r) * np.cos(th)
    # Scene y = 0 is the ground in front of the stage, between the deck and row 1.
    mid = np.abs(th) < math.radians(6)
    z0 = float(np.median(np.concatenate([samp(dtm, *arc(r))[mid] for r in np.arange(0.5, r0 - 0.4, 0.5)])))
    spans, prof = [], []
    for i in range(n_rows):
        r = r0 + (i + 0.5) * rd
        h, c = samp(dtm, *arc(r)), samp(chm, *arc(r))
        ok = (np.abs(h - np.median(h[mid])) < 1.2) & (c < 1.2)
        ok = ndimage.binary_closing(ok, structure=np.ones(21), border_value=0) | ok
        lab, _ = ndimage.label(ok)
        k = lab[np.argmin(np.abs(th))]
        span = th[lab == k] if k else th[mid]
        spans.append(((F + r) * span.min(), (F + r) * span.max()))
        prof.append((r, h))
    # Straight edges in plan, fitted to the row ends with outliers (gaps in the trees) trimmed.
    R = np.array([p[0] for p in prof]); S = np.array(spans)
    edges = []
    for j in range(2):
        keep = np.ones(len(R), bool)
        for _ in range(4):
            c = np.polyfit(R[keep], S[keep, j], 1)
            err = np.abs(np.polyval(c, R) - S[:, j])
            keep = err < max(1.0, np.percentile(err, 70))
        edges.append(c)
    rows = []
    for r, h in prof:
        a0, a1 = np.polyval(edges[0], r) / (F + r), np.polyval(edges[1], r) / (F + r)
        sel = (th >= a0) & (th <= a1)
        cf = np.polyfit(np.degrees(th[sel]), h[sel] - z0, 2)
        rows.append([round(r - rd / 2, 3), round(math.degrees(a0), 2), round(math.degrees(a1), 2), *[round(float(v), 4) for v in cf[::-1]]])
    return {'focus': F, 'centreX': cx, 'rowDepth': rd, 'rise': s['rise'], 'rows': rows}, z0


def row_height(row, deg):
    return row[3] + row[4] * deg + row[5] * deg * deg


def stage_roof(e, n, z, c, cfg):
    """Footprint of the stage roof: the largest connected patch of high returns near the stage, fitted with the
    smallest rectangle that holds it."""
    r, res = cfg['roof'], 0.5
    x0, y0 = r['near'][0] - 40, r['near'][1] + 40
    m = (c == 1) & (e > x0) & (e < x0 + 80) & (n < y0) & (n > y0 - 80)
    ix, iy = ((e[m] - x0) / res).astype(int), ((y0 - n[m]) / res).astype(int)
    top = np.full((160, 160), -1e9, np.float32)
    np.maximum.at(top, (iy, ix), z[m])
    high = ndimage.maximum_filter(top, 3) > r['minZ']
    lab, nl = ndimage.label(high)
    k = np.argmax(ndimage.sum(high, lab, range(1, nl + 1))) + 1
    ys, xs = np.nonzero(lab == k)
    P = np.stack([x0 + (xs + 0.5) * res, y0 - (ys + 0.5) * res], 1)
    mu = P.mean(0); best = None
    for a in np.radians(np.arange(-45, 45, 0.25)):
        R = np.array([[math.cos(a), math.sin(a)], [-math.sin(a), math.cos(a)]]); Q = (P - mu) @ R.T
        lo, hi = Q.min(0), Q.max(0); A = np.prod(hi - lo)
        if best is None or A < best[0]:
            best = (A, a, lo, hi)
    A, a, lo, hi = best
    ctr = mu + np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]]) @ ((lo + hi) / 2)
    return {'centre': ctr.tolist(), 'angle': math.degrees(a), 'depth': float(hi[0] - lo[0] + res), 'width': float(hi[1] - lo[1] + res),
            'top': float(np.percentile(top[lab == k], 90))}


# ---------- Buildings and trees ----------

def roughness(a, size=5):
    return np.sqrt(np.maximum(ndimage.uniform_filter(a ** 2, size) - ndimage.uniform_filter(a, size) ** 2, 0))


def building_mask(dtm, dsm, counts, res, classified):
    """Cells under a building roof: the survey's own building class where it has one, otherwise tall, flat-topped,
    solid areas that are not plants."""
    chm = dsm - dtm
    if classified:
        m = ndimage.binary_closing(counts['bld'] > 0, iterations=2) & (chm > 2.0)
    else:
        # Roofs and grandstands are planes (flat or pitched); canopy is bumpy. Curvature tells them apart where
        # plain roughness would also reject a sloping stand. Some surveys call low flat roofs plants, so a really
        # smooth surface is kept whatever its class.
        r = ndimage.uniform_filter(np.abs(ndimage.laplace(ndimage.median_filter(dsm, 3))), 5) * (0.5 / res)
        flat = (chm > 2.5) & (r < 0.25) & ((counts['veg'] == 0) | (r < 0.1))
        m = ndimage.binary_closing(ndimage.binary_opening(flat, iterations=2), iterations=2)
    m = ndimage.binary_fill_holes(m) & (chm > 2.0) | (m & (chm > 2.0))
    lab, nl = ndimage.label(m)
    if nl:
        area = ndimage.sum(m, lab, range(1, nl + 1)) * res * res
        m &= np.isin(lab, np.nonzero(area >= 25)[0] + 1)
    return m


def polygons(mask, E0, N0, res, tol):
    """Outer rings and holes of a region mask as lists of (east, north), simplified to tol metres."""
    from skimage import measure
    pad = np.pad(mask, 1).astype(np.float32)
    rings = []
    for c in measure.find_contours(pad, 0.5):
        c = measure.approximate_polygon(c, tol / res)
        if len(c) < 4:
            continue
        e = E0 + (c[:, 1] - 1) * res
        n = N0 - (c[:, 0] - 1) * res
        area = 0.5 * np.sum(e[:-1] * n[1:] - e[1:] * n[:-1])
        rings.append((area, np.stack([e, n], 1)))
    outer = [r for a, r in rings if a < 0]  # find_contours runs clockwise around filled regions in (row, col)
    holes = [r for a, r in rings if a > 0]
    if not outer:
        outer, holes = holes, []
    from shapely.geometry import Point, Polygon
    out = []
    for o in outer:
        p = Polygon(o)
        out.append((o, [h for h in holes if p.contains(Point(h.mean(0))) and abs(0.5 * np.sum(h[:-1, 0] * h[1:, 1] - h[1:, 0] * h[:-1, 1])) > 30]))
    return out


def buildings(dtm, dsm, mask, half, res, step, tol, keep=None):
    """Buildings as stacked prisms: each building is split where its roof height changes by more than `step`, and
    every part becomes a footprint polygon from the ground to its roof. Returns [(base, top, ring, holes)] in local
    east/north."""
    E0, N0 = -half, half
    lab, nl = ndimage.label(mask)
    objs = ndimage.find_objects(lab)
    out = []
    for k, sl in enumerate(objs, 1):
        if sl is None:
            continue
        sl = (slice(max(0, sl[0].start - 1), sl[0].stop + 1), slice(max(0, sl[1].start - 1), sl[1].stop + 1))
        m = lab[sl] == k
        if keep is not None and not keep(sl, m):
            continue
        top = ndimage.median_filter(np.where(m, dsm[sl], 0), 3)
        h = top - dtm[sl]
        base = float(np.percentile(dtm[sl][m], 15))
        e0, n0 = E0 + sl[1].start * res, N0 - sl[0].start * res
        hv = h[m]
        if hv.max() - hv.min() < step * 1.2:
            levels = [(m, float(np.percentile(top[m], 60)))]
        else:
            # Quantise roof height, clean the steps up, and give every connected part its own height.
            q = np.round((top - base) / step).astype(int)
            q = ndimage.median_filter(np.where(m, q, -1), 5)
            levels = []
            for v in np.unique(q[m]):
                part = (q == v) & m
                pl, pn = ndimage.label(part)
                for j in range(1, pn + 1):
                    pm = pl == j
                    if pm.sum() * res * res < 12:
                        continue
                    levels.append((pm, float(np.percentile(top[pm], 60))))
            # Cells left out of every part (small slivers) join the lowest part around them.
            covered = np.zeros_like(m)
            for pm, _ in levels:
                covered |= pm
            if (m & ~covered).sum() and levels:
                low = min(levels, key=lambda t: t[1])
                low[0][m & ~covered] = True
        for pm, t in levels:
            if t - base < 2.0:
                continue
            for ring, holes in polygons(pm, e0, n0, res, tol):
                out.append((base, t, ring, holes))
    return out


def trees(dtm, dsm, counts, half, res, blocked):
    """Trees: local maxima of the canopy height at least 2.5 m tall, one per 3 m, away from buildings."""
    chm = ndimage.gaussian_filter(dsm - dtm, 0.7)
    E, N = grid(half, res)
    rough = roughness(dsm)
    tall = (chm > 2.5) & ~blocked
    peak = (chm == ndimage.maximum_filter(chm, size=int(3 / res) | 1)) & tall & ((rough >= 0.12) | (counts['veg'] > 0))
    ys, xs = np.nonzero(peak)
    out = []
    for y, x in zip(ys, xs):
        h = float(chm[y, x])
        # Crown radius: how far the canopy stays above half the tree's height, in 8 directions.
        rr = []
        for a in np.linspace(0, 2 * np.pi, 8, endpoint=False):
            r = 0.5
            while r < 8:
                yy, xx = int(round(y - math.sin(a) * r / res)), int(round(x + math.cos(a) * r / res))
                if not (0 <= yy < chm.shape[0] and 0 <= xx < chm.shape[1]) or chm[yy, xx] < h * 0.45:
                    break
                r += res
            rr.append(r)
        out.append([float(E[y, x]), float(N[y, x]), float(dtm[y, x]), h, float(np.mean(rr))])
    return out


def rect_mask(fr, E, N, rects, pad=0.0):
    X, Z = to_scene(fr, E, N)
    m = np.zeros(E.shape, bool)
    for x0, z0, x1, z1 in rects:
        m |= (X >= min(x0, x1) - pad) & (X <= max(x0, x1) + pad) & (Z >= min(z0, z1) - pad) & (Z <= max(z0, z1) + pad)
    return m


# ---------- Main ----------

def main(path):
    cfg = json.load(open(path))
    out = os.path.join(ROOT, 'app', 'venues3d', cfg['id'])
    os.makedirs(out, exist_ok=True)
    core = cfg['core']
    half, res = core['half'], core['res']
    amphi = 'roof' in cfg

    fr0 = Frame(cfg['lat'], cfg['lon'], cfg.get('facing', 90))
    e, n, z, c, inten, rgb = lidar(cfg, fr0, half * 1.45)
    if amphi:
        # The stage roof found in the lidar fixes the true origin and facing.
        roof = stage_roof(e, n, z, c, cfg)
        facing = cfg.get('facing', 90 - roof['angle'])
        ua = math.radians(90 - facing)
        u = np.array([math.cos(ua), math.sin(ua)])  # towards the stage
        o = np.array(roof['centre']) - u * (roof['depth'] / 2 - cfg['roof']['overhang'])
        print(f"stage roof {roof['width']:.1f} x {roof['depth']:.1f} m, top {roof['top']:.1f}")
    else:
        facing, o = cfg['facing'], np.zeros(2)
    lon0, lat0 = fr0.ll(o[0], o[1])
    fr = Frame(float(lat0), float(lon0), facing)
    e, n = e - o[0], n - o[1]
    print(f"facing {facing:.1f} deg; origin {lat0:.6f}, {lon0:.6f}; {len(e)} points")

    dtm, dsm, ig, counts = rasterize(e, n, z, c, inten, half, res)
    classified = counts['bld'].sum() > 1000
    E, N = grid(half, res)
    lowered = dtm.copy()
    manifest_extra = {}
    clear = cfg.get('clear', [])
    if amphi:
        seats, z0 = seating(cfg, fr, dtm, dsm, half, res)
        print(f"{len(seats['rows'])} rows, floor at {z0:.2f} m, top row +{seats['rows'][-1][3]:.1f} m")
        # Under the rows the ground is dropped a little so the modelled steps sit on it without the lidar poking through.
        X, Z = to_scene(fr, E, N)
        Xc = X - seats['centreX']
        rr = np.hypot(Xc, Z + seats['focus']) - seats['focus']
        th = np.degrees(np.arctan2(Xc, Z + seats['focus']))
        for row in seats['rows']:
            r, a0, a1 = row[:3]
            m = (rr >= r - 0.3) & (rr < r + seats['rowDepth'] + 0.3) & (th >= a0 - 0.4) & (th <= a1 + 0.4)
            lowered[m] = np.minimum(dtm[m], z0 + row_height(row, th[m]) - 0.5)
        # The stage deck and the pit in front of it are flat: the lidar has no ground under the roof, only a guess.
        R = roof
        rc = np.array(R['centre']) - o
        v = np.array([-u[1], u[0]])
        du = (E - rc[0]) * u[0] + (N - rc[1]) * u[1]
        dv = (E - rc[0]) * v[0] + (N - rc[1]) * v[1]
        stage = (np.abs(dv) < R['width'] / 2 + 1) & (du < R['depth'] / 2 + 1) & (du > -R['depth'] / 2 + cfg['roof']['overhang'] - cfg['seating']['firstRow'] + 0.2)
        lowered[stage] = np.minimum(lowered[stage], z0 - 0.15)
        rd = roof['centre'][0] - o[0], roof['centre'][1] - o[1]
        rx, rz = to_scene(fr, *rd)
        manifest_extra['roof'] = {'at': [round(float(rx), 2), round(float(rz), 2)], 'width': round(roof['width'], 2), 'depth': round(roof['depth'], 2), 'top': round(roof['top'] - z0, 2)}
        manifest_extra['seating'] = seats
        clear = clear + [[rx - roof['width'] / 2 - 4, rz - roof['depth'] / 2 - 4, rx + roof['width'] / 2 + 4, rz + roof['depth'] / 2 + 4]]
        level = 'ground'
    else:
        lv = cfg.get('level', {})
        level = lv.get('kind', 'ground')
        # `flat` (default: the cleared area) is what gets levelled; on a sloping lawn or sunken plaza only the stage
        # is, and the crowd stands on the real ground.
        flat = cfg.get('flat', clear)
        inside = rect_mask(fr, E, N, flat[:1])
        if level == 'roof':
            # The venue is on a roof or deck: y = 0 is that surface, measured from the lidar, or given.
            z0 = float(lv['elevation']) if 'elevation' in lv else float(np.median(dsm[inside]))
        else:
            z0 = float(lv['elevation']) if 'elevation' in lv else float(np.median(dtm[inside]))
            # The venue's own ground is levelled to y = 0, blending into the real ground over `blend` metres.
            d = ndimage.distance_transform_edt(~rect_mask(fr, E, N, flat), sampling=res)
            w = np.clip(1 - d / lv.get('blend', 10), 0, 1)
            w = w * w * (3 - 2 * w)
            lowered = lowered * (1 - w) + z0 * w
        print(f'level {level} at {z0:.2f} m')

    # Buildings and trees, leaving out anything standing in the venue's own area.
    venue_area = rect_mask(fr, E, N, clear, 2) if clear else np.zeros(E.shape, bool)
    bmask = building_mask(dtm, dsm, counts, res, classified)

    def keep_core(sl, m):
        # On a roof the building under the venue stays: it is what the venue stands on.
        return level == 'roof' or not (venue_area[sl] & m).sum() > 0.2 * m.sum()
    blds = buildings(dtm, dsm, bmask, half, res, cfg.get('buildingStep', 3.0), 1.0, keep_core)
    if level == 'roof':
        from shapely.geometry import Point, Polygon
        x0, z0r, x1, z1r = clear[0]
        ce, cn = from_scene(fr, (x0 + x1) / 2, (z0r + z1r) / 2)
        area = Polygon(np.stack(from_scene(fr, np.array([x0, x1, x1, x0]), np.array([z0r, z0r, z1r, z1r])), 1))
        # The part the venue stands on is cut to the venue's floor; anything else standing over the venue goes.
        out, host = [], 0
        for b in blds:
            P = Polygon(b[2])
            if P.contains(Point(float(ce), float(cn))):
                out.append((b[0], z0 - 0.03, b[2], b[3])); host += 1
            elif not P.intersects(area) or b[1] <= z0 + 0.5:
                out.append(b)
        blds = out
        print(f'venue stands on {host} roof part(s)')
    blocked = ndimage.binary_dilation(bmask, iterations=2) | venue_area
    trs = trees(dtm, dsm, counts, half, res, blocked)
    print(f'{len(trs)} trees, {len(blds)} building parts ({"classified" if classified else "found from the shape of the returns"})')

    # Buildings further out, from a thinned read of the same survey.
    if 'outer' in cfg:
        oc = cfg['outer']
        e2, n2, z2, c2, i2, _ = lidar(cfg, fr, oc['half'] * 1.02, '-outer', oc.get('spacing', 1.2))
        e2, n2 = e2 - o[0], n2 - o[1]
        dtm2, dsm2, _, counts2 = rasterize(e2, n2, z2, c2, i2, oc['half'], oc['res'])
        E2, N2 = grid(oc['half'], oc['res'])
        inner = (np.abs(E2) < half - 6) & (np.abs(N2) < half - 6)
        bm2 = building_mask(dtm2, dsm2, counts2, oc['res'], classified) & ~inner

        def keep_outer(sl, m):
            return not (inner[sl] & m).any()
        more = buildings(dtm2, dsm2, bm2, oc['half'], oc['res'], cfg.get('outerStep', 6.0), oc['res'] * 1.2, keep_outer)
        print(f'{len(more)} more building parts out to {oc["half"]} m')
        blds += more

    # Water: lidar water returns near the venue, the water index everywhere.
    rings_cfg = {k: cfg[k] for k in ('mid', 'far')}
    s2cfg = cfg.get('sentinel', {})
    months = s2cfg.get('months', [6, 7, 8, 9] if cfg['lat'] > 30 else [3, 4, 5, 10, 11])
    Ef, Nf = grid(rings_cfg['far']['half'], rings_cfg['far']['res'])
    tiles = s2cfg.get('tiles') or s2_tiles(fr, Ef, Nf)
    scenes = [(s2cfg['scene'], s2cfg['date'])] if 'scene' in s2cfg else []
    for t in tiles:
        s = s2_scene(t, months)
        if s and all(s[0] != q[0] for q in scenes) and f'/{int(t[:2])}/{t[2]}/{t[3:]}/' not in ''.join(q[0] for q in scenes):
            scenes.append(s)
    first = s2_tiles(fr, np.zeros((1, 1)), np.zeros((1, 1)))[0]
    scenes.sort(key=lambda s: f'/{int(first[:2])}/{first[2]}/{first[3:]}/' not in s[0])
    print('sentinel-2:', ', '.join(f"{s[0].split('/')[-2]}" for s in scenes))

    water = s2_water(scenes, fr, E, N, 10) & (counts['bld'] == 0)
    if counts['water'].sum() > 100:
        water = ndimage.binary_closing(ndimage.binary_dilation(counts['water'] > 0, iterations=1), iterations=3) | (water & ~(dsm - dtm > 1.5))
    water = ndimage.binary_opening(water, iterations=2) & ~venue_area
    wl = float(np.median(dtm[water])) if water.sum() > 200 else None
    if wl is not None:
        lowered[water] = np.minimum(lowered[water], wl)

    vis = sky_visibility(np.maximum(dsm, lowered), res)
    img, lo = enc_height(lowered - z0, vis)
    img.save(os.path.join(out, 'core-height.png'), optimize=True)
    Image.fromarray((water * 255).astype(np.uint8)).save(os.path.join(out, 'core-water.png'), optimize=True)

    # Albedo at twice the height grid.
    k2 = (dtm.shape[0] - 1) * 2
    Ea, Na = grid(half, res / 2)
    if rgb is not None:
        lin = raster_rgb(e, n, rgb, half, res / 2) * cfg.get('rgbGain', 1.0)
        src = 'point colour'
    else:
        col = s2_colour(scenes, fr, Ea, Na, res / 2)
        ii = ndimage.zoom(ig, (Ea.shape[0] / ig.shape[0]), order=1)[:Ea.shape[0], :Ea.shape[1]]
        ii = ndimage.gaussian_filter(ii, 0.6)
        det = np.clip((ii / np.maximum(ndimage.gaussian_filter(ii, 12), 1)) ** 0.55, 0.7, 1.35)
        lin = col * det[..., None] * cfg.get('albedoGain', 2.0)
        src = 'Sentinel-2 and lidar intensity'
    Image.fromarray((srgb(lin) * 255).astype(np.uint8)).resize((k2, k2), Image.LANCZOS).save(os.path.join(out, 'core-albedo.jpg'), quality=86)
    print('core albedo from', src)

    rings = {}
    for name in ('mid', 'far'):
        r = rings_cfg[name]
        E2, N2 = grid(r['half'], r['res'])
        h = terrarium(fr, E2, N2, r['zoom'])
        col = s2_colour(scenes, fr, E2, N2, r['res'])
        wm = s2_water(scenes, fr, E2, N2, r['res'])
        wm = ndimage.binary_opening(wm, iterations=1)
        if wm.sum():
            # The terrain tiles carry the sea floor; water is drawn at its surface.
            lvl = wl if wl is not None else float(np.percentile(h[wm], 70))
            h = np.where(wm, lvl, h)
        h = h - z0
        img, lo2 = enc_height(h)
        img.save(os.path.join(out, f'{name}-height.png'), optimize=True)
        Image.fromarray((wm * 255).astype(np.uint8)).save(os.path.join(out, f'{name}-water.png'), optimize=True)
        Image.fromarray((srgb(col * cfg.get('albedoGain', 2.0)) * 255).astype(np.uint8)).save(os.path.join(out, f'{name}-albedo.jpg'), quality=85)
        rings[name] = {'half': r['half'], 'res': r['res'], 'min': lo2, 'size': E2.shape[0]}

    def sp(ee, nn):
        x, zz = to_scene(fr, ee, nn)
        return round(float(x), 1), round(float(zz), 1)

    def ring_xz(ring):
        x, zz = to_scene(fr, ring[:, 0], ring[:, 1])
        return [v for p in zip(np.round(x, 1).tolist(), np.round(zz, 1).tolist()) for v in p]
    bl = [{'b': round(b - z0, 1), 't': round(t - z0, 1), 'p': ring_xz(r), **({'h': [ring_xz(h) for h in hs]} if hs else {})} for b, t, r, hs in blds]
    s2_dates = sorted({s[1] for s in scenes})
    credits = [
        {'what': 'Ground, buildings and trees', 'src': f"USGS 3D Elevation Program lidar, {cfg['lidar']} (public domain)", 'url': 'https://registry.opendata.aws/usgs-lidar/'},
        {'what': 'Ground colour' if rgb is None else 'Colour beyond the site', 'src': f"Copernicus Sentinel-2 L2A, {', '.join(s2_dates)} (contains modified Copernicus Sentinel data)", 'url': 'https://registry.opendata.aws/sentinel-2-l2a-cogs/'},
        {'what': 'Land to the horizon', 'src': 'Terrain Tiles on AWS (USGS 3DEP, SRTM and others)', 'url': 'https://registry.opendata.aws/terrain-tiles/'},
    ]
    if rgb is not None:
        credits.insert(1, {'what': 'Ground colour', 'src': 'Colour carried in the lidar survey (from aerial photos flown with it)', 'url': 'https://registry.opendata.aws/usgs-lidar/'})
    manifest = {
        'id': cfg['id'], 'name': cfg['name'], 'kind': 'amphi' if amphi else 'site', 'level': level,
        'lat': round(float(lat0), 6), 'lon': round(float(lon0), 6), 'facing': round(facing, 1),
        'elevation': round(z0, 2),
        'core': {'half': half, 'res': res, 'min': lo, 'size': dtm.shape[0], 'albedo': k2},
        **rings,
        **manifest_extra,
        'clear': [[round(v, 1) for v in r] for r in clear],
        'trees': [[*sp(t[0], t[1]), round(t[2] - z0, 2), round(t[3], 2), round(t[4], 2)] for t in trs],
        'buildings': bl,
        'credits': cfg.get('credits', credits),
        'built': cfg.get('notes', ''),
    }
    manifest['water'] = bool(water.any())
    manifest['reach'] = cfg['outer']['half'] if 'outer' in cfg else half
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), separators=(',', ':'))
    print('wrote', out, f"({sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out)) / 1e6:.1f} MB)")


if __name__ == '__main__':
    main(sys.argv[1])
