# Renders one labelled contact sheet (default 4x4) from a JSON spec on stdin (PIL only; run by
# tools/art/contact-sheet.mjs). Spec: {"out": path, "cols": 4, "rows": 4, "title": str,
# "tiles": [{"path": png-or-null, "label": str, "sub": str}]}. Each tile is cropped like the delivery
# encode (bottom 5% off) so the sheet shows what ships; a missing master is a grey "missing" tile.
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

spec = json.load(sys.stdin)
cols, rows = spec.get("cols", 4), spec.get("rows", 4)
TW, TH, LAB, PAD = 280, 389, 44, 10          # tile 280 x 389 (the 832x1216 ratio cropped 5%) + label strip

def font(size, bold=False):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size)

f_title, f_key, f_sub = font(20, True), font(14, True), font(12)
HEAD = 40
W = cols * TW + (cols + 1) * PAD
H = HEAD + rows * (TH + LAB) + (rows + 1) * PAD
sheet = Image.new("RGB", (W, H), (22, 24, 32))
d = ImageDraw.Draw(sheet)
d.text((PAD, 8), spec.get("title", ""), fill=(235, 238, 245), font=f_title)

for i, t in enumerate(spec["tiles"][: cols * rows]):
    r, c = divmod(i, cols)
    x = PAD + c * (TW + PAD)
    y = HEAD + PAD + r * (TH + LAB + PAD)
    if t.get("path") and os.path.exists(t["path"]):
        im = Image.open(t["path"]).convert("RGB")
        im = im.crop((0, 0, im.width, int(im.height * 0.95)))
        im.thumbnail((TW, TH), Image.LANCZOS)
        tile = Image.new("RGB", (TW, TH), (10, 10, 14))
        tile.paste(im, ((TW - im.width) // 2, (TH - im.height) // 2))
        sheet.paste(tile, (x, y))
        d.rectangle([x, y, x + TW - 1, y + TH - 1], outline=(70, 76, 96))
    else:
        d.rectangle([x, y, x + TW - 1, y + TH - 1], fill=(48, 50, 58), outline=(120, 70, 70))
        d.text((x + TW // 2 - 28, y + TH // 2 - 8), "missing", fill=(200, 170, 170), font=f_key)
    d.text((x + 2, y + TH + 4), t.get("label", ""), fill=(255, 255, 255), font=f_key)
    d.text((x + 2, y + TH + 22), (t.get("sub", "") or "")[:38], fill=(160, 168, 190), font=f_sub)

os.makedirs(os.path.dirname(spec["out"]), exist_ok=True)
sheet.save(spec["out"], quality=88)
print(spec["out"])
