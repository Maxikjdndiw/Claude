"""Generate the action batch for the VH Advisory 15 s logo intro.

The monogram geometry is copied 1:1 from Assets/Logos/vh-mark.svg (64-unit
space); the Mark group scales it. Colours are the design-system tokens.
Run: python3 build_actions.py > build-actions.json
"""
import json

C = "main"
FULL = {"start": 0, "duration": 15000}

def rgb(h, a=1.0):
    h = h.lstrip("#")
    return [round(int(h[i:i + 2], 16) / 255, 4) for i in (0, 2, 4)] + [a]

BRAND = rgb("0E4D3A")       # brand (VH Green)
ON_BRAND = rgb("FFFFFF")    # on-brand
INK = rgb("111614")         # ink
INK_MUTED = rgb("5B635F")   # ink-muted
CLEAR = rgb("FFFFFF", 0.0)  # invisible mask geometry

EASE_OUT = {"type": "cubicBezier", "x1": 0.2, "y1": 0, "x2": 0.2, "y2": 1}
EASE_IN_OUT = {"type": "cubicBezier", "x1": 0.65, "y1": 0, "x2": 0.25, "y2": 1}
LINEAR = {"type": "linear"}

actions = []

def tf(anchor, pos, scale=(100, 100), opacity=100):
    return {"anchorPoint": list(anchor), "position": list(pos), "scale": list(scale),
            "rotation": 0, "opacity": opacity}

def rect(lid, name, x, y, w, h, color, anchor_frac=(0.5, 0.5)):
    """Rect at (x, y, w, h) in parent space, pivoting at a fraction of its size."""
    ax, ay = anchor_frac[0] * w, anchor_frac[1] * h
    actions.append({"type": "createFxRectLayer", "compositionId": C, "layerId": lid,
                    "name": name, "activeRange": FULL,
                    "transform": tf((ax, ay), (x + ax, y + ay)),
                    "rect": {"size": [w, h], "fillColor": color}})

def keys(lid, prop, pts):
    """pts: [(ms, value, easing), ...]; value float or [x, y]."""
    kf = []
    for i, (ms, v, ease) in enumerate(pts):
        val = ({"type": "vector2", "value": list(v)} if isinstance(v, (list, tuple))
               else {"type": "float", "value": v})
        kf.append({"id": f"l{lid}-{prop}-{i}", "layerTime": ms, "value": val, "easing": ease})
    actions.append({"type": "setFxPropertyKeyframes", "compositionId": C,
                    "property": {"layerId": lid, "propertyType": prop}, "keyframes": kf})

HOLD = {"type": "hold"}

def appear(lid, t0):
    """Keep a not-yet-drawn element fully hidden until its entrance starts."""
    keys(lid, "opacity", [(0, 0.0, LINEAR), (t0, 100.0, HOLD)])

def grow(lid, prop, t0, t1, ease=EASE_OUT, start=0.1, hide=True):
    keys(lid, prop, [(t0, start, LINEAR), (t1, 100.0, ease)])
    if hide:
        appear(lid, t0)

# ---------------------------------------------------------------- Mark (64-unit space)
# Sibling order: first created = topmost after the prepend below.
mark_ids = []
def mark_rect(lid, name, x, y, w, h, color, anchor_frac=(0.5, 0.5)):
    rect(lid, name, x, y, w, h, color, anchor_frac)
    mark_ids.append(lid)

# Mask geometry for the V (transparent; grows downward to reveal the strokes).
mark_rect(13, "V reveal mask", 6, 14, 30, 36, CLEAR, (0.5, 0.0))
actions.append({"type": "createFxShapeLayer", "compositionId": C, "layerId": 12, "name": "V",
                "activeRange": FULL, "transform": tf((0, 0), (0, 0)),
                "shape": {"path": {"commands": [
                    {"type": "moveTo", "x": 9, "y": 16}, {"type": "lineTo", "x": 16.5, "y": 16},
                    {"type": "lineTo", "x": 24, "y": 40}, {"type": "lineTo", "x": 30.5, "y": 16},
                    {"type": "lineTo", "x": 33, "y": 16}, {"type": "lineTo", "x": 24.8, "y": 48},
                    {"type": "lineTo", "x": 22.6, "y": 48}, {"type": "close"}]},
                    "fills": [{"paint": {"type": "solid", "color": ON_BRAND},
                               "fillRule": "nonZeroWinding", "blendMode": "normal", "opacity": 1}],
                    "strokes": []}})
mark_ids.append(12)
mark_rect(14, "V serif left", 7, 15, 12, 1.6, ON_BRAND)
mark_rect(15, "V serif right", 28.5, 15, 7, 1.6, ON_BRAND)
mark_rect(16, "H stem left", 38, 16, 5, 32, ON_BRAND, (0.5, 1.0))
mark_rect(17, "H stem right", 52, 16, 5, 32, ON_BRAND, (0.5, 1.0))
mark_rect(18, "H crossbar", 43, 31, 9, 2, ON_BRAND, (0.0, 0.5))
mark_rect(19, "H serif top left", 36, 15, 9, 1.6, ON_BRAND)
mark_rect(20, "H serif top right", 50, 15, 9, 1.6, ON_BRAND)
mark_rect(21, "H serif base left", 36, 46.4, 9, 1.6, ON_BRAND)
mark_rect(22, "H serif base right", 50, 46.4, 9, 1.6, ON_BRAND)
mark_rect(11, "Mark square", 0, 0, 64, 64, BRAND)  # bottom of the mark stack

actions.append({"type": "groupFxCompositionLayers", "compositionId": C, "layerIds": mark_ids,
                "groupLayerId": 10, "name": "Mark",
                "transform": tf((32, 32), (960, 540), (450, 450))})
actions.append({"type": "setFxLayerMasks", "compositionId": C, "layerId": 12,
                "masks": [{"id": 501, "layer": 13, "mode": "add", "opacity": 1}]})

# 1. A VH Green hairline draws across, then opens into the square.
HAIR = 0.55  # % of 64 units -> ~1.6 px at 450 %
keys(11, "scaleX", [(250, 0.1, LINEAR), (1050, 100.0, EASE_OUT)])
appear(11, 250)
keys(11, "scaleY", [(0, HAIR, LINEAR), (1150, HAIR, LINEAR), (1850, 100.0, EASE_IN_OUT)])

# 2. The monogram is set: V serifs, V strokes written downward, H rises like two bars.
grow(14, "scaleX", 1950, 2250); grow(15, "scaleX", 2000, 2300)
grow(13, "scaleY", 2100, 2650, EASE_IN_OUT, hide=False)
grow(21, "scaleX", 2200, 2500); grow(22, "scaleX", 2250, 2550)
grow(16, "scaleY", 2350, 2850, EASE_IN_OUT); grow(17, "scaleY", 2500, 3000, EASE_IN_OUT)
grow(18, "scaleX", 2900, 3250)
grow(19, "scaleX", 2950, 3250); grow(20, "scaleX", 3000, 3300)

# 3. Hold, breathing slightly; then the mark settles into the lockup position.
keys(10, "scaleX", [(1850, 450.0, LINEAR), (5400, 462.0, LINEAR), (6500, 300.0, EASE_IN_OUT)])
keys(10, "scaleY", [(1850, 450.0, LINEAR), (5400, 462.0, LINEAR), (6500, 300.0, EASE_IN_OUT)])
keys(10, "positionX", [(5400, 960.0, LINEAR), (6500, 546.0 + 106, EASE_IN_OUT)])
keys(10, "positionY", [(5400, 540.0, LINEAR), (6500, 500.0, EASE_IN_OUT)])

# ---------------------------------------------------------------- Wordmark (canvas space)
# Lockup = vh-wordmark.svg at 3x, top y=404; shifted DX so its visible
# extent (mark to the end of "Advisory") is centred on the canvas.
DX = 106
rect(30, "Divider", DX + 690 - 2.25, 434, 4.5, 132, BRAND, (0.5, 0.5))
grow(30, "scaleY", 6250, 6850, EASE_IN_OUT)

rect(32, "Name reveal mask", DX + 693, 380, 900, 240, CLEAR, (0.0, 0.0))
actions.append({"type": "createFxTextLayer", "compositionId": C, "layerId": 31, "name": "Name",
                "activeRange": FULL, "transform": tf((0, 0), (DX + 738, 533)),
                "sourceText": {"text": "VH Advisory", "fontFamily": "Newsreader 72pt",
                               "fontStyle": "Regular", "fontSize": 90, "fillColor": INK,
                               "strokeWidth": 0, "justification": "left", "boxText": False}})
actions.append({"type": "setFxLayerMasks", "compositionId": C, "layerId": 31,
                "masks": [{"id": 502, "layer": 32, "mode": "add", "opacity": 1}]})
# The name is wiped in from the divider while settling 30 px to the right.
grow(32, "scaleX", 6550, 7450, EASE_OUT, hide=False)
keys(31, "positionX", [(6550, DX + 708.0, LINEAR), (7500, DX + 738.0, EASE_OUT)])

actions.append({"type": "createFxTextLayer", "compositionId": C, "layerId": 33, "name": "Tagline",
                "activeRange": FULL, "transform": tf((0, 0), (DX + 452, 668), opacity=0),
                "sourceText": {"text": "Data-backed go-to-market strategy for early-stage startups.",
                               "fontFamily": "Geist", "fontStyle": "Regular", "fontSize": 26,
                               "fillColor": INK_MUTED, "strokeWidth": 0, "justification": "left",
                               "boxText": False}})
keys(33, "opacity", [(7900, 0.0, LINEAR), (8600, 100.0, EASE_OUT)])
keys(33, "positionY", [(7900, 680.0, LINEAR), (8600, 668.0, EASE_OUT)])

# ---------------------------------------------------------------- Master: slow push, fade out
actions.append({"type": "groupFxCompositionLayers", "compositionId": C,
                "layerIds": [10, 30, 32, 31, 33], "groupLayerId": 100, "name": "Lockup",
                "transform": tf((960, 540), (960, 540))})
keys(100, "scaleX", [(6500, 100.0, LINEAR), (14700, 102.5, LINEAR)])
keys(100, "scaleY", [(6500, 100.0, LINEAR), (14700, 102.5, LINEAR)])
keys(100, "opacity", [(13900, 100.0, LINEAR), (14700, 0.0, EASE_IN_OUT)])

print(json.dumps(actions, indent=1))
