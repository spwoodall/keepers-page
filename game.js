import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---- Version + asset cache-busting ---------------------------------
// VERSION is read once at module load from the repo-root VERSION file
// so it can never drift from what the rest of the project considers
// "current". Top-level await is intentional — every asset URL flows
// through assetUrl() and needs VERSION resolved before first load.
// Bump the VERSION file on each release; the cache-bust is automatic.
const VERSION = (await fetch('VERSION')
  .then((r) => (r.ok ? r.text() : ''))
  .catch(() => '')).trim() || 'unknown';

// On localhost we swap VERSION for a per-session timestamp so iterating on
// panos / audio doesn't get pinned to whatever the disk cache holds for the
// last-seen `?v=<VERSION>` URL. Captured once at module load — every asset
// URL in this session shares the same value, so panoCache stays consistent.
const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const cacheBust = isLocalDev ? Date.now() : VERSION;

const assetUrl = (path) => `${path}?v=${cacheBust}`;

const versionTag = document.getElementById('version-tag');
if (versionTag) versionTag.textContent = VERSION;

// ---- Procedural panorama generator ----------------------------------
// Generates a 2048x1024 equirectangular image so we don't need real assets.
// Each node has its own palette + signature shapes so you can tell them apart.
function makePano({ skyTop, skyBottom, ground, accent, stars = false, sun = null }) {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // Sky gradient (top half)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  skyGrad.addColorStop(0, skyTop);
  skyGrad.addColorStop(1, skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H * 0.55);

  // Ground
  const groundGrad = ctx.createLinearGradient(0, H * 0.55, 0, H);
  groundGrad.addColorStop(0, skyBottom);
  groundGrad.addColorStop(0.3, ground);
  groundGrad.addColorStop(1, '#000');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);

  // Stars
  if (stars) {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H * 0.5;
      const r = Math.random() * 1.4;
      ctx.globalAlpha = 0.3 + Math.random() * 0.7;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Sun / moon
  if (sun) {
    const grad = ctx.createRadialGradient(sun.x * W, sun.y * H, 0, sun.x * W, sun.y * H, sun.r);
    grad.addColorStop(0, sun.color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // Horizon "buildings" / accent bands so you can orient yourself
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * W;
    const w = 20 + Math.random() * 80;
    const h = 30 + Math.random() * 120;
    ctx.fillRect(x, H * 0.55 - h, w, h);
  }
  ctx.globalAlpha = 1;

  // Cardinal markers (N/E/S/W) so you can see where you're facing
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = 'bold 60px monospace';
  ctx.textAlign = 'center';
  ['W', 'N', 'E', 'S'].forEach((dir, i) => {
    ctx.fillText(dir, W * (i / 4) + W / 8, H * 0.52);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Real panorama loader (Skybox AI exports, etc.) -----------------
// Pano URLs flow through assetUrl() — every VERSION bump invalidates
// the browser cache automatically so updated art lands without manual
// hard-refreshes.
const textureLoader = new THREE.TextureLoader();
const panoCache = new Map();
// Patched to renderer.capabilities.getMaxAnisotropy() after the renderer
// is created. Sharpens panos at grazing viewing angles on the sphere.
let maxAnisotropy = 1;
function loadPano(url) {
  if (!panoCache.has(url)) {
    const tex = textureLoader.load(assetUrl(url));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    panoCache.set(url, tex);
  }
  return panoCache.get(url);
}
// Preload alternate state panoramas so puzzle-swaps are instant.
// Ascension is also preloaded here — it's the only non-dock pano on the
// critical path and TextureLoader returns an empty texture until the image
// data arrives, so an unprepared first visit renders black for a full cycle.
loadPano('panos/ascension.jpg');
loadPano('panos/library-activated.jpg');
loadPano('panos/observatory-activated.jpg');
loadPano('panos/reversed-shore.jpg');

// ---- Captain's log content (used at boot AND from the help menu) ----
const CAPTAINS_LOG_HTML = `
  <h2>The Captain's Log</h2>
  <p><em>Day uncounted, no shore on any chart we know</em></p>
  <p>We have made landfall. The compass spun for hours before
  stilling — this place sits on no map I have ever read.</p>
  <p>The local accounts I traded for at the last port spoke of
  an Observatory above the clouds, where the Keepers once read
  the stars and bound their wisdom to leather and ink. They
  are gone now, the Keepers. The Library still stands.</p>
  <p>You have asked me to wait at the dock. I will wait. But
  the wind has already chosen which way it blows, and you are
  the only one of us to hear it.</p>
  <p><em>The door bears three symbols. Only one was placed by
  the Keepers themselves — their spiral, twin to the sigil
  within. Press it, and the way will open.</em></p>
  <p>Find the Keepers' writings. Find what awaits beyond the
  sigil and the spiral. Then come back to us — or do not.</p>
  <p style="text-align: right; margin-top: 24px;">— Captain Renn</p>
  <div class="close">click to close</div>
`;

// ---- Puzzle state ---------------------------------------------------
const state = {
  librarySlotInspected: false,
  libraryBookRead: false,
  observatoryMechanismActive: false,
  shoreCompleted: false,   // shore book pressed in ascension (age entered)
  shoreReturned: false,    // shore puzzle solved, player returned to ascension
  greenCompleted: false,
  greenReturned: false,
  dockDoorUnlocked: false,
  shoreLighthouseInspected: false,
  shorePortholeInspected: false,
  shoreMonolithCarvingsInspected: false,
  shoreChamberPortalInspected: false,
  shoreChamberSpiralInspected: false,
  shoreMoonInspected: false,
  shoreShellInspected: false,
  greenTreeInspected: false,
  greenBasinInspected: false,
  greenShellInspected: false,
  cottageCompleted: false,
  cottageReturned: false,
  cottageJournalLeftRead: false,
  cottageJournalRightRead: false,
  cottageSpiralInspected: false,
  cottageCompassInspected: false,
  cottageShellInspected: false,
  // Shore multi-room
  shoreLighthouseLogRead: false,
  lighthouseBeamRedirected: false,
  chamberDiscsRead: false,
  shoreMonolithChamberSolved: false,
  // Green multi-room
  greenCanopyAligned: false,
  greenRootDepthsSolved: false,
  greenDepthsPearlsInspected: false,
  greenRootAltarInspected: false,
  greenDepthsPoolInspected: false,
  greenRootGlyphsInspected: false,
  greenCanopyViewInspected: false,
  // Cottage multi-room
  cottageLoftNoteRead: false,
  cottageTowerOrrerySet: false,
  cottageLoftSeen: false,
  cottageTowerSeen: false,
  cottageNamePlaquesInspected: false,
  cottageHallCoatsInspected: false,
  cottageHallStarChartsInspected: false,
  cottageHallAntikytheraInspected: false,
  cottageLoftMirrorInspected: false,
  cottageLoftQuiltInspected: false,
  cottageLoftWindowInspected: false,
  libraryBooksInspected: false,
  libraryWindowInspected: false,
  // Bizarre realm (Fourth Age)
  bizarreTwinMoonsInspected: false,
  bizarreCloudSeaInspected: false,
  bizarrePlateauEdgeInspected: false,
  bizarreFamiliarDistanceInspected: false,
  bizarreTreeInspected: false,
  bizarreSpiralTrunkInspected: false,
  bizarreScrollInspected: false,
  bizarreSmallerPaleMoonInspected: false,
  bizarreRennNameInspected: false,
  bizarreShellInspected: false,
};

// ---- Action handlers (run on click for non-travel hotspots) ---------
const ACTIONS = {
  readCaptainsLog: () => {
    showOverlay(CAPTAINS_LOG_HTML);
  },
  readBook: () => {
    state.libraryBookRead = true;
    // Several pages turning — the player is reading through the book.
    // Passage-open fires 1s before the page audio ends, so the hidden
    // passage groans open while the player is still on the last page.
    const pageAudio = playSfx('book-pages');
    if (pageAudio) {
      const fireCreakBeforeEnd = () => {
        const delay = Math.max(0, (pageAudio.duration * 1000) - 1000);
        setTimeout(() => playSfx('passage-open'), delay);
      };
      if (pageAudio.duration && !isNaN(pageAudio.duration)) fireCreakBeforeEnd();
      else pageAudio.addEventListener('loadedmetadata', fireCreakBeforeEnd, { once: true });
    }
    showOverlay(`
      <h2>The Lectern Book</h2>
      <p>The pages are weathered and inked in a careful hand. Diagrams
      of brass mechanisms cover the margins. At the center of the
      spread, a single sentence:</p>
      <p><em>"The bookshelves yield their secrets only to those who read.
      A passage awaits the patient reader."</em></p>
      <p>Beneath it, in different ink, a second hand has added:</p>
      <p><em>"And beyond the passage — three pages, three Ages, and a
      way that is not a page at all."</em></p>
      <p>As you finish the lines, you hear a faint click somewhere
      in the room — the sound of wood shifting against wood.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  touchLinkingBook: () => {
    state.shoreCompleted = true;
    playSfx('linking-warp');
    // Transform the chamber — the linking-book reveal moment.
    refreshCurrentNode();
    showOverlay(`
      <h2>The Linking Book</h2>
      <p>The page is alive. Within its borders, an image moves —
      a shore of black sand under twin moons, the surf rolling
      backward from the land into the sea.</p>
      <p>You press your palm flat against the page. The chamber
      dissolves around you.</p>
      <p><em>You feel yourself fall toward the other shore.</em></p>
      <div class="close">click anywhere to depart</div>
    `, () => {
      // Long fade for the leap between Ages.
      travelTo('reversedShore', { fadeMs: 3000 });
    });
  },
  touchGreenBook: () => {
    state.greenCompleted = true;
    playSfx('linking-warp');
    refreshCurrentNode();
    showOverlay(`
      <h2>The Linking Book</h2>
      <p>The page is alive. Within its borders, an image moves —
      a clearing in a vast canopy forest, golden light through the
      leaves, and the slow weight of trees older than memory.</p>
      <p>You press your palm flat against the page. The chamber
      dissolves around you.</p>
      <p><em>You feel yourself fall toward the green country.</em></p>
      <div class="close">click anywhere to depart</div>
    `, () => {
      travelTo('greenCountry', { fadeMs: 3000 });
    });
  },
  inspectGreenTree: () => {
    state.greenTreeInspected = true;
    playSfx('tree-rustle', 2.0);
    showOverlay(`
      <h2>The Ancient Trees</h2>
      <p>Their trunks rise like the columns of a hall without ceiling —
      taller than any mountain you have known, their roots curling above
      the earth like the fingers of sleepers. The bark is patient and warm.</p>
      <p>Standing before them, you understand that these trees were here
      before the Keepers, and will be here when whoever follows you has gone.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectGreenBasin: () => {
    state.greenBasinInspected = true;
    playSfx('water-drop');
    showOverlay(`
      <h2>The Root-Basin</h2>
      <p>The roots have woven themselves into a great circular cradle,
      and the cradle holds a pool of still water. The water reflects
      nothing above you — no leaves, no gold sky, only an overcast
      twilight you cannot see.</p>
      <p>You look up. Then back down. The reflection does not change.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectGreenShell: () => {
    state.greenShellInspected = true;
    playSfx('shell-fade');
    showOverlay(`
      <h2>A Small Shell</h2>
      <p>Resting on the curl of a root, deep purple and warm to the
      touch — a shell that should not be here. You have held one like
      it before, on a shore beneath twin moons.</p>
      <p>Someone has carried it across the worlds. You wonder which
      way they were going.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  touchKeepersBook: () => {
    state.cottageCompleted = true;
    playSfx('linking-warp');
    refreshCurrentNode();
    showOverlay(`
      <h2>The Keepers' Book</h2>
      <p>The cover is deep red leather, worn warm with handling.
      The page within is alive — a stone cottage on a cliff above
      the sea, an empty chair pulled close to a cold hearth, sigils
      carved into the walls.</p>
      <p>You press your palm flat against the page. The chamber
      dissolves around you.</p>
      <p><em>You feel yourself fall toward the place that was theirs.</em></p>
      <div class="close">click anywhere to depart</div>
    `, () => {
      travelTo('keepersCottage', { fadeMs: 3000 });
    });
  },
  inspectOpenBook: () => {
    playSfx('book-open');
    showOverlay(`
      <h2>The Open Book</h2>
      <p>A working notebook, dense with diagrams of constellations and
      brass mechanisms — the careful hand of someone trying to understand
      a thing too large for paper.</p>
      <p>Scrawled in the margin, in a different ink and a hurried hand:</p>
      <p><em>"Rachel — feed the animals. Tell Silas the constellations
      move differently here. I will not be long."</em></p>
      <div class="close">click to close</div>
    `);
  },
  stepIntoRoots: () => {
    playSfx('walk-dirt');
    showOverlay(`
      <h2>Between the Roots</h2>
      <p>You step into the gap. The bark you touched before is now
      around you on every side — older than the Keepers, older,
      perhaps, than whatever followed them.</p>
      <p>The moss closes behind you. The forest does not protest.</p>
      <p>The green country holds you the way a cup holds rain — gently,
      briefly, without weight.</p>
      <div class="close">click to continue</div>
    `, () => {
      travelTo('greenRootHollow', { fadeMs: 3000 });
    });
  },
  inspectShoreLighthouse: () => {
    state.shoreLighthouseInspected = true;
    playSfx('lighthouse');
    showOverlay(`
      <h2>The Lighthouse</h2>
      <p>The tower is pitch-black, blacker than the water it watches.
      Its beam burns steady, but it points <em>down</em> — into the
      dark — not outward, not warning anyone away.</p>
      <p>You wonder what it expects to find in the depths.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectShoreMoon: () => {
    state.shoreMoonInspected = true;
    playSfx('mystical-chime', 2.0);
    showOverlay(`
      <h2>The Smaller Moon</h2>
      <p>It hangs low above the horizon, paler than its larger
      twin. Its craters are arranged in a pattern you almost
      recognize — like a face turned just slightly away.</p>
      <p>When you look at it directly, it seems to wane.
      When you look away, it seems to grow.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectShoreShell: () => {
    state.shoreShellInspected = true;
    playSfx('shell-fade');
    showOverlay(`
      <h2>A Purple Shell</h2>
      <p>You crouch and lift one from the wet stones. It is a
      deep purple, almost black in the starlight — and warm in
      your palm, though everything else on this shore is cold.</p>
      <p>When you set it back down, you cannot remember picking
      it up.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectCottageJournalLeft: () => {
    state.cottageJournalLeftRead = true;
    playSfx('book-open');
    showOverlay(`
      <h2>A Journal in a Careful Hand</h2>
      <p>The page is pristine — kept so carefully it might be a textbook.
      Every line measured, every margin even. They wrote about the work:
      the brass, the books, the sigils that wanted careful drawing. They
      wrote about the sea outside their window. They wrote about him.</p>
      <p><em>They were not afraid when they wrote this.</em></p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectCottageJournalRight: () => {
    state.cottageJournalRightRead = true;
    playSfx('book-open');
    showOverlay(`
      <h2>A Journal in a Different Hand</h2>
      <p>More sketch than text — pages crowded with drawings, half-
      glimpses, fragments. Visions and memories. The shape of light at
      dawn. Words appear only where the drawings cannot say it.</p>
      <p><em>The last entry stops mid-thought.</em></p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectCottageShell: () => {
    state.cottageShellInspected = true;
    playSfx('shell-fade');
    showOverlay(`
      <h2>A Small Shell</h2>
      <p>Tucked beneath the desk, half-hidden in the shadow — deep purple
      and warm to the touch. You have held one like it before — on a shore
      beneath twin moons, on a moss-covered root in a green country.</p>
      <p>This one is the third. Or perhaps the first. They carried it
      with them; or it followed them; or it was always here, and you
      have been chasing its likeness across the worlds.</p>
      <p><em>They did not stay. But they did not go alone.</em></p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectCottageSpiral: () => {
    state.cottageSpiralInspected = true;
    playSfx('sweep-away');
    showOverlay(`
      <h2>The Keepers' Spiral</h2>
      <p>Carved into the stone, deep enough to last. The shape your
      hand already remembers — from the dock door, from the cover
      of a red book in the chamber above.</p>
      <p>This was their mark, and this was their home.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectCottageCompass: () => {
    state.cottageCompassInspected = true;
    playSfx('metallic-thud');
    showOverlay(`
      <h2>A Brass Compass</h2>
      <p>Pocket-sized, brass-bezeled, cool in your palm. The needle
      has been removed — or fell out, or was never there. The
      cardinal points remain, and they no longer mean anything.</p>
      <p>You remember the compass on the captain's table, the one
      that stopped spinning the day you arrived. You wonder which
      of them stopped first.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  ascendCottageLoft: () => {
    playSfx('stone-footsteps');
    showOverlay(`
      <h2>The Upper Hall</h2>
      <p>The stairs rise into a long stone hallway, and the
      hallway opens onto a narrow corridor. Two doors face each
      other — left and right. Between them, the stone wall
      carries two names you cannot quite read in this light.</p>
      <p>The wind outside sounds different up here. Closer.</p>
      <div class="close">click to continue</div>
    `, () => {
      travelTo('cottageUpperHall', { fadeMs: 1500 });
    });
  },
  wadeToMonolith: () => {
    showOverlay(`
      <h2>The Tide</h2>
      <p>You step into the water. It does not retreat from you;
      it does not push you back. It pulls you in — gently,
      steadily — as if you were always meant to belong to it.</p>
      <p>Ahead, the monolith waits beneath the sister moon — black
      against her pale light. The water carries you toward it,
      though your feet do not move.</p>
      <p>The shore recedes. The smaller moon recedes.</p>
      <div class="close">click to approach</div>
    `, () => {
      playSfx('wave-crash');
      travelTo('shoreMonolith', { fadeMs: 3000 });
    });
  },
  // ---- Dock door symbol puzzle ----
  inspectDoorTree: () => {
    playSfx('interact-tap');
    showOverlay(`
      <h2>A Carved Panel</h2>
      <p>A tangle of intertwined branches and leaves, deep
      in the brass. A symbol of the green country, perhaps —
      somewhere far from here.</p>
      <p><em>The panel does not move.</em></p>
      <div class="close">click to close</div>
    `);
  },
  inspectDoorWave: () => {
    playSfx('interact-tap');
    showOverlay(`
      <h2>A Carved Panel</h2>
      <p>Concentric arcs roll outward, like waves on a calm sea.
      Tarnished brass beneath your fingers.</p>
      <p><em>The panel does not move.</em></p>
      <div class="close">click to close</div>
    `);
  },
  unlockDoor: () => {
    state.dockDoorUnlocked = true;
    playSfx('brass-click');
    showOverlay(`
      <h2>The Keepers' Spiral</h2>
      <p>A single coiling line, spiraling inward to a small
      inset pearl. The mark of the Keepers.</p>
      <p>You press your palm flat against it. The brass is
      warm. Something deep inside the door turns over with
      a quiet, weighty click.</p>
      <p><em>The door unbolts itself.</em></p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectLockedDoor: () => {
    playSfx('locked-door');
    showOverlay(`
      <h2>The Door</h2>
      <p>Brass and worn wood, set into the stone of the cliff.
      Three carved panels run along its frame. Beneath the
      arch, the keyhole catches the dying light.</p>
      <p><em>It is locked. The panels watch.</em></p>
      <div class="close">click to close</div>
    `);
  },

  activateMechanism: () => {
    state.observatoryMechanismActive = true;
    // Steam-brass machinery starts up immediately, then the brass click
    // + slab grind follow once the mechanism has built momentum.
    playSfx('mechanism-whir', 0.75);
    setTimeout(() => {
      playSfx('mechanical-gadget');
      playSfx('heavy-door-open');
    }, 800);
    showOverlay(`
      <h2>The Brass Mechanism</h2>
      <p>You lay a hand on the brass instrument. It is warm.</p>
      <p>With a low hum, the gears turn — slowly at first, then with
      purpose. Around the rim, an inscription wakes into faint light:
      a ring of interlocking spirals matching a pattern you have not
      yet seen. Beneath your feet, a great stone slab grinds open.</p>
      <p><em>A way down has revealed itself.</em></p>
      <div class="close">click to close</div>
    `);
    // Hum layers in now that the mechanism is alive — keep it loop'd while
    // the player lingers, and re-trigger automatically on return visits.
    {
      const { path, mix } = resolveAmbient(WORLD.observatory);
      setNodeAmbient(path, mix);
    }
    refreshCurrentNode();
  },
  interactSlot: () => {
    const firstTime = !state.librarySlotInspected;
    state.librarySlotInspected = true;
    playSfx('interact-tap');
    showOverlay(`
      <h2>An Empty Slot</h2>
      <p>A single book is missing from the row. The wood beneath
      the gap has been worn smooth, as if something has been
      taken and replaced many times.</p>
      ${firstTime ? `<p><em>You turn — and only now do your eyes settle
      on the open volume resting on the lectern at the chamber's
      center.</em></p>` : ''}
      <div class="close">click to close</div>
    `);
    if (firstTime) refreshCurrentNode();
  },
  inspectSpentSigil: () => {
    playSfx('metallic-thud');
    showOverlay(`
      <h2>A Brass Sigil-Plate</h2>
      <p>A circle of brass, dulled with age. The pearl at its
      center is long gone, its empty hollow filling slowly with
      library dust.</p>
      <p>You kneel and lay a hand on it. The metal is cold — not
      the cold of dead stone, but the cold of something that was
      warm once, and has remembered to be still.</p>
      <p><em>Whoever made it is no longer here.</em></p>
      <div class="close">click to close</div>
    `);
  },

  inspectLibraryWindow: () => {
    state.libraryWindowInspected = true;
    playSfx('knock-on-window');
    showOverlay(`
      <h2>The Window</h2>
      <p>The glass is old enough to have memory — the island bends
      slightly through it. Below, the dock. Beyond that, the shore
      where the tide runs wrong. Further still, the shape of the
      lighthouse against the twin moons, though it is daylight here
      and there should be no moons at all.</p>
      <p>You press a hand to the glass. It is warm. The world outside
      does not notice you looking at it.</p>
      <div class="close">click to close</div>
    `);
  },

  inspectLibraryBooks: () => {
    state.libraryBooksInspected = true;
    playSfx('book-pull-open-and-close');
    showOverlay(`
      <h2>The Shelves</h2>
      <p>The shelves run deeper than any single life. Hundreds of
      bindings — cracked leather, oiled cloth, vellum gone the color
      of tea — and many of them are sets. Twenty volumes. Thirty.
      One spans an entire run of shelf in matching dark green, sixty
      spines numbered in faded gold.</p>
      <p>You pull one out at random. The spine creaks softly. Inside:
      notation in three different hands across as many decades,
      marginalia answering marginalia, a final entry on the last
      page that reads simply <em>enough.</em></p>
      <p>The Keepers were not in a hurry. They never were.</p>
      <div class="close">click to close</div>
    `);
  },

  // ---- Shore multi-room -----------------------------------------------
  inspectMonolithCarvings: () => {
    state.shoreMonolithCarvingsInspected = true;
    playSfx('sweep-away');
    showOverlay(`
      <h2>The Wave Carvings</h2>
      <p>Sigils run along the base of the stone — the same
      wave mark from the dock door, but here it is one of
      many. Each symbol distinct. Each one old enough that
      the edges have softened to suggestion. Whatever was
      being recorded here, it was not meant to be read quickly.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectBizarreTwinMoons: () => {
    state.bizarreTwinMoonsInspected = true;
    playSfx('mystical-chime', 2.0);
    showOverlay(`
      <h2>The Twin Moons</h2>
      <p>You have seen them before — once, from a beach at the
      foot of a stone monolith. The arrangement is the same.
      The angle is the same. They have not moved.</p>
      <p>You have moved.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectBizarreCloudSea: () => {
    state.bizarreCloudSeaInspected = true;
    playSfx('floating-pad');
    showOverlay(`
      <h2>The Cloud Sea</h2>
      <p>You think you are on a plateau. You are on a page.</p>
      <p>Below the cloud is the margin. Below the margin is
      whatever was here before the writing.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectBizarrePlateauEdge: () => {
    state.bizarrePlateauEdgeInspected = true;
    playSfx('exhale');
    showOverlay(`
      <h2>The Edge</h2>
      <p>The stone of the plateau falls away in tiers, each
      step shallower than the last, until there is nothing left
      to stand on and only the cloud remains.</p>
      <p>This is where the writing ran out. The Keepers stopped
      here because their world stopped here.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectFamiliarDistance: () => {
    state.bizarreFamiliarDistanceInspected = true;
    // Cut the bizarre-realm music so peaceful-ray can breathe — then
    // restart the music when the sound finishes (the world exhales,
    // the thesis lands, the world resumes). Respects mute state.
    const wasMusicPlaying = bizarreRealmMusicActive && !audioPrefs.musicMuted;
    if (!audioPrefs.sfxMuted && wasMusicPlaying) {
      fadeAudioElement(ambientAudio, 0, 250);
      const sfx = playSfx('peaceful-ray');
      if (sfx) {
        sfx.addEventListener('ended', () => {
          if (bizarreRealmMusicActive && !audioPrefs.musicMuted) {
            fadeAudioElement(ambientAudio, audioPrefs.music, 1500);
          }
        }, { once: true });
      }
    } else {
      playSfx('peaceful-ray');
    }
    showOverlay(`
      <h2>The Familiar Distance</h2>
      <p>Below the cloud sea, something familiar — and something
      not.</p>
      <p>The dock where a ship still waits. The observatory where
      brass once turned beneath your hand. A shore where you read
      by lantern-light.</p>
      <p>Three places. One island. One moonlight. The pieces a
      dream keeps, set together as if they had always been one
      place.</p>
      <p>Someone has been dreaming.</p>
      <p>Someone has been dreaming you here.</p>
      <p>Or you have been dreaming yourself.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectTheTree: () => {
    state.bizarreTreeInspected = true;
    playSfx('tree-rustle', 2.0);
    showOverlay(`
      <h2>The Tree</h2>
      <p>From here it stands as it has always stood. Older than
      the writing. Older than the Keepers.</p>
      <p>You count its rings without trying and stop counting
      somewhere around a thousand. The tree did not arrive. The
      tree was.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectBizarreSpiralTrunk: () => {
    state.bizarreSpiralTrunkInspected = true;
    playSfx('wood-tap');
    showOverlay(`
      <h2>The S, Cut into Bark</h2>
      <p>A spiral, scored deep into the trunk — the shape of
      an S. The first letter of a name you have read in
      journals and seen on a book's looping cover.</p>
      <p>A pearl at its heart. You have seen pearls like it
      before — in the dock door, in an open notebook, at the
      center of every sigil that still answers, in green water
      beneath a canopy, and in a dozen places besides.</p>
      <p>The pearl is the Keepers' signature. They press it into
      anything worth remembering.</p>
      <p>An S, finally carved. Drawn around the one mark its
      maker and another have always shared.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectBizarreScroll: () => {
    state.bizarreScrollInspected = true;
    playSfx('written-letter');
    showOverlay(`
      <h2>A Scroll, Bound in Leather</h2>
      <p>The same leather that wraps the open book at the roots
      — soft, hand-wrapped, tied with a knot only its maker
      would have made.</p>
      <p>Untouched, in this version of things.</p>
      <p>There are other endings. They begin here.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectBizarreSmallerPaleMoon: () => {
    state.bizarreSmallerPaleMoonInspected = true;
    playSfx('mystical-chime', 2.0);
    showOverlay(`
      <h2>The Pale Moon</h2>
      <p>Smaller than its sister. Paler. Patient.</p>
      <p>Someone watched this moon for eleven years. The journal
      margins remember its arc. An orrery arm was set against
      it. A son was taught its name in a language nobody else
      used.</p>
      <p>Here it hangs above her husband's writing, as if it
      had agreed to come along.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectBizarreRennName: () => {
    state.bizarreRennNameInspected = true;
    playSfx('wood-tap');
    showOverlay(`
      <h2>A Carved Name</h2>
      <p>A single name, scratched small into a root —
      <em>Renn.</em></p>
      <p>Old enough that the bark has begun to close around it.</p>
      <p>The captain has been here. He did not write this place —
      but he came, and he stayed long enough to leave his name
      in it.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectBizarreShell: () => {
    state.bizarreShellInspected = true;
    playSfx('shell-fade');
    showOverlay(`
      <h2>A Purple Shell</h2>
      <p>Deep purple. Warm to the touch. You have held one like
      it on a shore, on a root, beside a cold hearth.</p>
      <p>This one followed them as far as a shell can be
      followed. It sits among the roots of a tree older than
      the writing, untroubled by the moonlight.</p>
      <p>Some things were too small to leave behind.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  readLighthouseLog: () => {
    state.shoreLighthouseLogRead = true;
    playSfx('book-open');
    showOverlay(`
      <h2>A Rusted Logbook</h2>
      <p>The pages are swollen with salt water, barely legible.
      The last surviving entry reads:</p>
      <p><em>"The dial knows three voices. The Keepers wrote:
      the subject lies neither in sky nor in sea — but in what
      lies between.</em></p>
      <p><em>I have read that line every night for three tides.
      I have not yet been brave enough to set the dial. I am
      afraid that they were right. I am more afraid of what
      answers if they are."</em></p>
      <div class="close">click to close</div>
    `);
  },
  inspectShorePorthole: () => {
    state.shorePortholeInspected = true;
    playSfx('knock-on-window');
    showOverlay(`
      <h2>The Porthole</h2>
      <p>A round of glass thick with salt. Through it, the night
      sea — black sand, the tide running backward, the monolith
      dark at the far edge of the beach.</p>
      <p>The larger moon sits directly behind the monolith, a
      halo around the stone; the smaller moon hangs farther off.
      The arrangement has not moved since you arrived. As if it
      has been waiting for you to look back.</p>
      <div class="close">click to close</div>
    `);
  },
  setDialSky: () => {
    playSfx('interact-tap');
    showOverlay(`
      <h2>Sky</h2>
      <p>You move the dial to the topmost position. The beam
      swings — but the hole in the floor shows only the same
      dark water it always has. Nothing changes in the chamber
      beyond.</p>
      <p><em>Not this one.</em></p>
      <div class="close">click to close</div>
    `);
  },
  setDialSea: () => {
    playSfx('interact-tap');
    showOverlay(`
      <h2>Sea</h2>
      <p>You move the dial outward. The mechanism turns — but
      there are no outward windows here, no face toward the
      water. The lighthouse has forgotten how to look at the
      surface of things.</p>
      <p><em>Not this one.</em></p>
      <div class="close">click to close</div>
    `);
  },
  setDialDepths: () => {
    state.lighthouseBeamRedirected = true;
    playSfx('brass-click');
    showOverlay(`
      <h2>Depths</h2>
      <p>You move the dial to the lowest position. The beam
      locks — straight down, as it was always built to be —
      and the hole fills with cold light that travels farther
      than it should. Somewhere below, something receives it.</p>
      <p><em>You have looked where the Keepers would not.</em></p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectRedirectedBeam: () => {
    playSfx('beam-sound', 2.0);
    showOverlay(`
      <h2>The Redirected Beam</h2>
      <p>The beam holds downward now, its light passing through
      the floor and into the water below. Whatever it was built
      to watch, it has found the correct angle. Somewhere below,
      a chamber is receiving it.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectChamberPortal: () => {
    state.shoreChamberPortalInspected = true;
    playSfx('sweep-away');
    showOverlay(`
      <h2>The Stone Aperture</h2>
      <p>A perfect circle cut through the rock — not broken through,
      not worn away. Carved. Whoever made it knew exactly what they
      wanted: a hole that leads nowhere, framed like a window that
      has never held glass.</p>
      <p>You look through it. The other side is the same chamber
      you are standing in. And yet you cannot shake the feeling
      that it is watching you back.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectChamberSpiral: () => {
    state.shoreChamberSpiralInspected = true;
    playSfx('sweep-away');
    showOverlay(`
      <h2>The Concentric Rings</h2>
      <p>Circles within circles, each one scored with the same
      patient depth. Not a symbol — a record. Like a cross-section
      of something that grew very slowly in the dark.</p>
      <p>You count eleven rings before you lose track of where one
      ends and the next begins. Whatever was being measured here,
      it took a long time.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectFloorDiscs: () => {
    const activated = state.lighthouseBeamRedirected;
    if (activated) {
      playSfx('fx-light', 0.5);
      state.chamberDiscsRead = true;
    } else {
      playSfx('water-drop');
    }
    showOverlay(`
      <h2>The Floor Circles</h2>
      <p>Two discs of glass set flush into the sand — ringed
      in stone, polished once, clouded now. They are positioned
      beneath a gap in the ceiling that is not quite a hole.</p>
      ${activated
        ? `<p>The beam found them. They burn white and do not flicker —
           as if they have been waiting for exactly this, and are not
           surprised that it finally came.</p>
           <p>Two circles. Two moons. The same diameter, the same spacing.
           Whoever built this chamber stood on that shore and measured.</p>`
        : `<p>Whatever they are waiting to receive has not arrived yet.</p>`
      }
      <div class="close">click to close</div>
    `);
  },
  touchChamberPanel: () => {
    state.shoreMonolithChamberSolved = true;
    playSfx('sigil-warp');
    showOverlay(`
      <h2>The Basin</h2>
      <p>The light finds it cleanly — the beam has always been
      aimed at this. You reach into the glow and let your hand
      rest beneath the surface. It is warm. Not the warmth of
      water in sun. The warmth of something living.</p>
      <p>The chamber hums once, low and long. The water stills.
      Something beneath the floor shifts and does not return.</p>
      <p><em>The Age accepts you.</em></p>
      <div class="close">click to depart</div>
    `, () => {
      state.shoreReturned = true;
      triggerAgeReturn(
        'The light that watched the depths has found what it sought.<br>' +
        'The water stills. Somewhere above, the shore is waiting to be remembered.'
      );
    });
  },

  // ---- Green multi-room -----------------------------------------------
  inspectRootAltar: () => {
    state.greenRootAltarInspected = true;
    playSfx('sweep-away');
    showOverlay(`
      <h2>The Stone Altar</h2>
      <p>Cut stone, deliberately placed — not grown here. The
      knotwork panels are old work, careful work. Someone brought
      this here and left it among the moss.</p>
      <p>On the flat top, the same mark as the dock door's left
      panel — the tree. Carved smaller beside it, in a different hand:</p>
      <p><em>"The tree knows its own. The stone above
      remembers."</em></p>
      <div class="close">click to close</div>
    `);
  },
  alignDiskTree: () => {
    state.greenCanopyAligned = true;
    playSfx('brass-click');
    showOverlay(`
      <h2>The Tree</h2>
      <p>You turn the wood until the tree symbol centers. A shaft
      of light descends through the hollow trunk — not sunlight,
      something older and more patient. It knows exactly where it
      is going.</p>
      <p><em>Below, in the depths, something is now visible
      that was not visible before.</em></p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  alignDiskWave: () => {
    playSfx('sweep-away');
    showOverlay(`
      <h2>The Wave</h2>
      <p>You turn the wood to the wave symbol. The hollow below
      stays dark. The wave belongs to another shore — it has
      nothing to say here among the roots.</p>
      <p><em>Not this one.</em></p>
      <div class="close">click to close</div>
    `);
  },
  alignDiskSpiral: () => {
    playSfx('sweep-away');
    showOverlay(`
      <h2>The Spiral</h2>
      <p>You turn the wood to the Keepers' mark. The hollow
      flickers — almost — then settles back to dark. The spiral
      opens other doors. Not this one.</p>
      <p><em>Not this one.</em></p>
      <div class="close">click to close</div>
    `);
  },
  inspectWallDisc: () => {
    if (state.greenCanopyAligned) {
      playSfx('fx-light', 0.5);
    } else {
      playSfx('sweep-away');
    }
    if (state.greenCanopyAligned) {
      showOverlay(`
        <h2>The Stone Disc</h2>
        <p>The pearl has answered. Something inside it glows now — a
        warm light from a place that is not this one, refracted
        through the gilded roots that cradle it.</p>
        <p>It found what it was waiting for.</p>
        <div class="close">click to close</div>
      `);
    } else {
      showOverlay(`
        <h2>The Stone Disc</h2>
        <p>A great stone roundel set into the trunk, bearing a gilded
        tree carved in deep relief. Its branches reach toward the rim;
        its roots gather around a pearl at the base, held in a shallow
        socket.</p>
        <p>The work is old — older than the platform, older than the
        staircase. It does not move. It is waiting for something.</p>
        <div class="close">click to close</div>
      `);
    }
  },
  inspectAlignedDisk: () => {
    playSfx('wood-tap');
    showOverlay(`
      <h2>The Aligned Disk</h2>
      <p>The tree symbol faces the center. The shaft of light you
      sent downward is still traveling — you can feel the platform
      humming faintly with it. Something below has received it.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectCanopyView: () => {
    state.greenCanopyViewInspected = true;
    playSfx('floating-pad');
    showOverlay(`
      <h2>The Forest</h2>
      <p>The canopy spreads to every horizon, broken in places by
      pale stone spires that rise out of the leaves like the fingers
      of something the forest grew around but never quite swallowed.
      The gold sunset catches the top of all of it — leaves and stone
      alike — and holds it like something precious.</p>
      <p>From here you understand that this Age is not laid out
      around a center. It is canopy, and the canopy is everything,
      and the stone fingers are not buildings but reminders.</p>
      <p>This is the view the Keepers came up here to think.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectDepthsPool: () => {
    state.greenDepthsPoolInspected = true;
    playSfx('water-drop');
    showOverlay(`
      <h2>The Underground Pool</h2>
      <p>The water reflects a field of stars. There are no stars
      overhead — only roots. The pool is showing you something that
      does not exist above it.</p>
      <p>The star field is steady. Patient. It will wait for as
      long as you need.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectDepthsPearls: () => {
    state.greenDepthsPearlsInspected = true;
    playSfx('water-drop');
    showOverlay(`
      <h2>The Pearls</h2>
      <p>Small bright things scattered through the bioluminescent
      water, each one catching what little light the cavern has
      and holding it. Not jewels, not eggs — pearls, or something
      old enough to be called pearls.</p>
      <p>They lean toward the brightest part of the pool the way
      a sleeping face turns toward a window. Whatever they are,
      they are waiting to be seen.</p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectRootGlyphs: () => {
    state.greenRootGlyphsInspected = true;
    playSfx('wood-tap');
    showOverlay(`
      <h2>A Carved Symbol</h2>
      <p>Something is carved into this root — a glyph, a
      constellation, a mark of some kind — but the shadow is too
      deep to read it. Whatever light reaches here is not directed
      at this one.</p>
      <div class="close">click to close</div>
    `);
  },
  touchLitRoot: () => {
    state.greenRootDepthsSolved = true;
    playSfx('sigil-warp');
    showOverlay(`
      <h2>The Lit Root</h2>
      <p>The light from above falls on this one — just this one,
      out of all of them. You lay your hand on the root. It is
      warm. The glyph along its surface pulses once, slowly, as
      though the tree above felt it.</p>
      <p>The pool stills. The star field sharpens. The roots part
      around you — not an exit, an acknowledgment.</p>
      <p><em>The Age accepts you.</em></p>
      <div class="close">click to depart</div>
    `, () => {
      state.greenReturned = true;
      triggerAgeReturn(
        'The roots close behind you, and the star field fades back to root and dark.<br>' +
        'The warmth of old wood stays with you as the green country recedes.'
      );
    });
  },

  // ---- Cottage multi-room ---------------------------------------------
  inspectNamePlaques: () => {
    state.cottageNamePlaquesInspected = true;
    playSfx('wood-tap');
    showOverlay(`
      <h2>Two Names</h2>
      <p>One plaque is measured and level — each letter the same
      depth, the same width. The other is slightly crooked, its
      letters cut with less patience and more feeling. Each was
      carved by the other's hand, you think.</p>
      <p>The names are worn to initials: <em>S.</em> and
      <em>R.</em></p>
      <div class="close">click to close</div>
    `);
  },
  inspectHallCoats: () => {
    state.cottageHallCoatsInspected = true;
    playSfx('bed-sheets');
    showOverlay(`
      <h2>Two Coats</h2>
      <p>Heavy wool, made for cliff wind. Neither has been lifted
      from its hook in a long time — the shoulders have taken the
      shape of the wood. Two coats. Two people who stopped needing
      them at the same moment.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectHallStarCharts: () => {
    state.cottageHallStarChartsInspected = true;
    playSfx('book-open', 2.0);
    showOverlay(`
      <h2>The Star Charts</h2>
      <p>An open scroll laid out on a small stand — a wheel of
      constellations divided into twelve, marked in a careful
      hand. Behind it, more scrolls leaning against the wall,
      rolled and tied, waiting to be unrolled by hands that did
      not come back.</p>
      <p>Several of the marked stars are not on any sky you have
      ever seen. The Keepers were watching something the rest of
      the world cannot.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectHallAntikythera: () => {
    state.cottageHallAntikytheraInspected = true;
    playSfx('brass-click');
    showOverlay(`
      <h2>The Mechanism</h2>
      <p>An ancient device of brass and bronze, gears within
      gears, older than the cottage and older than the stone the
      cottage is built from. Some of the gears are sized to track
      the moon. Some, the sun. Some, things you cannot name.</p>
      <p>It does not move. Whoever last wound it has not been
      here in a long time. The dust on the largest gear is
      undisturbed except in the shape of two fingers — as if
      someone reached toward it once and stopped.</p>
      <div class="close">click to close</div>
    `);
  },
  readLoftNote: () => {
    state.cottageLoftNoteRead = true;
    playSfx('book-open');
    showOverlay(`
      <h2>A Folded Note</h2>
      <p>Not a letter — a working instruction, written quickly in
      the careful hand from the journal downstairs:</p>
      <p><em>"When the second arm reaches the pale moon, the glass
      will find it. Don't forget again."</em></p>
      <p>Beneath, in the other hand: <em>"You always forget."</em></p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  inspectLoftMirror: () => {
    state.cottageLoftMirrorInspected = true;
    playSfx('written-letter');
    showOverlay(`
      <h2>Letters in the Mirror</h2>
      <p>Cards, notes, a pressed flower gone brittle — held in the
      frame so long they have become part of it. You can read
      fragments: a name that recurs, a date you cannot place, a
      joke that only makes sense to the person it was written for.</p>
      <p><em>These were kept because they were worth keeping.</em></p>
      <div class="close">click to close</div>
    `);
  },
  inspectLoftQuilt: () => {
    state.cottageLoftQuiltInspected = true;
    playSfx('bed-sheets');
    showOverlay(`
      <h2>The Spiral Quilt</h2>
      <p>The same mark you have traced across the whole island —
      the same spiral, embroidered in careful thread along the hem.
      Not an emblem here. Something domestic. Something chosen
      because it was theirs and it was beautiful.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectLoftWindow: () => {
    state.cottageLoftWindowInspected = true;
    playSfx('floating-pad');
    showOverlay(`
      <h2>The Window</h2>
      <p>A calm sea at golden hour. No twin moons. No reversed tide.
      Just the sea, behaving the way the sea is supposed to behave.
      From this window, nothing is wrong.</p>
      <p>You wonder if this is why they chose this room.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectStarCharts: () => {
    playSfx('book-open');
    showOverlay(`
      <h2>The Star Charts</h2>
      <p>Every chart across the whole table shows two moons —
      different positions, different seasons, different years of
      patient observation. But always two. They mapped this sky
      for a very long time.</p>
      <p>One chart has a constellation circled in red: a cluster
      of seven stars you have seen before, reflected in still
      water in a place that had no stars above it.</p>
      <div class="close">click to close</div>
    `);
  },
  inspectTowerLogbook: () => {
    playSfx('book-open');
    showOverlay(`
      <h2>A Half-Drawn Constellation</h2>
      <p>The same careful hand as the journals downstairs. Seven
      stars captured on the page, the eighth left undrawn. In
      the margin:</p>
      <p><em>"R — the eighth star is where the pale moon sat last
      Midsummer. Work it backward from there."</em></p>
      <p>You have seen this constellation before, reflected in
      water that had no stars above it.</p>
      <div class="close">click to close</div>
    `);
  },
  setOrreryArm1: () => {
    playSfx('interact-tap');
    showOverlay(`
      <h2>The First Arm</h2>
      <p>You move the first arm to its stop — a small carved disc
      of brass marking the sun's position. The arm settles. Through
      the telescope, the lens stays clouded. The Keepers were not
      watching for daylight things.</p>
      <p><em>Not this one.</em></p>
      <div class="close">click to close</div>
    `);
  },
  setOrreryArm2: () => {
    state.cottageTowerOrrerySet = true;
    playSfx('brass-click');
    showOverlay(`
      <h2>The Second Arm</h2>
      <p>You move the second arm until it rests against the pale
      moon — the smaller one, low on its arc. The orrery clicks
      once, twice, and stills. Through the telescope eyepiece the
      lens clarifies. Something has come into alignment that was
      waiting to be found.</p>
      <p><em>The glass will find it.</em></p>
      <div class="close">click to close</div>
    `);
    refreshCurrentNode();
  },
  setOrreryArm3: () => {
    playSfx('interact-tap');
    showOverlay(`
      <h2>The Third Arm</h2>
      <p>You move the third arm — its disc is silver, larger,
      polished bright. The arm comes to rest at the larger of the
      two moons. The orrery hums and stills. The lens remains
      clouded.</p>
      <p><em>Not this one.</em></p>
      <div class="close">click to close</div>
    `);
  },
  inspectOrrery: () => {
    if (state.cottageTowerOrrerySet) {
      playSfx('fx-light', 0.5);
      showOverlay(`
        <h2>The Orrery</h2>
        <p>The brass has gone warm. The second arm holds against the
        pale moon's mark, where it was always meant to stop. The
        instrument is doing what it was made for.</p>
        <div class="close">click to close</div>
      `);
    } else {
      playSfx('interact-tap');
      showOverlay(`
        <h2>The Orrery</h2>
        <p>An orrery of brass and silver — three arms, three discs,
        a pearl at the center. It has not turned for a long time.
        The parts move easily, waiting for a careful hand.</p>
        <div class="close">click to close</div>
      `);
    }
  },
  useTelescope: () => {
    playSfx('sigil-warp');
    showOverlay(`
      <h2>The Telescope</h2>
      <p>You press your eye to the lens. The instrument has been
      waiting for exactly this angle — the orrery's alignment
      carries through the glass and the glass carries through
      to the sky.</p>
      <p>Far out over the sea, in the dark between the two moons,
      there is a light that is not a moon and not a star. It moves
      — steadily, purposefully — as if it knows where it is going.
      As if it has always known.</p>
      <p><em>The Age accepts you.</em></p>
      <div class="close">click to depart</div>
    `, () => {
      state.cottageReturned = true;
      triggerAgeReturn(
        'The light between the moons moved on, and you let it.<br>' +
        'The names you did not learn stay behind with the cold hearth and the open journals.'
      );
    });
  },

  // ---- Bizarre realm — climactic two-book choice ----------------------
  touchKeeperOneBook: () => {
    playSfx('page-turn');
    showOverlay(`
      <h2>The First Book</h2>
      <p>The handwriting is looping and unhurried — the hand of
      someone who wrote for comfort as much as memory.</p>
      <p><em>I do not know if anyone will ever come this far. I
      wrote this Age for the two of us — a place to sit above the
      clouds and remember that the worlds are still there, even
      when we cannot reach them.</em></p>
      <p><em>If you are reading this, then the page still works.
      The link still holds.</em></p>
      <p><em>Take the shell home, if you find one. They travel
      well.</em></p>
      <div class="close">click to close</div>
    `, () => {
      triggerEndscreen(
        'You close the cover. The clouds below the plateau catch the moonlight and hold it.<br>' +
        'Wherever the Keepers are, they left the door open.'
      );
    });
  },

  touchKeeperTwoBook: () => {
    playSfx('page-turn');
    showOverlay(`
      <h2>The Second Book</h2>
      <p>The handwriting is compact and careful, each letter
      measured — the hand of someone who wrote to think.</p>
      <p><em>The second moon reached its alignment last night. I
      have been watching it for eleven years.</em></p>
      <p><em>What I have learned: the Ages do not end when you
      leave them. The shore still turns. The roots still grow.
      The canopy still watches the horizon. We are not the point
      of any of this.</em></p>
      <p><em>Which is, I think, exactly right.</em></p>
      <div class="close">click to close</div>
    `, () => {
      triggerEndscreen(
        'You close the cover. The second moon climbs toward its twin, unhurried.<br>' +
        'The Age continues without you, exactly as it should.'
      );
    });
  },
};

// ---- Book-frame geometry (hollow rectangle outline) -----------------
function norm2(v) {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  return len > 0 ? [v[0] / len, v[1] / len] : [0, 0];
}

function makeQuadFrame(pts, t = 0.12) {
  // pts: [[x,y], ...] 4 corners in any order (TR, BR, BL, TL from R-capture)
  const area = pts.reduce((s, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const ccw = area > 0;
  const inset = pts.map((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const next = pts[(i + 1) % pts.length];
    const e1 = norm2([p[0] - prev[0], p[1] - prev[1]]);
    const e2 = norm2([next[0] - p[0], next[1] - p[1]]);
    const n1 = ccw ? [-e1[1], e1[0]] : [e1[1], -e1[0]];
    const n2 = ccw ? [-e2[1], e2[0]] : [e2[1], -e2[0]];
    const bis = norm2([n1[0] + n2[0], n1[1] + n2[1]]);
    const d = t / Math.max(n1[0] * bis[0] + n1[1] * bis[1], 0.25);
    return [p[0] + bis[0] * d, p[1] + bis[1] * d];
  });
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(inset[0][0], inset[0][1]);
  inset.slice(1).forEach(([x, y]) => hole.lineTo(x, y));
  hole.closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
}

function makeBookFrame(w = 0.5, h = 1.8, t = 0.08) {
  const shape = new THREE.Shape();
  shape.moveTo(-w/2, -h/2);
  shape.lineTo( w/2, -h/2);
  shape.lineTo( w/2,  h/2);
  shape.lineTo(-w/2,  h/2);
  shape.lineTo(-w/2, -h/2);
  const hole = new THREE.Path();
  hole.moveTo(-w/2 + t, -h/2 + t);
  hole.lineTo( w/2 - t, -h/2 + t);
  hole.lineTo( w/2 - t,  h/2 - t);
  hole.lineTo(-w/2 + t,  h/2 - t);
  hole.lineTo(-w/2 + t, -h/2 + t);
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
}

// ---- World graph ----------------------------------------------------
// Hotspots is a function that returns a list — lets us hide/show
// based on `state` without rebuilding the whole world.
const WORLD = {
  dock: {
    name: 'The Dock',
    pano: () => loadPano('panos/dock.jpg'),
    // Per-node ambient — water, gulls, wind. Loops while the player
    // is at the dock; crossfades out when they travel away.
    ambient: 'audio/sfx/dock-ambient.mp3',
    ambientMix: 0.45,
    // Open framing — the player's first sight is the ship that brought them.
    startDir: [0.73, -0.15, 0.67],
    hotspots: () => [
      // The ship — Captain Renn's vessel, waiting at anchor. Wide short panel
      // to match the hull silhouette; opens the captain's log on click.
      { action: 'readCaptainsLog', dir: [0.71, -0.26, 0.65], shape: 'quad',
        corners: [[4.23,0.85], [3.31,-0.85], [-3.31,-0.85], [-4.23,0.85]],
        label: "Captain Renn's ship", color: 0xffaa44,
        sfx: 'key-lock-insert', sfxVolume: 2.0 },
      // Three door panels — only the spiral is the Keepers' mark.
      // Book-frame outlines match the tall narrow panel shapes.
      { action: 'inspectDoorTree', dir: [-0.83, 0.5, -0.29], w: 1.1, h: 2.1, roll: -0.08,
        label: 'a carved panel', color: 0xa078ff, shape: 'panel',
        hidden: () => state.dockDoorUnlocked },
      { action: 'unlockDoor', dir: [-0.61, 0.49, -0.63], roll: 0.05,
        label: 'a carved panel', color: 0xa078ff, shape: 'panel',
        hidden: () => state.dockDoorUnlocked },
      { action: 'inspectDoorWave', dir: [-0.66, 0.245, -0.7], w: 1.35, h: 2.25,
        label: 'a carved panel', color: 0xa078ff, shape: 'panel',
        hidden: () => state.dockDoorUnlocked },
      // The door itself — locked = flavor inspect, unlocked = travel.
      { action: 'inspectLockedDoor', dir: [-0.81, 0.28, -0.52], shape: 'quad',
        corners: [[1.64,1.31], [1.7,-1.31], [-1.7,-1.31], [-1.64,1.31]],
        label: 'the door',
        hidden: () => state.dockDoorUnlocked },
      { to: 'observatory', dir: [-0.81, 0.28, -0.52],
        label: 'enter the door',
        sfx: 'door-open', fadeMs: 3600,
        hidden: () => !state.dockDoorUnlocked },
    ],
  },
  library: {
    name: 'The Library',
    // Pano swaps when the player reads the lectern book — the world
    // physically reflects the discovery. updated = pre-read, activated = post-read.
    pano: () => loadPano(state.libraryBookRead
      ? 'panos/library-activated.jpg'
      : 'panos/library.jpg'),
    // Open framing — the spiral staircase + lectern in view, with the
    // empty bookshelf catching the eye in peripheral vision.
    startDir: [0.1, -0.04, -0.99],
    hotspots: () => [
      // Spent brass sigil-plate set into the library floor. Inspect-only;
      // the pearl is gone and the plate no longer links anywhere. Rendered
      // as the default travel-ring (matches the ascension's working plate
      // in scale) but in dark burnt brown to signal a dead link.
      { action: 'inspectSpentSigil', dir: [-0.48, -0.66, 0.58],
        label: 'a brass sigil-plate', color: 0xb07835, shape: 'quad',
        corners: [[3.06,0.58], [1.22,-1.87], [-3.24,-0.33], [-1.04,1.63]] },
      // Lectern book — only becomes clickable once the player has
      // inspected the empty slot and noticed the book. Hides after read.
      { action: 'readBook', dir: [0.86, -0.025, 0.5], label: 'read the open book',
        color: 0xffaa44, shape: 'open-book',
        hidden: () => !state.librarySlotInspected || state.libraryBookRead },
      // Empty slot in the bookshelf — pure clue hotspot pointing toward
      // the lectern. Hides once the book is read (panorama shows it filled).
      { action: 'interactSlot', dir: [-0.17, 0.16, 0.97], label: 'an empty slot in the shelf',
        color: 0xa078ff, shape: 'book',
        hidden: () => state.libraryBookRead },
      // Window behind the lectern — vista inspect. Future: room or outside space.
      { action: 'inspectLibraryWindow', dir: [0.86, 0.17, 0.48],
        label: 'a tall window', color: 0xa078ff, shape: 'quad',
        corners: [[1.44,3.04], [1.53,-3.04], [-1.53,-3.04], [-1.44,3.04]],
        hidden: () => state.libraryWindowInspected },
      // The shelves themselves — flavor inspect on the Keepers' patience.
      // Wide quad spans the far wall of bindings.
      { action: 'inspectLibraryBooks', dir: [-0.32, 0.12, -0.94], shape: 'quad',
        corners: [[10.4,3.63], [10.75,-3.77], [-10.83,-4.29], [-10.32,4.43]],
        label: 'the long rows of books', color: 0xffaa44,
        hidden: () => state.libraryBooksInspected },
      // Spiral staircase — main exit, always visible.
      { to: 'observatory', dir: [0.52, -0.2, -0.83], label: 'climb the spiral staircase',
        sfx: 'climbing-stairs', sfxDelay: 500, fadeMs: 6500 },
      // Secret passage between the bookshelves — the puzzle reward.
      // Hidden until the book is read.
      { to: 'ascension', dir: [-1, -0.04, 0.06], label: 'a hidden passage in the bookshelves',
        color: 0xa078ff,
        sfx: 'leaving-walk', fadeMs: 4000,
        hidden: () => !state.libraryBookRead },
    ],
  },
  ascension: {
    name: 'The Ascension Chamber',
    pano: () => loadPano('panos/ascension.jpg'),
    ambient: 'audio/sfx/ascension-ambient.mp3',
    ambientMix: 0.45,
    startDir: [0.2, -0.06, 0.98],
    hotspots: () => [
      // The shore's linking book — blue leather, wave sigil.
      { action: 'touchLinkingBook',
        dir: [-0.57, -0.36, -0.74], shape: 'quad',
        corners: [[0.85,2.5], [0.76,-3.15], [-0.77,-2.29], [-0.85,2.93]],
        label: 'a glowing book — touch the page', color: 0x5a9aff,
        hidden: () => state.shoreCompleted },
      // The green country's linking book — green leather, tree sigil.
      { action: 'touchGreenBook',
        dir: [-0.71, -0.36, -0.61], shape: 'quad',
        corners: [[0.84,2.07], [0.74,-3.14], [-0.78,-1.85], [-1.15,2.85]],
        label: 'a glowing book — touch the page', color: 0x9aff7a,
        hidden: () => state.greenCompleted },
      // The Keepers' red book — third linking book, the cottage Age.
      { action: 'touchKeepersBook',
        dir: [-0.39, -0.37, -0.84], shape: 'quad',
        corners: [[0.44,1.76], [0.44,-2.66], [-0.67,-2.5], [-0.74,2.39]],
        label: 'a glowing book — touch the page', color: 0xff5a4a,
        hidden: () => state.cottageCompleted },
      // The Keepers' open notebook — lore + dedication easter egg.
      { action: 'inspectOpenBook',
        dir: [-0.43, -0.64, -0.63], shape: 'quad',
        corners: [[4.63,2.61], [5.99,-2.17], [-5.69,-2.99], [-4.93,2.55]],
        label: 'an open notebook, mid-thought', color: 0xffaa44,
        hidden: () => state.shoreReturned && state.greenReturned && state.cottageReturned },
      // Step onto the sigil-plate — escape valve back to library.
      { to: 'library', dir: [-0.48, -0.41, 0.78], label: 'step onto the sigil',
        color: 0x7affd2,
        sfx: 'sigil-warp', fadeMs: 1800,
        hidden: () => state.shoreReturned && state.greenReturned && state.cottageReturned },
      // Bizarre realm orrery — unlocks when all 3 Ages are returned from.
      { to: 'bizarreRealm', dir: [0.07, 0.11, -0.99],
        label: 'the armillary sphere — it holds something new', color: 0xd4aaff,
        sfx: 'peaceful-ray', sfxVolume: 1.5, fadeMs: 4000,
        hidden: () => !(state.shoreReturned && state.greenReturned && state.cottageReturned) },
    ],
  },
  // ---- Bizarre Realm (stub — pano pending) ----------------------------
  bizarreRealm: {
    name: 'The Fourth Age',
    pano: () => loadPano('panos/bizarre-realm.jpg'),
    onEnter: () => {
      // First-time entry: start the bizarre realm track and fade UP from
      // silence. Return entry from bizarreRealmTree (which shares this
      // track): music is already mid-playback — don't reset src or restart
      // playback. Just refresh the label and let the song continue.
      // (Earlier version did `fadeAudio(0, 3000)` then jammed volume in a
      // setTimeout — the in-flight fade kept stomping the new volume back
      // down to 0, so the track played silently until the next travel
      // re-fade brought it back up.)
      if (bizarreRealmMusicActive) {
        updateTrackLabel();
        return;
      }
      bizarreRealmMusicActive = true;
      ambientAudio.loop = true;
      ambientAudio.src = assetUrl(BIZARRE_REALM_TRACK.url);
      ambientAudio.volume = 0;
      ambientAudio.play().catch(err => console.warn('[bizarre]', err));
      if (!audioPrefs.musicMuted) {
        fadeAudioElement(ambientAudio, audioPrefs.music, 2000);
      }
      updateTrackLabel();
    },
    startDir: [-0.5, 0.46, 0.74],
    hotspots: () => [
      { action: 'inspectBizarreTwinMoons', dir: [0.06, 0.38, -0.92],
        label: 'two moons above the plateau', color: 0xc8d4e8, shape: 'circle',
        hidden: () => state.bizarreTwinMoonsInspected },
      { action: 'inspectBizarreCloudSea', dir: [0.99, 0.06, -0.09], shape: 'quad',
        corners: [[7.61,1.09],[7.65,-1.09],[-7.65,-1.09],[-7.61,1.09]],
        label: 'the cloud sea', color: 0x90b8d8,
        hidden: () => state.bizarreCloudSeaInspected },
      { action: 'inspectBizarrePlateauEdge', dir: [-0.74, 0.02, -0.67],
        label: 'the edge of the plateau', color: 0xc4a878, shape: 'circle',
        hidden: () => state.bizarrePlateauEdgeInspected },
      { action: 'inspectFamiliarDistance', dir: [0.08, -0.14, -0.99], shape: 'quad',
        corners: [[2.38,0.66],[2.78,-0.66],[-2.78,-0.66],[-2.38,0.66]],
        label: 'something familiar in the distance', color: 0xffaa44 },
      { action: 'inspectTheTree', dir: [-0.61, 0.6, 0.52],
        label: 'the tree across the cloud', color: 0xa6826a, shape: 'circle',
        hidden: () => state.bizarreTreeInspected },
      { to: 'bizarreRealmTree', dir: [-0.59, 0.49, 0.64],
        label: 'toward the tree', sfx: 'stone-footsteps', fadeMs: 3500,
        hidden: () => !state.bizarreTreeInspected },
      { to: 'ascension', dir: [-0.75, -0.47, -0.46],
        label: 'step onto the sigil', color: 0x7affd2,
        sfx: 'sigil-warp', fadeMs: 3000 },
    ],
  },

  bizarreRealmTree: {
    name: 'The Fourth Age',
    pano: () => loadPano('panos/bizarre-realm-tree.jpg'),
    startDir: [0.45, 0.64, -0.63],
    hotspots: () => [
      { action: 'touchKeeperOneBook', dir: [0.25, -0.54, -0.8],
        label: 'an open book — looping hand', color: 0xffd27a, shape: 'quad',
        corners: [[4.56,1.07],[4,-1.7],[-4.84,-1.43],[-3.72,2.06]] },
      { action: 'touchKeeperTwoBook', dir: [0.51, -0.68, -0.52],
        label: 'a sealed book — careful hand', color: 0xd4aaff, shape: 'quad',
        corners: [[3.54,1.07],[0.27,-2.22],[-3.42,-0.67],[-0.4,1.82]] },
      { action: 'inspectBizarreSpiralTrunk', dir: [0.52, -0.06, -0.85], shape: 'quad',
        corners: [[1.04,1.77],[1,-1.75],[-1.15,-1.87],[-0.9,1.85]],
        label: 'an S, cut into the bark', color: 0xffd27a,
        hidden: () => state.bizarreSpiralTrunkInspected },
      { action: 'inspectBizarreScroll', dir: [0.82, -0.56, 0.13],
        label: 'a scroll among the roots', color: 0xffd27a, shape: 'circle',
        hidden: () => state.bizarreScrollInspected },
      { action: 'inspectBizarreSmallerPaleMoon', dir: [-0.42, 0.09, 0.91],
        label: 'the pale moon', color: 0xc8d4e8, shape: 'circle',
        hidden: () => state.bizarreSmallerPaleMoonInspected },
      { action: 'inspectBizarreRennName', dir: [0.69, -0.32, -0.65],
        label: 'a name carved into a root', color: 0xb07835, shape: 'circle',
        hidden: () => state.bizarreRennNameInspected },
      { action: 'inspectBizarreShell', dir: [-0.12, -0.61, -0.78],
        label: 'a small shell among the roots', color: 0xa078ff, shape: 'circle',
        hidden: () => state.bizarreShellInspected },
      { to: 'bizarreRealm', dir: [0.24, -0.73, 0.64],
        label: 'back to the plateau', sfx: 'stone-footsteps', fadeMs: 3500 },
    ],
  },

  reversedShore: {
    name: 'The Reversed Shore',
    pano: () => loadPano('panos/reversed-shore.jpg'),
    // Per-node ambient — the Reversed Shore's signature soundscape.
    ambient: 'audio/sfx/shore-ambient.mp3',
    ambientMix: 1.8,
    startDir: [-0.78, 0.15, 0.61],
    hotspots: () => [
      { action: 'inspectShoreLighthouse', dir: [-0.88, 0.04, -0.48], shape: 'quad',
        corners: [[0.43,0.87],[0.44,-0.87],[-0.44,-0.87],[-0.43,0.87]],
        label: 'the black lighthouse',
        color: 0xffc26a,
        hidden: () => state.shoreLighthouseInspected },
      { action: 'inspectShoreMoon', dir: [0.65, 0.26, 0.72],
        label: 'the smaller moon',
        color: 0xc0d0ff, shape: 'circle',
        hidden: () => state.shoreMoonInspected },
      { action: 'inspectShoreShell', dir: [-0.07, -0.8, -0.59],
        label: 'a purple shell on the stones',
        color: 0xc8a0ff, shape: 'circle',
        hidden: () => state.shoreShellInspected },
      // Final exit — only appears once all three have been seen.
      // Passage shape so it reads as a true travel ring (overlay before travel).
      { action: 'wadeToMonolith', dir: [0.91, -0.21, 0.35],
        label: 'walk into the tide',
        color: 0x7affd2, shape: 'passage',
        hidden: () => !(state.shoreLighthouseInspected
                        && state.shoreMoonInspected
                        && state.shoreShellInspected) },
    ],
  },
  greenCountry: {
    name: 'The Green Country',
    pano: () => loadPano('panos/green-country.jpg'),
    // Per-node ambient — woodland: distant birds, leaf-rustle, deep stillness.
    ambient: 'audio/sfx/green-ambient.mp3',
    startDir: [-0.58, 0.37, 0.72],
    hotspots: () => [
      // The ancient trees — aimed up the trunks (distinct from the gap
      // between roots, which is the terminal target). Panel shape with
      // custom w/h to fit the trees' massive scale.
      { action: 'inspectGreenTree', dir: [-0.42, 0.88, -0.21], shape: 'quad',
        corners: [[1.2,4.65], [3.13,-4.65], [-3.29,-4.62], [-1.04,4.62]],
        label: 'ancient trees, taller than mountains', color: 0x9aff7a,
        hidden: () => state.greenTreeInspected },
      // The root-woven basin holding a pool that reflects a wrong sky.
      { action: 'inspectGreenBasin', dir: [0.43, -0.64, 0.64],
        label: 'a basin of roots holding still water',
        color: 0xc0d0ff, shape: 'circle',
        hidden: () => state.greenBasinInspected },
      // A small purple shell resting on a root — cross-Age callback.
      { action: 'inspectGreenShell', dir: [0.62, -0.76, -0.18],
        label: 'a small purple shell on the root',
        color: 0xc8a0ff, shape: 'circle',
        hidden: () => state.greenShellInspected },
      // Terminal exit — only appears once all three have been seen.
      // Passage shape so it reads as a true travel ring (the overlay runs
      // before the actual travel).
      { action: 'stepIntoRoots', dir: [0.31, 0.08, -0.95],
        label: 'step between the great roots',
        color: 0x7affd2, shape: 'passage',
        hidden: () => !(state.greenTreeInspected
                        && state.greenBasinInspected
                        && state.greenShellInspected) },
    ],
  },
  keepersCottage: {
    name: "The Keepers' Cottage",
    pano: () => loadPano('panos/keepers-cottage.jpg'),
    // Per-node ambient — wind outside the stone, room-tone of long emptiness.
    ambient: 'audio/sfx/wind-outside-room.mp3',
    // wind-outside-room.mp3 is mastered quietly — push it above the default
    // 0.6 environmental mix so the room actually breathes.
    ambientMix: 1.5,
    startDir: [-0.98, 0.16, -0.13],
    hotspots: () => [
      // Left desk journal — the careful chronicler's hand. Pristine
      // textbook layout next to the brass candelabra and orrery.
      // Sized to hug the journal's full open-spread footprint.
      { action: 'inspectCottageJournalLeft', dir: [0.21, -0.56, -0.8], shape: 'quad',
        corners: [[2.79,0.91], [3.32,-0.91], [-3.32,-0.91], [-2.79,0.91]],
        label: 'an open journal on the left desk', color: 0xffaa44,
        hidden: () => state.cottageJournalLeftRead },
      { action: 'inspectCottageJournalRight', dir: [0.74, -0.67, -0.1], shape: 'quad',
        corners: [[3.83,1.59], [4.25,-1.59], [-4.25,-1.59], [-3.83,1.59]],
        label: 'an open journal on the right desk', color: 0xffaa44,
        hidden: () => state.cottageJournalRightRead },
      { action: 'inspectCottageSpiral', dir: [-0.45, 0.01, 0.89], shape: 'quad',
        corners: [[1.08,2.39], [1.08,-2.39], [-1.08,-2.39], [-1.08,2.39]],
        label: 'a spiral carved into the stone', color: 0xffd27a,
        hidden: () => state.cottageSpiralInspected },
      // Needleless brass compass resting on a side table by the
      // armchair — cross-Age callback to the captain's stopped compass.
      { action: 'inspectCottageCompass', dir: [0.7, -0.65, 0.31],
        label: 'a brass compass on the books',
        color: 0xc0d0ff, shape: 'circle',
        hidden: () => state.cottageCompassInspected },
      // Small purple shell tucked under the left desk — cross-Age
      // callback to the reversed shore + green country shells.
      { action: 'inspectCottageShell', dir: [0.25, -0.76, -0.6],
        label: 'a small purple shell',
        color: 0xc8a0ff, shape: 'circle',
        hidden: () => state.cottageShellInspected },
      // Left staircase — hidden until all five inspects are complete.
      // Passage shape so it reads as a true travel ring (overlay before travel).
      { action: 'ascendCottageLoft', dir: [-0.85, 0.4, 0.33],
        label: 'the left staircase',
        color: 0x7affd2, shape: 'passage',
        hidden: () => !(state.cottageJournalLeftRead
                        && state.cottageJournalRightRead
                        && state.cottageSpiralInspected
                        && state.cottageCompassInspected
                        && state.cottageShellInspected) },
      // Right staircase — DIR captured 2026-05-31. Leads to same upper hall.
      { action: 'ascendCottageLoft', dir: [-0.04, 0.47, -0.88],
        label: 'the right staircase',
        color: 0x7affd2, shape: 'passage',
        hidden: () => !(state.cottageJournalLeftRead
                        && state.cottageJournalRightRead
                        && state.cottageSpiralInspected
                        && state.cottageCompassInspected
                        && state.cottageShellInspected) },
    ],
  },
  observatory: {
    name: 'The Observatory',
    // Pano swaps when the player activates the brass mechanism.
    pano: () => loadPano(state.observatoryMechanismActive
      ? 'panos/observatory-activated.jpg'
      : 'panos/observatory.jpg'),
    // Pre-activation: soft wind reaches the cliff-top observatory through stone.
    // Post-activation: gears take over the room.
    ambient: () => state.observatoryMechanismActive
      ? 'audio/sfx/rusty-gears.mp3'
      : 'audio/sfx/soft-wind.mp3',
    // Wind is half of normal; rusty-gears is mastered quietly and needs the boost.
    ambientMix: () => state.observatoryMechanismActive ? 1.5 : 0.5,
    // Re-fire the mechanism whir on each return visit, so the player
    // hears the room come alive each time — not just the first.
    onEnter: () => {
      if (state.observatoryMechanismActive) playSfx('mechanism-whir', 0.75);
    },
    // Open framing — sea of clouds and constellations. Mechanism is
    // discovered by turning, not handed to the player on arrival.
    startDir: [0.88, 0.17, 0.44],
    hotspots: () => [
      { to: 'dock', dir: [0.41, -0.91, -0.07], label: 'back to the dock',
        sfx: 'door-open', fadeMs: 3600 },
      // Brass mechanism — clue + puzzle gate. Hidden once activated.
      { action: 'activateMechanism', dir: [-0.85, 0.02, -0.04],
        label: 'the brass mechanism',
        color: 0xffaa44, shape: 'button',
        hidden: () => state.observatoryMechanismActive },
      // Slab descent — locked until the mechanism is activated.
      { to: 'library', dir: [0.32, -0.57, 0.76],
        label: 'descend through the slab',
        sfx: 'heavy-door-open', fadeMs: 2400,
        hidden: () => !state.observatoryMechanismActive },
    ],
  },

  // ---- Shore multi-room nodes -----------------------------------------
  shoreMonolith: {
    name: 'The Monolith',
    pano: () => loadPano(state.lighthouseBeamRedirected ? 'panos/shore-monolith-activated.jpg' : 'panos/shore-monolith.jpg'),
    ambient: 'audio/sfx/shore-ambient.mp3',
    ambientMix: 1.8,
    startDir: [-0.8, 0.19, 0.58],
    hotspots: () => [
      { action: 'inspectMonolithCarvings', dir: [-0.73, 0.03, -0.68], shape: 'quad',
        corners: [[1.5,3.37],[1.52,-3.15],[-1.51,-2.29],[-1.51,2.07]],
        label: 'wave carvings on the stone', color: 0xa078ff,
        hidden: () => state.shoreMonolithCarvingsInspected },
      { to: 'shoreMonolithChamber', dir: [0.22, -0.03, -0.98],
        label: () => state.lighthouseBeamRedirected ? 'the chamber beyond' : 'the passage into the dark',
        sfx: 'leaving-walk', sfxVolume: 2.0, fadeMs: 4000 },
      { to: 'shoreLighthouse', dir: [0.94, 0.11, 0.32],
        label: 'the distant lighthouse', sfx: 'linking-warp', fadeMs: 3000 },
      { to: 'reversedShore', dir: [0.7, -0.09, 0.71],
        label: 'back to the shore', sfx: 'wave-crash', fadeMs: 4000 },
    ],
  },
  shoreMonolithChamber: {
    name: 'The Chamber',
    pano: () => loadPano(state.lighthouseBeamRedirected ? 'panos/shore-monolith-chamber-activated.jpg' : 'panos/shore-monolith-chamber.jpg'),
    ambient: 'audio/sfx/monolith-chamber-ambient.mp3',
    startDir: [-0.65, 0.11, -0.75],
    hotspots: () => [
      { action: 'inspectChamberPortal', dir: [-0.69, 0.09, 0.72],
        label: 'a stone aperture in the arch', color: 0xa078ff, shape: 'circle',
        hidden: () => state.shoreChamberPortalInspected },
      { action: 'inspectChamberSpiral', dir: [0.44, 0.03, -0.9],
        label: 'a spiral carving', color: 0xa078ff, shape: 'quad',
        corners: [[1.99,7.25], [1.62,-6.86], [-1.93,-7.66], [-1.67,7.27]],
        hidden: () => state.shoreChamberSpiralInspected },
      { action: 'inspectFloorDiscs', dir: [-0.11, -0.65, 0.75],
        label: 'two circles in the floor', color: 0xa078ff, shape: 'circle',
        hidden: () => state.lighthouseBeamRedirected },
      // Lit version — teal, visible once beam is redirected, hides after player reads.
      { action: 'inspectFloorDiscs', dir: [-0.11, -0.65, 0.75],
        label: 'two circles in the floor', color: 0x7affd2, shape: 'circle',
        hidden: () => !state.lighthouseBeamRedirected || state.chamberDiscsRead },
      { action: 'touchChamberPanel', dir: [-0.63, -0.31, -0.71],
        label: 'the basin, lit from within', color: 0x7affd2, shape: 'circle',
        hidden: () => !state.chamberDiscsRead || state.shoreMonolithChamberSolved },
      { to: 'shoreMonolith', dir: [0.94, -0.28, -0.21],
        label: 'back through the passage', sfx: 'leaving-walk', sfxVolume: 2.0, fadeMs: 3500 },
    ],
  },
  shoreLighthouse: {
    name: 'The Lighthouse',
    pano: () => loadPano(state.lighthouseBeamRedirected ? 'panos/shore-lighthouse-activated.jpg' : 'panos/shore-lighthouse.jpg'),
    ambient: 'audio/sfx/lighthouse-ambient.mp3',
    startDir: [0.4, -0.1, 0.91],
    hotspots: () => [
      { action: 'readLighthouseLog', dir: [-0.3, -0.24, -0.92],
        label: 'a rusted logbook', color: 0xffaa44, shape: 'quad',
        corners: [[3.19,0.87], [3.14,-0.44], [-3.14,-0.87], [-3.19,0.44]] },
      { action: 'inspectShorePorthole', dir: [-0.97, -0.01, -0.24],
        label: 'a porthole into the night', color: 0xc8d4e8, shape: 'circle',
        hidden: () => state.shorePortholeInspected },
      // Three dial positions — puzzle origin. Depths is correct.
      // All three dirs need H-key capture once pano is in.
      { action: 'setDialSky', dir: [0.59, 0.65, -0.48],
        label: 'the dial — sky position', color: 0xa078ff, shape: 'circle',
        hidden: () => state.lighthouseBeamRedirected },
      { action: 'setDialSea', dir: [0.76, 0.62, 0.19],
        label: 'the dial — sea position', color: 0xa078ff, shape: 'circle',
        hidden: () => state.lighthouseBeamRedirected },
      { action: 'setDialDepths', dir: [0.89, 0.42, -0.17],
        label: 'the dial — depths position', color: 0xa078ff, shape: 'circle',
        hidden: () => state.lighthouseBeamRedirected },
      // Post-redirect — single confirm inspect.
      { action: 'inspectRedirectedBeam', dir: [0.98, -0.12, -0.17],
        label: 'the redirected beam', color: 0x7affd2, shape: 'circle', r: 0.5,
        hidden: () => !state.lighthouseBeamRedirected },
      { to: 'shoreMonolith', dir: [-0.62, -0.38, 0.69],
        label: 'back to the monolith', sfx: 'climbing-stairs', fadeMs: 4500 },
    ],
  },

  // ---- Green multi-room nodes -----------------------------------------
  greenRootHollow: {
    name: 'The Root Hollow',
    pano: () => loadPano('panos/green-country-hollow.jpg'),
    ambient: 'audio/sfx/green-ambient.mp3',
    startDir: [-0.83, 0.11, -0.55],
    hotspots: () => [
      { action: 'inspectRootAltar', dir: [-0.49, -0.05, -0.87],
        label: 'a carved stone altar', color: 0xffaa44, shape: 'quad',
        corners: [[2.37,0.74], [2.39,-0.63], [-2.4,-0.77], [-2.36,0.67]],
        hidden: () => state.greenRootAltarInspected },

      { to: 'greenRootDepths', dir: [-0.38, -0.34, 0.86],
        label: 'a passage descending into the roots', sfx: 'footsteps-in-forest', fadeMs: 3500 },
      { to: 'greenCanopy', dir: [0.2, 0.33, 0.92],
        label: 'the hollow trunk going up', sfx: 'stone-footsteps', fadeMs: 3500 },
      { to: 'greenCountry', dir: [0.66, 0.21, -0.73],
        label: 'back to the green country', sfx: 'walk-dirt', fadeMs: 4000 },
    ],
  },
  greenRootDepths: {
    name: 'The Root Depths',
    // Pano swaps when the canopy disc is aligned — the cold light from above
    // finds the lit root only after the puzzle is set.
    pano: () => loadPano(state.greenCanopyAligned
      ? 'panos/green-country-depths-activated.jpg'
      : 'panos/green-country-depths.jpg'),
    ambient: 'audio/sfx/dripping-water-stalactites-cave.mp3',
    startDir: [0.94, -0.2, 0.29],
    hotspots: () => [
      { action: 'inspectDepthsPool', dir: [0.73, -0.64, 0.24],
        label: 'the underground pool', color: 0xc0d0ff, shape: 'circle',
        hidden: () => state.greenDepthsPoolInspected },
      // Pearls — only visible in the dark/unaligned state. Once the canopy
      // pours light into the chamber, they're no longer the only bright
      // things in the room and the player's eye moves to the lit root.
      { action: 'inspectDepthsPearls', dir: [-0.06, -0.84, -0.54], shape: 'circle',
        label: 'small pearls in the water', color: 0xffd27a,
        hidden: () => state.greenCanopyAligned || state.greenDepthsPearlsInspected },
      { action: 'inspectRootGlyphs', dir: [-0.71, -0.27, -0.65],
        label: 'markings hidden among the roots', color: 0xa078ff, shape: 'circle',
        hidden: () => state.greenRootGlyphsInspected },
      { action: 'touchLitRoot', dir: [-0.64, -0.49, 0.59],
        label: 'the root lit from above', color: 0x7affd2, shape: 'circle',
        hidden: () => !state.greenCanopyAligned || state.greenRootDepthsSolved },
      { to: 'greenRootHollow', dir: [-0.97, -0.17, 0.17],
        label: 'back up to the hollow', sfx: 'footsteps-in-forest', fadeMs: 3500 },
    ],
  },
  greenCanopy: {
    name: 'The Canopy',
    pano: () => loadPano(state.greenCanopyAligned ? 'panos/green-country-canopy-activated.jpg' : 'panos/green-country-canopy.jpg'),
    ambient: 'audio/sfx/green-canopy-ambient.mp3',
    ambientMix: 2.5,
    startDir: [-0.84, 0.14, -0.52],
    hotspots: () => [
      { action: 'inspectCanopyView', dir: [0.93, -0.1, -0.35],
        label: 'the endless forest below', color: 0x9aff7a, shape: 'quad',
        corners: [[9.43,1.31], [9.32,-1.31], [-9.32,-1.31], [-9.43,1.31]],
        hidden: () => state.greenCanopyViewInspected },
      { action: 'inspectWallDisc', dir: [-0.62, -0.38, 0.69],
        label: 'a gilded tree, a pearl at its root', color: 0xffaa44, shape: 'circle' },
      { action: 'alignDiskTree', dir: [-0.74, -0.65, -0.18],
        label: 'a tree carved into the wood', color: 0x9aff7a, shape: 'circle',
        hidden: () => state.greenCanopyAligned },
      { action: 'alignDiskWave', dir: [-0.71, -0.66, 0.25],
        label: 'a wave carved into the wood', color: 0xa078ff, shape: 'circle',
        hidden: () => state.greenCanopyAligned },
      { action: 'alignDiskSpiral', dir: [-0.62, -0.78, 0.02],
        label: 'a spiral carved into the wood', color: 0xffd27a, shape: 'circle',
        hidden: () => state.greenCanopyAligned },
      { action: 'inspectAlignedDisk', dir: [-0.74, -0.65, -0.18],
        label: 'the disk — aligned', color: 0x7affd2, shape: 'circle',
        hidden: () => !state.greenCanopyAligned },
      { to: 'greenRootHollow', dir: [0.66, -0.57, 0.5],
        label: 'back down the hollow trunk', sfx: 'stone-footsteps', fadeMs: 3500 },
    ],
  },

  // ---- Cottage multi-room nodes ---------------------------------------
  cottageUpperHall: {
    name: 'The Upper Hall',
    pano: () => loadPano('panos/cottage-upper-hall.jpg'),
    ambient: 'audio/sfx/wind-outside-room.mp3',
    ambientMix: 1.0,
    startDir: [-0.83, -0.32, -0.46],
    hotspots: () => [
      { action: 'inspectNamePlaques', dir: [-0.83, -0.31, -0.46], shape: 'quad',
        corners: [[2.71,2.83], [2.44,-2.79], [-2.42,-2.87], [-2.72,2.83]],
        label: 'two name plaques on the wall', color: 0xffaa44,
        hidden: () => state.cottageNamePlaquesInspected },
      { action: 'inspectHallCoats', dir: [0.44, -0.03, 0.9],
        label: 'two coats on the rack', color: 0xa078ff,
        hidden: () => state.cottageHallCoatsInspected },
      // Star chart stand — Keepers' sky obsession, foreshadows the tower.
      { action: 'inspectHallStarCharts', dir: [-0.06, -0.57, 0.82], shape: 'quad',
        corners: [[2.52,4.67], [1.88,-4.69], [-1.83,-4.66], [-2.57,4.69]],
        label: 'an open star chart on a stand', color: 0xffd27a,
        hidden: () => state.cottageHallStarChartsInspected },
      // Antikythera-style brass mechanism — ancient astronomical computer.
      { action: 'inspectHallAntikythera', dir: [0.52, -0.79, -0.32], shape: 'quad',
        corners: [[1.54,3.35], [0.92,-3.36], [-1.02,-3.33], [-1.43,3.34]],
        label: 'a brass mechanism of gears', color: 0xffd27a,
        hidden: () => state.cottageHallAntikytheraInspected },
      { to: 'cottageLoft', dir: [-0.69, -0.37, 0.61],
        label: 'the left door', sfx: 'door-open', fadeMs: 3600 },
      { to: 'cottageTower', dir: [0.13, -0.37, -0.92],
        label: 'the right door', sfx: 'door-open', fadeMs: 3600 },
      { to: 'keepersCottage', dir: [0.91, -0.39, 0.11],
        label: 'back down the long hall', sfx: 'stone-footsteps', fadeMs: 3500 },
    ],
  },
  cottageLoft: {
    name: 'The Loft',
    pano: () => loadPano('panos/cottage-loft.jpg'),
    ambient: 'audio/sfx/wind-outside-room.mp3',
    ambientMix: 0.8,
    onEnter: () => { state.cottageLoftSeen = true; },
    startDir: [0.27, 0.04, 0.96],
    hotspots: () => [
      // Puzzle origin — folded note gives the orrery clue. Hides once read.
      { action: 'readLoftNote', dir: [0.36, -0.42, 0.84], shape: 'quad',
        corners: [[1.5,0.99], [2.57,-0.64], [-1.55,-0.97], [-2.52,0.62]],
        label: 'a folded note on the desk', color: 0xffaa44,
        hidden: () => state.cottageLoftNoteRead },
      { action: 'inspectLoftMirror', dir: [-0.99, 0.16, 0.03],
        label: 'letters tucked in the mirror frame', color: 0xffaa44,
        hidden: () => state.cottageLoftMirrorInspected },
      { action: 'inspectLoftQuilt', dir: [-0.89, -0.44, 0.12], shape: 'quad',
        corners: [[7.79,2.05], [5.59,-4.35], [-8.7,-1.38], [-4.68,3.68]],
        label: 'the spiral quilt on the bed', color: 0xffd27a,
        hidden: () => state.cottageLoftQuiltInspected },
      { action: 'inspectLoftWindow', dir: [0.27, 0.14, 0.95],
        label: 'the window', color: 0xc0d0ff, shape: 'circle',
        hidden: () => state.cottageLoftWindowInspected },
      { to: 'cottageUpperHall', dir: [0.01, -0.06, -1],
        label: 'back to the upper hall', sfx: 'door-open', fadeMs: 3600 },
    ],
  },
  cottageTower: {
    name: 'The Tower',
    // Pano swaps when the orrery is set — the room responds to the puzzle
    // (subtle warm glow on the pale-moon symbol + central illumination).
    pano: () => loadPano(state.cottageTowerOrrerySet
      ? 'panos/cottage-tower-activated.jpg'
      : 'panos/cottage-tower.jpg'),
    ambient: 'audio/sfx/wind-outside-room.mp3',
    ambientMix: 2.0,
    onEnter: () => { state.cottageTowerSeen = true; },
    startDir: [-0.69, -0.52, -0.5],
    hotspots: () => [
      { action: 'inspectStarCharts', dir: [-0.73, -0.46, -0.51], shape: 'quad',
        corners: [[6.7,1.03], [4.98,-2.16], [-6.95,-1.72], [-4.73,2.84]],
        label: 'the star charts', color: 0xffaa44 },
      { action: 'inspectTowerLogbook', dir: [0.33, -0.05, -0.94], shape: 'quad',
        corners: [[2.63,0.85], [3.56,-1.07], [-2.82,-0.9], [-3.37,1.12]],
        label: 'an open logbook', color: 0xffaa44 },
      // Three orrery arm positions — puzzle target. Second arm (pale moon) is correct.
      // Dirs need H-key capture on orrery face. Hidden once set.
      { action: 'setOrreryArm1', dir: [0.61, 0.03, 0.79],
        label: 'the orrery — first arm', color: 0xffd27a, shape: 'circle',
        hidden: () => state.cottageTowerOrrerySet },
      { action: 'setOrreryArm2', dir: [0.27, 0.03, 0.968],
        label: 'the orrery — second arm', color: 0xffd27a, shape: 'circle',
        hidden: () => state.cottageTowerOrrerySet },
      { action: 'setOrreryArm3', dir: [0.39, 0.53, 0.75],
        label: 'the orrery — third arm', color: 0xffd27a, shape: 'circle',
        hidden: () => state.cottageTowerOrrerySet },
      // Always-on whole-orrery inspect — copy + SFX adapt to state.
      { action: 'inspectOrrery', dir: [0.44, 0.24, 0.86],
        label: 'the orrery', color: 0xffd27a, shape: 'circle' },
      // Age terminal — only unlocked once orrery is correctly set.
      { action: 'useTelescope', dir: [-0.54, 0.43, -0.73],
        label: 'the telescope', color: 0x7affd2, shape: 'circle',
        hidden: () => !state.cottageTowerOrrerySet || state.cottageReturned },
      { to: 'cottageUpperHall', dir: [0.88, -0.01, -0.48],
        label: 'back to the upper hall', sfx: 'door-open', fadeMs: 3600 },
    ],
  },
};

// ---- Renderer / scene -----------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
panoCache.forEach((tex) => { tex.anisotropy = maxAnisotropy; });

// Apply persisted brightness to the canvas via CSS variable.
const initialBrightness = parseFloat(localStorage.getItem('mystBrightness') ?? '1');
document.documentElement.style.setProperty('--brightness', initialBrightness);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1100);
camera.position.set(0, 0, 0.01);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
// Persisted look prefs. Base rotateSpeed is negative so the world drags
// "with" the cursor; sensitivity scales magnitude, invert flips sign.
const BASE_ROTATE_SPEED = -0.3;
const lookPrefs = {
  sensitivity: parseFloat(localStorage.getItem('mystSensitivity') ?? '1'),
  invert:      localStorage.getItem('mystInvertDrag') === '1',
};
function applyRotateSpeed() {
  controls.rotateSpeed = BASE_ROTATE_SPEED * lookPrefs.sensitivity *
                         (lookPrefs.invert ? -1 : 1);
}
applyRotateSpeed();
// Hide the worst of the equirectangular nadir/zenith distortion.
// 0 = straight up, PI = straight down. Allow ~40° from horizon up
// and ~40° below — tight enough to keep both poles out of view.
controls.minPolarAngle = Math.PI * 0.28;
controls.maxPolarAngle = Math.PI * 0.72;

// ---- Panorama sphere ------------------------------------------------
const sphereGeom = new THREE.SphereGeometry(500, 60, 40);
sphereGeom.scale(-1, 1, 1);
const sphereMat = new THREE.MeshBasicMaterial({ map: null });
const sphere = new THREE.Mesh(sphereGeom, sphereMat);
scene.add(sphere);

// Always re-evaluate the node's pano fn so state-driven swaps work.
// The underlying loadPano/makePano calls handle their own caching.
function getPano(key) {
  const p = WORLD[key].pano;
  return p ? p() : null;
}

// Update the current node's panorama + hotspots in place — no fade.
// Used when an action mutates state and the world should reflect that
// without making the player travel away and back.
function refreshCurrentNode() {
  if (!currentNode) return;
  const node = WORLD[currentNode];
  sphereMat.map = node.pano();
  sphereMat.needsUpdate = true;
  buildHotspots(node);
}

// ---- Hotspots -------------------------------------------------------
const hotspotGroup = new THREE.Group();
scene.add(hotspotGroup);

function buildHotspots(node) {
  hotspotGroup.clear();
  const list = typeof node.hotspots === 'function' ? node.hotspots() : node.hotspots;
  for (const hs of list) {
    const isHidden = typeof hs.hidden === 'function' ? hs.hidden() : !!hs.hidden;
    if (isHidden) continue;
    const dir = new THREE.Vector3(...hs.dir).normalize().multiplyScalar(20);
    // Frame thickness bumped 0.08→0.12 / 0.1→0.14 so borders read clearly
    // at typical viewing distance. Visible footprint also defines the
    // hit-pad size below.
    let geom, hitW = 0, hitH = 0;
    if (hs.shape === 'quad') {
      geom = makeQuadFrame(hs.corners, 0.12);
      const xs = hs.corners.map((c) => c[0]), ys = hs.corners.map((c) => c[1]);
      hitW = Math.max(...xs) - Math.min(...xs) + 0.2;
      hitH = Math.max(...ys) - Math.min(...ys) + 0.2;
    }
    else if (hs.shape === 'book')      { geom = makeBookFrame(0.5, 1.8, 0.12); hitW = 0.7;  hitH = 2.0; }
    else if (hs.shape === 'open-book') {
      // Open-book frames can override w/h per-hotspot to fit books of
      // different shapes (the lectern's wide volume vs. the cottage's
      // squarer journals).
      const pw = hs.w ?? 1.8;
      const ph = hs.h ?? 0.5;
      geom = makeBookFrame(pw, ph, 0.12);
      hitW = pw + 0.2; hitH = ph + 0.2;
    }
    else if (hs.shape === 'panel')     {
      // Panel frames can override w/h per-hotspot for irregular carvings.
      const pw = hs.w ?? 0.95;
      const ph = hs.h ?? 1.9;
      geom = makeBookFrame(pw, ph, 0.14);
      hitW = pw + 0.2; hitH = ph + 0.2;
    }
    else if (hs.shape === 'button')    { geom = new THREE.CircleGeometry(0.5, 32); hitW = hitH = 1.2; }
    else if (hs.shape === 'circle')    { const r = hs.r ?? 0.85; geom = new THREE.RingGeometry(r - 0.15, r, 32); hitW = hitH = r * 2.2; }
    // Passage ring — same geometry as the default travel ring, for action-style
    // hotspots that semantically represent an active passage (e.g. an Age entry
    // gated behind state, where clicking shows a transition overlay before travel).
    else if (hs.shape === 'passage')   { geom = new THREE.RingGeometry(1.2, 1.6, 32); hitW = hitH = 3.4; }
    else if (hs.action)                { geom = makeBookFrame(1.4, 1.4, 0.12); hitW = hitH = 1.6; }
    else                                { geom = new THREE.RingGeometry(1.2, 1.6, 32); hitW = hitH = 3.4; }
    const userData = {
      target: hs.to,         // travel target (may be undefined)
      action: hs.action,     // action key (may be undefined)
      label: typeof hs.label === 'function' ? hs.label() : hs.label,
      sfx: hs.sfx,           // optional one-shot SFX on click
      sfxVolume: hs.sfxVolume, // optional volume multiplier for sfx (default 1.0)
      sfxDelay: hs.sfxDelay, // optional ms delay before SFX fires
      fadeMs: hs.fadeMs,     // optional fade-out duration override
    };
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshBasicMaterial({
        color: hs.color ?? 0xffd27a, transparent: true, opacity: 0.30,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    mesh.position.copy(dir);
    mesh.lookAt(0, 0, 0);
    // Optional roll: tilt the frame in its own plane to match perspective
    // (e.g. panels on a curved/angled wall). Radians; positive = CCW.
    if (hs.roll) mesh.rotateZ(hs.roll);
    Object.assign(mesh.userData, userData);
    hotspotGroup.add(mesh);

    // Hit pad — slightly larger transparent shape behind the visible
    // mesh. Lets the player click anywhere within the symbol's footprint
    // (including the hole of rings/frames). Rectangular shapes get a
    // plane; round shapes get a disc so the affordance matches.
    if (hitW > 0 && hitH > 0) {
      const isRect = hs.shape === 'quad' || hs.shape === 'book' || hs.shape === 'open-book' || hs.shape === 'panel' || (!hs.shape && !!hs.action);
      const hitGeom = isRect
        ? new THREE.PlaneGeometry(hitW, hitH)
        : new THREE.CircleGeometry(Math.max(hitW, hitH) / 2, 48);
      const hitPad = new THREE.Mesh(
        hitGeom,
        new THREE.MeshBasicMaterial({
          // Neutral tint in normal play so bright hotspot colors don't
          // bleed into the hit pad. Dev mode uses the hotspot's color
          // for an obvious placement audit.
          color: devMode ? (hs.color ?? 0xffd27a) : 0xffffff,
          transparent: true,
          opacity: devMode ? 0.14 : 0.025,
          depthWrite: false, side: THREE.DoubleSide,
        })
      );
      hitPad.position.copy(dir);
      hitPad.lookAt(0, 0, 0);
      if (hs.roll) hitPad.rotateZ(hs.roll);
      Object.assign(hitPad.userData, userData);
      hitPad.userData.isHitPad = true;
      hotspotGroup.add(hitPad);
    }
  }
}

// ---- Click → travel · hover → label ---------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const fadeEl = document.getElementById('fade');
const labelEl = document.getElementById('label');
const nodeNameEl = document.getElementById('node-name');

addEventListener('click', (e) => {
  // Don't capture clicks on the overlay — let it close itself.
  if (e.target.closest('#overlay')) return;
  // Same for the age-transition epilogue — without this, dismissing the
  // epilogue bubbles to here and the raycast can re-hit the Age-terminal
  // hotspot underneath, re-firing triggerAgeReturn.
  if (e.target.closest('#age-transition')) return;
  // Endscreen too — once the dedication/credits fade is rolling, the
  // raycast must not hit the bizarre-tree hotspots underneath. (Bug:
  // a player who knew where the second book was could trigger BOTH
  // endings by clicking through the fade.)
  if (e.target.closest('#endscreen')) return;
  if (titleScreenActive) return;
  if (rectCaptureMode) { captureRectCorner(e.clientX, e.clientY); return; }
  if (pointPickMode) { capturePointPickHere(e.clientX, e.clientY); return; }
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(hotspotGroup.children)[0];
  if (!hit) return;
  const { target, action, sfx, sfxVolume, sfxDelay, fadeMs } = hit.object.userData;
  if (sfx) {
    if (sfxDelay) setTimeout(() => playSfx(sfx, sfxVolume ?? 1.0), sfxDelay);
    else playSfx(sfx, sfxVolume ?? 1.0);
  }
  if (action && ACTIONS[action]) ACTIONS[action]();
  else if (target) travelTo(target, { fadeMs });
});

addEventListener('pointermove', (e) => {
  if (titleScreenActive) return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(hotspotGroup.children)[0];
  if (hit) {
    labelEl.textContent = hit.object.userData.label;
    labelEl.classList.add('active');
    document.body.style.cursor = 'pointer';
  } else {
    labelEl.classList.remove('active');
    document.body.style.cursor = 'crosshair';
  }
});

// ---- Clue overlay ---------------------------------------------------
const overlayEl = document.getElementById('overlay');
const overlayPanel = document.getElementById('overlay-panel');
const endscreenEl = document.getElementById('endscreen');
let overlayCloseCallback = null;

// Set the per-Age epilogue line and fire the endscreen + audio fade.
function triggerEndscreen(epilogueHtml) {
  const ep = endscreenEl.querySelector('.epilogue');
  if (ep) ep.innerHTML = epilogueHtml;
  endscreenEl.classList.add('active');
  fadeAudio(0, 4000);
  if (nodeAmbientAudio) fadeAudioElement(nodeAmbientAudio, 0, 4000);
}

const ageTransitionEl = document.getElementById('age-transition');
function triggerAgeReturn(epilogueHtml) {
  ageTransitionEl.querySelector('.age-epilogue').innerHTML = epilogueHtml;
  ageTransitionEl.classList.add('active');
  fadeAudio(0, 3000);
  if (nodeAmbientAudio) fadeAudioElement(nodeAmbientAudio, 0, 3000);
  ageTransitionEl.addEventListener('click', () => {
    ageTransitionEl.classList.remove('active');
    travelTo('ascension', { fadeMs: 2000, startDir: [0.38, -0.33, -0.86] });
  }, { once: true });
}

function showOverlay(html, onClose) {
  overlayPanel.innerHTML = html;
  overlayEl.classList.add('active');
  overlayCloseCallback = onClose || null;
}
overlayEl.addEventListener('click', () => {
  playSfx('menu-click');
  overlayEl.classList.remove('active');
  const hadCallback = !!overlayCloseCallback;
  if (overlayCloseCallback) {
    const cb = overlayCloseCallback;
    overlayCloseCallback = null;
    cb();
  }
  // Rebuild hotspots for pure inspection closes so state changes are reflected.
  // Skip when there's an onClose callback — those trigger navigation.
  if (!hadCallback && currentNode) buildHotspots(WORLD[currentNode]);
});

let currentNode = null;
async function travelTo(key, opts = {}) {
  const node = WORLD[key];
  if (!node) return;
  if (bizarreRealmMusicActive && key !== 'bizarreRealm' && key !== 'bizarreRealmTree') {
    bizarreRealmMusicActive = false;
    ambientAudio.loop = false;
    playSpecificTrack(currentTrackIndex >= 0 ? currentTrackIndex : 0);
  }
  const fadeMs = opts.fadeMs ?? 600;
  fadeEl.classList.add('active');
  await new Promise(r => setTimeout(r, fadeMs));
  sphereMat.map = getPano(key);
  sphereMat.needsUpdate = true;
  buildHotspots(node);
  nodeNameEl.textContent = node.name;
  currentNode = key;
  if (devMode) refreshDevHud();
  // Crossfade the per-node ambient layer (if any).
  if (audioStarted) {
    const { path, mix } = resolveAmbient(node);
    setNodeAmbient(path, mix);
  }
  // Optional: orient the camera to a node-defined opening framing.
  // For a panorama viewer the camera lives at origin and orbits around
  // the sphere center. To look in `dir`, we keep the target at origin
  // and position the camera a tiny offset in the OPPOSITE direction —
  // which rotates the view without changing the orbit radius.
  const startDir = opts.startDir ?? node.startDir;
  if (startDir) {
    const dir = new THREE.Vector3(...startDir).normalize();
    controls.target.set(0, 0, 0);
    camera.position.copy(dir).multiplyScalar(-0.01);
    controls.update();
  }
  fadeEl.classList.remove('active');
  // Restore gameplay music if it was faded out for an age transition.
  if (gameplayMusicStarted && !audioPrefs.musicMuted && ambientAudio.volume < audioPrefs.music) {
    fadeAudioElement(ambientAudio, audioPrefs.music, 2000);
  }
  // Per-node arrival hook — fires after fade clears so any one-shot sfx
  // lands while the player is fully in the room.
  if (typeof node.onEnter === 'function') node.onEnter();
}

// ---- Dev mode: aim at a spot, press H to capture hotspot direction --
const devHud = document.getElementById('devhud');
let devMode = false;
const previewRingGroup = new THREE.Group();
scene.add(previewRingGroup);

// ---- Dev grid: spherical lat/lon lines, toggled with G in dev mode ----
const devGrid = (() => {
  const R = 20, SEG = 64;
  const pos = [];
  const push = (ax, ay, az, bx, by, bz) => pos.push(ax, ay, az, bx, by, bz);
  // Latitude lines every 1.25°, skip poles
  for (let lat = -88.75; lat <= 88.75; lat += 1.25) {
    const phi = (lat * Math.PI) / 180;
    const y = R * Math.sin(phi), r = R * Math.cos(phi);
    for (let i = 0; i < SEG; i++) {
      const t1 = (i / SEG) * Math.PI * 2, t2 = ((i + 1) / SEG) * Math.PI * 2;
      push(r * Math.cos(t1), y, r * Math.sin(t1), r * Math.cos(t2), y, r * Math.sin(t2));
    }
  }
  // Longitude lines every 1.25°
  for (let lon = 0; lon < 360; lon += 1.25) {
    const theta = (lon * Math.PI) / 180;
    for (let i = 0; i < SEG; i++) {
      const p1 = ((-90 + (i / SEG) * 180) * Math.PI) / 180;
      const p2 = ((-90 + ((i + 1) / SEG) * 180) * Math.PI) / 180;
      push(
        R * Math.cos(p1) * Math.cos(theta), R * Math.sin(p1), R * Math.cos(p1) * Math.sin(theta),
        R * Math.cos(p2) * Math.cos(theta), R * Math.sin(p2), R * Math.cos(p2) * Math.sin(theta),
      );
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const grid = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({
    color: 0x4488ff, transparent: true, opacity: 0.80, depthWrite: false,
  }));
  grid.visible = false;
  scene.add(grid);
  return grid;
})();

let devGridVisible = false;
function toggleDevGrid() {
  devGridVisible = !devGridVisible;
  devGrid.visible = devGridVisible;
  refreshDevHud();
}

// Save the player-facing clamps so we can restore them when exiting dev mode.
const PLAYER_POLAR_MIN = controls.minPolarAngle;
const PLAYER_POLAR_MAX = controls.maxPolarAngle;

const devHudInfo = document.getElementById('devhud-info');
const devTravelPanel = document.getElementById('dev-travel-panel');
const devTravelGrid = document.getElementById('dev-travel-grid');
(function buildDevTravelGrid() {
  Object.keys(WORLD).forEach((key) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = key;
    btn.addEventListener('click', () => {
      devTravelPanel.classList.remove('active');
      travelTo(key, { fadeMs: 800 });
    });
    devTravelGrid.appendChild(btn);
  });
})();

function refreshDevHud() {
  const gridLabel = devGridVisible ? '<b>G</b> grid ✓' : '<b>G</b> grid';
  devHudInfo.innerHTML = `
    <div class="hint">DEV MODE — <b>H</b> point &nbsp;·&nbsp; <b>R</b> rect &nbsp;·&nbsp; <b>P</b> pick &nbsp;·&nbsp; ${gridLabel}</div>
    <div>node: <b>${currentNode}</b> &nbsp;·&nbsp; <b>D</b> exit &nbsp;·&nbsp; <b>X</b> clear &nbsp;·&nbsp; <b>T</b> travel</div>
  `;
}

function setDevMode(on) {
  devMode = on;
  devHud.classList.toggle('active', on);
  document.body.classList.toggle('dev-mode', on);
  if (on) {
    // Unlock full pitch range so the designer can aim straight up/down.
    controls.minPolarAngle = Math.PI * 0.01;
    controls.maxPolarAngle = Math.PI * 0.99;
    refreshDevHud();
  } else {
    controls.minPolarAngle = PLAYER_POLAR_MIN;
    controls.maxPolarAngle = PLAYER_POLAR_MAX;
    previewRingGroup.clear();
    devTravelPanel.classList.remove('active');
    devGridVisible = false;
    devGrid.visible = false;
  }
  // Rebuild hotspots so dev hit-pad visualizations appear/disappear.
  if (currentNode && WORLD[currentNode]) buildHotspots(WORLD[currentNode]);
}

function captureHotspotHere() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const r = (n) => Math.round(n * 100) / 100;
  const dirArr = [r(dir.x), r(dir.y), r(dir.z)];

  // Drop a preview ring at this direction
  const pos = dir.clone().multiplyScalar(20);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 1.6, 32),
    new THREE.MeshBasicMaterial({
      color: 0x7affd2, transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  ring.position.copy(pos);
  ring.lookAt(0, 0, 0);
  previewRingGroup.add(ring);

  const snippet = `{ to: '???', dir: [${dirArr.join(', ')}], label: '???' }`;
  devHudInfo.innerHTML = `
    <div class="hint">Captured hotspot from <b>${currentNode}</b> — paste into WORLD.${currentNode}.hotspots:</div>
    <div class="snippet">${snippet}</div>
    <div class="hint" style="margin-top:6px">aim &amp; press <b>H</b> for another &nbsp;·&nbsp; <b>R</b> rect &nbsp;·&nbsp; <b>X</b> clear &nbsp;·&nbsp; <b>D</b> exit</div>
  `;
  console.log('[hotspot]', snippet);
}

let rectCaptureMode = false;
let rectCorners = [];
let pointPickMode = false;

function setPointPickMode(on) {
  pointPickMode = on;
  document.body.classList.toggle('rect-capture', on);
  if (on) {
    devHudInfo.innerHTML = `
      <div class="hint">POINT PICK — click anywhere to capture &nbsp;·&nbsp; <b>P</b> exit &nbsp;·&nbsp; <b>X</b> clear</div>
      <div>node: <b>${currentNode}</b></div>
    `;
  } else {
    refreshDevHud();
  }
}

function capturePointPickHere(clientX, clientY) {
  const px = (clientX / innerWidth) * 2 - 1;
  const py = -(clientY / innerHeight) * 2 + 1;
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(px, py), camera);
  const hit = rc.intersectObject(sphere)[0];
  if (!hit) return;

  const r = (n) => Math.round(n * 100) / 100;
  const dir = hit.point.clone().normalize();
  const dirArr = [r(dir.x), r(dir.y), r(dir.z)];

  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.25, 16),
    new THREE.MeshBasicMaterial({ color: 0x7affd2, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  dot.position.copy(dir.clone().multiplyScalar(20));
  dot.lookAt(0, 0, 0);
  previewRingGroup.add(dot);

  const snippet = `dir: [${dirArr.join(', ')}]`;
  devHudInfo.innerHTML = `
    <div class="hint">POINT PICK — click anywhere to capture &nbsp;·&nbsp; <b>P</b> exit &nbsp;·&nbsp; <b>X</b> clear</div>
    <div>node: <b>${currentNode}</b></div>
    <div class="snippet">${snippet}</div>
  `;
  console.log('[point-pick]', snippet);
}

const RECT_CORNER_LABELS = ['top-right', 'bottom-right', 'bottom-left', 'top-left'];

function setRectCaptureMode(on) {
  rectCaptureMode = on;
  rectCorners = [];
  document.body.classList.toggle('rect-capture', on);
  if (on) {
    devHudInfo.innerHTML = `
      <div class="hint">RECT CAPTURE — click 4 corners in order &nbsp;·&nbsp; <b>R</b> cancel</div>
      <div>node: <b>${currentNode}</b> &nbsp;·&nbsp; corner <b>1</b> of 4 &nbsp;(${RECT_CORNER_LABELS[0]})</div>
    `;
  } else {
    refreshDevHud();
  }
}

function snapDirToGrid(unitDir, stepDeg = 5) {
  const stepRad = (stepDeg * Math.PI) / 180;
  const lat = Math.asin(Math.max(-1, Math.min(1, unitDir.y)));
  const lon = Math.atan2(unitDir.z, unitDir.x);
  const sLat = Math.round(lat / stepRad) * stepRad;
  const sLon = Math.round(lon / stepRad) * stepRad;
  const cosLat = Math.cos(sLat);
  return new THREE.Vector3(cosLat * Math.cos(sLon), Math.sin(sLat), cosLat * Math.sin(sLon));
}

function captureRectCorner(clientX, clientY) {
  const px = (clientX / innerWidth) * 2 - 1;
  const py = -(clientY / innerHeight) * 2 + 1;
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(px, py), camera);
  const hit = rc.intersectObject(sphere)[0];
  if (!hit) return;

  const raw = hit.point.clone().normalize();
  const dir = devGridVisible ? snapDirToGrid(raw, 1.25) : raw;
  rectCorners.push(dir);

  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.25, 16),
    new THREE.MeshBasicMaterial({ color: 0xff9944, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  dot.position.copy(dir.clone().multiplyScalar(20));
  dot.lookAt(0, 0, 0);
  previewRingGroup.add(dot);

  if (rectCorners.length < 4) {
    const next = rectCorners.length;
    devHudInfo.innerHTML = `
      <div class="hint">RECT CAPTURE — click 4 corners in order &nbsp;·&nbsp; <b>R</b> cancel</div>
      <div>node: <b>${currentNode}</b> &nbsp;·&nbsp; corner <b>${next + 1}</b> of 4 &nbsp;(${RECT_CORNER_LABELS[next]})</div>
    `;
    return;
  }

  // 4 corners collected: TR, BR, BL, TL
  const r = (n) => Math.round(n * 100) / 100;
  const DIST = 20;

  // Center = normalize(average of all 4)
  const center = rectCorners.reduce((acc, c) => acc.add(c), new THREE.Vector3()).normalize();
  const forward = center.clone().negate();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, forward).normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  const pc = center.clone().multiplyScalar(DIST);

  // Project all 4 corners, take bounding box
  const projected = rectCorners.map((c) => {
    const d = c.clone().multiplyScalar(DIST).sub(pc);
    return { x: d.dot(right), y: d.dot(up) };
  });
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const corners = projected.map((p) => [r(p.x), r(p.y)]);
  const dirArr = [r(center.x), r(center.y), r(center.z)];

  const preview = new THREE.Mesh(
    makeQuadFrame(corners, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xff9944, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
  );
  preview.position.copy(pc);
  preview.lookAt(0, 0, 0);
  previewRingGroup.add(preview);

  const snippet = `{ action: '???', dir: [${dirArr.join(', ')}], shape: 'quad', corners: [${corners.map((c) => `[${c}]`).join(', ')}], label: '???' }`;
  devHudInfo.innerHTML = `
    <div class="hint">Rect captured from <b>${currentNode}</b> — paste into WORLD.${currentNode}.hotspots:</div>
    <div class="snippet">${snippet}</div>
    <div class="hint" style="margin-top:6px"><b>R</b> new rect &nbsp;·&nbsp; <b>X</b> clear &nbsp;·&nbsp; <b>H</b> point &nbsp;·&nbsp; <b>D</b> exit</div>
  `;
  console.log('[rect-hotspot]', snippet);
  rectCaptureMode = false;
  rectCorners = [];
  document.body.classList.remove('rect-capture');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
      .catch(err => console.warn('[fullscreen]', err));
  } else {
    document.exitFullscreen();
  }
}
addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') setDevMode(!devMode);
  else if (devMode && (e.key === 'h' || e.key === 'H')) captureHotspotHere();
  else if (devMode && (e.key === 'x' || e.key === 'X')) previewRingGroup.clear();
  else if (devMode && (e.key === 't' || e.key === 'T')) devTravelPanel.classList.toggle('active');
  else if (devMode && (e.key === 'r' || e.key === 'R')) setRectCaptureMode(!rectCaptureMode);
  else if (devMode && (e.key === 'p' || e.key === 'P')) setPointPickMode(!pointPickMode);
  else if (devMode && (e.key === 'g' || e.key === 'G')) toggleDevGrid();
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});

// ---- Audio preferences ----------------------------------------------
// Persisted to localStorage so the player's volumes survive refresh.
const audioPrefs = {
  music:      parseFloat(localStorage.getItem('mystVolMusic') ?? '0.45'),
  sfx:        parseFloat(localStorage.getItem('mystVolSfx')   ?? '0.7'),
  musicMuted: localStorage.getItem('mystMuteMusic') === '1',
  sfxMuted:   localStorage.getItem('mystMuteSfx')   === '1',
};

// ---- Music: title track + gameplay playlist ------------------------
// Browsers block autoplay until a user gesture. The first click on the
// title card authorizes audio: title music plays through the captain's
// log, then crossfades into the gameplay playlist which advances in
// the listed order, wrapping at the end.
const ambientAudio = document.getElementById('ambient');
const titleMusicAudio = document.getElementById('title-music');
titleMusicAudio.src = assetUrl('audio/title.mp3');
ambientAudio.volume = 0;
titleMusicAudio.volume = 0;

const BIZARRE_REALM_TRACK = {
  url: 'audio/low_atmos-space-relaxation-atmosphere-514706.mp3',
  label: 'The Fourth Age',
};
let bizarreRealmMusicActive = false;

const GAMEPLAY_PLAYLIST = [
  { url: 'audio/atlasaudio-ambient-astronomy-511860.mp3',
    label: 'Astronomy' },
  { url: 'audio/juliush-relax-chill-out-music-for-landscapes-under-water-animals-forests-8105.mp3',
    label: 'Landscapes' },
  { url: 'audio/zulfugarkarimov-weightless-rest-528509.mp3',
    label: 'Weightless' },
  { url: 'audio/anton_vlasov-ambient-chill-drone-15790.mp3',
    label: 'Drone' },
  { url: 'audio/juraganvisi-nocturnal-piano-reflections-with-dreamlike-pads-and-lo-fi-v2-416000.mp3',
    label: 'Nocturnal Piano' },
];
let currentTrackIndex = -1;

function pickNextGameplayTrack() {
  const len = GAMEPLAY_PLAYLIST.length;
  const next = currentTrackIndex < 0 ? 0 : (currentTrackIndex + 1) % len;
  currentTrackIndex = next;
  return GAMEPLAY_PLAYLIST[next];
}

// fadeAudio kept as alias for ambientAudio fades (used by end screen).
function fadeAudio(target, duration = 2500) {
  fadeAudioElement(ambientAudio, target, duration);
}

let audioStarted = false;
function startAmbient() {
  if (audioStarted) return;
  // Make sure the audio element is unmuted regardless of mute prefs —
  // they only control the long-term mute toggle.
  titleMusicAudio.muted = audioPrefs.musicMuted;
  titleMusicAudio.play().then(() => {
    audioStarted = true;
    fadeAudioElement(titleMusicAudio, audioPrefs.music, 800);
    // NOTE: node ambient (dock water) is intentionally NOT started here.
    // It fires when the title fades out so the title screen stays clean.
  }).catch(err => console.warn('[title-music] play blocked', err));
}
// Capture phase fires before any child's stopPropagation — guarantees the
// first click anywhere on the page (including audio/help buttons) starts
// the title music.
addEventListener('click', startAmbient, { once: true, capture: true });

function updateTrackLabel() {
  const el = document.getElementById('track-name');
  if (!el) return;
  if (bizarreRealmMusicActive) { el.innerHTML = BIZARRE_REALM_TRACK.label; return; }
  el.innerHTML = currentTrackIndex >= 0
    ? GAMEPLAY_PLAYLIST[currentTrackIndex].label
    : '&mdash;';
}

let titleScreenActive = true;
let gameplayMusicStarted = false;
const DEFAULT_GAMEPLAY_TRACK = 'Landscapes';
function startGameplayMusic() {
  if (gameplayMusicStarted) return;
  gameplayMusicStarted = true;
  // Fade title music out, then start the gameplay playlist on its
  // chosen opener. From there, tracks advance in listed order.
  fadeAudioElement(titleMusicAudio, 0, 2000);
  setTimeout(() => titleMusicAudio.pause(), 2100);
  let idx = GAMEPLAY_PLAYLIST.findIndex(t => t.label === DEFAULT_GAMEPLAY_TRACK);
  if (idx < 0) idx = 0;
  currentTrackIndex = idx;
  const track = GAMEPLAY_PLAYLIST[currentTrackIndex];
  ambientAudio.src = assetUrl(track.url);
  ambientAudio.volume = 0;
  ambientAudio.play()
    .then(() => fadeAudioElement(ambientAudio, audioPrefs.music, 3000))
    .catch(err => console.warn('[ambient] play failed', err));
  updateTrackLabel();
}
// When a gameplay track ends, advance to the next one in order.
ambientAudio.addEventListener('ended', () => {
  if (bizarreRealmMusicActive) return;
  const track = pickNextGameplayTrack();
  ambientAudio.src = assetUrl(track.url);
  ambientAudio.play().catch(err => console.warn('[ambient] next', err));
  updateTrackLabel();
});

// Player controls for cycling tracks.
function playSpecificTrack(idx) {
  currentTrackIndex = idx;
  ambientAudio.src = assetUrl(GAMEPLAY_PLAYLIST[idx].url);
  ambientAudio.volume = audioPrefs.musicMuted ? 0 : audioPrefs.music;
  ambientAudio.play().catch(err => console.warn('[track]', err));
  updateTrackLabel();
}
function skipNext() {
  if (titleScreenActive || bizarreRealmMusicActive) return;
  if (currentTrackIndex < 0) {
    // Title dismissed but gameplay hasn't kicked in yet — start it.
    startGameplayMusic();
    return;
  }
  const len = GAMEPLAY_PLAYLIST.length;
  playSpecificTrack((currentTrackIndex + 1) % len);
}
function skipPrev() {
  if (titleScreenActive || bizarreRealmMusicActive) return;
  if (currentTrackIndex < 0) {
    startGameplayMusic();
    return;
  }
  const len = GAMEPLAY_PLAYLIST.length;
  playSpecificTrack((currentTrackIndex - 1 + len) % len);
}

// ---- Per-node ambient layer -----------------------------------------
// Each node can declare an `ambient` path that loops while the player
// is in that node. Crossfades when they travel away.
const NODE_AMBIENT_MIX = 0.6;
let nodeAmbientAudio = null;
let currentAmbientPath = null;
let currentAmbientMix = NODE_AMBIENT_MIX;

function fadeAudioElement(el, target, duration = 1500) {
  const start = el.volume;
  const startTime = performance.now();
  function step() {
    const t = Math.min((performance.now() - startTime) / duration, 1);
    el.volume = start + (target - start) * t;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function resolveAmbient(node) {
  const path = typeof node?.ambient === 'function' ? node.ambient() : node?.ambient;
  const mix = typeof node?.ambientMix === 'function' ? node.ambientMix() : node?.ambientMix;
  return { path, mix: mix ?? NODE_AMBIENT_MIX };
}

function setNodeAmbient(path, mix = NODE_AMBIENT_MIX) {
  if (path === currentAmbientPath) {
    currentAmbientMix = mix;
    return;
  }
  currentAmbientPath = path;
  currentAmbientMix = mix;
  if (nodeAmbientAudio) {
    const old = nodeAmbientAudio;
    nodeAmbientAudio = null;
    fadeAudioElement(old, 0, 1500);
    setTimeout(() => { old.pause(); old.src = ''; }, 1700);
  }
  if (!path) return;
  const audio = new Audio(assetUrl(path));
  audio.loop = true;
  audio.volume = 0;
  // Environmental ambience belongs to the SFX channel, not music.
  audio.muted = audioPrefs.sfxMuted;
  audio.play()
    .then(() => fadeAudioElement(audio, mix * audioPrefs.sfx, 1500))
    .catch(err => console.warn('[node-ambient] play blocked', err));
  nodeAmbientAudio = audio;
}

// ---- One-shot sound effects -----------------------------------------
// Drop files at audio/sfx/<name>.mp3 and call playSfx('<name>').
const sfxCache = new Map();

// Preload every SFX at boot — without this, the first play of each
// sound has a noticeable lag while the browser decodes the file.
const PRELOAD_SFX = [
  'page-turn', 'book-pages', 'book-open', 'book-pull-open-and-close', 'key-lock-insert',
  'door-open', 'heavy-door-open', 'metallic-thud',
  'passage-open', 'interact-tap', 'brass-click', 'mechanical-gadget',
  'climbing-stairs', 'sigil-warp', 'linking-warp',
  'mechanism-whir', 'wave-crash', 'lighthouse', 'mystical-chime',
  'shell-fade', 'beam-sound', 'knock-on-window', 'peaceful-ray', 'fx-light',
  'tree-rustle', 'sweep-away', 'footsteps-in-forest', 'wood-tap', 'written-letter', 'locked-door', 'exhale', 'floating-pad', 'button-forward', 'button-back', 'menu-click',
];
PRELOAD_SFX.forEach(name => {
  const sfx = new Audio(assetUrl(`audio/sfx/${name}.mp3`));
  sfx.preload = 'auto';
  sfxCache.set(name, sfx);
});
function playSfx(name, volume = 1.0) {
  if (audioPrefs.sfxMuted) return null;
  let sfx = sfxCache.get(name);
  if (!sfx) {
    sfx = new Audio(assetUrl(`audio/sfx/${name}.mp3`));
    sfxCache.set(name, sfx);
  }
  sfx.volume = Math.min(1, volume * audioPrefs.sfx);
  sfx.currentTime = 0;
  sfx.play().catch(err => console.warn('[sfx]', name, err));
  return sfx;
}

// ---- Volume menu UI -------------------------------------------------
const volMusic = document.getElementById('vol-music');
const volSfx = document.getElementById('vol-sfx');
const muteMusicBtn = document.getElementById('mute-music');
const muteSfxBtn = document.getElementById('mute-sfx');
const rowMusic = document.getElementById('row-music');
const rowSfx = document.getElementById('row-sfx');
const SPEAKER_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path d="M6 9 H9 L13 6 V18 L9 15 H6 Z" fill="currentColor"
    stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
  <path d="M15.5 10 Q17.5 12 15.5 14"
    stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <path d="M18.5 8 Q22 12 18.5 16"
    stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>
</svg>`;
const MUTED_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path d="M6 9 H9 L13 6 V18 L9 15 H6 Z" fill="currentColor"
    stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
  <line x1="16" y1="10" x2="21" y2="15"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
  <line x1="21" y1="10" x2="16" y2="15"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
</svg>`;

volMusic.value = audioPrefs.music;
volSfx.value = audioPrefs.sfx;

function applyMuteUI() {
  ambientAudio.muted = audioPrefs.musicMuted;
  titleMusicAudio.muted = audioPrefs.musicMuted;
  // Node ambient is treated as SFX, not music.
  if (nodeAmbientAudio) nodeAmbientAudio.muted = audioPrefs.sfxMuted;
  muteMusicBtn.innerHTML = audioPrefs.musicMuted ? MUTED_SVG : SPEAKER_SVG;
  muteSfxBtn.innerHTML   = audioPrefs.sfxMuted   ? MUTED_SVG : SPEAKER_SVG;
  muteMusicBtn.classList.toggle('muted', audioPrefs.musicMuted);
  muteSfxBtn.classList.toggle('muted', audioPrefs.sfxMuted);
  rowMusic.classList.toggle('muted', audioPrefs.musicMuted);
  rowSfx.classList.toggle('muted', audioPrefs.sfxMuted);
}
applyMuteUI();

// ---- Settings panel (tabbed: Audio / Settings / How to Play) -------
const menuBtn = document.getElementById('menu-btn');
const settingsPanel = document.getElementById('settings-panel');
const panelBackdrop = document.getElementById('panel-backdrop');
const DEFAULT_TAB = 'settings';

function switchTab(tab) {
  settingsPanel.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  settingsPanel.querySelectorAll('.tab-content').forEach((c) => {
    c.classList.toggle('active', c.dataset.tabContent === tab);
  });
}

function closeAllPanels({ silent = false } = {}) {
  // Note: do NOT close the captain's-log overlay here. It has its own
  // click-to-close handler, and document-level clicks that re-open the
  // overlay (e.g. clicking an interactive hotspot) also fire this handler
  // by bubbling. openSettings() explicitly dismisses the overlay when
  // needed so the two don't stack visually.
  const wasOpen = settingsPanel.classList.contains('active');
  settingsPanel.classList.remove('active');
  menuBtn.classList.remove('active');
  panelBackdrop.classList.remove('active');
  if (typeof disarmReset === 'function') disarmReset();
  // Play the back sound here so every caller (backdrop click, window
  // bubble click, settings-close button, menu-btn toggle, etc.) gets it
  // consistently — but only if a panel was actually open AND the caller
  // isn't going to play its own sound (e.g. show-changelog plays
  // menu-click and doesn't want a back-sound layered on top).
  if (wasOpen && !silent) playSfx('button-back');
}

function openSettings(tab) {
  // Close any open captain's log overlay so it doesn't lurk behind the panel.
  overlayEl.classList.remove('active');
  // Title screen always opens to How to Play; in-game always opens to Settings
  // (unless an explicit tab is passed, e.g. from the title's "How to play" button).
  if (document.body.classList.contains('title-active')) tab = 'howto';
  switchTab(tab || DEFAULT_TAB);
  settingsPanel.classList.add('active');
  menuBtn.classList.add('active');
  panelBackdrop.classList.add('active');
}

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (settingsPanel.classList.contains('active')) {
    closeAllPanels();  // plays button-back internally
  } else {
    playSfx('button-forward');
    openSettings();
  }
});
settingsPanel.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    playSfx('menu-click');
    switchTab(btn.dataset.tab);
  });
});
document.getElementById('settings-fullscreen').addEventListener('click', (e) => {
  e.stopPropagation();
  playSfx('menu-click');
  toggleFullscreen();
});

// Brightness slider — CSS filter on the canvas via --brightness var.
const brightnessSlider = document.getElementById('brightness-slider');
brightnessSlider.value = initialBrightness;
brightnessSlider.addEventListener('input', () => {
  const v = parseFloat(brightnessSlider.value);
  document.documentElement.style.setProperty('--brightness', v);
  localStorage.setItem('mystBrightness', v);
});

// Sensitivity slider — multiplies OrbitControls rotateSpeed.
const sensitivitySlider = document.getElementById('sensitivity-slider');
sensitivitySlider.value = lookPrefs.sensitivity;
sensitivitySlider.addEventListener('input', () => {
  lookPrefs.sensitivity = parseFloat(sensitivitySlider.value);
  localStorage.setItem('mystSensitivity', lookPrefs.sensitivity);
  applyRotateSpeed();
});

// Invert toggle — flips the sign on rotateSpeed.
const invertToggle = document.getElementById('invert-toggle');
function applyInvertUI() {
  invertToggle.textContent = lookPrefs.invert ? 'On' : 'Off';
  invertToggle.classList.toggle('on', lookPrefs.invert);
}
applyInvertUI();
invertToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  playSfx('menu-click');
  lookPrefs.invert = !lookPrefs.invert;
  localStorage.setItem('mystInvertDrag', lookPrefs.invert ? '1' : '0');
  applyInvertUI();
  applyRotateSpeed();
});

// Reset progress — two-step inline confirm (click arms; second click clears).
const resetBtn = document.getElementById('reset-progress');
let resetArmed = false;
let resetTimer = null;
function disarmReset() {
  resetArmed = false;
  resetBtn.textContent = 'Clear';
  resetBtn.classList.remove('danger');
  if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
}
const RESET_FAREWELL_HTML = `
  <h2>The Wind Shifts</h2>
  <p><em>And so the Age closes its page</em></p>
  <p>Every shore you have walked, every door whose voice you came
  to know &mdash; gone, as if you had not made landfall at all.</p>
  <p><em>The compass spins anew. The Captain waits at a different
  dock.</em></p>
  <p style="text-align: right; margin-top: 24px;">&mdash; Captain Renn</p>
  <div class="close">click to set sail</div>
`;
resetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  playSfx('menu-click');
  if (resetArmed) {
    closeAllPanels({ silent: true });
    showOverlay(RESET_FAREWELL_HTML, () => {
      // Wait one frame so the browser registers the overlay's display:none
      // before we trigger the fade's opacity transition — otherwise the
      // two style changes batch together and the transition is skipped.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fadeEl.classList.add('active'));
      });
      // 600ms fade + ~600ms hold at black before the reload cuts in.
      setTimeout(() => {
        localStorage.clear();
        location.reload();
      }, 1400);
    });
    return;
  }
  resetArmed = true;
  resetBtn.textContent = 'Confirm?';
  resetBtn.classList.add('danger');
  resetTimer = setTimeout(disarmReset, 4000);
});

// ---- Changelog (Settings button + title-screen version tag) ---------
// Source of truth lives in CHANGELOG.md. Top-level `# Heading` becomes h2;
// each `## Version — date` becomes a release h3. A standalone `**Label**`
// line becomes the `change-label` paragraph that styles the New/Enhanced/
// Fixed groupings; `- item` lines collapse into a `<ul class="changelog">`;
// `---` becomes the divider rule between releases.
function changelogMdToHtml(md) {
  const out = [];
  let inList = false;
  const closeList = () => {
    if (inList) { out.push('</ul>'); inList = false; }
  };
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    if (line === '---') { closeList(); out.push('<hr class="rule">'); continue; }
    let m;
    if ((m = line.match(/^#\s+(.+)$/))) {
      closeList(); out.push(`<h2>${m[1]}</h2>`); continue;
    }
    if ((m = line.match(/^##\s+(.+)$/))) {
      closeList(); out.push(`<h3>${m[1]}</h3>`); continue;
    }
    if ((m = line.match(/^-\s+(.+)$/))) {
      if (!inList) { out.push('<ul class="changelog">'); inList = true; }
      out.push(`<li>${m[1]}</li>`);
      continue;
    }
    if ((m = line.match(/^\*\*([^*]+)\*\*$/))) {
      closeList(); out.push(`<p class="change-label">${m[1]}</p>`); continue;
    }
    closeList();
    out.push(`<p>${line}</p>`);
  }
  closeList();
  return out.join('\n');
}

let changelogHtmlPromise = null;
function getChangelogHtml() {
  if (!changelogHtmlPromise) {
    changelogHtmlPromise = fetch('CHANGELOG.md')
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(md => changelogMdToHtml(md) + '\n<div class="close">click to close</div>')
      .catch(err => {
        // Clear the promise so a later open re-attempts the fetch.
        changelogHtmlPromise = null;
        console.warn('[changelog] load failed', err);
        return '<h2>Changelog</h2><p>Could not load changelog.</p>'
             + '<div class="close">click to close</div>';
      });
  }
  return changelogHtmlPromise;
}
// Warm the cache so the first open feels instant.
getChangelogHtml();

async function showChangelog() {
  showOverlay(await getChangelogHtml());
}
document.getElementById('show-changelog').addEventListener('click', (e) => {
  playSfx('menu-click');
  e.stopPropagation();
  closeAllPanels({ silent: true });
  showChangelog();
});
document.getElementById('version-tag').addEventListener('click', (e) => {
  e.stopPropagation();
  playSfx('button-forward');
  showChangelog();
});

document.getElementById('howto-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  playSfx('button-forward');
  openSettings('howto');
});
settingsPanel.addEventListener('click', (e) => e.stopPropagation());
document.getElementById('settings-close').addEventListener('click', closeAllPanels);
panelBackdrop.addEventListener('click', closeAllPanels);
addEventListener('click', closeAllPanels);

volMusic.addEventListener('input', () => {
  audioPrefs.music = parseFloat(volMusic.value);
  localStorage.setItem('mystVolMusic', audioPrefs.music);
  if (audioStarted) {
    ambientAudio.volume = audioPrefs.music;
    titleMusicAudio.volume = audioPrefs.music;
  }
});
volSfx.addEventListener('input', () => {
  audioPrefs.sfx = parseFloat(volSfx.value);
  localStorage.setItem('mystVolSfx', audioPrefs.sfx);
  // Node ambient (environmental) lives on the SFX channel.
  if (nodeAmbientAudio) nodeAmbientAudio.volume = audioPrefs.sfx * currentAmbientMix;
  playSfx('interact-tap');
});
muteMusicBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  playSfx('menu-click');
  audioPrefs.musicMuted = !audioPrefs.musicMuted;
  localStorage.setItem('mystMuteMusic', audioPrefs.musicMuted ? '1' : '0');
  applyMuteUI();
});
muteSfxBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  audioPrefs.sfxMuted = !audioPrefs.sfxMuted;
  localStorage.setItem('mystMuteSfx', audioPrefs.sfxMuted ? '1' : '0');
  applyMuteUI();
  if (!audioPrefs.sfxMuted) playSfx('menu-click');
});

document.getElementById('replay-btn').addEventListener('click', () => {
  location.reload();
});
document.getElementById('track-next').addEventListener('click', (e) => {
  e.stopPropagation();
  playSfx('menu-click');
  skipNext();
});
document.getElementById('track-prev').addEventListener('click', (e) => {
  e.stopPropagation();
  playSfx('menu-click');
  skipPrev();
});

// ---- Boot -----------------------------------------------------------
// Captain's log shows on every session start. Age completions drop the
// player back at the ascension chamber, not the dock, so the log only
// fires when someone is actually beginning a fresh session — which is
// the right moment for it.

// Hide the help button/menu while the title/preload is up — they belong
// to gameplay. Class is removed when the title fades out.
document.body.classList.add('title-active');

// Start loading the dock behind the title card so it's ready when the
// player dismisses the title.
travelTo('dock');

const titleCard = document.getElementById('titlecard');
const beginBtn = document.getElementById('begin-btn');
const preloadCard = document.getElementById('preload-card');

// Begin button starts in loading state — gated on dock pano + title music ready.
beginBtn.classList.add('loading');
beginBtn.textContent = 'Loading…';
beginBtn.disabled = true;

const dockReady = new Promise(resolve => {
  const img = new Image();
  img.onload = resolve;
  img.onerror = resolve; // don't block forever if pano 404s
  img.src = assetUrl('panos/dock.jpg');
});
const titleMusicReady = new Promise(resolve => {
  if (titleMusicAudio.readyState >= 3) resolve();
  else titleMusicAudio.addEventListener('canplaythrough', resolve, { once: true });
});
Promise.all([dockReady, titleMusicReady]).then(() => {
  beginBtn.classList.remove('loading');
  beginBtn.textContent = 'Begin';
  beginBtn.disabled = false;
});

// First click anywhere on the preload card lifts the autoplay gate,
// starts the title music, and fades the card away to reveal the title.
preloadCard.addEventListener('click', () => {
  startAmbient();
  preloadCard.classList.add('fading');
  setTimeout(() => preloadCard.classList.add('gone'), 1500);
}, { once: true });

function beginExperience() {
  if (beginBtn.disabled) return;
  // Explicit play call here too — guarantees audio attempt even if
  // a parent's stopPropagation swallowed the capture-phase listener.
  startAmbient();
  titleCard.classList.add('fading');
  setTimeout(() => {
    titleCard.classList.add('gone');
    titleScreenActive = false;
    document.body.classList.remove('title-active');
    // World ambience (water/wind) layers in now that the title is gone.
    if (currentNode) {
      const { path, mix } = resolveAmbient(WORLD[currentNode]);
      if (path) setNodeAmbient(path, mix);
    }
    setTimeout(() => showOverlay(CAPTAINS_LOG_HTML, startGameplayMusic), 400);
  }, 1500);
}
beginBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  playSfx('key-lock-insert', 2.0);
  beginExperience();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

(function loop() {
  requestAnimationFrame(loop);
  const t = performance.now() * 0.002;
  hotspotGroup.children.forEach(r => {
    // Hit pads keep the constant opacity assigned when they were built.
    // Only the visible frame/ring meshes participate in the pulse.
    if (r.userData.isHitPad) return;
    r.material.opacity = 0.4 + 0.2 * Math.sin(t + r.position.x);
  });
  controls.update();
  renderer.render(scene, camera);
})();
