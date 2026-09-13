# Art direction — three candidates

Three directions, with prompts for GPT Image. Two are the options you named
(pixel, cartoon); the third is mine.

Generate, pick one, hand the PNGs back and I'll build the renderer to match.

---

## The problem the art has to solve

Not "make a pretty city". At 390 px wide, a 10×10 board gives each cell about
**35 px**, and that cell has to communicate four things at once:

1. **which zone** — three-way, instantly
2. **which density** — three-way, and it must survive colourblindness
3. **whether a road runs through it**
4. **whether it's blight or a park**

Plus the payoff: the skyline strip has to feel like an actual city, because that
is the thing the whole game is producing.

That's the whole brief. A direction that makes gorgeous 35 px buildings you can't
tell apart has failed, and most "cute city game" art fails exactly there.

**The structural trick available to all three directions:** the board and the
skyline are different surfaces with different jobs. The board must be legible
above all. The skyline has room to be beautiful. Any direction that puts the
detailed, "real city" art in the skyline and keeps the board diagrammatic gets
both things instead of compromising on one.

---

## Shared constraints — fold these into every prompt

- **Top-down or near-top-down.** True isometric fights a square grid puzzle:
  pieces stop looking like tetrominoes and tall cells occlude their neighbours.
  A slight forward tilt to show a few pixels of facade is the most you want.
- **Zone hues stay fixed**: residential green `#3D8B4A`, commercial blue
  `#2E6DA8`, industrial amber `#C4841D`. Density reads as *darker and taller*.
- **Density must read in a second channel** — height, shadow, or stacked outline —
  not colour alone.
- **No text, no labels, no UI chrome, no watermark, no logo.** Image models garble
  small type and you'll only have to mask it out.
- **Roads carry no direction.** No lane markings, no centre lines, no arrows,
  no curved markings joining the arms of a bend. In the rules a road conducts
  independently along its own row and column and **rays do not turn corners**, so
  any marking implying flow around a bend is drawing a rule the game doesn't
  have. Plain paving.
- **No water.** Cut from the design — it permanently disabled the row and column
  it sat in.
- **Flat, even lighting on the board.** A dramatic sun looks great in a hero image
  and makes cells at the dark end of the board unreadable in the actual game.

### Generation settings

- Hero images: **1024 × 1536** portrait. Tile sheets: **1024 × 1024**.
- Generate **4 variations** of each prompt — the spread between them tells you
  more about the direction than any single image.
- Don't chase a perfect board. A hero image is a *mood* reference; the tile sheet
  is the one I actually build from.

---

## Direction A — "16-bit Planning Office"

**Pixel art, top-down, SNES lineage.** SimCity (SNES) and A-Train, not Stardew.
Chunky tiles, a tight palette, dithered shadows, a warm late-afternoon cast.
Density shows as a taller sprite with more visible facade pixels.

**The case:** pixel art is *designed* for legibility at small sizes — that's the
constraint it grew up under. Cheap to iterate, crisp on hi-DPI if authored at 1×
and integer-scaled, and the nostalgia lands squarely on people who played SimCity.

**The risk:** "pixel city builder" is a crowded shelf, and it is the direction
most likely to read as an asset-store default. Also — and this matters — **GPT
Image cannot really make pixel art.** It fakes it: inconsistent pixel grid, too
many colours, anti-aliased edges. Treat anything it returns as mood only; real
tiles get authored in Aseprite or by downscaling a clean vector.

### Hero prompt

```
Top-down pixel art city block, 16-bit SNES era, in the style of SimCity for
Super Nintendo. A dense 10x10 grid of square city lots seen from directly
above with a very slight forward tilt, so each building shows a few pixels of
facade. Three kinds of district in flat, distinct colours: leafy green
low-rise houses, deep blue commercial storefronts and towers, amber-brown
industrial sheds and warehouses. Buildings come in three clear heights —
single houses, mid-rise blocks, and tall towers — with the taller ones darker
and casting short dithered pixel shadows down and to the right. Narrow plain
grey asphalt roads with no markings of any kind run between some lots in
straight runs. A few lots are empty dirt, one is a small green park with trees. Limited
palette of about 24 colours, hard pixel edges, no anti-aliasing, no gradients.
Even flat daylight. No text, no labels, no UI, no watermark.
```

### Tile sheet prompt

```
A clean asset sheet of 12 square pixel-art city tiles for a mobile game,
arranged in a strict 4 wide by 3 tall grid, evenly spaced with equal gaps, on
a plain light grey background. 16-bit SNES style, top-down with a slight
forward tilt, hard pixel edges, no anti-aliasing, limited palette.

Reading left to right, top to bottom:
row 1 — a single green suburban house; a green two-storey apartment block,
darker; a tall dark green residential tower.
row 2 — a small blue shop; a blue mid-rise office, darker; a tall dark blue
commercial tower.
row 3 — a small amber workshop; an amber factory with a chimney, darker; a
large dark amber industrial plant with two chimneys.
row 4 — an empty dirt lot; a plain grey asphalt road tile running top to
bottom with no markings; a small green park with two round trees and a bench.

Each tile fills its square completely and is centred. No text, no labels, no
numbers, no borders around tiles, no watermark.
```

---

## Direction B — "Toybox"

**Flat vector cartoon.** Bold shapes, generous rounding, saturated colour, a
single thick darker outline, one flat offset shadow. Buildings read like painted
wooden blocks — Duplo, or a beautifully made board game. Density is literally a
taller stack of blocks.

**The case:** maximum legibility at 35 px, by a distance. Cheapest to produce and
to animate, scales to any resolution, and it is far and away the strongest for an
app icon and store screenshots. If the goal is "ship something that looks
professional on a phone", this is the safe, correct answer.

**The risk:** it's the safe, correct answer. This is what most casual puzzle games
look like, and a toy-block city is the least "real city" of the three — you get
charm, not place.

### Hero prompt

```
Top-down illustration of a stylised toy city block, flat vector cartoon style,
bold and friendly. A 10x10 grid of square lots seen from almost directly
above, each holding a simple chunky building made of rounded geometric solids,
like painted wooden toy blocks. Three district colours, clearly separated:
fresh green houses with pitched roofs, deep blue shops and offices with flat
roofs, warm amber factories with rounded chimneys and vents. Three clear
heights — one block tall, two blocks tall, three blocks tall — with taller
buildings in a deeper shade of the same colour, each casting one soft flat
shadow in the same direction. Smooth plain grey roads with no lane markings run in
straight runs between lots. Thick consistent dark outlines on
everything, flat fills, no gradients, no texture, no noise. A couple of small
green park squares with round trees and a bench. Bright
even lighting, cheerful and clean. No text, no labels, no UI, no watermark.
```

### Tile sheet prompt

```
A clean asset sheet of 12 square game tiles, arranged in a strict 4 wide by 3
tall grid, evenly spaced with equal gaps, on a plain white background. Flat
vector cartoon style with thick dark outlines, flat fills, rounded chunky
geometry, one soft shadow per object, no gradients or texture. Top-down view,
almost directly above, each building made of simple stacked blocks.

Reading left to right, top to bottom:
row 1 — one small green house with a pitched roof; a green two-block
apartment, deeper green; a green three-block tower, deepest green.
row 2 — one small blue shop with an awning; a blue two-block office, deeper
blue; a blue three-block tower, deepest blue.
row 3 — one small amber workshop; an amber two-block factory with a chimney,
deeper amber; an amber three-block plant with two chimneys, deepest amber.
row 4 — an empty pale lot with faint grid markings; a plain grey road tile
running top to bottom with no markings; a small green park with two round
trees and a bench.

Each tile fills its square and is centred. No text, no labels, no numbers, no
borders, no watermark.
```

---

## Direction C — "Massing model" — **SELECTED**

**The board is a physical architectural model.** Chipboard, basswood and painted
card blocks on a drafting table, lit by a low raking light, photographed from
directly above. Zones are painted in flat colour on the block faces. **Density
reads entirely through height and the length of the shadow it throws.** Roads are
crisp white tape, unmarked.

And then the skyline strip above the board is the opposite: a **painted
elevation panorama**, detailed and warm — the one place with real buildings,
where there is room to draw them properly.

**The case.** Three reasons I'd argue for this one.

*It solves the legibility problem instead of fighting it.* Shadow length is a
free third channel — colour says zone, height says density, and the shadow says
density again for anyone who can't see the colour difference. Nothing else on
this list gives you that for nothing.

*It puts the "real city" where it can actually be real.* You said you want a real
city effect. A 35 px tile cannot deliver that in any style; a painted elevation
strip across the top of the screen absolutely can. This direction is the only one
that stops asking the board to be a city and lets it be the *plan* of one — which
is what it is, and which is why the game is about zoning in the first place.

*Nobody looks like this.* Architectural massing models are a genuinely beautiful,
completely unexploited look for a mobile game, and they carry the exact fantasy —
you are the person moving blocks around on the model before anything gets built.

**The risk:** shadows plus colour plus pips can get noisy, and it needs a
consistent render pipeline or a real illustrator for the skyline — it is the most
expensive of the three to keep coherent. If the board ends up murky, the fallback
is to keep the model materials and flatten the lighting.

### Hero prompt

```
An architectural massing model photographed from directly overhead, studio
shot on a drafting table. A 10x10 grid of square lots on a pale chipboard
base, each holding a simple rectangular block of basswood or painted card —
no windows, no doors, no detail, pure massing study. Blocks come in three
distinct heights: low single-storey, medium, and tall. Block faces are painted
in three flat matte colours by district — sage green, deep slate blue, and
warm ochre amber — with taller blocks in deeper saturations of the same
colours. A low raking light from the upper left throws long soft grey shadows
across the base, so the taller blocks are unmistakable by shadow length alone.
Narrow strips of plain white tape mark the roads in straight runs between
blocks, with no lines or markings on them. One lot is a small patch of model-railway grass with lichen trees.
Visible
material texture — card grain, cut edges, a faint pencil grid ruled on the
base. Muted, sophisticated, tactile. Shallow depth of field is not wanted:
everything sharp, flat on, top-down. No text, no labels, no people, no cars,
no UI, no watermark.
```

### Companion prompt — the skyline strip

The second half of the direction, and the piece that carries the "real city"
feeling. Generate this at **1536 × 1024 landscape**.

```
A wide painted elevation of a city skyline, seen straight on from ground
level, like an architect's presentation drawing. A continuous row of buildings
across the full width — low houses with pitched roofs on the left, rising
through mid-rise apartment blocks and offices to tall towers, then falling
away to industrial sheds and chimneys on the right. Painted in flat washes of
sage green, deep slate blue and warm ochre amber, grouped by type. Fine ink
linework over the washes, visible brush texture, slight paper grain. A plain
pale sky with no clouds, and no ground detail below the building line. Muted,
warm, hand-made, in the manner of a watercolour architectural rendering.
Nothing photographic. No text, no labels, no people, no cars, no watermark.
```

### Tile sheet prompt

```
A clean asset sheet of 12 square tiles, arranged in a strict 4 wide by 3 tall
grid, evenly spaced with equal gaps, on a plain neutral grey background. Each
tile is a top-down photograph of a piece of an architectural massing model:
painted card and basswood blocks on chipboard, lit from the upper left, each
casting a soft grey shadow. No windows, no doors, no signage — pure massing.

Reading left to right, top to bottom:
row 1 — one low sage green block, short shadow; a medium sage green block,
deeper green, longer shadow; a tall dark sage green block, long shadow.
row 2 — one low slate blue block; a medium slate blue block, deeper; a tall
dark slate blue block.
row 3 — one low ochre amber block; a medium amber block, deeper; a tall dark
amber block with a small cylinder chimney.
row 4 — a bare chipboard lot with a faint ruled pencil grid; a strip of crisp
plain white tape running top to bottom on chipboard, unmarked; a square of
model-railway grass with two small lichen trees.

Each tile fills its square and is centred. Consistent lighting direction
across all tiles. No text, no labels, no numbers, no borders, no watermark.
```

---

## Terrain, roads and the park — run this once, in the chosen style

Replace `{STYLE}` with the style sentence from the direction you chose (the first
two lines of its tile-sheet prompt).

```
A clean asset sheet of 6 square game tiles arranged in a strict 3 wide by 2
tall grid, evenly spaced on a plain neutral background. {STYLE}

Reading left to right, top to bottom:
row 1 — a small public park: grass, a few round trees, a path; a patch of grey
rubble and derelict ground, cracked and weedy, clearly abandoned; an empty
buildable lot, flat and bare.
row 2 — a plain grey road tile running top to bottom, unmarked; a plain grey
road tile running left to right, unmarked; a plain grey crossroads tile where
two unmarked roads meet at right angles.

Each tile fills its square and is centred. No text, no labels, no numbers, no
borders, no watermark.
```

---

## What to send back

Whatever you generate, plus two things:

1. **Which direction you want**, or which parts of which — "C's board with B's
   specials" is a perfectly good answer and probably a better game than either.
2. **Which images are canon**, in the order of the tile lists above, so I can map
   each tile to its cell state without guessing.

From there M5 stops being "make it pretty" and becomes a spec: nine zone tiles,
four terrain and road tiles, six specials, one skyline strip, three density
shadows.

If none of the three land, the most useful thing you can tell me is *which cell
was hardest to identify* in the ones you generated. That's the real test, and
it's the one the pretty hero images will not answer.
