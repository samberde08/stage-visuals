"""Download USGS 3DEP lidar points for a box around a venue.

Reads the public Entwine (EPT) copy of 3DEP on AWS (usgs-lidar-public, no
account needed), keeps every point inside the box and saves them as a .npz.

  python3 tools/venue3d/fetch_lidar.py CO_DRCOG_2_2020 39.6654 -105.2057 700 out.npz
"""
import json, math, sys, io, concurrent.futures as cf, urllib.request
import numpy as np, laspy

BASE = 'https://usgs-lidar-public.s3.amazonaws.com/'
R = 6378137.0


def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except Exception:
            if i == 3:
                raise


def merc(lat, lon):
    return math.radians(lon) * R, math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R


def main(ds, lat, lon, half_m, out):
    ept = json.loads(get(f'{BASE}{ds}/ept.json'))
    cx, cy = merc(lat, lon)
    h = half_m / math.cos(math.radians(lat))  # metres on the ground -> mercator units
    box = (cx - h, cy - h, cx + h, cy + h)
    b0 = ept['bounds']

    def nb(key):
        d, x, y, z = map(int, key.split('-'))
        s = (b0[3] - b0[0]) / 2 ** d
        return b0[0] + x * s, b0[1] + y * s, b0[0] + (x + 1) * s, b0[1] + (y + 1) * s

    def hit(key):
        a = nb(key)
        return not (a[2] < box[0] or a[0] > box[2] or a[3] < box[1] or a[1] > box[3])

    nodes = []

    def walk(key):
        hier = json.loads(get(f'{BASE}{ds}/ept-hierarchy/{key}.json'))
        for k, n in hier.items():
            if not hit(k):
                continue
            if n == -1:
                if k != key:
                    walk(k)
            elif n > 0:
                nodes.append(k)
    walk('0-0-0-0')
    print(len(nodes), 'nodes', file=sys.stderr)

    def load(k):
        las = laspy.read(io.BytesIO(get(f'{BASE}{ds}/ept-data/{k}.laz')))
        x, y = np.asarray(las.x), np.asarray(las.y)
        m = (x >= box[0]) & (x <= box[2]) & (y >= box[1]) & (y <= box[3])
        return np.stack([x[m], y[m], np.asarray(las.z)[m]], 1), np.asarray(las.intensity)[m], np.asarray(las.classification)[m], np.asarray(las.return_number)[m]
    parts = list(cf.ThreadPoolExecutor(16).map(load, nodes))
    xyz = np.concatenate([p[0] for p in parts])
    # mercator -> local metres east/north of the centre
    k = math.cos(math.radians(lat))
    e = (xyz[:, 0] - cx) * k
    n = (xyz[:, 1] - cy) * k
    np.savez_compressed(out, e=e.astype(np.float32), n=n.astype(np.float32), z=xyz[:, 2].astype(np.float32),
                        i=np.concatenate([p[1] for p in parts]), c=np.concatenate([p[2] for p in parts]),
                        r=np.concatenate([p[3] for p in parts]), lat=lat, lon=lon, dataset=ds)
    print(len(e), 'points', file=sys.stderr)


if __name__ == '__main__':
    a = sys.argv
    main(a[1], float(a[2]), float(a[3]), float(a[4]), a[5])
