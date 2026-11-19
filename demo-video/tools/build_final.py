#!/usr/bin/env python3
"""Writes the Hyperframes composition for the AXIOM Forge demo film.

Everything visible is either real footage of the Extension Development Host (assets/footage/*.mp4,
cut by footage/cuts.tsv) or typography/graphics drawn here. All times are in seconds.
Output: composition/index.html + composition/compositions/*.html (static HTML; timed elements are
written into the markup, as the Hyperframes contract asks).
"""
import json, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1] / "final" / "composition"
SCRATCH = pathlib.Path(__file__).resolve().parent / "data"  # paths.json: Flask file list; energy.json: music RMS at 5 fps
PATHS = json.loads((SCRATCH / "paths.json").read_text())
ENERGY = json.loads((SCRATCH / "energy.json").read_text())  # music RMS at 5 fps, normalised 0..1

W, H = 1920, 1080
SX, SY, SW, SH = 180, 150, 1560, 878  # the product "screen" in frame px (final: ~5% larger than the first cut)
K = SW / 1440  # window points -> screen px

PALETTE = {
    "bg": "#13151a", "surface": "#191c22", "surface2": "#20242c", "seam": "#2a2f39", "seam2": "#383e4b",
    "fg": "#e5e7ec", "muted": "#9ba3b1", "faint": "#6e7686",
    "act": "#9c9dfb", "actStrong": "#5d5fd8", "run": "#5cc8e6", "ok": "#47c68b", "wait": "#e8ad4a", "bad": "#f2706b",
}

# ---------------------------------------------------------------- film timeline (root seconds)
SCENES = [  # id, start, duration
    ("s1", 0.0, 18.0), ("s2", 18.0, 14.0), ("s3", 32.0, 30.0), ("s4", 62.0, 26.0),
    ("s5", 88.0, 34.6), ("s6", 122.6, 30.0), ("s7", 152.6, 28.0), ("s8", 180.6, 21.4),
]
TOTAL = 202.0  # final: end slate held 2 s longer so the credits can be read
START = {sid: st for sid, st, _ in SCENES}

VO = {  # id -> root start (durations measured from the wav files)
    "n1a": 0.6, "n1b": 2.6, "n1c": 10.0, "n1d": 13.0,
    "s2a": 18.9, "s2b": 24.9,
    "s3a": 33.0, "s3b": 37.0, "s3d": 51.0, "s3c": 56.3,
    "s4a": 62.6, "s4b": 68.4, "s4c": 71.5,
    "s5a": 88.6, "s5b": 93.4, "s5c": 113.5,
    "s6a": 123.2, "s6b": 124.6, "s6c": 131.0, "s6d": 141.0,
    "s7a": 153.0, "s7b": 165.0, "s7c": 175.0,
    "n8a": 184.0, "n8b": 186.2, "n8c": 193.9,
}
VO_DUR = {"n1a": 1.408, "n1b": 6.656, "n1c": 2.475, "n1d": 1.899, "n8a": 1.856, "n8b": 3.563, "n8c": 1.195, "s2a": 5.525, "s2b": 6.229, "s3a": 2.027, "s3b": 12.651,
          "s3c": 5.397, "s3d": 1.92, "s4a": 5.291, "s4b": 1.515, "s4c": 5.717, "s5a": 3.819, "s5b": 6.485,
          "s5c": 5.525, "s6a": 1.045, "s6b": 3.093, "s6c": 7.488, "s6d": 3.221, "s7a": 6.677, "s7b": 2.88,
          "s7c": 1.493}

SFX = [  # root time, file, volume (peaks land on the picture; clicks only on real on-screen clicks)
    (17.95, "impactSoft_medium_001.ogg", 0.55),   # mark starts drawing
    (42.62, "click2.ogg", 0.45),                  # Run (c03 starts on the click)
    (81.0, "click_003.ogg", 0.45),                # Review changes
    (90.2, "click2.ogg", 0.45),                   # Accept hunk
    (110.6, "click_003.ogg", 0.45),               # Reject
    (121.1, "click2.ogg", 0.45),                  # Send rejection
    (161.05, "click_003.ogg", 0.45),              # Run command
    (165.4, "bong_001.ogg", 0.5),                 # 58 passed (beat-locked: music cue 165.4)
    (180.7, "impactSoft_medium_004.ogg", 0.5),    # into the finale (beat-locked: music cue 180.7)
    (193.8, "impactBell_heavy_000.ogg", 0.55),    # wordmark lands (beat-locked: music cue 193.8)
]


SFXLEN = {"bong_001.ogg": 0.12, "click2.ogg": 0.05, "click_003.ogg": 0.01, "impactBell_heavy_000.ogg": 1.48, "impactSoft_medium_001.ogg": 0.18, "impactSoft_medium_004.ogg": 0.14}


def esc(s):
    return html.escape(s, quote=True)


def energy_at(t):
    i = max(0, min(len(ENERGY) - 1, int(t * 5)))
    return ENERGY[i]


# ---------------------------------------------------------------- shared CSS
BASE_CSS = f"""
#root {{ position:absolute; inset:0; overflow:hidden; font-family: Outfit, sans-serif; color:{PALETTE['fg']}; }}
.mono {{ font-family: 'IBM Plex Mono', monospace; }}
.screen {{ position:absolute; left:{SX}px; top:{SY}px; width:{SW}px; height:{SH}px; border-radius:14px; overflow:hidden;
  background:{PALETTE['bg']}; box-shadow: 0 34px 90px rgba(0,0,0,0.6), 0 0 0 1px {PALETTE['seam2']}; }}
.cam {{ position:absolute; left:0; top:0; width:{SW}px; height:{SH}px; transform-origin:0 0; }}
.cam video {{ position:absolute; left:0; top:0; width:{SW}px; height:{SH}px; object-fit:cover; }}
.callout {{ position:absolute; display:flex; align-items:center; gap:14px; padding:14px 22px 14px 18px; border-radius:10px;
  background:rgba(25,28,34,0.94); box-shadow: 0 0 0 1px {PALETTE['seam2']}, 0 16px 40px rgba(0,0,0,0.45);
  font-size:34px; font-weight:500; line-height:1.15; white-space:nowrap; }}
.callout i {{ width:4px; align-self:stretch; border-radius:2px; background:{PALETTE['act']}; }}
.callout b {{ font-weight:700; }}
.callout.ok i {{ background:{PALETTE['ok']}; }} .callout.bad i {{ background:{PALETTE['bad']}; }}
.callout.wait i {{ background:{PALETTE['wait']}; }} .callout.run i {{ background:{PALETTE['run']}; }}
.callout small {{ display:block; font-size:28px; font-weight:400; color:{PALETTE['muted']}; margin-top:4px; }}
.badge {{ position:absolute; padding:8px 16px; border-radius:999px; font-size:28px; font-weight:500;
  background:rgba(19,21,26,0.9); color:{PALETTE['muted']}; box-shadow:0 0 0 1px {PALETTE['seam2']}; }}
"""


def video_tag(vid, clip, start, dur, media_start=0.0):
    return (f'<video id="{vid}" class="clip" data-start="{start:.3f}" data-duration="{dur:.3f}" '
            f'data-media-start="{media_start:.3f}" data-track-index="1" src="assets/footage/{clip}.mp4" muted playsinline></video>')


def cam_js(sel, keys):
    """keys: list of (t, scale, px, py, dur, ease) with px,py in WINDOW POINTS (focal point centred)."""
    out = []
    for t, s, px, py, d, ease in keys:
        fx, fy = px * K, py * K
        x = SW / 2 - fx * s
        y = SH / 2 - fy * s
        x = max(SW - SW * s, min(0, x))
        y = max(SH - SH * s, min(0, y))
        if d == 0:
            out.append(f'tl.set("{sel}",{{scale:{s},x:{x:.1f},y:{y:.1f}}},{t});')
        else:
            out.append(f'tl.to("{sel}",{{scale:{s},x:{x:.1f},y:{y:.1f},duration:{d},ease:"{ease}"}},{t});')
    return "\n".join(out)


def callout(cid, start, dur, x, y, text, sub=None, tone="", track=3):
    x = int(180 + (x - 216) * 1560 / 1488); y = int(150 + (y - 172) * 1560 / 1488)
    sub_html = f"<small>{esc(sub)}</small>" if sub else ""
    return (f'<div id="{cid}" class="clip callout {tone}" data-start="{start:.2f}" data-duration="{dur:.2f}" data-track-index="{track}" '
            f'style="left:{x}px; top:{y}px; z-index:20"><i></i><div class="ct">{text}{sub_html}</div></div>')


def callout_js(cid, start, dur):
    return (f'tl.fromTo("#{cid} > *",{{opacity:0,filter:"blur(6px)"}},{{opacity:1,filter:"blur(0px)",duration:0.22,ease:"power3.out",stagger:0.04}},{start+0.02:.2f});'
            f'tl.fromTo("#{cid}",{{x:-14}},{{x:0,duration:0.45,ease:"expo.out"}},{start+0.02:.2f});'
            f'tl.to("#{cid} > *",{{opacity:0,filter:"blur(6px)",duration:0.18,ease:"power2.in"}},{start+dur-0.22:.2f});')


def scene_file(sid, dur, css, body, js):
    return f"""<template>
  <style>
{BASE_CSS}
{css}
  </style>
  <div id="root" data-composition-id="{sid}" data-width="{W}" data-height="{H}">
{body}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
{js}
    window.__timelines["{sid}"] = tl;
  </script>
</template>
"""


# ---------------------------------------------------------------- S1: the stranger
def s1():
    cols = 5
    per = (len(PATHS) + cols - 1) // cols
    col_html = []
    for c in range(cols):
        lines = "<br>".join(esc(p) for p in PATHS[c * per:(c + 1) * per])
        col_html.append(f'<div class="pcol" style="left:{60 + c * 372}px">{lines}</div>')
    css = f"""
.field {{ position:absolute; inset:-60px 0 0 0; }}
.pcol {{ position:absolute; top:0; width:360px; font-family:'IBM Plex Mono',monospace; font-size:15px; line-height:24px;
  color:{PALETTE['muted']}; white-space:nowrap; overflow:hidden; }}
.veil {{ position:absolute; inset:0; background: radial-gradient(ellipse 62% 60% at 50% 52%, rgba(19,21,26,0.95) 0%, rgba(19,21,26,0.6) 58%, rgba(19,21,26,0) 100%); }}
.lead {{ position:absolute; left:0; right:0; top:200px; text-align:center; font-size:76px; font-weight:600; letter-spacing:-0.02em; }}
.lead span {{ display:inline-block; margin:0 0.13em; }}
.q {{ position:absolute; left:470px; width:1100px; display:flex; gap:26px; }}
.q i {{ width:6px; border-radius:3px; background:{PALETTE['act']}; }}
.q .t {{ font-size:54px; font-weight:600; letter-spacing:-0.015em; line-height:1.1; }}
.q .s {{ font-size:32px; color:{PALETTE['muted']}; margin-top:8px; font-variant-numeric: tabular-nums; }}
"""
    def words(txt):
        return "".join(f"<span>{esc(w)}</span>" for w in txt.split())
    body = f"""
    <div id="s1-field" class="field" data-layout-ignore style="opacity:0">{''.join(col_html)}</div>
    <div class="veil"></div>
    <div id="s1-lead" class="clip lead" data-start="0.55" data-duration="17.05" data-track-index="1">{words("AI can write code.")}</div>
    <div id="s1-q1" class="clip q" data-start="2.6" data-duration="15.0" data-track-index="2" style="top:360px"><i></i><div>
      <div class="t">Can it understand the repository?</div>
      <div class="s" id="s1-q1s"><span id="s1-n1">216</span> files<span id="s1-tk">, <span id="s1-n2">285.5k</span> tokens</span></div></div></div>
    <div id="s1-q2" class="clip q" data-start="9.95" data-duration="7.65" data-track-index="3" style="top:530px"><i></i><div>
      <div class="t">Can it justify the changes it proposes?</div>
      <div class="s" id="s1-q2s">A confident diff is not a correct one.</div></div></div>
    <div id="s1-q3" class="clip q" data-start="12.95" data-duration="4.65" data-track-index="4" style="top:700px"><i></i><div>
      <div class="t">Can it prove they actually work?</div>
      <div class="s" id="s1-q3s">Generated is not verified.</div></div></div>
"""
    js = f"""
    tl.to("#s1-field",{{opacity:0.45,duration:2.4,ease:"power2.inOut"}},0.2);
    tl.fromTo("#s1-field",{{y:40}},{{y:-260,duration:17.4,ease:"none"}},0);
    tl.fromTo("#s1-lead span",{{opacity:0,filter:"blur(6px)"}},{{opacity:1,filter:"blur(0px)",duration:0.14,stagger:0.08,ease:"power3.out"}},0.6);
    tl.to("#s1-lead",{{color:"{PALETTE['muted']}",duration:0.5,ease:"power2.inOut"}},2.5);
    tl.fromTo("#s1-q1",{{opacity:0,x:-14,filter:"blur(6px)"}},{{opacity:1,x:0,filter:"blur(0px)",duration:0.45,ease:"expo.out"}},2.62);
    tl.fromTo("#s1-q1s",{{opacity:0}},{{opacity:1,duration:0.25,ease:"power2.out"}},5.55);
    tl.fromTo("#s1-n1",{{textContent:0}},{{textContent:216,duration:0.5,ease:"power2.out",snap:{{textContent:1}}}},5.6);
    tl.fromTo("#s1-tk",{{opacity:0}},{{opacity:1,duration:0.2,ease:"power2.out"}},7.25);
    tl.fromTo("#s1-n2",{{opacity:1}},{{opacity:1,duration:1.2,ease:"none",onUpdate:function(){{var p=this.progress();var el=document.getElementById("s1-n2");if(el)el.textContent=(285.5*(1-Math.pow(1-p,3))).toFixed(1)+"k";}}}},7.25);
    tl.to("#s1-q1",{{opacity:0.55,duration:0.4,ease:"power2.inOut"}},9.8);
    tl.fromTo("#s1-q2",{{opacity:0,x:-14,filter:"blur(6px)"}},{{opacity:1,x:0,filter:"blur(0px)",duration:0.45,ease:"expo.out"}},9.97);
    tl.fromTo("#s1-q2s",{{opacity:0}},{{opacity:1,duration:0.25,ease:"power2.out"}},11.0);
    tl.to("#s1-q2",{{opacity:0.55,duration:0.4,ease:"power2.inOut"}},12.8);
    tl.fromTo("#s1-q3",{{opacity:0,x:-14,filter:"blur(6px)"}},{{opacity:1,x:0,filter:"blur(0px)",duration:0.45,ease:"expo.out"}},12.97);
    tl.fromTo("#s1-q3s",{{opacity:0}},{{opacity:1,duration:0.25,ease:"power2.out"}},14.0);
    tl.to(["#s1-q1","#s1-q2"],{{opacity:1,duration:0.4,ease:"power2.inOut"}},15.2);
    tl.to(["#s1-lead","#s1-q1","#s1-q2","#s1-q3"],{{opacity:0,filter:"blur(10px)",duration:0.3,ease:"power2.in",stagger:0.04}},17.15);
    tl.to("#s1-field",{{opacity:0,scale:0.6,duration:0.7,ease:"power3.in"}},17.25);
"""
    return scene_file("s1", 18.0, css, body, js)


# ---------------------------------------------------------------- S2: reveal
MARK_SVG = ('<svg viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">'
            '<path class="tri" d="M12 3 21 20H3Z" pathLength="100"/><path class="bar" d="M7.6 14.5h8.8" pathLength="100"/></svg>')


def halo_js(sel, t0, t1, base, k, offset):
    """Build-time audio modulation: the halo's opacity follows the music's RMS (sampled every 0.2 s)."""
    out = []
    t = t0
    while t < t1 - 0.01:
        e = energy_at(offset + t)
        out.append(f'tl.to("{sel}",{{opacity:{base + k * e:.3f},duration:0.2,ease:"sine.inOut"}},{t:.2f});')
        t += 0.2
    return "".join(out)


def s2():
    css = f"""
.halo {{ position:absolute; left:460px; top:-30px; width:1000px; height:1000px; border-radius:50%;
  background: radial-gradient(circle, rgba(93,95,216,0.55) 0%, rgba(93,95,216,0.16) 38%, rgba(93,95,216,0) 70%); }}
.markw {{ position:absolute; left:860px; top:250px; width:200px; height:200px; }}
.markw svg {{ width:100%; height:100%; }}
.markw .tri, .markw .bar {{ stroke-dasharray:100; }}
.word {{ position:absolute; left:0; right:0; top:500px; text-align:center; font-size:112px; font-weight:600; letter-spacing:-0.025em; }}
.word span {{ display:inline-block; }}
.sub {{ position:absolute; left:0; right:0; top:660px; text-align:center; font-size:38px; color:{PALETTE['muted']}; }}
.tag {{ position:absolute; left:0; right:0; text-align:center; font-size:72px; font-weight:600; letter-spacing:-0.02em; }}
"""
    letters = "".join(f"<span>{'&nbsp;' if ch == ' ' else esc(ch)}</span>" for ch in "AXIOM Forge")
    body = f"""
    <div id="s2-halo" class="halo"></div>
    <div id="s2-markw" class="markw">{MARK_SVG.format(c=PALETTE['act'])}</div>
    <div id="s2-word" class="clip word" data-start="0.9" data-duration="12.35" data-track-index="1">{letters}</div>
    <div id="s2-sub" class="clip sub" data-start="2.5" data-duration="3.9" data-track-index="2">An engineering agent inside VS Code, running on TrueForge.</div>
    <div id="s2-t1" class="clip tag" data-start="8.35" data-duration="4.95" data-track-index="2" style="top:430px">Understand the code.</div>
    <div id="s2-t2" class="clip tag" data-start="9.9" data-duration="3.4" data-track-index="3" style="top:530px">Justify every change.</div>
    <div id="s2-t3" class="clip tag" data-start="11.5" data-duration="1.8" data-track-index="4" style="top:630px; color:{PALETTE['act']}">Verify before delivery.</div>
    <div class="screen" id="s2-screen" style="opacity:0">
      <div class="cam" id="s2-cam">{video_tag("s2-v1", "c01", 12.9, 1.1, 0.0)}</div>
    </div>
"""
    js = f"""
    tl.fromTo("#s2-halo",{{opacity:0,scale:0.7}},{{opacity:0.35,scale:1,duration:1.2,ease:"power2.out"}},0);
    {halo_js("#s2-halo", 1.2, 12.9, 0.25, 0.35, 18.0)}
    tl.fromTo("#s2-markw .tri",{{strokeDashoffset:100}},{{strokeDashoffset:0,duration:1.15,ease:"power2.inOut"}},0.0);
    tl.fromTo("#s2-markw .bar",{{strokeDashoffset:100}},{{strokeDashoffset:0,duration:0.45,ease:"power3.out"}},0.95);
    tl.fromTo("#s2-word span",{{opacity:0.0,filter:"blur(5px)"}},{{opacity:1,filter:"blur(0px)",duration:0.2,stagger:0.07,ease:"power3.out"}},0.95);
    tl.fromTo("#s2-sub",{{opacity:0,filter:"blur(8px)"}},{{opacity:1,filter:"blur(0px)",duration:0.2,ease:"power3.out"}},2.55);
    tl.to("#s2-sub",{{opacity:0,filter:"blur(8px)",duration:0.2,ease:"power2.in"}},6.15);
    tl.to("#s2-markw",{{x:0,y:-215,scale:0.5,duration:0.9,ease:"power2.inOut"}},6.6);
    tl.to("#s2-word",{{y:-290,scale:0.55,duration:0.9,ease:"power2.inOut"}},6.6);
    tl.to("#s2-halo",{{y:-200,scale:0.75,duration:0.9,ease:"power2.inOut"}},6.6);
    tl.fromTo("#s2-t1",{{opacity:0,filter:"blur(8px)"}},{{opacity:1,filter:"blur(0px)",duration:0.18,ease:"power3.out"}},8.4);
    // beat-locked: 27.93 s (music strong cue) = scene 9.93
    tl.fromTo("#s2-t2",{{opacity:0,filter:"blur(8px)"}},{{opacity:1,filter:"blur(0px)",duration:0.18,ease:"power3.out"}},9.93);
    // beat-locked: 29.55 s (music strong cue) = scene 11.55
    tl.fromTo("#s2-t3",{{opacity:0,filter:"blur(8px)"}},{{opacity:1,filter:"blur(0px)",duration:0.18,ease:"power3.out"}},11.55);
    tl.to(["#s2-t1","#s2-t2","#s2-t3","#s2-word","#s2-markw"],{{opacity:0,filter:"blur(10px)",duration:0.25,ease:"power2.in"}},13.0);
    tl.to("#s2-halo",{{opacity:0,duration:0.5,ease:"power2.in"}},13.0);
    tl.fromTo("#s2-screen",{{opacity:0,y:90,scale:0.94}},{{opacity:1,y:0,scale:1,duration:0.95,ease:"expo.out"}},13.05);
"""
    return scene_file("s2", 14.0, css, body, js)


# ---------------------------------------------------------------- screen scenes (S3..S7)
def screen_scene(sid, dur, shots, cams, callouts, badges=(), extra_css="", extra_body="", extra_js=""):
    vids = "\n".join(video_tag(f"{sid}-v{i+1}", clip, st, d, ms) for i, (clip, st, d, ms) in enumerate(shots))
    cos = "\n".join(callout(f"{sid}-c{i+1}", *c) for i, c in enumerate(callouts))
    cos_js = "\n".join(callout_js(f"{sid}-c{i+1}", c[0], c[1]) for i, c in enumerate(callouts))
    bdg = "\n".join(f'<div id="{sid}-b{i+1}" class="clip badge" data-start="{st}" data-duration="{d}" data-track-index="4" style="left:{SX + SW - 230}px; top:{SY + 18}px; z-index:21">{esc(t)}</div>'
                    for i, (st, d, t) in enumerate(badges))
    body = f"""
    <div class="screen" id="{sid}-screen"><div class="cam" id="{sid}-cam">
{vids}
    </div></div>
{cos}
{bdg}
{extra_body}
"""
    js = cam_js(f"#{sid}-cam", cams) + "\n" + cos_js + "\n" + extra_js
    return scene_file(sid, dur, extra_css, body, js)


def s3():
    # c02 typing (media 2.0..12.6) | c03 context assembled | c04 Context view
    shots = [("c02", 0.0, 10.6, 2.0), ("c03", 10.6, 5.4, 0.0), ("c04", 16.0, 14.0, 0.0)]
    cams = [
        (0.0, 1.0, 720, 405, 0, ""),
        (0.6, 1.45, 648, 470, 2.2, "power2.inOut"),     # push in on the composer while typing (Run button kept in frame)
        (10.6, 1.45, 330, 330, 0, ""),                  # cut: timeline, context assembled
        (16.0, 1.0, 720, 405, 0, ""),                   # cut: Context view, full frame
        (16.6, 1.35, 520, 300, 2.0, "power2.inOut"),    # figures + map
        (26.6, 1.45, 520, 540, 1.6, "power2.inOut"),    # reasons
    ]
    callouts = [
        (11.4, 5.4, 1000, 700, "<b>8 of 216</b> files sent", "assembled in 1.3 s, before the model sees anything", ""),
        (17.6, 4.4, 1080, 250, "<b>23.4k</b> of a 24k-token budget", "the whole repo is 285.5k", ""),
        (19.6, 5.8, 1180, 760, "<b>14 real relationships</b>", "imports, test coverage, documentation", "run"),
        (25.4, 4.4, 1080, 760, "Every file says <b>why</b>", "“Tests cli.py”  “Name matches cli”", "ok"),
    ]
    return screen_scene("s3", 30.0, shots, cams, callouts)


def s4():
    shots = [("c05", 0.0, 8.3, 0.0), ("c06", 8.3, 6.5, 0.0), ("c07", 14.8, 4.6, 0.0), ("c08", 19.4, 6.6, 0.0)]
    cams = [
        (0.0, 1.35, 640, 380, 0, ""),
        (0.2, 1.45, 640, 430, 7.8, "power1.inOut"),     # slow drift over the reads (task text kept in frame)
        (8.3, 1.6, 1010, 330, 0, ""),                   # native diff: the hunk
        (8.4, 1.75, 1010, 340, 6.2, "power1.inOut"),
        (14.8, 1.45, 600, 360, 0, ""),                  # paused banner + trace
        (19.4, 1.0, 720, 405, 0, ""),                   # Activity full
        (19.8, 1.4, 560, 300, 1.8, "power2.inOut"),
    ]
    callouts = [
        (0.8, 6.6, 1020, 840, "Agent loop on <b>TrueForge</b>", "editor tools served to it over MCP (7 tools)", ""),
        (9.2, 5.2, 300, 860, "A real proposal, in VS Code's own diff", "nothing is written yet", "wait"),
        (15.3, 4.0, 980, 560, "<b>Paused.</b> Review: waiting for you", None, "wait"),
        (20.6, 5.2, 1000, 880, "<b>6</b> tool calls, <b>0</b> failed", "2 min 44 s, every step timed", ""),
    ]
    badges = [(0.0, 8.3, "1.75× speed")]
    return screen_scene("s4", 26.0, shots, cams, callouts, badges)


def s5():
    shots = [("c09", 0.0, 12.1, 0.0), ("c10", 12.1, 7.5, 0.0), ("c11", 19.6, 15.0, 8.0)]
    cams = [
        (0.0, 1.0, 720, 405, 0, ""),
        (0.3, 1.55, 640, 330, 1.6, "power2.inOut"),     # the hunk + explanation
        (12.1, 1.35, 640, 430, 0, ""),                  # decided: applied, Undo change
        (19.6, 1.0, 720, 405, 0, ""),
        (20.0, 1.3, 640, 380, 1.6, "power2.inOut"),     # the rename hunk
        (32.4, 1.0, 720, 405, 1.2, "power2.inOut"),
    ]
    callouts = [
        (1.0, 4.4, 1110, 220, "The model's <b>own explanation</b>", "per file, per hunk", ""),
        (4.8, 6.6, 1110, 860, "Accept a hunk, then <b>Apply accepted</b>", "only accepted hunks are written", "ok"),
        (13.0, 6.0, 900, 880, "Applied, with <b>Undo change</b>", None, "ok"),
        (23.2, 5.0, 1110, 250, "<b>Rejected</b>: rename flask_version", "the agent is told not to apply it", "bad"),
        (29.6, 4.6, 1110, 860, "<b>0</b> lines written", "checked on disk afterwards", ""),
    ]
    return screen_scene("s5", 34.6, shots, cams, callouts)


def s6():
    # c12 Cmd+I (sped up) | c14 Models | c13 backup diff | c15 accept + editor
    shots = [("c12", 0.0, 8.0, 0.0), ("c14", 8.0, 9.5, 0.0), ("c13", 17.5, 6.5, 0.0), ("c15", 24.0, 6.0, 3.0)]
    cams = [
        (0.0, 1.0, 720, 405, 0, ""),
        (0.3, 1.45, 560, 300, 2.0, "power2.inOut"),     # selection + input box
        (8.0, 1.0, 720, 405, 0, ""),
        (8.3, 1.4, 560, 330, 1.8, "power2.inOut"),      # route: primary failed, backup serving
        (14.4, 1.65, 520, 625, 1.4, "power2.inOut"),    # routing history: Request failed (400)
        (17.5, 1.7, 1050, 330, 0, ""),                  # backup's docstring in the diff
        (24.0, 1.0, 720, 405, 0, ""),
    ]
    callouts = [
        (0.4, 7.2, 1060, 860, "Demo setup: primary given an <b>invalid key</b> on purpose", None, "wait"),
        (9.0, 4.8, 1100, 250, "Primary: <b>failed (bad config)</b>", "Gemini answered 400 to the invalid key", "bad"),
        (12.6, 4.6, 1100, 420, "Backup <b>qwen-3-8-27b</b> serving", "no retries, fresh TrueForge session", "ok"),
        (18.4, 5.2, 300, 860, "The backup's edit, still waiting for you", None, "wait"),
        (25.0, 4.6, 1100, 860, "Accepted and applied", None, "ok"),
    ]
    badges = [(0.0, 8.0, "1.75× speed")]
    return screen_scene("s6", 30.0, shots, cams, callouts, badges)


def s7():
    shots = [("c16", 0.0, 10.5, 8.5), ("c17", 10.5, 10.5, 0.0), ("c18", 21.0, 7.0, 0.0)]
    cams = [
        (0.0, 1.0, 720, 405, 0, ""),
        (0.3, 1.6, 720, 410, 2.0, "power2.inOut"),      # the approval dialog
        (10.5, 1.0, 720, 405, 0, ""),
        (10.7, 1.55, 520, 255, 1.4, "power2.inOut"),    # 58 / 0 / 1 / 0
        (14.0, 1.75, 470, 450, 1.6, "power2.inOut"),    # exit code, duration, pytest output
        (21.0, 1.4, 720, 160, 0, ""),                   # trace all green
    ]
    callouts = [
        (0.8, 7.6, 1110, 250, "Asks before it runs <b>anything</b>", "no shell; python, pytest, flask, read-only git, npm test", "wait"),
        (11.6, 3.6, 1110, 620, "<b>58 passed, 0 failed</b>", "pytest tests/test_cli.py -q", "ok"),
        (15.6, 4.6, 1110, 620, "Exit code <b>0</b> in 319 ms", "recorded with the files it covered", "ok"),
        (21.8, 5.6, 1110, 760, "<b>Verified</b>: exit 0", "a change counts as verified only after a passing check", "ok"),
    ]
    return screen_scene("s7", 28.0, shots, cams, callouts)


# ---------------------------------------------------------------- S8: finale
def s8():
    names = [("overview", "Overview"), ("task", "Task"), ("context", "Context"), ("activity", "Activity"),
             ("review", "Review"), ("models", "Models"), ("proof", "Proof")]
    tiles = []
    tw, th = 400, 225
    xs = [100, 540, 980, 1420, 320, 760, 1200]
    ys = [220, 220, 220, 220, 560, 560, 560]
    for i, (f, label) in enumerate(names):
        tiles.append(f'<div class="tile" id="s8-t{i}" style="left:{xs[i]}px; top:{ys[i]}px"><img src="assets/stills/{f}.jpg" alt=""><span>{label}</span></div>')
    css = f"""
.stage {{ position:absolute; inset:0; perspective:1600px; }}
.grid {{ position:absolute; inset:0; transform-style:preserve-3d; }}
.tile {{ position:absolute; width:{tw}px; height:{th}px; border-radius:10px; overflow:visible; }}
.tile img {{ width:{tw}px; height:{th}px; border-radius:10px; display:block; box-shadow:0 0 0 1px {PALETTE['seam2']}, 0 20px 50px rgba(0,0,0,0.5); }}
.tile span {{ position:absolute; left:2px; top:{th + 10}px; font-size:28px; font-weight:500; color:{PALETTE['muted']}; }}
.halo {{ position:absolute; left:560px; top:20px; width:800px; height:800px; border-radius:50%;
  background: radial-gradient(circle, rgba(93,95,216,0.5) 0%, rgba(93,95,216,0.14) 40%, rgba(93,95,216,0) 70%); }}
.markw {{ position:absolute; left:885px; top:210px; width:150px; height:150px; }}
.markw svg {{ width:100%; height:100%; }} .markw .tri, .markw .bar {{ stroke-dasharray:100; }}
.say {{ position:absolute; left:0; right:0; text-align:center; font-weight:600; letter-spacing:-0.02em; }}
.say span {{ display:inline-block; margin:0 0.12em; }}
.word {{ position:absolute; left:0; right:0; top:400px; text-align:center; font-size:130px; font-weight:600; letter-spacing:0.04em; }}
.word span {{ display:inline-block; }}
.tag {{ position:absolute; left:0; right:0; top:600px; display:flex; justify-content:center; gap:34px; font-size:50px; font-weight:500; }}
.tag span {{ display:inline-block; }}
.rule {{ position:absolute; left:930px; top:712px; width:60px; height:2px; border-radius:1px; background:{PALETTE['act']}; opacity:0.7; }}
.event {{ position:absolute; left:0; right:0; top:744px; text-align:center; font-size:28px; font-weight:500; letter-spacing:0.02em; color:{PALETTE['muted']}; }}
.event i {{ display:inline-block; width:5px; height:5px; margin:0 18px; border-radius:3px; background:{PALETTE['faint']}; vertical-align:middle; }}
.credits {{ position:absolute; left:0; right:0; top:900px; text-align:center; color:{PALETTE['muted']}; }}
.credits .lab {{ font-size:20px; font-weight:600; letter-spacing:0.08em; color:{PALETTE['faint']}; margin-bottom:12px; }}
.credits .row {{ display:flex; justify-content:center; gap:56px; font-size:26px; }}
.credits b {{ font-weight:600; color:{PALETTE['fg']}; opacity:0.85; }}
.black {{ position:absolute; inset:0; background:#000; opacity:0; }}
"""
    def words(txt):
        return "".join(f"<span>{esc(w)}</span>" for w in txt.split())
    letters = "".join(f"<span>{'&nbsp;' if ch == ' ' else esc(ch)}</span>" for ch in "AXIOM FORGE")
    body = f"""
    <div class="stage"><div class="grid" id="s8-grid">{''.join(tiles)}</div></div>
    <div id="s8-a" class="clip say" data-start="3.35" data-duration="8.6" data-track-index="1" style="top:390px; font-size:74px">{words("AI should not just write code.")}</div>
    <div id="s8-b" class="clip say" data-hold data-start="5.55" data-duration="6.4" data-track-index="2" style="top:510px; font-size:56px; color:{PALETTE['act']}">{words("It should understand, justify and verify every change.")}</div>
    <div id="s8-halo" class="halo" style="opacity:0"></div>
    <div id="s8-markw" class="markw" style="opacity:0">{MARK_SVG.format(c=PALETTE['act'])}</div>
    <div id="s8-word" class="clip word" data-start="13.15" data-duration="8.25" data-track-index="3">{letters}</div>
    <div id="s8-tag" class="clip tag" data-start="14.5" data-duration="6.9" data-track-index="4"><span>Understand the code.</span><span>Justify every change.</span><span style="color:{PALETTE['act']}">Verify before delivery.</span></div>
    <div id="s8-rule" class="clip rule" data-start="15.5" data-duration="5.9" data-track-index="5"></div>
    <div id="s8-event" class="clip event" data-start="15.5" data-duration="5.9" data-track-index="6">TrueFoundry Forge-a-thon<i></i>IIT Bombay<i></i>18 November 2026</div>
    <div id="s8-credits" class="clip credits" data-start="16.1" data-duration="5.3" data-track-index="7">
      <div class="lab">Audio credits</div>
      <div class="row"><span><b>Music</b> Sascha Ende, ende.app · CC BY 4.0</span><span><b>Sound effects</b> Kenney · CC0</span><span><b>Voice</b> Kokoro</span></div>
    </div>
    <div id="s8-black" class="black"></div>
"""
    tile_js = []
    for i in range(7):
        tile_js.append(f'tl.fromTo("#s8-t{i}",{{opacity:0,scale:0.86,filter:"blur(8px)"}},{{opacity:1,scale:1,filter:"blur(0px)",duration:0.7,ease:"expo.out"}},{0.1 + i * 0.08:.2f});')
    js = "\n".join(tile_js) + f"""
    tl.fromTo("#s8-grid",{{rotationY:-3,rotationX:3,z:0}},{{rotationY:3,rotationX:1,z:30,duration:12.0,ease:"sine.inOut"}},0);
    tl.to("#s8-grid",{{opacity:0.16,scale:0.94,filter:"blur(6px)",duration:0.9,ease:"power2.inOut"}},2.9);
    tl.to("#s8-grid .tile span",{{opacity:0,duration:0.4,ease:"power2.in"}},2.9);
    tl.fromTo("#s8-a span",{{opacity:0,filter:"blur(6px)"}},{{opacity:1,filter:"blur(0px)",duration:0.14,stagger:0.08,ease:"power3.out"}},3.4);
    tl.fromTo("#s8-b span",{{opacity:0,filter:"blur(6px)"}},{{opacity:1,filter:"blur(0px)",duration:0.14,stagger:0.07,ease:"power3.out"}},5.6);
    tl.to(["#s8-a span","#s8-b span"],{{opacity:0,filter:"blur(10px)",duration:0.3,stagger:0.01,ease:"power2.in"}},11.55);
    tl.fromTo("#s8-halo",{{opacity:0,scale:0.7}},{{opacity:0.3,scale:1,duration:1.0,ease:"power2.out"}},11.8);
    {halo_js("#s8-halo", 12.8, 20.8, 0.22, 0.3, 180.6)}
    tl.fromTo("#s8-markw",{{opacity:0}},{{opacity:1,duration:0.2}},11.95);
    tl.fromTo("#s8-markw .tri",{{strokeDashoffset:100}},{{strokeDashoffset:0,duration:1.1,ease:"power2.inOut"}},11.95);
    tl.fromTo("#s8-markw .bar",{{strokeDashoffset:100}},{{strokeDashoffset:0,duration:0.4,ease:"power3.out"}},12.8);
    // beat-locked: wordmark lands with the bell on the 193.8 s music cue (scene 13.2)
    tl.fromTo("#s8-word span",{{opacity:0,filter:"blur(6px)"}},{{opacity:1,filter:"blur(0px)",duration:0.2,stagger:0.05,ease:"power3.out"}},13.2);
    tl.fromTo("#s8-tag span",{{opacity:0,filter:"blur(6px)"}},{{opacity:1,filter:"blur(0px)",duration:0.18,stagger:0.3,ease:"power3.out"}},14.55);
    tl.fromTo("#s8-rule",{{scaleX:0}},{{scaleX:1,duration:0.6,ease:"expo.out"}},15.55);
    tl.fromTo("#s8-event",{{opacity:0,y:8}},{{opacity:1,y:0,duration:0.6,ease:"power2.out"}},15.6);
    tl.fromTo("#s8-credits",{{opacity:0}},{{opacity:1,duration:0.8,ease:"power2.out"}},16.15);
    tl.to("#s8-black",{{opacity:1,duration:0.6,ease:"power2.inOut"}},20.75);
"""
    return scene_file("s8", 21.4, css, body, js)


# ---------------------------------------------------------------- chrome overlay: chapter + trace (S3..S7)
def chrome():
    t0 = START["s3"]
    end = START["s8"]
    dur = end - t0
    chapters = [("Repository intelligence", 0.0), ("Autonomous agent", START["s4"] - t0), ("SafeChange", START["s5"] - t0),
                ("ModelShield", START["s6"] - t0), ("Proof of change", START["s7"] - t0)]
    whys = ["AXIOM understands the codebase before it changes it.",
            "It works a real task with real tools, then stops before writing.",
            "Every proposed hunk stays under your control.",
            "It recovers when a model provider fails.",
            "It verifies the outcome with a real command."]
    stations = ["Context", "Agent", "Tools", "Review", "Applied", "Verified"]
    lit = [32.0, 62.0, 66.0, 76.8, 100.1, 165.4]  # root seconds, when each station lights
    ch_html = []
    for i, (name, st) in enumerate(chapters):
        d = (chapters[i + 1][1] if i + 1 < len(chapters) else dur) - st
        ch_html.append(f'<div id="ch-t{i}" class="clip chap" data-start="{st:.2f}" data-duration="{d:.2f}" data-track-index="1"><span class="num">{i + 1}</span>{esc(name)}<div class="why">{esc(whys[i])}</div></div>')
    st_html = []
    for i, name in enumerate(stations):
        x = 1060 + i * 130
        st_html.append(f'<div class="st" data-layout-allow-overflow id="ch-s{i}" style="left:{x}px"><div class="dot" id="ch-d{i}"></div><div class="lab" id="ch-l{i}">{name}</div></div>')
        if i < 5:
            st_html.append(f'<div class="seg" style="left:{x + 9}px"><div class="fill" id="ch-f{i}"></div></div>')
    css = f"""
.chap {{ position:absolute; left:{SX}px; top:30px; font-size:40px; font-weight:600; letter-spacing:-0.015em; }}
.chap .num {{ display:inline-block; width:44px; height:44px; margin-right:16px; border-radius:22px; text-align:center; line-height:44px;
  font-size:26px; font-weight:600; color:{PALETTE['bg']}; background:{PALETTE['act']}; vertical-align:4px; }}
.chap .why {{ font-size:28px; font-weight:400; letter-spacing:0; color:{PALETTE['muted']}; margin-top:6px; padding-left:60px; }}
.live {{ position:absolute; right:{W - SX - SW}px; top:112px; font-size:22px; color:{PALETTE['muted']}; display:flex; align-items:center; gap:10px; }}
.live::before {{ content:''; width:9px; height:9px; border-radius:5px; background:{PALETTE['bad']}; }}
.st {{ position:absolute; top:34px; width:18px; overflow:visible; }}
.dot {{ width:18px; height:18px; border-radius:9px; box-sizing:border-box; border:2px solid {PALETTE['seam2']}; background:{PALETTE['bg']}; }}
.lab {{ position:absolute; top:26px; left:9px; transform:translateX(-50%); font-size:22px; color:{PALETTE['muted']}; white-space:nowrap; }}
.seg {{ position:absolute; top:42px; width:130px; height:2px; background:{PALETTE['seam']}; }}
.fill {{ width:100%; height:100%; background:{PALETTE['ok']}; transform-origin:0 50%; transform:scaleX(0); }}
"""
    body = f"""
{''.join(ch_html)}
    <div class="live" id="ch-live">Recorded live in VS Code, 18 Nov 2026</div>
{''.join(st_html)}
"""
    js = []
    for i in range(5):
        js.append(f'tl.fromTo("#ch-t{i}",{{opacity:0,filter:"blur(8px)"}},{{opacity:1,filter:"blur(0px)",duration:0.2,ease:"power3.out"}},{chapters[i][1] + 0.02:.2f});')
    js.append('tl.fromTo(["#ch-live",".st",".seg"],{opacity:0},{opacity:1,duration:0.6,ease:"power2.out"},0.1);')
    for i, t in enumerate(lit):
        lt = t - t0
        col = PALETTE['ok']
        if i != 3:
            js.append(f'tl.to("#ch-d{i}",{{borderColor:"{col}",backgroundColor:"{col}",duration:0.22,ease:"power2.out"}},{lt:.2f});')
        js.append(f'tl.to("#ch-l{i}",{{color:"{PALETTE["fg"]}",duration:0.22}},{lt:.2f});')
        if i > 0:
            js.append(f'tl.to("#ch-f{i-1}",{{scaleX:1,duration:0.42,ease:"power2.out"}},{max(0, lt - 0.42):.2f});')
    # Review waits (amber) until applied
    js.append(f'tl.to("#ch-d3",{{borderColor:"{PALETTE["wait"]}",backgroundColor:"{PALETTE["wait"]}",duration:0.2}},{76.8 - t0:.2f});')
    js.append(f'tl.to("#ch-d3",{{borderColor:"{PALETTE["ok"]}",backgroundColor:"{PALETTE["ok"]}",duration:0.2}},{90.2 - t0:.2f});')
    js.append(f'tl.to(["#ch-live",".st",".seg",".chap"],{{opacity:0,duration:0.35,ease:"power2.in"}},{dur - 0.4:.2f});')
    return scene_file("chrome", dur, css, body, "\n".join(js))


# ---------------------------------------------------------------- background glow (whole film)
def bg():
    css = f"""
.ground {{ position:absolute; inset:0; background:{PALETTE['bg']}; }}
.glow {{ position:absolute; left:260px; top:120px; width:1400px; height:940px; border-radius:50%;
  background: radial-gradient(ellipse at center, rgba(93,95,216,0.30) 0%, rgba(93,95,216,0.10) 42%, rgba(93,95,216,0) 70%); }}
"""
    body = '<div class="ground"></div><div class="glow" id="bg-glow" style="opacity:0"></div>'
    js = [f'tl.to("#bg-glow",{{opacity:0.5,duration:1.2,ease:"power2.out"}},{START["s3"] - 1.6});']
    t = START["s3"]
    while t < START["s8"] - 0.4:
        js.append(f'tl.to("#bg-glow",{{opacity:{0.42 + 0.45 * energy_at(t):.3f},duration:0.25,ease:"sine.inOut"}},{t:.2f});')
        t += 0.25
    js.append(f'tl.to("#bg-glow",{{opacity:0,duration:0.8}},{START["s8"]:.2f});')
    return scene_file("bg", TOTAL, css, body, "\n".join(js))


# ---------------------------------------------------------------- root
def duck_lane():
    """Music bed: 0.30 normally, 0.11 under the voice, short ramps; bell/outro lift at the end."""
    pts = [(0.0, 0.30)]
    spans = sorted((VO[k], VO[k] + VO_DUR[k]) for k in VO)
    merged = []
    for a, b in spans:
        if merged and a - merged[-1][1] < 0.9:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    for a, b in merged:
        pts += [(a - 0.35, 0.30), (a - 0.05, 0.11), (b + 0.05, 0.11), (b + 0.45, 0.30)]
    pts.append((TOTAL, 0.30))
    pts = sorted({round(t, 3): v for t, v in pts if t >= 0}.items())
    return json.dumps({"version": 1, "lanes": [{"target": "volume", "points": [{"t": t, "v": v} for t, v in pts]}]})


def root():
    hosts = [f'<div id="bg" data-composition-id="bg" data-composition-src="compositions/bg.html" data-start="0" data-duration="{TOTAL}" '
             f'data-track-index="0" data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:0"></div>']
    for sid, st, d in SCENES:
        hosts.append(f'<div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{st}" '
                     f'data-duration="{d}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:2"></div>')
    hosts.append(f'<div id="chrome" data-composition-id="chrome" data-composition-src="compositions/chrome.html" data-start="{START["s3"]}" '
                 f'data-duration="{START["s8"] - START["s3"]:.1f}" data-track-index="2" data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:3"></div>')
    lane = esc(duck_lane())
    audio = [f'<audio id="bed" class="clip" data-start="0" data-duration="200" data-track-index="10" data-volume="1" '
             f'data-automation="{lane}" src="assets/music/bed.wav"></audio>']
    for k, t in sorted(VO.items(), key=lambda kv: kv[1]):
        audio.append(f'<audio id="vo-{k}" class="clip" data-start="{t}" data-duration="{VO_DUR[k]}" data-track-index="11" data-volume="1" src="assets/vo/{k}.wav"></audio>')
    for i, (t, f, v) in enumerate(SFX):
        audio.append(f'<audio id="sfx-{i+1}" class="clip" data-start="{t}" data-duration="{SFXLEN[f]}" data-track-index="12" data-volume="{v}" src="assets/sfx/{f}"></audio>')
    variables = json.dumps([
        {"id": "color-ground", "type": "color", "label": "Background", "default": PALETTE["bg"]},
        {"id": "color-ink", "type": "color", "label": "Text", "default": PALETTE["fg"]},
        {"id": "color-accent", "type": "color", "label": "Accent", "default": PALETTE["act"]},
        {"id": "font-display", "type": "string", "label": "Display font", "default": "Outfit"},
    ])
    return f"""<!doctype html>
<html lang="en" data-composition-variables='{variables}'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>AXIOM Forge competition demo</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      :root {{ --color-ground:{PALETTE['bg']}; --color-ink:{PALETTE['fg']}; --color-accent:{PALETTE['act']}; --font-display: Outfit; }}
      * {{ margin:0; padding:0; box-sizing:border-box; }}
      html, body {{ margin:0; width:1920px; height:1080px; overflow:hidden; background:var(--color-ground); }}
      #root {{ position:relative; width:100%; height:100%; font-family: var(--font-display), sans-serif; color: var(--color-ink); }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1920" data-height="1080">
      {chr(10).join('      ' + h for h in hosts)}
      {chr(10).join('      ' + a for a in audio)}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""


def main():
    comp = ROOT / "compositions"
    comp.mkdir(parents=True, exist_ok=True)
    files = {"s1": s1(), "s2": s2(), "s3": s3(), "s4": s4(), "s5": s5(), "s6": s6(), "s7": s7(), "s8": s8(),
             "chrome": chrome(), "bg": bg()}
    for k, v in files.items():
        (comp / f"{k}.html").write_text(v)
    (ROOT / "index.html").write_text(root())
    print("wrote", len(files), "scenes; VO clips", len(VO), "; SFX", len(SFX))


if __name__ == "__main__":
    main()
