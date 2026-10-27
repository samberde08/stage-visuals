"""Build a venue pack (app/venues3d/<id>/) from public survey data.

  python3 tools/venue3d/build_pack.py tools/venue3d/red-rocks.json

A pack is the real site around one venue, in the scene's frame (origin at downstage centre, y up, metres):

  core-height.png   the ground and rocks near the venue, from USGS 3DEP lidar: 0.5 m grid, height in R*256+G
                    centimetres above manifest.core.min, baked sky visibility (ambient occlusion) in B
  core-albedo.jpg   ground colour: Sentinel-2 true colour (10 m) sharpened with the lidar's own return intensity
  mid-*/far-*       the land out to a few km and to the horizon, from the AWS Terrain Tiles and Sentinel-2
  manifest.json     where it all goes, plus what was measured from the lidar: stage roof, seating rows,
                    trees and buildings, and credits

Everything is fetched from open data buckets on AWS that need no account. Downloads are cached in
tools/venue3d/.cache/. Needs numpy, scipy, pillow, pyproj, rasterio, laspy[lazrs].
"""
import io, json, math, os, sys, urllib.request
import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy import ndimage
from scipy.interpolate import LinearNDInterpolator
from scipy.spatial import Delaunay

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, '.cache')


def get(url):
    path = os.path.join(CACHE, url.split('://', 1)[1].replace('/', '_'))
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


# ---------- Lidar ----------

def lidar(cfg, fr, half):
    """Ground (DTM) and first-surface (DSM) grids and return intensity, from the EPT copy of 3DEP."""
    cache = os.path.join(CACHE, f"{cfg['id']}-lidar.npz")
    if not os.path.exists(cache):
        sys.path.insert(0, HERE)
        from fetch_lidar import main as fetch
        os.makedirs(CACHE, exist_ok=True)
        fetch(cfg['lidar'], fr.lat, fr.lon, half * 1.45, cache)
    d = np.load(cache)
    # fetch_lidar's metres are mercator scaled by cos(lat) about its own centre; re-centre on the origin.
    e, n = d['e'], d['n']
    keep = (d['c'] != 7) & (d['c'] != 18)  # low and high noise
    return e[keep], n[keep], d['z'][keep], d['c'][keep], d['i'][keep].astype(np.float32)


def rasterize(e, n, z, c, inten, half, res):
    E, N = grid(half, res)
    k = E.shape[0]
    g = c == 2
    sel = g & (np.abs(e) < half + 8) & (np.abs(n) < half + 8)
    dtm = LinearNDInterpolator(Delaunay(np.stack([e[sel], n[sel]], 1)), z[sel])(E, N).astype(np.float32)
    dtm = np.where(np.isnan(dtm), np.nanmedian(dtm), dtm)
    ix = np.round((e + half) / res).astype(int)
    iy = np.round((half - n) / res).astype(int)
    ok = (ix >= 0) & (ix < k) & (iy >= 0) & (iy < k)
    ix, iy, zz, ii = ix[ok], iy[ok], z[ok], inten[ok]
    dsm = np.full((k, k), -1e9, np.float32)
    np.maximum.at(dsm, (iy, ix), zz)
    dsm = np.where(dsm < -1e8, np.nan, dsm)
    dsm = np.fmax(dsm, dtm)
    dsm = np.where(np.isnan(dsm), dtm, dsm)
    # Fill single-cell dropouts in the canopy so trees and roofs read as solid.
    dsm = np.maximum(dsm, np.minimum(ndimage.maximum_filter(dsm, 3), ndimage.median_filter(dsm, 3)))
    s = np.zeros((k, k), np.float32); cnt = np.zeros((k, k), np.float32)
    gi = (c[ok] == 2)
    np.add.at(s, (iy[gi], ix[gi]), ii[gi]); np.add.at(cnt, (iy[gi], ix[gi]), 1)
    m = cnt > 0
    near = ndimage.distance_transform_edt(~m, return_distances=False, return_indices=True)
    inten_g = (s / np.maximum(cnt, 1))[tuple(near)]
    return dtm, dsm, inten_g


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


# ---------- Imagery and terrain tiles ----------

def sentinel(cfg, fr, E, N, out_res):
    """Sentinel-2 L2A true colour sampled at local (E, N), as linear reflectance."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import from_bounds
    s2 = cfg['sentinel']
    url = f"https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/{s2['tile'][:2]}/{s2['tile'][2]}/{s2['tile'][3:]}/{s2['date'][:4]}/{int(s2['date'][4:6])}/{s2['scene']}/TCI.tif"
    lon, lat = fr.ll(E, N)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif'):
        with rasterio.open(url) as src:
            utm = Transformer.from_crs(4326, src.crs, always_xy=True)
            x, y = utm.transform(lon, lat)
            pad = 40
            w = from_bounds(x.min() - pad, y.min() - pad, x.max() + pad, y.max() + pad, src.transform)
            scale = max(1, out_res / 10)
            shape = (3, max(8, int(w.height / scale)), max(8, int(w.width / scale)))
            a = src.read(window=w, out_shape=shape, boundless=True, fill_value=0, resampling=Resampling.average).astype(np.float32)
            wt = src.window_transform(w)
    col = (x - wt.c) / wt.a * shape[2] / w.width - 0.5
    row = (y - wt.f) / wt.e * shape[1] / w.height - 0.5
    # TCI maps reflectance 0..0.2 (L2A digital numbers 0..2000) onto 1..255.
    return np.stack([ndimage.map_coordinates(a[b], [row, col], order=3, mode='nearest') for b in range(3)], -1) / 255 * 0.2


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


# ---------- What the lidar shows about the venue ----------

def to_scene(fr, e, n):
    f = math.radians(fr.facing)
    return e * math.cos(f) - n * math.sin(f), -(e * math.sin(f) + n * math.cos(f))


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


def structures(cfg, dtm, dsm, half, res, skip):
    """Trees (crown tops in the canopy model) and buildings (large flat-topped blocks)."""
    chm = ndimage.gaussian_filter(dsm - dtm, 0.7)
    E, N = grid(half, res)
    # Buildings: connected areas over 2.5 m whose top is flat (low local roughness).
    rough = ndimage.generic_filter(dsm, np.std, size=5) if False else np.sqrt(np.maximum(ndimage.uniform_filter(dsm ** 2, 5) - ndimage.uniform_filter(dsm, 5) ** 2, 0))
    tall = chm > 2.5
    flat = tall & (rough < 0.35)
    lab, nl = ndimage.label(ndimage.binary_opening(flat, iterations=2))
    blds = []
    for k in range(1, nl + 1):
        m = lab == k
        area = m.sum() * res * res
        if area < 40:
            continue
        ee, nn = E[m], N[m]
        if any(abs(ee.mean() - sx) < sw and abs(nn.mean() - sz) < sw for sx, sz, sw in skip):
            continue
        P = np.stack([ee, nn], 1); mu = P.mean(0); best = None
        for a in np.radians(np.arange(0, 90, 1.0)):
            R = np.array([[math.cos(a), math.sin(a)], [-math.sin(a), math.cos(a)]]); Q = (P - mu) @ R.T
            lo, hi = Q.min(0), Q.max(0); A = np.prod(hi - lo + res)
            if best is None or A < best[0]:
                best = (A, a, lo, hi)
        A, a, lo, hi = best
        if area / A < 0.6:
            continue
        c = mu + np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]]) @ ((lo + hi) / 2)
        blds.append({'e': round(float(c[0]), 2), 'n': round(float(c[1]), 2), 'w': round(float(hi[0] - lo[0] + res), 2), 'd': round(float(hi[1] - lo[1] + res), 2),
                     'rot': round(math.degrees(a), 1), 'h': round(float(np.median(chm[m])), 2), 'base': round(float(np.percentile(dtm[m], 10)), 2)})
        tall &= ~ndimage.binary_dilation(m, iterations=3)
    # Trees: local maxima of the canopy height, at least 2.5 m tall, one per 3 m.
    peak = (chm == ndimage.maximum_filter(chm, size=int(3 / res) | 1)) & tall & (chm > 2.5) & (rough >= 0.12)
    ys, xs = np.nonzero(peak)
    trees = []
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
        trees.append([round(float(E[y, x]), 2), round(float(N[y, x]), 2), round(float(dtm[y, x]), 2), round(h, 2), round(float(np.mean(rr)), 2)])
    return trees, blds


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


# ---------- Main ----------

def main(path):
    cfg = json.load(open(path))
    out = os.path.join(ROOT, 'app', 'venues3d', cfg['id'])
    os.makedirs(out, exist_ok=True)
    core = cfg['core']
    half, res = core['half'], core['res']

    # The lidar is fetched around the configured origin; the stage roof found in it then fixes the true origin and facing.
    fr0 = Frame(cfg['lat'], cfg['lon'], 90)
    e, n, z, c, inten = lidar(cfg, fr0, half)
    roof = stage_roof(e, n, z, c, cfg)
    facing = cfg.get('facing', 90 - roof['angle'])
    ua = math.radians(90 - facing)
    u = np.array([math.cos(ua), math.sin(ua)])  # towards the stage
    o = np.array(roof['centre']) - u * (roof['depth'] / 2 - cfg['roof']['overhang'])
    lon0, lat0 = fr0.ll(o[0], o[1])
    fr = Frame(float(lat0), float(lon0), facing)
    e, n = e - o[0], n - o[1]
    print(f"stage roof {roof['width']:.1f} x {roof['depth']:.1f} m, top {roof['top']:.1f}; facing {facing:.1f} deg; origin {lat0:.6f}, {lon0:.6f}")

    dtm, dsm, ig = rasterize(e, n, z, c, inten, half, res)
    seats, z0 = seating(cfg, fr, dtm, dsm, half, res)
    print(f"{len(seats['rows'])} rows, floor at {z0:.2f} m, top row +{seats['rows'][-1][3]:.1f} m, row 1 {seats['rows'][0][1]}..{seats['rows'][0][2]} deg, top {seats['rows'][-1][1]}..{seats['rows'][-1][2]} deg")

    # Under the rows the ground is dropped a little so the modelled steps sit on it without the lidar poking through.
    E, N = grid(half, res)
    X, Z = to_scene(fr, E, N)
    Xc = X - seats['centreX']
    rr = np.hypot(Xc, Z + seats['focus']) - seats['focus']
    th = np.degrees(np.arctan2(Xc, Z + seats['focus']))
    lowered = dtm.copy()
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
    roof_skip = [(roof['centre'][0] - o[0], roof['centre'][1] - o[1], max(roof['width'], roof['depth']) / 2 + 4)]
    trees, blds = structures(cfg, dtm, dsm, half, res, roof_skip)
    print(f'{len(trees)} trees, {len(blds)} buildings')

    vis = sky_visibility(np.maximum(dsm, lowered), res)
    img, lo = enc_height(lowered - z0, vis)
    img.save(os.path.join(out, 'core-height.png'), optimize=True)

    # Albedo at twice the height grid: Sentinel-2 colour, detail from the lidar return intensity.
    k2 = (dtm.shape[0] - 1) * 2
    Ea, Na = grid(half, res / 2)
    col = sentinel(cfg, fr, Ea, Na, res / 2)
    ii = ndimage.zoom(ig, (Ea.shape[0] / ig.shape[0]), order=1)[:Ea.shape[0], :Ea.shape[1]]
    ii = ndimage.gaussian_filter(ii, 0.6)
    det = np.clip((ii / np.maximum(ndimage.gaussian_filter(ii, 12), 1)) ** 0.55, 0.7, 1.35)
    lin = col * det[..., None] * cfg['albedoGain']
    Image.fromarray((srgb(lin) * 255).astype(np.uint8)).resize((k2, k2), Image.LANCZOS).save(os.path.join(out, 'core-albedo.jpg'), quality=86)

    rings = {}
    for name in ('mid', 'far'):
        r = cfg[name]
        E2, N2 = grid(r['half'], r['res'])
        h = terrarium(fr, E2, N2, r['zoom']) - z0
        col = sentinel(cfg, fr, E2, N2, r['res'])
        img, lo2 = enc_height(h)
        img.save(os.path.join(out, f'{name}-height.png'), optimize=True)
        Image.fromarray((srgb(col * cfg['albedoGain']) * 255).astype(np.uint8)).save(os.path.join(out, f'{name}-albedo.jpg'), quality=85)
        rings[name] = {'half': r['half'], 'res': r['res'], 'min': lo2, 'size': E2.shape[0]}

    def scene_pt(ee, nn):
        x, zz = to_scene(fr, ee, nn)
        return round(float(x), 2), round(float(zz), 2)
    rd = roof['centre'][0] - o[0], roof['centre'][1] - o[1]

    def yaw(deg):
        # The building's width axis, east-counterclockwise in plan, as a three.js rotation.y in the scene.
        xv, zv = to_scene(fr, math.cos(math.radians(deg)), math.sin(math.radians(deg)))
        return math.atan2(-zv, xv)
    manifest = {
        'id': cfg['id'], 'name': cfg['name'], 'lat': round(float(lat0), 6), 'lon': round(float(lon0), 6), 'facing': round(facing, 1),
        'elevation': round(z0, 2),
        'core': {'half': half, 'res': res, 'min': lo, 'size': dtm.shape[0], 'albedo': k2},
        **rings,
        'roof': {'at': scene_pt(*rd), 'width': round(roof['width'], 2), 'depth': round(roof['depth'], 2), 'top': round(roof['top'] - z0, 2)},
        'seating': seats,
        'trees': [[*scene_pt(t[0], t[1]), round(t[2] - z0, 2), t[3], t[4]] for t in trees],
        'buildings': [{**dict(zip(('x', 'z'), scene_pt(b['e'], b['n']))), 'w': b['w'], 'd': b['d'], 'yaw': round(yaw(b['rot']), 3), 'h': b['h'], 'base': round(b['base'] - z0, 2)} for b in blds],
        'credits': cfg['credits'],
        'built': cfg['notes'],
    }
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), separators=(',', ':'))
    print('wrote', out)


if __name__ == '__main__':
    main(sys.argv[1])
