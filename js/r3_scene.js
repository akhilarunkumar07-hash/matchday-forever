/* r3_scene.js - the 3D stadium: renderer, lights, pitch, goals, stands, ad boards, floodlights.
   Units: 1 scene unit = 1 metre. Scene X = (world x - W/2) / 10, scene Z = (world y - H/2) / 10, Y is up. */
(function () {
  const G = window.G, T = THREE, R = (G.R3 = G.R3 || {});
  const { W, H, GOAL, BOX, SIX } = G;
  R.toX = (wx) => (wx - W / 2) / 10;
  R.toZ = (wy) => (wy - H / 2) / 10;

  function canvasTex(c, rx, ry) {
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    if (rx) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry || 1); }
    return t;
  }
  R.canvasTex = canvasTex;

  /* ---------- pitch: grass stripes and white lines painted on one big texture ---------- */
  function pitchTexture() {
    const M = 10, K = 16, pw = 105 + 2 * M, ph = 68 + 2 * M; // margin in metres, pixels per metre
    const c = document.createElement('canvas'); c.width = pw * K; c.height = ph * K;
    const x = c.getContext('2d'), rnd = G.rng(5);
    for (let i = 0; i * 5 < pw; i++) { x.fillStyle = i % 2 ? '#2c8444' : '#34944c'; x.fillRect(i * 5 * K, 0, 5 * K + 1, c.height); }
    for (let i = 0; i < 42000; i++) { // grass blades
      x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
      x.fillRect(rnd() * c.width, rnd() * c.height, 1 + rnd() * 2, 2 + rnd() * 7);
    }
    for (let i = 0; i * 5 < ph; i++) { x.fillStyle = i % 2 ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.03)'; x.fillRect(0, i * 5 * K, c.width, 5 * K); } // cross mowing
    x.save(); x.translate(M * K, M * K); x.scale(K / 10, K / 10); // from here on, draw in world units
    x.strokeStyle = 'rgba(247,247,240,0.95)'; x.lineWidth = 1.8; x.lineCap = 'round';
    x.strokeRect(0, 0, W, H);
    x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();
    x.beginPath(); x.arc(W / 2, H / 2, G.CIRC, 0, 6.283); x.stroke();
    x.fillStyle = 'rgba(247,247,240,0.95)'; x.beginPath(); x.arc(W / 2, H / 2, 2.4, 0, 6.283); x.fill();
    const a = Math.acos((BOX.d - G.SPOT) / G.CIRC), by = (H - BOX.w) / 2, sy = (H - SIX.w) / 2;
    x.strokeRect(0, by, BOX.d, BOX.w); x.strokeRect(0, sy, SIX.d, SIX.w);
    x.strokeRect(W - BOX.d, by, BOX.d, BOX.w); x.strokeRect(W - SIX.d, sy, SIX.d, SIX.w);
    [G.SPOT, W - G.SPOT].forEach((sx) => { x.beginPath(); x.arc(sx, H / 2, 2.4, 0, 6.283); x.fill(); });
    x.beginPath(); x.arc(G.SPOT, H / 2, G.CIRC, -a, a); x.stroke();
    x.beginPath(); x.arc(W - G.SPOT, H / 2, G.CIRC, Math.PI - a, Math.PI + a); x.stroke();
    [[0, 0, 0], [W, 0, Math.PI / 2], [W, H, Math.PI], [0, H, -Math.PI / 2]].forEach(([cx, cy, s]) => { x.beginPath(); x.arc(cx, cy, 10, s, s + Math.PI / 2); x.stroke(); });
    x.restore();
    return { tex: canvasTex(c), w: pw, h: ph };
  }

  /* ---------- goals ---------- */
  function netTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3;
    x.strokeRect(0, 0, 64, 64);
    return canvasTex(c, 1, 1);
  }

  function bar(a, b, r, mat) { // a cylinder between two points
    const dir = new T.Vector3().subVectors(b, a), len = dir.length();
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 8), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    return m;
  }

  function tri(pts, mat) { // a net triangle; uv in metres so the mesh cells stay square
    const g = new T.BufferGeometry(), pos = [], uv = [];
    pts.forEach((p) => { pos.push(p[0], p[1], p[2]); uv.push((p[0] + p[2]) * 6, p[1] * 6); });
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(uv), 2));
    return new T.Mesh(g, mat);
  }

  function makeGoal(netMat) {
    const g = new T.Group(), white = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.2 });
    const hw = GOAL.w / 20, hh = GOAL.h / 10, d = GOAL.depth / 10, V = (x, y, z) => new T.Vector3(x, y, z);
    g.add(bar(V(0, 0, -hw), V(0, hh, -hw), 0.065, white), bar(V(0, 0, hw), V(0, hh, hw), 0.065, white), bar(V(0, hh, -hw - 0.065), V(0, hh, hw + 0.065), 0.065, white));
    g.add(bar(V(0, hh, -hw), V(d, 0.05, -hw), 0.04, white), bar(V(0, hh, hw), V(d, 0.05, hw), 0.04, white), bar(V(d, 0.05, -hw), V(d, 0.05, hw), 0.04, white));
    g.add(tri([[0, 0, -hw], [0, hh, -hw], [d, 0, -hw]], netMat), tri([[0, 0, hw], [0, hh, hw], [d, 0, hw]], netMat));
    const back = tri([[0, hh, -hw], [d, 0, -hw], [d, 0, hw]], netMat), back2 = tri([[0, hh, -hw], [d, 0, hw], [0, hh, hw]], netMat);
    g.add(back, back2);
    return g;
  }

  /* ---------- crowd, ad boards ---------- */
  function crowdTexture() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    const x = c.getContext('2d'), r = G.rng(21), cols = ['#d94a3a', '#f2f0e6', '#ffd23f', '#3b6fd6', '#9aa0a8', '#2fb7ff', '#e8452c'];
    x.fillStyle = '#0f1a15'; x.fillRect(0, 0, 1024, 256);
    for (let row = 0; row < 20; row++) {
      x.fillStyle = row % 2 ? '#16251e' : '#122019'; x.fillRect(0, row * 13, 1024, 13);
      for (let i = 0; i < 90; i++) {
        const px = (i + r() * 0.6) * 11.5, py = row * 13 + 7;
        x.fillStyle = cols[(r() * cols.length) | 0]; x.globalAlpha = 0.55 + r() * 0.4;
        x.beginPath(); x.arc(px, py + 1.5, 3.6, 0, 6.283); x.fill(); // body
        x.fillStyle = '#e0ac7e'; x.beginPath(); x.arc(px, py - 3, 2.2, 0, 6.283); x.fill(); // head
      }
    }
    x.globalAlpha = 1;
    return canvasTex(c, 5, 1);
  }

  function adTexture() {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 64;
    const x = c.getContext('2d'), cols = ['#ffd23f', '#2f7bff', '#e8452c', '#f2f0e6', '#35d07f'], txt = ['MATCHDAY XI', 'REAL MADNESS', 'BAYERN MUNCHIES', 'PLAY FAIR', 'SPOT KICK'];
    for (let i = 0; i < 5; i++) {
      x.fillStyle = cols[i]; x.fillRect(i * 410, 0, 410, 64);
      x.fillStyle = i === 3 || i === 0 ? '#14201a' : '#ffffff';
      x.font = '800 40px "Big Shoulders Display", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(txt[i], i * 410 + 205, 34);
    }
    return canvasTex(c);
  }


  /* ---------- tiered stands full of animated fans ---------- */
  const fanSets = [];
  R.cheerLevel = 0;
  function buildStands(scene) {
    const concrete = new T.MeshBasicMaterial({ color: 0x353d45 }), roofMat = new T.MeshBasicMaterial({ color: 0x1a2026 }), lampMat = new T.MeshBasicMaterial({ color: 0xfff6d6 });
    const rnd = G.rng(77), RD = 0.85, RH = 0.62, BASE = 0.8;
    const shirts = [0xd94a3a, 0xf2f0e6, 0xffd23f, 0x3b6fd6, 0x9aa0a8, 0x2fb7ff, 0xe8452c, 0x2fa86a, 0x1b1f24];
    const skins = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a21];
    const defs = [
      { rot: Math.PI / 2, ox: 0, oz: -41, len: 124, rows: 15 }, { rot: -Math.PI / 2, ox: 0, oz: 41, len: 124, rows: 15 },
      { rot: 0, ox: 61, oz: 0, len: 84, rows: 11 }, { rot: Math.PI, ox: -61, oz: 0, len: 84, rows: 11 },
    ];
    defs.forEach((d) => {
      const g = new T.Group(); g.rotation.y = d.rot; g.position.set(d.ox, 0, d.oz);
      const pts = [[0, 0]];
      for (let r = 0; r < d.rows; r++) pts.push([r * RD, BASE + r * RH], [(r + 1) * RD, BASE + r * RH]);
      pts.push([d.rows * RD, 0]);
      const shape = new T.Shape(); shape.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((q) => shape.lineTo(q[0], q[1]));
      const geo = new T.ExtrudeGeometry(shape, { depth: d.len, bevelEnabled: false }); geo.translate(0, 0, -d.len / 2);
      g.add(new T.Mesh(geo, concrete));
      // fans
      const spots = [];
      for (let r = 0; r < d.rows; r++) for (let z = -d.len / 2 + 0.5; z < d.len / 2 - 0.4; z += 0.72) {
        if (rnd() < 0.08) continue;
        spots.push([r * RD + RD * 0.5 + (rnd() - 0.5) * 0.15, BASE + r * RH, z + (rnd() - 0.5) * 0.2, rnd() * 6.28, r]);
      }
      const bodyGeo = new T.BoxGeometry(0.36, 0.55, 0.5); bodyGeo.translate(0, 0.42, 0);
      const headGeo = new T.IcosahedronGeometry(0.15, 0); headGeo.translate(0, 0.88, 0);
      const bodies = new T.InstancedMesh(bodyGeo, new T.MeshBasicMaterial(), spots.length), heads = new T.InstancedMesh(headGeo, new T.MeshBasicMaterial(), spots.length);
      const col = new T.Color(), dim = (r) => 0.55 + 0.45 * (1 - r / d.rows);
      const dummy = new T.Object3D();
      spots.forEach((sp, i) => {
        dummy.position.set(sp[0], sp[1], sp[2]); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix); heads.setMatrixAt(i, dummy.matrix);
        col.setHex(shirts[(rnd() * shirts.length) | 0]).multiplyScalar(dim(sp[4])); bodies.setColorAt(i, col);
        col.setHex(skins[(rnd() * skins.length) | 0]).multiplyScalar(dim(sp[4])); heads.setColorAt(i, col);
      });
      g.add(bodies, heads);
      fanSets.push({ bodies, heads, spots, dummy });
      // roof and lights
      const top = BASE + d.rows * RH, depth = d.rows * RD;
      const roof = new T.Mesh(new T.BoxGeometry(depth * 0.7 + 3, 0.4, d.len + 6), roofMat); roof.position.set(depth * 0.55 + 1, top + 5.5, 0); roof.rotation.z = 0.08; g.add(roof);
      const strip = new T.Mesh(new T.BoxGeometry(0.25, 0.18, d.len), lampMat); strip.position.set(depth * 0.2 - 0.4, top + 5.2, 0); g.add(strip);
      const wall = new T.Mesh(new T.BoxGeometry(0.5, top + 7, d.len + 6), roofMat); wall.position.set(depth + 0.4, (top + 7) / 2, 0); g.add(wall);
      if (d.rot === -Math.PI / 2) { roof.visible = wall.visible = strip.visible = false; } // the stand nearest the camera must never block the view
      scene.add(g);
    });
  }
  // jumping fans when the crowd cheers (called every frame; cheap when quiet)
  let crowdWasLive = false;
  R.updateCrowd = function (t) {
    const c = R.cheerLevel;
    if (c < 0.03 && !crowdWasLive) return;
    crowdWasLive = c >= 0.03;
    fanSets.forEach((f) => {
      f.spots.forEach((sp, i) => {
        const j = c >= 0.03 ? Math.max(0, Math.sin(t * 9 + sp[3] * 3)) * 0.38 * Math.min(1, c) : 0;
        f.dummy.position.set(sp[0], sp[1] + j, sp[2]); f.dummy.updateMatrix();
        f.bodies.setMatrixAt(i, f.dummy.matrix); f.heads.setMatrixAt(i, f.dummy.matrix);
      });
      f.bodies.instanceMatrix.needsUpdate = f.heads.instanceMatrix.needsUpdate = true;
    });
  };

  /* ---------- corner flags, dugouts, sky glow ---------- */
  function buildExtras(scene) {
    const pole = new T.MeshBasicMaterial({ color: 0xf4f4f4 }), flag = new T.MeshBasicMaterial({ color: 0xffd23f, side: T.DoubleSide });
    [[-52.5, -34], [52.5, -34], [-52.5, 34], [52.5, 34]].forEach(([x, z]) => {
      const p = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.6, 6), pole); p.position.set(x, 0.8, z);
      const f = new T.Mesh(new T.PlaneGeometry(0.45, 0.3), flag); f.position.set(x + (x < 0 ? 0.22 : -0.22), 1.45, z);
      scene.add(p, f);
    });
    const glass = new T.MeshBasicMaterial({ color: 0x20303a, transparent: true, opacity: 0.8 }), bench = new T.MeshBasicMaterial({ color: 0x8a949c });
    [-14, 14].forEach((x) => {
      const roofB = new T.Mesh(new T.BoxGeometry(10, 0.15, 2.4), glass); roofB.position.set(x, 2.1, -37.3);
      const back = new T.Mesh(new T.BoxGeometry(10, 2, 0.1), glass); back.position.set(x, 1.05, -38.5);
      const seat = new T.Mesh(new T.BoxGeometry(9, 0.2, 0.7), bench); seat.position.set(x, 0.45, -37.8);
      scene.add(roofB, back, seat);
    });
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const x = c.getContext('2d'), grd = x.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#04070c'); grd.addColorStop(0.6, '#0c1a2a'); grd.addColorStop(1, '#1d3550');
    x.fillStyle = grd; x.fillRect(0, 0, 4, 256);
    scene.background = new T.CanvasTexture(c);
  }

  R.init = function (canvas) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene();
    scene.fog = new T.Fog(0x0a1420, 120, 320);
    const camera = new T.PerspectiveCamera(34, 16 / 9, 0.5, 600);

    scene.add(new T.HemisphereLight(0xbfd4ff, 0x244a2e, 0.75));
    const sun = new T.DirectionalLight(0xfff2dc, 1.1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 5, far: 170 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    const pt = pitchTexture();
    const pitch = new T.Mesh(new T.PlaneGeometry(pt.w, pt.h), new T.MeshStandardMaterial({ map: pt.tex, roughness: 0.95, metalness: 0 }));
    pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; scene.add(pitch);
    const ground = new T.Mesh(new T.PlaneGeometry(700, 600), new T.MeshBasicMaterial({ color: 0x0c1a12 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);

    const netMat = new T.MeshBasicMaterial({ map: netTexture(), transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false });
    const gR = makeGoal(netMat), gL = makeGoal(netMat);
    gR.position.x = 52.5; gL.position.x = -52.5; gL.rotation.y = Math.PI;
    scene.add(gR, gL);

    buildStands(scene);
    buildExtras(scene);

    const ad = new T.MeshBasicMaterial({ map: adTexture() });
    [[0, 38, 105], [Math.PI / 2, 57.5, 68], [-Math.PI / 2, 57.5, 68]].forEach(([ry, dist, width]) => {
      const holder = new T.Group(); holder.rotation.y = ry;
      const m = new T.Mesh(new T.PlaneGeometry(width, 1.3), ad); m.position.set(0, 0.65, -dist);
      holder.add(m); scene.add(holder);
    });

    const lamp = new T.MeshBasicMaterial({ color: 0xfffbe8 }), pole = new T.MeshBasicMaterial({ color: 0x1b252b });
    [[-66, -48], [66, -48], [-66, 48], [66, 48]].forEach(([x, z]) => {
      const p = new T.Mesh(new T.CylinderGeometry(0.5, 0.8, 34, 8), pole); p.position.set(x, 17, z);
      const panel = new T.Mesh(new T.BoxGeometry(8, 5, 0.6), lamp); panel.position.set(x, 35, z); panel.lookAt(0, 20, 0);
      scene.add(p, panel);
    });

    Object.assign(R, { renderer, scene, camera, sun });
    return R;
  };
})();
