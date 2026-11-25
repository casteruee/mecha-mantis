"""Annotated head-difference diagram: reference vs current, numbered callouts + legend."""
from PIL import Image, ImageDraw, ImageFont

ref = Image.open('ref-head-macro.png').convert('RGB')
our = Image.open('rounds/r6/macro_head.png').convert('RGB')
W = 900


def scaled(im):
    w, h = im.size
    return im.resize((W, round(h * W / w)))


r, o = scaled(ref), scaled(our)
H = max(r.size[1], o.size[1])
panel = Image.new('RGB', (W * 2 + 30, H + 150), (235, 234, 238))
panel.paste(r, (0, 150))
panel.paste(o, (W + 30, 150))
d = ImageDraw.Draw(panel)
font = ImageFont.load_default()

RED = (210, 30, 60)
BLUE = (20, 90, 210)


def callout(img_x, img_y, n, col, side):
    x = img_x + (0 if side == 'ref' else W + 30)
    y = img_y + 150
    d.ellipse([x - 16, y - 16, x + 16, y + 16], outline=col, width=3)
    d.text((x - 5, y - 6), str(n), fill=col, font=font)


# reference side
callout(285, 140, 1, RED, 'ref')
callout(440, 172, 2, RED, 'ref')
callout(428, 132, 3, RED, 'ref')
callout(238, 172, 4, RED, 'ref')
callout(312, 148, 5, RED, 'ref')
callout(325, 325, 6, RED, 'ref')
# our side
callout(335, 185, 1, BLUE, 'our')
callout(370, 185, 2, BLUE, 'our')
callout(382, 132, 3, BLUE, 'our')
callout(285, 200, 4, BLUE, 'our')
callout(332, 145, 5, BLUE, 'our')
callout(367, 310, 6, BLUE, 'our')

d.text((10, 10), 'REF  ref-head-macro', fill=(20, 20, 24), font=font)
d.text((W + 40, 10), 'OURS  r6 macro_head', fill=(20, 20, 24), font=font)
legend = [
    '1 outline: ref = rounded triangle shield (near-straight top edge, pointed chin)  |  ours = ball',
    '2 eye major axis: ref tilts ~30 deg along the head top edge  |  ours near vertical (~10 deg)',
    '3 eye position: ref high+back, the top silhouette cuts into the eye  |  ours centred, far from the edge',
    '4 far eye: ref peeks as a black dome only  |  ours pokes out as a disc + straight pink rim line',
    '5 antennae: ref thin, from the crown between the eyes, narrow V  |  ours thick, forward roots, too straight',
    '6 chin+tilt: ref pointed chin + tiny mouth, head tilted ~35 deg  |  ours blunt + white blob, ~23 deg',
]
for i, s in enumerate(legend):
    d.text((12, 30 + i * 18), s, fill=(40, 38, 48), font=font)
panel.save('rounds/r6/work_head_diag.png')
print('ok', panel.size)
