# Fourth Age — Expansion Notes (v0.7.0)

Capture for the next pass on the Bizarre Realm. Current state at v0.6.0 is
two panos + four hotspots total, no flavor inspects, climax = binary book
choice. Feels thin against the other Ages.

Goal: bring the climactic Age up to the lore density of the others without
breaking its tight focus.

## Canonical Keeper identities (settled 2026-06-07)

**Established directly in the existing canon** via the open book in the
ascension chamber (`inspectOpenBook`, game.js:317). Main text is in the
careful hand, dense with constellation diagrams and brass mechanisms.
Margin scrawl in a different ink, a hurried hand:

> *"Rachel — feed the animals. Tell Silas the constellations move
> differently here. I will not be long."*

This scene names both Keepers and establishes a third figure (Silas) who
stayed behind:

- **R. = Rachel** — methodical, calculated, scientific. **She / her.**
  Writer of the three main Ages (Shore, Green Country, Cottage). The
  careful measured hand. Atrus-archetype. The open book is *her*
  notebook of research and observations.
- **S. = Stephen** — creative, head-in-the-clouds, dreamer. **He / him.**
  Liver of the three main Ages — walked into Rachel's worlds with
  hurried casual wonder. The looping/unhurried hand for personal
  writing; the *hurried* scrawl variant when leaving a quick note.
  Wrote *one* Age himself — the bizarre realm refuge — as a final act
  of love.
- **Silas** — Stephen and Rachel's **child**. Settled canon as of
  2026-06-07. Silas was left behind when the parents disappeared into
  the Ages. The line *"Tell Silas the constellations move differently
  here. I will not be long"* is now devastating in retrospect — a
  parent's casual goodbye, the kind of throwaway reassurance you'd
  scrawl in a margin before a routine trip. Stephen never came back.
  Rachel eventually followed.

  This opens a powerful narrative possibility for v0.7.0+: **the
  player may BE Silas, grown up, returning to find their parents'
  worlds**. Echoes the Atrus/Catherine → Yeesha → Uru arc in Myst
  lore. The four Ages then read as the parents' worlds the now-adult
  child is walking, looking for traces. The Captain's Log becomes the
  guidance left for Silas — possibly written by a friend or trustee
  who knew the family.

  Alternatively: Silas remains an absent presence, never met, only
  referenced. The pathos lives entirely in the absence. Both readings
  are valid; v0.7.0 should pick one and commit.

**The implicit arc**: Stephen walked into one of Rachel's Ages with the
casual confidence of someone who'd done it many times. He didn't come
back. Rachel eventually followed — leaving their child Silas behind.
Whatever Stephen wrote at the bizarre realm was for the two of them: a
refuge above the clouds, where they could sit and remember that the
worlds (and the child) were still there even when they couldn't reach
them. The Ages persist without them. Silas waits — or grows — or, in
one possible reading, becomes the player who finally returns.

All overlay copy that refers to a specific Keeper must respect those
pronouns. Existing audit done 2026-06-07: `inspectKeeperJournalRight`
"They wrote about her" → "him" (Rachel's journal writing about Stephen).
The only other gendered pronoun in game.js is "her pale light" on the
smaller sister moon (a poetic personification of the moon itself, not a
Keeper — fine to keep).

---

## The Myst lore vocabulary the game is already in

- Two Keepers (S. and R.) → echoes Sirrus and Achenar (two trapped sons)
- Linking books at the ascension pedestal → echoes Myst's linking books
- Captain Renn's log → echoes Atrus's journals
- The spiral motif threading through every Age → echoes the D'ni linking-book symbol
- The Ages as written places → echoes the Descriptive Art

The two-book choice on the bizarre realm tree already maps cleanly to
Sirrus/Achenar in Myst's library. The question is how to deepen this without
copying it outright.

---

## Top-priority expansions (pick at minimum these two)

### (1) Establish: the Fourth Age is *outside* the written Ages

The first three Ages are written places. The Fourth Age is where the
Keepers *went* — a place outside the writing. This reframes the cloud sea
beneath the plateau as "the edge of the page."

Inspect copy direction (plateau):
- **The Cloud Sea** — *"You think you are on a plateau. You are on a page.
  Below the cloud is the margin, and below the margin is whatever was here
  before the writing."*

### (2) The two Keepers are already split — lean into it

**Canonical character mapping** (settled 2026-06-07, factoring R. methodical/
scientific and S. creative/dreamer with the existing book overlays):

- **R. = methodical / scientific / calculated.** Writer of the *three* Ages
  (Shore, Green Country, Cottage). Atrus-archetype. The compact careful
  measured hand. R.'s artifacts across the game:
  - The tower logbook ("R — the eighth star is where the pale moon sat
    last Midsummer.") — wait, addressed to R. by S.? Re-read: this is
    R.'s own observation log, written in R.'s careful hand
  - The orrery instructions: *"When the second arm reaches the pale moon,
    the glass will find it. Don't forget again."* — R. reminding herself
    (or S.) of operational procedure
  - The cottage journals downstairs (the careful hand)
  - **R.'s book at the Fourth Age = Book Two** (`touchKeeperTwoBook`,
    compact/measured hand): R. the scientist looking back at her work,
    landing on the observation that *"The Ages do not end when you leave
    them. We are not the point of any of this."*

- **S. = creative / head-in-clouds / dreamer.** Lived inside R.'s three
  Ages, walked them with wonder, marveled at them, kept forgetting
  operational details. The looping unhurried hand. S.'s artifacts:
  - The teasing reply on the loft note: *"You always forget."* —
    addressed at R.'s instruction, the lovers' bickering of a long
    partnership where the dreamer ribs the scientist
  - **S. is also the Writer of the *Fourth Age***. The key inversion: S.,
    who never took up the Art for the three main Ages, finally wrote *one*
    Age — the bizarre realm refuge above the clouds — as a personal act
    of love near the end. The dreamer's first and only writing. This is
    Book One (`touchKeeperOneBook`, looping/unhurried hand): *"I wrote
    this Age for the two of us — a place to sit above the clouds and
    remember that the worlds are still there."*

**Why this works for Myst lore**:

- The Writer/Liver dichotomy holds for the *three* main Ages — R. wrote,
  S. lived. Atrus-faithful.
- The *Fourth Age* gets a beautiful Myst-style inversion: the dreamer's
  first and only act of writing. A side character finally taking up the
  Art to make something personal. Echoes Atrus's family writing Ages for
  intimate reasons (Riven for Catherine, Releeshahn for the D'ni, the
  broken pages, the secrets).

**The two-book choice gets real moral texture**:

- **Touching S.'s book (Book One, looping hand)** = honor the dreamer who
  finally wrote. Stay in the refuge with them.
- **Touching R.'s book (Book Two, careful hand)** = honor the scientist
  whose precise worlds outlived them. Accept that the Ages continue
  without you — exactly what R.'s overlay text already lands.

Neither is *wrong* — the careful reader who traced the hands across the
journals sees the fullest story. The book endings already half-do this;
the v0.7.0 rewrite should explicitly name S. and R. and sharpen each
ending to be unmistakably *that Keeper's* worldview.

---

## High-payoff, lower-priority expansions

### (3) A "third path" the careful player can find

Echoes Myst's white page beat. **The visual asset for this is already in
the bizarre-realm-tree pano** (as of 2026-06-07) — a piece of paper
tucked among the roots on the left side of the panorama. The asset is
present whether or not v0.7.0 wires it up.

Touching it neither frees a Keeper nor refuses them — it does something
else. Possible lore readings (pick one):

- **The blank page**: the player writes their own page here. The most
  Myst-faithful (echoes Atrus's blank page that needs the player to make
  a choice the Keepers didn't anticipate).
- **A torn-out page from one of the Keepers' books**: holds context that
  changes how the player reads S. and R. Reading it before touching a
  book changes the ending.
- **A letter from Captain Renn**: closes the Renn-as-Atrus loop. Renn
  knew the Keepers; this is his final message to the player.
- **The Captain's Log itself, here at the end**: the player has been
  holding the *fourth book* the whole time. Touching it doesn't end the
  Age the way the Keepers' books do — it returns the player to the
  dock, knowing.

The "true" ending if the player has earned it via careful observation
elsewhere in the run. Could be gated by inspecting specific items across
the other Ages.

### (4) Captain Renn → Atrus parallel

Renn is the absent-mentor figure. Possibilities:
- Renn knew the Keepers personally — same paper, same ink, same time.
- The Captain's Log was secretly the fourth book all along.
- Renn IS one of the Keepers, returned. (Risky — could undercut the lone-
  narrator framing — but huge if landed.)

### (5) Spiral as explicit through-line

Make the bizarre realm spiral *exactly* the same as the cottage loft spiral
(quilt embroidery, dock door panel, root altar, etc.). Touching it on the
plateau triggers a closing-loop overlay that pulls the player's memory of
every spiral they've seen across the run.

---

## Minimum plateau inspects to bring (3 ideas)

Pick at least 2 of these for v0.7.0:

- **The Spiral** — the glowing floor carvings. Lore: same mark from the
  cottage quilt, the dock door, the root altar. The Keepers' signature
  carried to the end.
- **The Cloud Sea** — what's *below* the plateau? See (1).
- **The Twin Moons** — last chance to land the recurring celestial marker.

## Minimum tree inspects to bring (2 ideas)

Before the book choice:

- **The Tree** — *"Older than the writing. The Keepers came here because
  the tree was here first."*
- **The Roots** — *"They twine around both books. The tree grew around
  the act, did not witness it."*

---

## (Optional) Post-choice landing beat

Currently the two-book choice ends the Age. Could add a final overlay that
ties the four Ages together from *that* Keeper's perspective. Right now
the choice happens and it's just over. A short closing line about what the
player learned about S vs R, and how the journey reframes in hindsight,
could carry real weight.

---

## PS guidance for the tree pano cleanup (in flight)

While cleaning up the tree pano's odd book perspective, consider adding:

1. **A small spiral mark** somewhere visible — carved into the tree
   trunk, painted on a root, or scratched into the ground near the books.
   Supports the (5) spiral-as-through-line inspect.

2. **Visual distinction between the two books** (canonical, settled
   2026-06-07):
   - **S.'s book (Book One — the dreamer's first and only writing)** —
     held closed by **leather straps**. Handmade, soft wraparound,
     finished-by-feel. The kind of closure you tie yourself. May be
     wrapped in cloth or simple worn leather, with a single spiral
     lightly scratched on the cover. Reads as personal, intimate,
     unpolished. S. gave his book a closure he could *tie* with his
     own hands. *"I wrote this Age for the two of us."*
   - **R.'s book (Book Two — the scientist's lifetime of work)** —
     held closed by **golden clasps** (locket-style, locking
     mechanism). Manufactured, precise, *sealed*. The kind of closure
     R. the scientist would commission for her finished work. Tooled
     leather, gilt-edged pages, maybe a stamped date or coordinate.
     The artifact of a methodical Writer protecting her summation.

   **Possible open/closed lore beat** (optional, depends on PS): S.'s
   book left *open* with the straps draped to the side — he meant for
   someone to find it. R.'s book left *sealed* with the golden clasps
   visible-and-locked — to touch R.'s book is to deliberately *unseal*
   something that was finished. Stronger Myst-style "open the sealed
   book" moment if pursued.

   Supports the (2) Writer-vs-Liver split — without visible distinction,
   the careful reader has nothing to anchor the choice on. The straps-
   vs-clasps contrast does the character work even before the player
   reads a single overlay.

3. **A third element** (optional, future-proofing) — a torn-out page caught
   in the roots, OR a blank folded letter, OR an unmarked envelope.
   Doesn't have to be wired this version; having the visual asset there
   lets us pursue (3) Hidden Third Path later without re-gen.

4. **Roots clearly twining around the books** — supports the (2) Roots
   inspect: "the tree grew around the act, did not witness it."

5. **Cloud sea / sunset horizon glow** — visible if possible. Supports
   the (1) edge-of-the-page lore.
