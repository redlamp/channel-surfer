---
tags: [domain/color, status/draft]
---

# Hue Direction Encoding

**Date:** 2026-08-23 · **Question:** how do other fields show CW vs CCW hue
rotation relative to a reference hue?

## The Core Problem

Signed hue distance lives on a circle: `signedDelta ∈ [-0.5, 0.5]` with both
ends identifying the same antipodal hue. Any encoding that maps the two
rotation directions onto a bipolar axis (warm/cool, red/blue, +/−) is a line
metaphor imposed on a cyclic domain — it necessarily degenerates at the two
points where sign is undefined (the target and its antipode). The fields
below have each hit this exact problem and settled on different answers.

## Approaches by Field

### Scientific visualization — cyclic colormaps

**matplotlib** defines *cyclic* as its own colormap class, distinct from
diverging: "change in lightness of two different colors that meet in the
middle and beginning/end at an unsaturated color; should be used for values
that wrap around at the endpoints, such as phase angle, wind direction, or
time of day." Design rule for the wrap: "we want to start and end on the
same color, and meet a symmetric center point in the middle. L* should
change monotonically from start to middle, and inversely from middle to
end." `twilight` / `twilight_shifted` follow this (white → blue arm → dark →
red arm → white); `hsv` is listed but warned against — its "L* values vary
widely throughout the colormap, making it a poor choice for representing
data." So matplotlib's answer to direction is: **two hue arms of matched
lightness, distance ordered by lightness, both endpoints forced to the same
color so the wrap is seamless.**
Source: <https://matplotlib.org/stable/users/explain/colors/colormaps.html>
(verified via the doc's source file on GitHub; the rendered page 403s
robots).

**Kovesi** (*Good Colour Maps: How to Design Them*, §4.6, arXiv:1509.03700)
is the deepest treatment. Key points, verified against the paper text:

- HSV hue circle critique: "perceptual contrast is uneven across the colour
  map with sections of low lightness contrast from cyan to yellow, and from
  red to magenta"; the lighter secondaries "generate false anomalies"; and
  it partitions the circle into three segments, which "is not consistent
  with the way in which we typically divide the circle. Generally we tend to
  think of the four main compass directions."
- His preferred designs give the circle **four nameable, equal-lightness-
  paired landmark colors** (a "cyclic zig zag" light/dark path, e.g.
  blue–darkened yellow–dark red–pink, or a "diamond" path
  magenta–yellow–green–blue). Direction is then read as *which landmark
  sequence you pass through*, exactly like compass quadrants.
- On diverging-style cyclic maps (directly the warm/cool situation): "If one
  is prepared to accept a colour ambiguity corresponding to phase angles of
  0 and 180 degrees then the principles used for diverging colour maps can
  be employed" — e.g. a white–red–white–blue–white cycle — and "one has to
  resolve the ambiguities that occur at phase angles of 0 and 180 degrees by
  context." I.e. the antipode ambiguity is a *known, accepted cost* of this
  family, not a fixable bug.
- Wrap/landmark alignment: he rotates the map by 25% of its length so the
  light/dark extremes land on meaningful orientations.
- Auxiliary data (amplitude, reliability): "scale the colours towards black,
  or towards white, as a function of the associated auxiliary data" — the
  same move as the tile's saturation mask, elevated to a design principle.
- Constant-lightness hue circles in CIELAB are possible but limited: max
  chroma ≈ 40 near L\* 65–75, "the colours obtained are not very vivid," and
  constant lightness sacrifices fine-detail resolution.

Source: <https://arxiv.org/abs/1509.03700> (verified from the PDF).
**colorcet** ships these as its `'cyclic'` group ("try 'glasbey', 'cyclic',
or 'diverging'") — <https://colorcet.holoviz.org/user_guide/index.html>.

**cmocean `phase`** (oceanography, tidal/wave phase): "The phase colormap is
circular, spanning all hues at a set lightness value... properties such as
wave phase and tidal phase which wrap around from 0˚ to 360˚ to 0˚ and
should be represented without major perceptual jumps in the colormap." The
opposite trade from twilight: perfect wrap and no false lightness features,
but distance is not ordered — you read position, not magnitude.
Source: <https://matplotlib.org/cmocean/> (verified). Paper: Thyng et al.
2016, *True colors of oceanography*, Oceanography 29(3).

### Complex analysis — phase portraits / domain coloring

Wegert & Semmler (*Phase Plots of Complex Functions*, arXiv:1007.2295) is
the canonical "direction on a circle" solution: "The phase lives on the
complex unit circle T, and points on a circle can naturally be encoded by
colors." The encoding is the **identity map: hue = angle**, so there is no
wrap point at all. Direction/orientation is carried entirely by **hue
order**: around zeros and poles "the colors are arranged in opposite orders"
— a viewer distinguishes CW from CCW winding by whether the rainbow runs
red→yellow→green or red→magenta→blue. They even define a "chromatic number":
the winding number counted as "how many times the color of the point moves
around the complete color circle." Lesson: if the pixels retain (a function
of) their own hue, direction is *already encoded* in the spatial ordering of
hues — the proximity-glow style throws away brightness contrast between the
two sides but a trained eye can still read direction from hue sequence.
Source: <https://arxiv.org/abs/1007.2295> (verified from the PDF).

### Video engineering — vectorscopes

A vectorscope plots chrominance polar: "hue as angle from 0°," saturation as
radius, with fixed graticule targets for the six color-bar primaries/
secondaries (complements sit diametrically opposite). A hue shift is read as
**rotation of the whole trace against the fixed labeled graticule** — the
direction cue is angular displacement relative to landmarks, not a color
code. The transferable idea: direction on a circle reads best against
*fixed, labeled anchor positions* (Kovesi's compass point again).
Source: <https://docs.timeinpixels.com/nobe-omniscope/scopes/vectorscope>
(vendor scope documentation; verified). SMPTE color-bar specs themselves not
fetched first-hand — positions of targets taken from the above (unverified
against SMPTE EG 1).

### Color-grading UIs

- **Photoshop Hue/Saturation** encodes direction numerically and by a
  reference-strip comparison: "The values displayed... reflect the number of
  degrees of rotation around the wheel... A positive value indicates
  clockwise rotation; a negative value, counterclockwise rotation. Values
  can range from −180 to +180." And: "The two color bars in the dialog box
  represent the colors in their order on the color wheel. The upper color
  bar shows the color before the adjustment; the lower bar shows how the
  adjustment affects all of the hues at full saturation." I.e. **two
  unrolled wheels, one static, one displaced — direction is read as the
  offset between them.**
  Source: <https://helpx.adobe.com/photoshop/using/adjusting-hue-saturation.html>
  (verified via the 2019 Wayback capture of this page; the current 2026
  rewrite dropped the color-bar paragraph).
- **Premiere Lumetri Hue vs Hue** (same convention as Resolve's Hue vs Hue
  curve): hue unrolled onto the x-axis, "To raise or lower the output value
  of the selected range, drag the center control point up or down" — CW vs
  CCW becomes **up vs down on a linearized strip**, hiding the wrap at the
  strip edges.
  Source: <https://helpx.adobe.com/premiere/desktop/correct-color/add-color-effects/correct-color-using-hue-and-saturation-curves.html>
  (verified). Resolve's manual labels the same vertical field "Hue Rotate"
  (search snippet of the Resolve 18 manual mirror; mirror now 404s —
  unverified first-hand).
- **DaVinci Resolve Color Warper**: "a web or grid display of all the hues
  and saturations in an image. Simply select any hue or range of hues... 
  then drag that range to another hue and saturation point on the web."
  Direction is shown as **literal geometric displacement of a mesh drawn
  over the chroma plane** — no color code at all, pure deformation.
  Source: <https://www.blackmagicdesign.com/products/davinciresolve/color>
  (verified).

### Web standards — naming the direction

CSS Color 4 standardized the vocabulary: hue interpolation is `shorter`
(default; "Angles are adjusted so that θ₂ − θ₁ ∈ [−180, 180]" — exactly the
shader's `signedDelta` fixup), `longer`, `increasing`, or `decreasing`.
Notably the spec names directions **increasing/decreasing hue angle**, not
warm/cool or CW/CCW — CW vs CCW depends on how a given picker draws the
wheel, while hue angle order is unambiguous.
Source: <https://www.w3.org/TR/css-color-4/#hue-interpolation> (verified).

### Color theory / perception

Kovesi's compass observation above is the main perceptual claim found: users
carve circles into four quadrants, not three, and want nameable landmark
colors at those positions. No primary literature was found asserting a
perceptual asymmetry between the two rotation directions themselves
(searched; treat any such claim as unsupported). Warm/cool is itself a
diametric split of the wheel — a *position* convention (roughly the
red-orange half vs the blue-green half), not a *direction* convention, which
is exactly why borrowing it for direction misleads: a genuinely warm-hued
pixel can land on the "cool" side of an arbitrary target.

## Critiques Relevant to the Current Warm/Cool Style

1. **It is Kovesi's diverging-cyclic family, with the known cost.** The
   white→accent→black double ramp is structurally his
   white–red–white–blue–white map (rotated so black sits at the antipode).
   Kovesi is explicit that this family has ambiguities at 0° *and* 180° that
   the viewer must "resolve by context" — near the antipode, both directions
   converge to near-black, so the direction signal fades out precisely where
   a one-degree hue change flips the accent. That is the breakdown Taylor
   flagged, and per the literature it is intrinsic to the scheme, not a
   tuning problem.
2. **The accents are themselves hues, on a hue tile.** The tile's subject is
   hue, and the encoding paints pixels amber/steel-blue regardless of their
   actual hue — a false-color collision Wegert's and cmocean's approaches
   avoid by keeping hue = data.
3. **Warm/cool is a position label, not a direction label** (see above);
   CSS names directions increasing/decreasing for this reason.
4. **Lightness reversals need smoothing.** Kovesi: gradient reversals in
   zig-zag/diverging cyclic maps must be smoothed "to avoid the creation of
   false features within the map." The current `smoothstep` pair partially
   does this; matplotlib additionally demands the two arms have *symmetric,
   matched* L\* profiles — the current amber (V=0.5 at H=40°) and blue
   accents are not lightness-matched, so one direction reads darker than the
   other at equal distance.

## Candidate Encodings for the Hue Tile (GLSL)

Inputs available: `signedDelta ∈ [-0.5, 0.5]`, pixel `hue`/`sat`, `uTargetHue`.

1. **Twilight-style cyclic LUT ("warm/cool done right").**
   `outCol = texture(uCyclicLUT, vec2(signedDelta + 0.5, 0.5))` with a
   twilight/CET-C3-class ramp: white at target, matched-lightness blue arm
   vs red arm, converging to one dark color at ±0.5.
   Pros: distance stays lightness-ordered; arms perceptually symmetric;
   wrap seamless by construction; smallest change from today.
   Cons: keeps the accepted 180° sign fade-out; still false-color.
2. **Constant-lightness phase wheel with closeness modulation (Kovesi ×
   cmocean).** `outCol = hsv2rgb(vec3(hue, 1.0, 1.0))` scaled toward
   black by `1 − 2·|signedDelta|` (and toward black by low `sat`, Kovesi's
   auxiliary-data move).
   Pros: hue = data (no false color), direction readable Wegert-style from
   hue order, no seam anywhere.
   Cons: direction is implicit (needs a legend/wheel affordance); this is
   the existing "proximity glow" — the research says its fix is *adding
   landmarks*, e.g. faint rings at |Δ| = 90°, not changing the colors.
3. **Four-landmark cyclic map (Kovesi diamond).** Analytic 4-stop ramp:
   white at 0, equal-lightness teal at +0.25, black at ±0.5, equal-lightness
   magenta at −0.25, smoothstepped between stops
   (`t = signedDelta + 0.5` through a 5-knot mix chain).
   Pros: gives the compass-quadrant read Kovesi argues for — "quarter turn
   CW" is a nameable color, and both directions converge smoothly to the
   *same* black so the antipode is a single landmark, not a cliff.
   Cons: four colors to learn; accents still collide with image hues.
4. **Direction as motion (vectorscope read).** Keep distance-bands
   grayscale but animate:
   `band = fract(|signedDelta|·N − uTime·sign(signedDelta))` — contour
   bands crawl toward the target hue on both sides, crawl direction = sign.
   Pros: direction unambiguous *everywhere*, including arbitrarily close to
   the antipode; color channel stays free for distance.
   Cons: needs a time uniform and taste — motion may be noise on a
   contemplative tool; sign flip at exactly ±0.5 shows as a shear line
   (honest, since that line is real).

Recommendation ordering per the sources: (1) as the drop-in fix, (2)+(3) as
the two philosophically clean poles (data-as-hue vs landmark-map), (4) as
the only option that never degrades at the antipode.
