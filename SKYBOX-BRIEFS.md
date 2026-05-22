# Skybox AI Briefs — v0.6.0 Multi-Room Expansion

Preset for all generations: **M3 Magic Realism**
Character limits: Main ≤ 600 · Negative ≤ 480

Palette lines are baked into each brief. If a generation drifts in tone or color,
regenerate before doing Photoshop — easier to fix at gen time.

---

## Shore Age

Palette: cold night, twin moonlight, black volcanic stone, deep blue-black water, no warm tones.

---

### 1. `panos/shore-monolith.jpg` — Hub

**Role:** Player arrives here after walking into the tide from reversedShore. Two exits: iron door → chamber, warp to distant lighthouse.

**Main prompt:**
Standing at the base of a massive black stone monolith rising from dark ocean water, nighttime, twin moons reflected in the still sea, monolith surface carved with concentric wave patterns, distant black lighthouse silhouetted against the moons on a far shoreline, low sea mist at water level, a low iron door set into the monolith base, ominous and ancient and sacred, magic realism.

**Negative prompt:**
warm colors, sunlight, daytime, people, fire, orange tones, red tones, vegetation, bright light, modern elements

---

### 2. `panos/shore-monolith-chamber.jpg` — Branch A (puzzle target)

**Role:** Beam from lighthouse enters through wall seam and illuminates the plinth panel when state.lighthouseBeamRedirected is true. Panel click completes the Shore puzzle.

**Main prompt:**
Interior of a small chamber inside a black stone monolith, knee-deep bioluminescent water covering the floor glowing cold blue-green, walls densely carved with concentric wave and arc symbols, a single circular stone plinth rising from the center with a carved circular panel on its surface, a narrow seam in one wall where a thin shaft of light can enter, very low vaulted ceiling, humid and claustrophobic and sacred, magic realism.

**Negative prompt:**
warm colors, sunlight, daytime, people, fire, orange tones, wide open space, bright even lighting, modern elements

---

### 3. `panos/shore-lighthouse.jpg` — Branch B (puzzle origin)

**Role:** Brass dial on beam mechanism has three position markers. Logbook clue: "neither sky nor sea — what lies between." Setting middle position sets state.lighthouseBeamRedirected, enabling the chamber puzzle.

**Main prompt:**
Interior of a tall black stone lighthouse tower, spiral stone stairs along the circular walls, a large brass beam mechanism aimed straight downward through a circular hole in the stone floor revealing dark water far below, a brass dial on the side of the mechanism with three etched position markers, an old rusted logbook chained to an iron post, salt-crusted walls, no outward windows, cold and abandoned, magic realism.

**Negative prompt:**
warm colors, sunlight, outward windows, sea views, people, orange tones, fire, bright light, vegetation, modern elements

---

## Green Country Age

Palette: gold amber sunset warmth, ancient deep green, bioluminescent green-gold glow, overcast twilight sky in any visible gaps.

---

### 4. `panos/green-root-hollow.jpg` — Hub

**Role:** Player arrives from stepIntoRoots action. Two exits: descending passage → greenRootDepths, ascending hollow trunk → greenCanopy.

**Main prompt:**
Interior of a vast root system beneath an ancient tree, a cathedral ceiling of massive interlocking braided roots, a gap overhead showing overcast twilight sky that does not match the gold sunset outside, bioluminescent lichen tracing root seams in green-gold glow, a shallow circular basin of still water on the root floor, two visible passages — one descending into darkness between roots, one ascending through the hollow tree trunk above, ancient and mystical, magic realism.

**Negative prompt:**
cold blue tones, open sky overhead, stone walls, people, modern elements, bright artificial lighting, crowded busy scene

---

### 5. `panos/green-root-depths.jpg` — Branch A (puzzle target)

**Role:** Multiple carved symbol clusters on the root walls — most in shadow. When state.greenCanopyAligned is true, light from above illuminates one specific root cluster. Player touches the lit root to complete the Green puzzle.

**Main prompt:**
Deep underground root cavern, enormous tree roots descending like columns into darkness, bioluminescent fungi and lichen as the only light source in cold green-blue, a dark underground pool reflecting a star field that does not exist overhead, multiple carved symbol clusters on the largest roots — glyphs, constellation shapes, spiral patterns — most in shadow with only a few lit, complete darkness beyond the lit area, ancient and disorienting and sacred, magic realism.

**Negative prompt:**
sunlight, warm tones, daytime, open sky, people, fire, orange tones, modern elements, bright even lighting, stone walls

---

### 6. `panos/green-canopy.jpg` — Branch B (puzzle origin)

**Role:** Carved stone disk in platform floor has three symbols (tree, wave, spiral). Rotating to tree symbol sets state.greenCanopyAligned, sending light down to illuminate the correct root cluster in the depths.

**Main prompt:**
Small elevated platform at the top of an enormous hollow ancient tree trunk where it opens to the forest canopy, looking out over an endless vast forest at golden sunset, warm gold sky fully visible above the treeline, platform is worn ancient wood with carved spiral patterns, a carved stone disk set into the platform floor with three symbols — a tree, a wave, and a spiral — it appears to be a rotatable mechanism, a simple worn wooden seat facing the horizon, peaceful and elevated, magic realism.

**Negative prompt:**
cold tones, nighttime, underground, people, modern elements, stone walls, gray overcast sky, cluttered canopy, crowded

---

## Cottage Age

Palette: warm amber stone, orange-gold sunset through windows, intimate warmth, no cold blues.
Note: brass instruments are intentionally limited to the tower — do not add scientific equipment to loft or hall briefs.

---

### 7. `panos/cottage-upper-hall.jpg` — Hub

**Role:** Transitional corridor between keepersCottage and the two branch rooms. Left door → cottageLoft, right door → cottageTower. Name plaques are the first explicit evidence there were two Keepers.

**Main prompt:**
Narrow stone corridor landing between floors of a cottage, warm amber stone vaulted ceiling, a small round window at the corridor end casting soft golden light, two wooden doors facing each other — left door plain worn wood, right door heavier with iron banding, two name plaques carved into the stone wall between the doors in different handwriting styles, a coat rack with two old wool coats hanging, an unlit iron lantern bracket, intimate and long-undisturbed, magic realism.

**Negative prompt:**
cold tones, bright daylight, open spaces, people, modern elements, fire, blue tones, scientific equipment, brass instruments, clutter

---

### 8. `panos/cottage-loft.jpg` — Branch A (puzzle origin)

**Role:** Folded note on writing desk sets state.cottageLoftNoteRead when read. Note reads: "When the second arm reaches the pale moon, the glass will find it." Unlocks orrery interaction in the tower. No scientific instruments — this is the personal space.

**Main prompt:**
Simple low-ceiling stone bedchamber, a narrow wooden bed with a worn quilt embroidered with a spiral pattern on the hem, a small round mirror on the wall with personal letters and cards and a pressed dried flower tucked into the frame, a small writing desk beneath a wide low window with a single folded note resting on the desk, the window shows a calm sea at golden sunset, a half-read book left open face-down on the pillow, personal and human and long-undisturbed, magic realism.

**Negative prompt:**
cold tones, brass instruments, orrery, telescope, scientific equipment, crowded, people, modern elements, blue tones, grand or imposing space

---

### 9. `panos/cottage-tower.jpg` — Branch B (puzzle target + Age terminal)

**Role:** Orrery interaction requires state.cottageLoftNoteRead. Three arm positions — correct one (second arm at pale/smaller moon) unlocks the telescope. Looking through telescope triggers Age terminal. Orrery should look mechanically adjustable — exposed pivot arms and gears.

**Main prompt:**
Circular stone tower observatory room, a large brass telescope on a pivoting floor mount aimed at the horizon through a wide arched window, a wooden drafting table covered in hand-drawn star charts each showing two moons, a brass orrery with exposed mechanical pivot arms and visible gears designed to be adjusted by hand, an open notebook with a half-drawn constellation diagram in a careful measured hand, arched windows showing sea and twilight sky with two moons, scholarly and purposeful, magic realism.

**Negative prompt:**
cold tones, personal items, quilts, casual clutter, letters, people, modern elements, blue tones, excessive decoration, warm cozy feel

---

## Generation Notes

- If a gen's lighting is right but color drifts, fix in Photoshop (see prior Age edits for precedent).
- Re-capture hotspot directions with H-key dev mode after every new pano — previous vectors point at the old pano's pixel positions.
- Interior spaces will naturally be dimmer than outdoor originals; acceptable as long as stone/material color matches the Age palette.
