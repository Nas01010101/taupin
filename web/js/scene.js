// Three.js scene for the parcel: terrain from the 2 m lidar DTM, one draped layer at a time
// (web/js/layers.js), tree crowns at the lidar treetops, a soil-profile skirt on the cut edge,
// bait-trap flags, an optional overlay of the low wet pocket, and photo pins (a stem plus the
// photo as a billboard). Machines and crop plants are left out; this tool is about the soil.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VIEWS, decode, colorOf } from './layers.js';
import { crittersFor, critterPose } from './critters.js';

// Relief is drawn 2 times (12 m over 600 m would read flat); trees are drawn at their lidar height.
const TEX = 1200, EXAG = 2, PROFILE_DEPTH = 24;

// base: URL prefix of field.json's layer files ('data/').
export function createScene(container, field, base = 'data/') {
  const N = field.parcel.size, W = N * field.parcel.res_m;
  const byKey = Object.fromEntries(field.layers.map(l => [l.key, l]));
  const data = {};
  let H = new Float32Array(N * N), hmin = 0, view = 'terrain', showPocket = false;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D view of the parcel; drag to rotate, scroll to zoom');
  renderer.domElement.setAttribute('role', 'img');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 6000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minDistance = 40; controls.maxDistance = 2200;
  scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x3a3020, 1.3));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.4);
  sun.position.set(-300, 500, -300);            // from the north-west, like the baked hillshade
  scene.add(sun);

  // ------------------------------------------------------------ terrain + draped layer
  const geo = new THREE.PlaneGeometry(W, W, N - 1, N - 1);
  geo.rotateX(-Math.PI / 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  const g2 = canvas.getContext('2d');
  const small = document.createElement('canvas');
  small.width = small.height = N;
  const s2 = small.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  scene.add(terrain);
  const px = TEX / (N - 1);

  let marks = [];
  function paint() {
    const v = VIEWS.find(x => x.key === view), lay = byKey[v.layer], vals = data[v.layer];
    const hs = data.hillshade, chm = data.canopy, n = lay.size, k = N / n;
    const img = s2.createImageData(N, N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const i = r * N + c;
      // 30 m layers: each 2 m cell takes its 30 m cell's value, so blocks stay visible.
      const val = n === N ? vals[i] : vals[Math.floor(r / k) * n + Math.floor(c / k)];
      let rgb = colorOf(lay, val) ?? [150, 146, 136];
      if (view === 'terrain' && chm?.[i] >= 2) rgb = [70, 96, 58];           // shade under crowns
      const s = 0.6 + 0.5 * hs[i];                 // flat ground (hs 0.71) at 0.95
      const o = i * 4;
      img.data[o] = rgb[0] * s; img.data[o + 1] = rgb[1] * s; img.data[o + 2] = rgb[2] * s; img.data[o + 3] = 255;
      if (showPocket && H[i] <= field.pocket.height_max_m) {
        img.data[o] = img.data[o] * 0.45 + 64 * 0.55; img.data[o + 1] = img.data[o + 1] * 0.45 + 150 * 0.55;
        img.data[o + 2] = img.data[o + 2] * 0.45 + 220 * 0.55;
      }
    }
    // Field notes: a tinted disc around each one.
    for (const m of marks) for (let r = Math.max(0, m.row - m.radius); r <= Math.min(N - 1, m.row + m.radius); r++)
      for (let c = Math.max(0, m.col - m.radius); c <= Math.min(N - 1, m.col + m.radius); c++) {
        if ((r - m.row) ** 2 + (c - m.col) ** 2 > m.radius ** 2) continue;
        const o = (r * N + c) * 4;
        for (let j = 0; j < 3; j++) img.data[o + j] = img.data[o + j] * 0.4 + m.rgb[j] * 0.6;
      }
    s2.putImageData(img, 0, 0);
    // Class and 30 m views stay blocky (nearest); 2 m views are smoothed between cell centres.
    g2.imageSmoothingEnabled = lay.kind !== 'classes' && n === N;
    g2.drawImage(small, -px / 2, -px / 2, TEX + px, TEX + px);   // pixel centres on the vertices
    tex.needsUpdate = true;
    trees.visible = view === 'terrain' || view === 'soil' || view === 'zones';
  }

  const heightAt = (row, col) => {
    const r = Math.max(0, Math.min(N - 1.001, row)), c = Math.max(0, Math.min(N - 1.001, col));
    const r0 = r | 0, c0 = c | 0, fr = r - r0, fc = c - c0, i = r0 * N + c0;
    const h = H[i] * (1 - fr) * (1 - fc) + H[i + 1] * (1 - fr) * fc + H[i + N] * fr * (1 - fc) + H[i + N + 1] * fr * fc;
    return (h - hmin) * EXAG;
  };
  const toWorld = (row, col) => new THREE.Vector3((col / (N - 1) - 0.5) * W, heightAt(row, col), (row / (N - 1) - 0.5) * W);

  // ------------------------------------------------------------ soil-profile skirt
  const profileTex = (() => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 256;
    const x = c.getContext('2d');
    // 0-1.2 m over 24 world units (20x): Ap 0-0.25 m dark topsoil, B clay 0.25-0.9 m, C below; a pale line at
    // 0.10 m marks the TSOIL1 layer the trap window is read from.
    const band = (z0, z1, col) => { x.fillStyle = col; x.fillRect(0, (z0 / 1.2) * 256, 8, ((z1 - z0) / 1.2) * 256 + 1); };
    band(0, 0.25, '#4a3424'); band(0.25, 0.9, '#7a6450'); band(0.9, 1.2, '#8d8070');
    x.fillStyle = '#e8d9a0'; x.fillRect(0, (0.1 / 1.2) * 256 - 1, 8, 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  function skirt() {
    const verts = [], uv = [], idx = [];
    const edges = [[0, 0, 0, 1], [0, N - 1, 1, 0], [N - 1, N - 1, 0, -1], [N - 1, 0, -1, 0]];
    for (const [r0, c0, dr, dc] of edges) {
      const b = verts.length / 3;
      for (let k = 0; k < N; k++) {
        const p = toWorld(r0 + dr * k, c0 + dc * k);
        // The profile hangs from the surface: 0 at the ground line, 1.2 m (24 units) below it.
        verts.push(p.x, p.y, p.z, p.x, p.y - PROFILE_DEPTH, p.z);
        uv.push(0, 1, 0, 0);
        if (k) { const a = b + (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: profileTex, side: THREE.DoubleSide })));
  }

  // ------------------------------------------------------------ trees (lidar treetops)
  const trees = new THREE.Group(); scene.add(trees);
  function plantTrees() {
    const list = field.trees, m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), list.length);
    list.forEach(([row, col0, h], i) => {
      // Crown shape is drawn, not measured: about 0.3 x height wide, the top 70 % of the tree.
      const r = Math.max(1.5, 0.3 * h), p = toWorld(row, col0);
      m.compose(new THREE.Vector3(p.x, p.y + h * 0.65, p.z), q, new THREE.Vector3(r, h * 0.35, r));
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, col.setHSL(0.27 + (i % 7) * 0.008, 0.38, 0.2 + Math.min(h, 30) / 150));
    });
    trees.add(crowns);
  }

  // ------------------------------------------------------------ trap flags
  const traps = new THREE.Group(); scene.add(traps);
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xf2efe6 });
  function letterSprite(txt) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#c8402c'; x.beginPath(); x.arc(32, 32, 28, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.font = '600 36px Inter, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(txt, 32, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
    s.renderOrder = 3; return s;
  }
  function placeTraps() {
    for (const t of field.traps) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 18, 6), flagMat); pole.position.y = 9;
      const tag = letterSprite(t.id); tag.position.y = 24; tag.scale.set(14, 14, 1);
      g.add(pole, tag);
      g.position.copy(toWorld(t.row, t.col));
      g.userData.trap = t.id;
      traps.add(g);
    }
  }

  // ------------------------------------------------------------ pins
  const pins = new THREE.Group(); scene.add(pins);
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x1d2320 });
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });   // wider than the stem, so a pin is easy to click
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  // id: set on pins the farmer can select ('note:3', 'find:1'); selected: draws a ring at the foot.
  function addPin({ row, col, thumb, color = 0xffffff, drop = 1, id = null, selected = false }) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 60, 6), stemMat); stem.position.y = 30;
    const head = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshLambertMaterial({ color }));
    head.position.y = 62;
    g.add(stem, head);
    if (id) { const hit = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 80, 8), hitMat); hit.position.y = 40; g.add(hit); }
    if (selected) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(11, 14, 32), ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 1; ring.renderOrder = 4; g.add(ring);
    }
    if (thumb) {
      // Small framed card above the pin: at 70 units the 160 px photo covered the trap letters and
      // looked pixelated when the camera zoomed in.
      const t = new THREE.TextureLoader().load(thumb); t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const frame = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, depthTest: false }));
      frame.scale.set(40, 40, 1); frame.position.y = 92; frame.renderOrder = 2;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
      sp.scale.set(36, 36, 1); sp.position.y = 92; sp.renderOrder = 3;
      g.add(frame, sp);
    }
    g.userData.cell = [row, col];
    g.userData.id = id;
    g.userData.base = toWorld(row, col);
    g.userData.drop = drop;
    pins.add(g);
    setDrop(g, drop);
    return g;
  }
  function setDrop(g, k) {                       // k: 0 = above the view, 1 = planted
    g.userData.drop = k;
    const e = 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
    g.position.copy(g.userData.base);
    g.position.y = g.userData.base.y + (1 - e) * 400;
    g.visible = k > 0;
  }
  function clearPins() { pins.clear(); critters.clear(); }

  // ------------------------------------------------------------ critters
  // Animals that crawl around a pest photo's pin (critters.js). Drawn oversized, like the pins: at
  // true size a 2 cm wireworm is far below one pixel of a 300 m field.
  const critters = new THREE.Group(); scene.add(critters);
  const SEG = 7, SEG_LAG = 0.5, ROAM = 40;   // lag (s) spaces the segments about one body width apart
  function critterMesh(look) {
    const m = new THREE.MeshLambertMaterial({ color: look.color });
    const g = new THREE.Group();
    if (look.shape === 'beetle') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), m); body.scale.set(5, 2.2, 3); body.position.y = 2.2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), m); head.position.set(5.6, 2, 0);
      g.add(body, head);
      const legMat = new THREE.MeshLambertMaterial({ color: 0x241810 });
      for (const side of [-1, 1]) for (const k of [-2.5, 0, 2.5]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 4), legMat);
        leg.rotation.x = side * 1.1; leg.position.set(k, 1.2, side * 3.2); leg.userData.leg = side; g.add(leg);
      }
    } else {
      // One sphere per segment; each follows the head along its path with a delay.
      const r0 = look.shape === 'grub' ? 4.4 : 3.2;
      for (let j = 0; j < SEG; j++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(r0 * (1 - j * 0.07), 10, 8), m);
        seg.userData.seg = j; g.add(seg);
      }
    }
    if (look.shape === 'beetle') g.scale.setScalar(1.8);
    g.userData.look = look;
    return g;
  }
  // id: the photo model class id. Returns null for classes that get no animals.
  function addCritters({ row, col, id, n = 6 }) {
    const look = crittersFor(id);
    if (!look) return null;
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) g.add(critterMesh(look));
    g.userData = { row, col, n };
    critters.add(g);
    return g;
  }
  const groundY = (x, z) => heightAt((z / W + 0.5) * (N - 1), (x / W + 0.5) * (N - 1));
  function moveCritters(t) {
    for (const g of critters.children) {
      const c = toWorld(g.userData.row, g.userData.col);
      g.children.forEach((a, i) => {
        if (a.userData.look.shape === 'beetle') {
          const p = critterPose(i, g.userData.n, t, { r: ROAM });
          const x = c.x + p.dx, z = c.z + p.dz;
          a.position.set(x, groundY(x, z), z); a.rotation.y = -p.heading;
          for (const leg of a.children) if (leg.userData.leg) leg.rotation.z = 0.5 * Math.sin(t * 14 + leg.position.x);
        } else {
          a.position.set(0, 0, 0); a.rotation.y = 0;
          for (const seg of a.children) {
            const p = critterPose(i, g.userData.n, t * 0.6, { r: ROAM, lag: seg.userData.seg * SEG_LAG });
            const x = c.x + p.dx, z = c.z + p.dz;
            seg.position.set(x, groundY(x, z) + 2.6 + 0.8 * Math.sin(t * 6 - seg.userData.seg), z);
          }
        }
      });
    }
  }

  // Pointer -> the cell under it, and the selectable pin under it when that pin is in front of the
  // ground. A click on a pin selects it; a click on the ground gives (row, col).
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let pickCb = null, pinCb = null, down = null, pickMode = false, lastMove = 0;
  const pinOf = o => { while (o && o.parent !== pins) o = o.parent; return o; };
  function hitAt(e, wantGround = true) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const ph = ray.intersectObjects(pins.children, true).find(h => pinOf(h.object)?.userData.id);
    const th = wantGround ? ray.intersectObject(terrain)[0] : null;
    const pin = ph && (!th || ph.distance <= th.distance + 30) ? pinOf(ph.object).userData.id : null;
    return { pin, cell: th ? { row: Math.round((1 - th.uv.y) * (N - 1)), col: Math.round(th.uv.x * (N - 1)) } : null };
  }
  // The ring shows where a click would land and how far a note's tint reaches (20 m = 10 cells).
  const hover = new THREE.Mesh(new THREE.RingGeometry(18, 20, 40), ringMat);
  hover.rotation.x = -Math.PI / 2; hover.renderOrder = 4; hover.visible = false; scene.add(hover);
  function clearHover() { hover.visible = false; renderer.domElement.style.cursor = ''; }
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const h = hitAt(e);
    if (h.pin) pinCb?.(h.pin); else if (h.cell) pickCb?.(h.cell.row, h.cell.col);
  });
  // The ground raycast is the slow part (about 180 000 triangles), so hover is sampled every 80 ms.
  renderer.domElement.addEventListener('pointermove', e => {
    if (e.buttons || performance.now() - lastMove < 80) return;
    lastMove = performance.now();
    const h = hitAt(e, pickMode);
    renderer.domElement.style.cursor = h.pin ? 'pointer' : pickMode && h.cell ? 'crosshair' : '';
    hover.visible = pickMode && !h.pin && !!h.cell;
    if (hover.visible) { hover.position.copy(toWorld(h.cell.row, h.cell.col)); hover.position.y += 1; }
  });
  renderer.domElement.addEventListener('pointerleave', clearHover);

  // ------------------------------------------------------------ load layers, build the mesh
  // A field built in the browser (build.js) carries each layer's bytes in `buffer`; baked fields
  // are fetched from base + file.
  const ready = Promise.all(field.layers.map(async l => {
    if (l.buffer) { data[l.key] = decode(l.buffer, l.encoding); return; }
    const res = await fetch(base + l.file);
    if (!res.ok) throw new Error(`${l.file}: ${res.status}`);
    data[l.key] = decode(await res.arrayBuffer(), l.encoding);
  })).then(() => {
    H = data.height;
    hmin = Infinity;
    for (const h of H) if (h < hmin) hmin = h;      // no Math.min(...H): 90 000 arguments
    const pos = geo.attributes.position;
    for (let i = 0; i < N * N; i++) pos.setY(i, (H[i] - hmin) * EXAG);
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    skirt(); plantTrees(); placeTraps();
    // Pins added before the heights arrived sit at 0; lift them onto the ground.
    for (const g of pins.children) { g.userData.base = toWorld(...g.userData.cell); setDrop(g, g.userData.drop); }
    paint();
  });

  // ------------------------------------------------------------ camera + loop
  let orbitAngle = null, dist = 1100;
  function fit() {
    const dir = new THREE.Vector3(-0.56, 0.48, 0.73).normalize(), v = new THREE.Vector3();
    for (let d = 400; d <= 2200; d += 20) {
      camera.position.copy(dir).multiplyScalar(d); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      const fits = [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a, b]) => {
        v.set(a * W / 2, 0, b * W / 2).project(camera);
        return Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.82;
      });
      if (fits) { dist = d; break; }
    }
    controls.target.set(0, 0, 0);
  }
  // Fixed orbit for the demo: angle in radians around the parcel at the fitted distance.
  function setOrbit(angle) {
    orbitAngle = angle;
    const r = dist * 0.82, y = dist * 0.48;
    camera.position.set(Math.sin(angle) * r, y, Math.cos(angle) * r);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
  }
  let userMoved = false;
  controls.addEventListener('start', () => { userMoved = true; });
  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    if (!userMoved) { fit(); if (orbitAngle !== null) setOrbit(orbitAngle); }
    renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(container);
  let looping = true;
  renderer.setAnimationLoop(() => {
    if (!looping) return;
    if (orbitAngle === null) controls.update();
    if (critters.children.length) moveCritters(performance.now() / 1000);
    renderer.render(scene, camera);
  });
  resize();

  const cellOk = (row, col) => Math.max(0, Math.min(N - 1, row)) * N + Math.max(0, Math.min(N - 1, col));
  return {
    ready, addPin, addCritters, setDrop, clearPins, setOrbit,
    setPocket(on) { showPocket = on; if (data.height) paint(); },
    // marks: [{ row, col, rgb, radius }] in grid cells, from the field notes.
    setMarks(list) { marks = list; if (data.height) paint(); },
    // key: one of VIEWS (terrain, twi, ndvi, lst, soil, zones).
    setLayer(key) { view = key; if (data.height) paint(); },
    get layer() { return view; },
    // decoded lidar canopy heights in metres, after ready.
    canopy: () => data.canopy,
    setTraps(on) { traps.visible = on; },
    onPick(cb) { pickCb = cb; },
    // cb(id): a pin added with an id was clicked. setPickMode(true): crosshair and a ring over the ground.
    onPinPick(cb) { pinCb = cb; },
    setPickMode(on) { pickMode = !!on; if (!on) clearHover(); },
    render() { renderer.render(scene, camera); },
    setLooping(on) { looping = on; },
    // Low wet pocket: lowest 15 % of parcel cells by lidar height (field.pocket); false until ready.
    isPocket: (row, col) => H[cellOk(row, col)] <= field.pocket.height_max_m && !!data.height,
    size: N,
    // The pitch deck sets controls.autoRotate on these; the render loop already calls controls.update().
    camera, controls,
  };
}
