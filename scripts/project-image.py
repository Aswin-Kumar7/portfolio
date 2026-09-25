"""Prepare a project photo or screenshot for the site (needs Pillow: pip install pillow).

    python scripts/project-image.py design/source-images/iitpr1.jpeg roadsos

Writes public/assets/projects/<name>-<width>.bin for 640, 960 and 1280 px (never wider than the
original, whose own width becomes the top size when it's smaller), plus <name>-blur.bin for the
card's blurred backdrop. The files are WebP, scrambled (XOR with KEY) so they don't open as
images from the network panel; src/components/VeiledImage.tsx unscrambles them in the page.
Then add `image: { name, widths, aspect, alt }` to the project in src/data/resume.ts.
Keep originals in design/source-images/ (git-ignored), never in public/.
"""

import io
import pathlib
import sys

from PIL import Image, ImageOps

KEY = b'aswinkumar.dev'  # must match src/components/VeiledImage.tsx


def veil(im: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, method=6)
    data = bytearray(buf.getvalue())
    for i in range(len(data)):
        data[i] ^= KEY[i % len(KEY)]
    return bytes(data)


src, name = pathlib.Path(sys.argv[1]), sys.argv[2]
out = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'projects'
out.mkdir(parents=True, exist_ok=True)

im = ImageOps.exif_transpose(Image.open(src))  # upright, whatever the camera said
if im.mode in ('RGBA', 'LA', 'P'):
    # transparent edges (window captures) sit on the site's dark ink instead of turning a random colour
    im = im.convert('RGBA')
    im = Image.alpha_composite(Image.new('RGBA', im.size, (2, 4, 11, 255)), im)
im = im.convert('RGB')
widths = [w for w in (640, 960, 1280) if w <= im.width]
if im.width < 1280:
    widths.append(im.width)
for w in widths:
    (out / f'{name}-{w}.bin').write_bytes(veil(im.resize((w, round(w * im.height / im.width)), Image.LANCZOS), 82))
(out / f'{name}-blur.bin').write_bytes(veil(im.resize((64, round(64 * im.height / im.width)), Image.LANCZOS), 60))
aspect = round(im.width / im.height, 4)
print(f"{name}: image: {{ name: '{name}', widths: {widths}, aspect: {aspect}, alt: '…' }}")
