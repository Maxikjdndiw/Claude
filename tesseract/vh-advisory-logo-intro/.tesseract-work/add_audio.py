"""Append the sound-design Audio layers (start ms, file duration ms, linear gain).
Gains: pad +18.5 dB, accents about +10.5 dB over the generated files (mix v5: impact -5 dB, riser and whoosh -3 dB to keep true peak under -1 dBTP)."""
import json, sys
CUES = [  # id, asset, name, start, duration, volume
    (200, "pad-bed",    "Pad bed (D add9)",              0, 15000, 8.41),
    (201, "riser",      "Riser into square opening",    87,  1100, 2.37),
    (202, "impact",     "Impact: square opens",       1150,   400, 1.5),
    (203, "tap-a",      "Tap: H stem left",           2350,   100, 3.35),
    (204, "tap-b",      "Tap: H stem right",          2500,   100, 3.35),
    (205, "ping",       "Ping: mark complete",        3250,   480, 3.35),
    (206, "whoosh",     "Whoosh: move to lockup",     5470,   900, 2.37),
    (207, "pop",        "Pop: name reveal",           6560,   180, 3.35),
    (208, "downlifter", "Downlifter: fade out",      13900,  1000, 3.35),
]
p = sys.argv[1]; d = json.load(open(p))
layers = [l for l in d["composition"]["layers"] if l.get("id") not in {c[0] for c in CUES}]
for lid, asset, name, start, dur, vol in CUES:
    layers.append({"id": lid, "name": name, "type": "Audio",
        "playback": {"type": "windowed", "inputRange": {"start": start, "duration": dur},
                     "mapping": {"type": "linear", "input": {"start": start, "duration": dur},
                                 "output": {"start": 0, "duration": dur}}, "inputOffsetMs": 0},
        "sourceRange": {"start": 0, "duration": dur}, "sourceIntrinsicDuration": dur,
        "source": {"assetId": "sfx-" + asset}, "volume": vol, "captionsEnabled": False})
d["composition"]["layers"] = layers
json.dump(d, open(p, "w"), indent=1)
