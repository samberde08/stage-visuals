# HDRI skies

Equirectangular HDR images from [Poly Haven](https://polyhaven.com/hdris), released under CC0 (public domain). The 1k versions here are the copies distributed with the three.js examples and the pmndrs drei-assets repository.

| File | Poly Haven page | Used for |
| --- | --- | --- |
| `forest_slope_1k.hdr` | https://polyhaven.com/a/forest_slope | Midday in forest venues (Electric Forest) |
| `quarry_01_1k.hdr` | https://polyhaven.com/a/quarry_01 | Midday under a clear sky (every open-air site except Electric Forest) |
| `kiara_1_dawn_1k.hdr` | https://polyhaven.com/a/kiara_1_dawn | Sunrise and sunset over rocky, arid land (Red Rocks, The Gorge, Las Vegas, Coachella) |
| `venice_sunset_1k.hdr` | https://polyhaven.com/a/venice_sunset | Sunset over the bay (CRSSD) |
| `blouberg_sunrise_2_1k.hdr` | https://polyhaven.com/a/blouberg_sunrise_2 | Sunrise and sunset in coastal and city sites (Miami, Brooklyn, Chicago, Detroit) |
| `spruit_sunrise_1k.hdr` | https://polyhaven.com/a/spruit_sunrise | Sunrise and sunset over fields and woods |
| `dikhololo_night_1k.hdr` | https://polyhaven.com/a/dikhololo_night | Night at Red Rocks |
| `moonless_golf_1k.hdr` | https://polyhaven.com/a/moonless_golf | Night in the woods (Electric Forest, Lost Lands) |

The app picks a midday, a golden-hour and, for wooded sites, a night image per venue (other sites get a plain night sky, so city light glow and the scenery's lit windows read clearly) (`scenery` in `app/venues.js`), crossfades them by sun height, and turns each daytime image so its sun lines up with the sun computed for the venue and time. They are generic skies matched to each site's landscape, not photos taken at the venues.
