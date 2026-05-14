import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---- Version label (bottom-right on title screen) -------------------
// Reads the VERSION file at repo root. Bump that file each release —
// no rebuild needed, the title picks it up on next visit.
fetch('VERSION')
  .then((r) => (r.ok ? r.text() : ''))
  .then((v) => {
    const tag = document.getElementById('version-tag');
    if (tag && v) tag.textContent = v.trim();
  })
  .catch(() => { /* version label is decorative; ignore */ });

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
// Cache-bust query param. Use a fixed version for shipped builds so
// browsers can actually cache panoramas across revisits. Bump when art
// changes.
const PANO_CACHE_BUST = '?v=1.0';
const textureLoader = new THREE.TextureLoader();
const panoCache = new Map();
// Patched to renderer.capabilities.getMaxAnisotropy() after the renderer
// is created. Sharpens panos at grazing viewing angles on the sphere.
let maxAnisotropy = 1;
function loadPano(url) {
  if (!panoCache.has(url)) {
    const tex = textureLoader.load(url + PANO_CACHE_BUST);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    panoCache.set(url, tex);
  }
  return panoCache.get(url);
}
// Preload alternate state panoramas so puzzle-swaps are instant.
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
  shoreCompleted: false,
  greenCompleted: false,
  dockDoorUnlocked: false,
  shoreLighthouseInspected: false,
  shoreMoonInspected: false,
  shoreShellInspected: false,
  greenTreeInspected: false,
  greenBasinInspected: false,
  greenShellInspected: false,
};

// ---- Action handlers (run on click for non-travel hotspots) ---------
const ACTIONS = {
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
    playSfx('interact-tap');
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
  inspectSealedBook: () => {
    playSfx('key-lock-insert');
    showOverlay(`
      <h2>The Sealed Book</h2>
      <p>A book bound in deep red leather, its cover pressed with a
      coiling spiral in tarnished brass, winding inward to a single
      pearl — the Keepers' own mark. The clasp is shut and warm, and
      will not yield to your touch.</p>
      <p><em>Not yet, perhaps. Not yet.</em></p>
      <div class="close">click to close</div>
    `);
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
    playSfx('footsteps-in-grass');
    showOverlay(`
      <h2>Between the Roots</h2>
      <p>You step into the gap. The bark you touched before is now
      around you on every side — older than the Keepers, older,
      perhaps, than whatever followed them.</p>
      <p>The moss closes behind you. The forest does not protest.</p>
      <p>The green country holds you the way a cup holds rain — gently,
      briefly, without weight.</p>
      <p><em>The Age accepts you.</em></p>
      <div class="close">click to depart</div>
    `, () => {
      triggerEndscreen(
        'The forest closes around you in green that does not end.<br>' +
        'Wherever the next Age lies, you carry with you the warmth of this one.'
      );
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
    playSfx('mystical-chime');
    showOverlay(`
      <h2>The Smaller Moon</h2>
      <p>It hangs low above the horizon, paler than its larger
      twin. Its craters are arranged in a pattern you almost
      recognise — like a face turned just slightly away.</p>
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
  finalDeparture: () => {
    playSfx('tide-take');
    showOverlay(`
      <h2>The Tide</h2>
      <p>You step into the water. It does not retreat from you;
      it does not push you back. It pulls you in — gently,
      steadily — as if you were always meant to belong to it.</p>
      <p>Ahead, the monolith waits beneath the sister moon — black
      against her pale light. The water carries you toward it,
      though your feet do not move.</p>
      <p>The shore recedes. The smaller moon recedes. Somewhere,
      a third page is turning.</p>
      <p><em>The Age accepts you.</em></p>
      <div class="close">click to depart</div>
    `, () => {
      triggerEndscreen(
        'The shore dissolves around you into water that does not end.<br>' +
        'Wherever the next Age lies, you carry with you the silence of this one.'
      );
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
    playSfx('interact-tap');
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
    playSfx('mechanism-whir');
    setTimeout(() => {
      playSfx('brass-click');
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
};

// ---- Book-frame geometry (hollow rectangle outline) -----------------
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
    pano: () => loadPano('panos/dock-updated.jpg'),
    // Per-node ambient — water, gulls, wind. Loops while the player
    // is at the dock; crossfades out when they travel away.
    ambient: 'audio/sfx/dock-ambient.mp3',
    // Open framing — the player's first sight is the ship that brought them.
    startDir: [0.73, -0.15, 0.67],
    hotspots: () => [
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
      { action: 'inspectLockedDoor', dir: [-0.81, 0.28, -0.52],
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
      : 'panos/library-updated.jpg'),
    // Open framing — the spiral staircase + lectern in view, with the
    // empty bookshelf catching the eye in peripheral vision.
    startDir: [0.1, -0.04, -0.99],
    hotspots: () => [
      // Sigil teleports the player back to the dock — fast travel shortcut.
      { to: 'dock', dir: [-0.47, -0.66, 0.58], label: 'step onto the sigil',
        color: 0x7affd2,
        sfx: 'sigil-warp', fadeMs: 1800 },
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
    // Per-node ambient — high-altitude wind, the chamber sits in the sky.
    ambient: 'audio/sfx/ascension-ambient.mp3',
    hotspots: () => [
      // The shore's linking book — blue leather, wave sigil.
      { action: 'touchLinkingBook',
        dir: [0.07, -0.32, -0.94],
        label: 'a glowing book — touch the page',
        color: 0x5a9aff,
        hidden: () => state.shoreCompleted || state.greenCompleted },
      // The green country's linking book — green leather, tree sigil.
      { action: 'touchGreenBook',
        dir: [-0.14, -0.32, -0.94],
        label: 'a glowing book — touch the page',
        color: 0x9aff7a,
        hidden: () => state.shoreCompleted || state.greenCompleted },
      // The Keepers' sealed book — red leather, spiral sigil.
      // Inspect-only in v0.4.0; becomes the cottage Age portal in v0.5.0+.
      { action: 'inspectSealedBook',
        dir: [0.26, -0.34, -0.9],
        label: 'a sealed book — clasped shut',
        color: 0xff5a4a,
        hidden: () => state.shoreCompleted || state.greenCompleted },
      // The Keepers' open notebook — lore + dedication easter egg.
      { action: 'inspectOpenBook',
        dir: [0.1, -0.63, -0.77],
        label: 'an open notebook, mid-thought',
        color: 0xffaa44,
        hidden: () => state.shoreCompleted || state.greenCompleted },
      // Return to the library — escape valve so the player can leave
      // without committing to an ending.
      { to: 'library', dir: [-0.85, -0.45, 0.25], label: 'return to the library',
        sfx: 'leaving-walk', fadeMs: 4000,
        hidden: () => state.shoreCompleted || state.greenCompleted },
    ],
  },
  reversedShore: {
    name: 'The Reversed Shore',
    pano: () => loadPano('panos/reversed-shore.jpg'),
    // Per-node ambient — the Reversed Shore's signature soundscape.
    ambient: 'audio/sfx/shore-ambient.mp3',
    // Placeholder framing — dev-capture to land on the big moon or the
    // lighthouse on arrival, whichever feels right.
    startDir: [0.35, 0.06, -0.94],
    hotspots: () => [
      { action: 'inspectShoreLighthouse', dir: [0.99, 0.04, -0.15],
        label: 'the black lighthouse',
        color: 0xffc26a, shape: 'book',
        hidden: () => state.shoreLighthouseInspected },
      { action: 'inspectShoreMoon', dir: [-0.6, 0.26, -0.76],
        label: 'the smaller moon',
        color: 0xc0d0ff, shape: 'circle',
        hidden: () => state.shoreMoonInspected },
      { action: 'inspectShoreShell', dir: [0.42, -0.81, 0.42],
        label: 'a purple shell on the stones',
        color: 0xc8a0ff, shape: 'circle',
        hidden: () => state.shoreShellInspected },
      // Final exit — only appears once all three have been seen.
      { action: 'finalDeparture', dir: [-0.94, -0.16, 0.28],
        label: 'walk into the tide',
        color: 0x7affd2,
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
    // Placeholder startDir — re-capture in dev mode for the ideal arrival framing.
    startDir: [0.5, -0.05, 0.86],
    hotspots: () => [
      // The ancient trees — dev-captured aimed at the trunks
      // (distinct from the gap between roots, which is the terminal target).
      // Panel shape with custom w/h to fit the trees' massive scale.
      { action: 'inspectGreenTree', dir: [-0.85, 0.26, -0.46], w: 2.5, h: 5.5,
        label: 'ancient trees, taller than mountains',
        color: 0x9aff7a, shape: 'panel',
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
      { action: 'stepIntoRoots', dir: [0.31, 0.08, -0.95],
        label: 'step between the great roots',
        color: 0x7affd2,
        hidden: () => !(state.greenTreeInspected
                        && state.greenBasinInspected
                        && state.greenShellInspected) },
    ],
  },
  observatory: {
    name: 'The Observatory',
    // Pano swaps when the player activates the brass mechanism.
    pano: () => loadPano(state.observatoryMechanismActive
      ? 'panos/observatory-activated.jpg'
      : 'panos/observatory-updated.jpg'),
    // Open framing — sea of clouds and constellations. Mechanism is
    // discovered by turning, not handed to the player on arrival.
    startDir: [0.88, 0.17, 0.44],
    hotspots: () => [
      { to: 'dock', dir: [0.41, -0.91, -0.07], label: 'back to the dock',
        sfx: 'door-open', fadeMs: 3600 },
      // Brass mechanism — clue + puzzle gate. Hidden once activated.
      // Placeholder direction; dev-capture and update.
      { action: 'activateMechanism', dir: [-1, 0.03, -0.04],
        label: 'the brass mechanism',
        color: 0xffaa44, shape: 'button',
        hidden: () => state.observatoryMechanismActive },
      // Slab descent — locked until the mechanism is activated.
      { to: 'library', dir: [0.34, -0.56, 0.76],
        label: 'descend through the slab',
        sfx: 'heavy-door-open', fadeMs: 2400,
        hidden: () => !state.observatoryMechanismActive },
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
  return WORLD[key].pano();
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
    if (hs.shape === 'book')           { geom = makeBookFrame(0.5, 1.8, 0.12); hitW = 0.7;  hitH = 2.0; }
    else if (hs.shape === 'open-book') { geom = makeBookFrame(1.8, 0.5, 0.12); hitW = 2.0;  hitH = 0.7; }
    else if (hs.shape === 'panel')     {
      // Panel frames can override w/h per-hotspot for irregular carvings.
      const pw = hs.w ?? 0.95;
      const ph = hs.h ?? 1.9;
      geom = makeBookFrame(pw, ph, 0.14);
      hitW = pw + 0.2; hitH = ph + 0.2;
    }
    else if (hs.shape === 'button')    { geom = new THREE.CircleGeometry(0.5, 32); hitW = hitH = 1.2; }
    else if (hs.shape === 'circle')    { geom = new THREE.RingGeometry(0.7, 0.85, 32); hitW = hitH = 1.9; }
    else                                { geom = new THREE.RingGeometry(1.2, 1.6, 32); hitW = hitH = 3.4; }
    const userData = {
      target: hs.to,         // travel target (may be undefined)
      action: hs.action,     // action key (may be undefined)
      label: hs.label,
      sfx: hs.sfx,           // optional one-shot SFX on click
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
      const isRect = hs.shape === 'book' || hs.shape === 'open-book' || hs.shape === 'panel';
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
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(hotspotGroup.children)[0];
  if (!hit) return;
  const { target, action, sfx, sfxDelay, fadeMs } = hit.object.userData;
  if (sfx) {
    if (sfxDelay) setTimeout(() => playSfx(sfx), sfxDelay);
    else playSfx(sfx);
  }
  if (action && ACTIONS[action]) ACTIONS[action]();
  else if (target) travelTo(target, { fadeMs });
});

addEventListener('pointermove', (e) => {
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

function showOverlay(html, onClose) {
  overlayPanel.innerHTML = html;
  overlayEl.classList.add('active');
  overlayCloseCallback = onClose || null;
}
overlayEl.addEventListener('click', () => {
  overlayEl.classList.remove('active');
  if (overlayCloseCallback) {
    const cb = overlayCloseCallback;
    overlayCloseCallback = null;
    cb();
  }
});

let currentNode = null;
async function travelTo(key, opts = {}) {
  const node = WORLD[key];
  if (!node) return;
  const fadeMs = opts.fadeMs ?? 600;
  fadeEl.classList.add('active');
  await new Promise(r => setTimeout(r, fadeMs));
  sphereMat.map = getPano(key);
  sphereMat.needsUpdate = true;
  buildHotspots(node);
  nodeNameEl.textContent = node.name;
  currentNode = key;
  // Crossfade the per-node ambient layer (if any).
  if (audioStarted) setNodeAmbient(node.ambient);
  // Optional: orient the camera to a node-defined opening framing.
  // For a panorama viewer the camera lives at origin and orbits around
  // the sphere center. To look in `dir`, we keep the target at origin
  // and position the camera a tiny offset in the OPPOSITE direction —
  // which rotates the view without changing the orbit radius.
  if (node.startDir) {
    const dir = new THREE.Vector3(...node.startDir).normalize();
    controls.target.set(0, 0, 0);
    camera.position.copy(dir).multiplyScalar(-0.01);
    controls.update();
  }
  fadeEl.classList.remove('active');
}

// ---- Dev mode: aim at a spot, press H to capture hotspot direction --
const devHud = document.getElementById('devhud');
let devMode = false;
const previewRingGroup = new THREE.Group();
scene.add(previewRingGroup);

// Save the player-facing clamps so we can restore them when exiting dev mode.
const PLAYER_POLAR_MIN = controls.minPolarAngle;
const PLAYER_POLAR_MAX = controls.maxPolarAngle;

function setDevMode(on) {
  devMode = on;
  devHud.classList.toggle('active', on);
  document.body.classList.toggle('dev-mode', on);
  if (on) {
    // Unlock full pitch range so the designer can aim straight up/down.
    controls.minPolarAngle = Math.PI * 0.01;
    controls.maxPolarAngle = Math.PI * 0.99;
    devHud.innerHTML = `
      <div class="hint">DEV MODE — pitch unlocked &middot; aim crosshair at desired hotspot, press <b>H</b> to capture</div>
      <div>node: <b>${currentNode}</b> &nbsp;·&nbsp; press <b>D</b> to exit, <b>X</b> to clear preview rings</div>
    `;
  } else {
    controls.minPolarAngle = PLAYER_POLAR_MIN;
    controls.maxPolarAngle = PLAYER_POLAR_MAX;
    previewRingGroup.clear();
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
  devHud.innerHTML = `
    <div class="hint">Captured hotspot from <b>${currentNode}</b> — paste into WORLD.${currentNode}.hotspots:</div>
    <div class="snippet">${snippet}</div>
    <div class="hint" style="margin-top:6px">aim &amp; press <b>H</b> for another &nbsp;·&nbsp; <b>X</b> clear &nbsp;·&nbsp; <b>D</b> exit</div>
  `;
  console.log('[hotspot]', snippet);
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
ambientAudio.volume = 0;
titleMusicAudio.volume = 0;

const GAMEPLAY_PLAYLIST = [
  { url: 'audio/atlasaudio-ambient-astronomy-511860.mp3',
    label: 'Astronomy' },
  { url: 'audio/juliush-relax-chill-out-music-for-landscapes-under-water-animals-forests-8105.mp3',
    label: 'Landscapes' },
  { url: 'audio/juliush-waves-from-piano-and-sea-ambient-chill-out-piano-music-and-waves-3551.mp3',
    label: 'Waves &amp; Piano' },
  { url: 'audio/anton_vlasov-ambient-chill-drone-15790.mp3',
    label: 'Drone' },
  { url: 'audio/desifreemusic-flowing-river-sounds-blended-with-calming-drone-pads-377064.mp3',
    label: 'Flowing River' },
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
  ambientAudio.src = track.url;
  ambientAudio.volume = 0;
  ambientAudio.play()
    .then(() => fadeAudioElement(ambientAudio, audioPrefs.music, 3000))
    .catch(err => console.warn('[ambient] play failed', err));
  updateTrackLabel();
}
// When a gameplay track ends, advance to the next one in order.
ambientAudio.addEventListener('ended', () => {
  const track = pickNextGameplayTrack();
  ambientAudio.src = track.url;
  ambientAudio.play().catch(err => console.warn('[ambient] next', err));
  updateTrackLabel();
});

// Player controls for cycling tracks.
function playSpecificTrack(idx) {
  currentTrackIndex = idx;
  ambientAudio.src = GAMEPLAY_PLAYLIST[idx].url;
  ambientAudio.volume = audioPrefs.musicMuted ? 0 : audioPrefs.music;
  ambientAudio.play().catch(err => console.warn('[track]', err));
  updateTrackLabel();
}
function skipNext() {
  // Title screen is locked to the title track — no skipping until dismissed.
  if (titleScreenActive) return;
  if (currentTrackIndex < 0) {
    // Title dismissed but gameplay hasn't kicked in yet — start it.
    startGameplayMusic();
    return;
  }
  const len = GAMEPLAY_PLAYLIST.length;
  playSpecificTrack((currentTrackIndex + 1) % len);
}
function skipPrev() {
  if (titleScreenActive) return;
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

function setNodeAmbient(path) {
  if (path === currentAmbientPath) return;
  currentAmbientPath = path;
  if (nodeAmbientAudio) {
    const old = nodeAmbientAudio;
    nodeAmbientAudio = null;
    fadeAudioElement(old, 0, 1500);
    setTimeout(() => { old.pause(); old.src = ''; }, 1700);
  }
  if (!path) return;
  const audio = new Audio(path);
  audio.loop = true;
  audio.volume = 0;
  // Environmental ambience belongs to the SFX channel, not music.
  audio.muted = audioPrefs.sfxMuted;
  audio.play()
    .then(() => fadeAudioElement(audio, NODE_AMBIENT_MIX * audioPrefs.sfx, 1500))
    .catch(err => console.warn('[node-ambient] play blocked', err));
  nodeAmbientAudio = audio;
}

// ---- One-shot sound effects -----------------------------------------
// Drop files at audio/sfx/<name>.mp3 and call playSfx('<name>').
const sfxCache = new Map();

// Preload every SFX at boot — without this, the first play of each
// sound has a noticeable lag while the browser decodes the file.
const PRELOAD_SFX = [
  'ui-tick', 'book-pages',
  'door-open', 'heavy-door-open',
  'passage-open', 'interact-tap', 'brass-click',
  'climbing-stairs', 'sigil-warp', 'linking-warp',
  'mechanism-whir', 'tide-take', 'lighthouse', 'mystical-chime',
  'shell-fade',
];
PRELOAD_SFX.forEach(name => {
  const sfx = new Audio(`audio/sfx/${name}.mp3`);
  sfx.preload = 'auto';
  sfxCache.set(name, sfx);
});
function playSfx(name, volume = 1.0) {
  if (audioPrefs.sfxMuted) return null;
  let sfx = sfxCache.get(name);
  if (!sfx) {
    sfx = new Audio(`audio/sfx/${name}.mp3`);
    sfxCache.set(name, sfx);
  }
  sfx.volume = volume * audioPrefs.sfx;
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

function closeAllPanels() {
  // Note: do NOT close the captain's-log overlay here. It has its own
  // click-to-close handler, and document-level clicks that re-open the
  // overlay (e.g. clicking an interactive hotspot) also fire this handler
  // by bubbling. openSettings() explicitly dismisses the overlay when
  // needed so the two don't stack visually.
  settingsPanel.classList.remove('active');
  menuBtn.classList.remove('active');
  panelBackdrop.classList.remove('active');
  if (typeof disarmReset === 'function') disarmReset();
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
  if (settingsPanel.classList.contains('active')) closeAllPanels();
  else openSettings();
});
settingsPanel.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    switchTab(btn.dataset.tab);
  });
});
document.getElementById('settings-fullscreen').addEventListener('click', (e) => {
  e.stopPropagation();
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
  if (resetArmed) {
    closeAllPanels();
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
const CHANGELOG_HTML = `
  <h2>Changelog</h2>
  <h3>v0.4.0 &mdash; 2026-05-14</h3>
  <p class="change-label">New</p>
  <ul class="changelog">
    <li>The Green Country &mdash; a second Age opens beneath the canopy</li>
    <li>Two more linking books at the ascension pedestal</li>
    <li>An open notebook rests where the Keepers left it</li>
  </ul>
  <p class="change-label">Enhanced</p>
  <ul class="changelog">
    <li>The reversed shore &mdash; clearer skies, a sister moon</li>
    <li>The ascension chamber &mdash; three pages, three paths</li>
    <li>The dock door &mdash; the tree panel in greater detail</li>
    <li>Music now cycles in order rather than at random</li>
  </ul>
  <p class="change-label">Fixed</p>
  <ul class="changelog">
    <li>Hover labels and location names no longer hide behind the sky</li>
  </ul>
  <hr class="rule">
  <h3>v0.3.0 &mdash; 2026-05-11</h3>
  <p class="change-label">New</p>
  <ul class="changelog">
    <li>A settings panel with brightness and sensitivity</li>
    <li>Larger, clearer interaction zones</li>
  </ul>
  <div class="close">click to close</div>
`;
function showChangelog() {
  showOverlay(CHANGELOG_HTML);
}
document.getElementById('show-changelog').addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllPanels();
  showChangelog();
});
document.getElementById('version-tag').addEventListener('click', (e) => {
  e.stopPropagation();
  showChangelog();
});

document.getElementById('howto-btn').addEventListener('click', (e) => {
  e.stopPropagation();
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
    if (!(state.shoreCompleted || state.greenCompleted)) ambientAudio.volume = audioPrefs.music;
    titleMusicAudio.volume = audioPrefs.music;
  }
});
volSfx.addEventListener('input', () => {
  audioPrefs.sfx = parseFloat(volSfx.value);
  localStorage.setItem('mystVolSfx', audioPrefs.sfx);
  // Node ambient (environmental) lives on the SFX channel.
  if (nodeAmbientAudio) nodeAmbientAudio.volume = audioPrefs.sfx * NODE_AMBIENT_MIX;
  playSfx('ui-tick');
});
muteMusicBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  audioPrefs.musicMuted = !audioPrefs.musicMuted;
  localStorage.setItem('mystMuteMusic', audioPrefs.musicMuted ? '1' : '0');
  applyMuteUI();
});
muteSfxBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  audioPrefs.sfxMuted = !audioPrefs.sfxMuted;
  localStorage.setItem('mystMuteSfx', audioPrefs.sfxMuted ? '1' : '0');
  applyMuteUI();
  if (!audioPrefs.sfxMuted) playSfx('ui-tick');
});

document.getElementById('reread-log').addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllPanels();
  showOverlay(CAPTAINS_LOG_HTML);
});
document.getElementById('replay-btn').addEventListener('click', () => {
  location.reload();
});
document.getElementById('track-next').addEventListener('click', (e) => {
  e.stopPropagation();
  skipNext();
});
document.getElementById('track-prev').addEventListener('click', (e) => {
  e.stopPropagation();
  skipPrev();
});

// ---- Boot -----------------------------------------------------------
// Intro shows once per browser. Append `?intro` to the URL to force it
// again, or run `localStorage.removeItem('mystIntroSeen')` in the console.
const INTRO_KEY = 'mystIntroSeen';
const forceIntro = new URLSearchParams(location.search).has('intro');
const shouldShowIntro = forceIntro || !localStorage.getItem(INTRO_KEY);

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
  img.src = 'panos/dock-updated.jpg' + PANO_CACHE_BUST;
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
    if (currentNode && WORLD[currentNode].ambient) {
      setNodeAmbient(WORLD[currentNode].ambient);
    }
    if (!shouldShowIntro) {
      // Returning player — skip straight to gameplay music.
      startGameplayMusic();
      return;
    }
    localStorage.setItem(INTRO_KEY, '1');
    setTimeout(() => showOverlay(CAPTAINS_LOG_HTML, startGameplayMusic), 400);
  }, 1500);
}
beginBtn.addEventListener('click', (e) => {
  e.stopPropagation();
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
