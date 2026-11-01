/* illegal_view.js - draws Illegal Soccer in 3D (figures with blasters, pickups, bullets, explosions) plus a crisp 2D HUD on top. */
(function () {
  const G = window.G, T = THREE, R = G.R3, IL = G.il, W = G.W, H = G.H;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PRESETS = [{ back: 22, up: 14.5, fov: 38, name: 'Action' }, { back: 32, up: 21, fov: 36, name: 'Wide' }, { back: 13, up: 9, fov: 44, name: 'Close' }];
  let figs = [], ball = null, built = false, camMode = 0, shake = 0, started = false;
  let rings = [], crateMeshes = new Map(), bulletPool = [], fxPool = [], ringPool = [], markers = [], floaters = [], glowTex = null, smokeTex = null;
  const look = new T.Vector3(), lookT = new T.Vector3(), focus = new T.Vector3(), want = new T.Vector3(), camGoal = new T.Vector3(), v3 = new T.Vector3();
  const COL = { spray: 0xffe14a, boom: 0xff9a3d, snipe: 0xff4d6d, rocket: 0xff6a1a, boing: 0xb36bff, blaster: 0x7fd6ff, medkit: 0x3be08a, boots: 0xffd23f };
  const NAME = { spray: 'Spray SMG', boom: 'Boomstick', snipe: 'Longshot', rocket: 'Rocketeer', boing: 'Boing Cannon', blaster: 'Blaster', medkit: 'Medkit', boots: 'Speed boots' };
  const hex = (c) => '#' + ('000000' + c.toString(16)).slice(-6);

  R.ilNextCam = () => { camMode = (camMode + 1) % PRESETS.length; return PRESETS[camMode].name; };

  function radial(inner, outer) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, inner); g.addColorStop(0.35, outer); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new T.CanvasTexture(c); return t;
  }
  const std = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.45, metalness: 0.25 }, o || {}));
  const shade = (m) => { m.castShadow = true; return m; };

  /* ---------- weapon models: the barrel points along -Y so it lines up with a raised arm ---------- */
  function makeGun(id) {
    const g = new T.Group(), col = COL[id] || 0x7fd6ff, dark = std(0x23272e), acc = std(col, { emissive: col, emissiveIntensity: 0.55, metalness: 0.1 });
    const cyl = (r, len, mat, y, x, z) => { const m = shade(new T.Mesh(new T.CylinderGeometry(r, r, len, 10), mat)); m.position.set(x || 0, y, z || 0); g.add(m); return m; };
    const box = (w, h, d, mat, x, y, z) => { const m = shade(new T.Mesh(new T.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); g.add(m); return m; };
    if (id === 'blaster') { box(0.08, 0.26, 0.06, dark, 0, -0.13, 0); cyl(0.022, 0.18, acc, -0.33); box(0.09, 0.07, 0.045, dark, -0.07, -0.05, 0); box(0.03, 0.12, 0.062, acc, 0.045, -0.14, 0); }
    else if (id === 'spray') { box(0.09, 0.34, 0.07, dark, 0, -0.17, 0); cyl(0.02, 0.14, acc, -0.41); box(0.05, 0.12, 0.05, dark, -0.09, -0.2, 0); box(0.09, 0.07, 0.045, dark, -0.07, -0.04, 0); box(0.02, 0.2, 0.072, acc, 0.05, -0.18, 0); }
    else if (id === 'boom') { cyl(0.032, 0.5, dark, -0.27, 0, -0.03); cyl(0.032, 0.5, dark, -0.27, 0, 0.03); box(0.07, 0.18, 0.09, std(0x8a5a2b, { metalness: 0 }), -0.02, -0.04, 0); cyl(0.034, 0.05, acc, -0.53, 0, -0.03); cyl(0.034, 0.05, acc, -0.53, 0, 0.03); }
    else if (id === 'snipe') { cyl(0.02, 0.7, dark, -0.34); box(0.07, 0.26, 0.055, dark, 0, -0.1, 0); const sc = cyl(0.03, 0.2, acc, -0.2, 0.07); box(0.05, 0.06, 0.05, dark, -0.06, -0.03, 0); sc.rotation.z = 0; cyl(0.014, 0.05, acc, -0.7); }
    else if (id === 'rocket') { cyl(0.065, 0.62, std(0x4d5560), -0.28); cyl(0.075, 0.1, acc, -0.6); cyl(0.07, 0.07, dark, 0.04); box(0.05, 0.08, 0.05, dark, -0.1, -0.2, 0); }
    else if (id === 'boing') { cyl(0.07, 0.36, acc, -0.2); [-0.08, -0.18, -0.28].forEach((y) => { const r = shade(new T.Mesh(new T.TorusGeometry(0.075, 0.016, 8, 16), dark)); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }); cyl(0.095, 0.05, dark, -0.4); box(0.08, 0.08, 0.05, dark, -0.1, -0.03, 0); }
    return g;
  }

  /* ---------- pickups ---------- */
  function makeCrate(c) {
    const g = new T.Group(), col = COL[c.type] || 0xffffff;
    const pad = new T.Mesh(new T.CylinderGeometry(0.85, 0.95, 0.08, 24), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55 })); pad.position.y = 0.05; g.add(pad);
    const ring = new T.Mesh(new T.RingGeometry(0.95, 1.15, 28), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
    const beam = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 4.2, 18, 1, true), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); beam.position.y = 2.1; g.add(beam);
    const item = new T.Group();
    if (c.type === 'medkit') {
      const b = shade(new T.Mesh(new T.BoxGeometry(0.8, 0.6, 0.8), std(0xf4f4f0, { metalness: 0 }))); item.add(b);
      const r1 = new T.Mesh(new T.BoxGeometry(0.62, 0.62, 0.2), new T.MeshBasicMaterial({ color: 0xe23b3b })), r2 = new T.Mesh(new T.BoxGeometry(0.2, 0.62, 0.62), new T.MeshBasicMaterial({ color: 0xe23b3b })); item.add(r1, r2);
    } else if (c.type === 'boots') {
      [-0.22, 0.22].forEach((z) => { const s = shade(new T.Mesh(new T.BoxGeometry(0.7, 0.3, 0.3), std(0xffd23f, { emissive: 0xffa800, emissiveIntensity: 0.5 }))); s.position.set(0, 0, z); item.add(s); const w = new T.Mesh(new T.BoxGeometry(0.1, 0.6, 0.04), new T.MeshBasicMaterial({ color: 0xffffff })); w.position.set(-0.3, 0.3, z); item.add(w); });
    } else { const gun = makeGun(c.type); gun.scale.setScalar(2.1); gun.rotation.z = -Math.PI / 2; gun.position.x = 0.5; item.add(gun); }
    item.position.y = 1.5; g.add(item); g.userData = { item, beam, ring, pad };
    R.scene.add(g); return g;
  }

  /* ---------- effects pool ---------- */
  function fx(x, y, z, col, vx, vy, vz, life, s0, s1, kind, g) {
    let f = fxPool.find((q) => !q.live); if (!f) return;
    f.live = true; f.t = 0; f.life = life; f.vx = vx; f.vy = vy; f.vz = vz; f.s0 = s0; f.s1 = s1; f.g = g || 0; f.kind = kind || 'glow';
    const m = f.spr.material; m.map = kind === 'smoke' ? smokeTex : glowTex; m.color.setHex(col); m.blending = kind === 'smoke' ? T.NormalBlending : T.AdditiveBlending; m.opacity = 1; m.needsUpdate = true;
    f.spr.position.set(R.toX(x), z, R.toZ(y)); f.spr.scale.setScalar(s0); f.spr.visible = true;
  }
  const burst = (x, y, z, col, n, sp, life, size) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, u = Math.random(), e = (Math.random() - 0.2) * 1.2; fx(x, y, z, col, Math.cos(a) * sp * u * 10, Math.sin(a) * sp * u * 10, e * sp * 0.6, life * (0.6 + Math.random() * 0.6), size, size * 0.2, 'glow', 6); } };
  function ringFx(x, y, col, r) {
    const q = ringPool.find((k) => !k.live); if (!q) return;
    q.live = true; q.t = 0; q.r = r; q.mesh.material.color.setHex(col); q.mesh.position.set(R.toX(x), 0.12, R.toZ(y)); q.mesh.visible = true;
  }

  R.ilBuild = function () {
    R.ilDestroy();
    glowTex = radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.45)'); smokeTex = radial('rgba(60,60,64,0.85)', 'rgba(70,70,74,0.4)');
    figs = IL.players.map((p) => {
      const t = G.TEAMS[p.team];
      const f = R.makeFigure({ beard: p.look.beard, face: p.look.f, seed: 1 + ((p.name.length * 7 + p.num * 13 + p.team * 29) | 0), shirt: t.color, shorts: t.shorts, socks: t.socks, skin: p.look.skin, hair: p.look.hair, style: p.look.style, num: p.num, numColor: t.trim });
      f.guns = {}; f.gunId = ''; f.aimAmt = 0; f.hidden = false; f.grey = 0;
      if (IL.tac) { // own copy of every material so a stunned player can turn grey without touching the others
        f.mats = [];
        f.root.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) { o.material = o.material.clone(); f.mats.push({ m: o.material, c: o.material.color ? o.material.color.clone() : null, tr: o.material.transparent, op: o.material.opacity }); } });
      }
      R.scene.add(f.root); return f;
    });
    ball = R.makeBall(); R.scene.add(ball.mesh, ball.blob);
    rings = IL.tac ? IL.players.map(() => { const m = new T.Mesh(new T.RingGeometry(0.62, 0.84, 36), new T.MeshBasicMaterial({ color: 0x3b9bff, transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.07; R.scene.add(m); return m; }) : [];
    bulletPool = []; for (let i = 0; i < 100; i++) {
      const g = new T.Group(), core = new T.Mesh(new T.BoxGeometry(1, 0.07, 0.07), new T.MeshBasicMaterial({ color: 0xffffff })), halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
      halo.scale.setScalar(0.7); g.add(core, halo); g.visible = false; g.userData = { core, halo }; R.scene.add(g); bulletPool.push(g);
    }
    fxPool = []; for (let i = 0; i < 260; i++) { const spr = new T.Sprite(new T.SpriteMaterial({ map: glowTex, depthWrite: false, transparent: true })); spr.visible = false; R.scene.add(spr); fxPool.push({ spr, live: false, t: 0, life: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, g: 0, kind: 'glow' }); }
    ringPool = []; for (let i = 0; i < 6; i++) { const mesh = new T.Mesh(new T.RingGeometry(0.9, 1, 40), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })); mesh.rotation.x = -Math.PI / 2; mesh.visible = false; R.scene.add(mesh); ringPool.push({ mesh, live: false, t: 0, r: 100 }); }
    markers = [0xffd23f, 0xff5ec4].map((col) => {
      const ring = new T.Mesh(new T.RingGeometry(0.75, 1, 32), new T.MeshBasicMaterial({ color: col, transparent: true, side: T.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
      const arrow = new T.Mesh(new T.ConeGeometry(0.22, 0.5, 10), new T.MeshBasicMaterial({ color: col })); arrow.rotation.x = Math.PI;
      R.scene.add(ring, arrow); return { ring, arrow };
    });
    crateMeshes = new Map(); floaters = []; shake = 0; started = false; built = true;
    R.setMatchVisible(false);
  };

  R.ilDestroy = function () {
    if (!built) return;
    figs.forEach((f) => R.scene.remove(f.root)); figs = [];
    if (ball) { R.scene.remove(ball.mesh, ball.blob); ball = null; }
    crateMeshes.forEach((g) => R.scene.remove(g)); crateMeshes = new Map();
    bulletPool.forEach((g) => R.scene.remove(g)); fxPool.forEach((f) => R.scene.remove(f.spr)); ringPool.forEach((r) => R.scene.remove(r.mesh));
    markers.forEach((m) => R.scene.remove(m.ring, m.arrow)); markers = []; rings.forEach((m) => R.scene.remove(m)); rings = []; bulletPool = []; fxPool = []; ringPool = [];
    built = false; R.setMatchVisible(true);
  };

  /* ---------- events from the game logic ---------- */
  function handleEvents(evs) {
    for (const e of evs) {
      if (e.k === 'muzzle') {
        const p = e.p, c = COL[e.w];
        fx(p.x + e.ax * 11, p.y + e.ay * 11, 11, c, 0, 0, 0, 0.08, 1.1, 0.2, 'glow'); fx(p.x + e.ax * 14, p.y + e.ay * 14, 11, 0xffffff, 0, 0, 0, 0.05, 0.6, 0.1, 'glow');
        if (e.w === 'rocket' || e.w === 'boom' || e.w === 'snipe') { shake = Math.max(shake, 0.25); burst(p.x + e.ax * 14, p.y + e.ay * 14, 11, 0xffd9a0, 6, 5, 0.3, 0.35); }
      } else if (e.k === 'bulletEnd') { if (e.w !== 'rocket' && e.w !== 'boing') burst(e.x, e.y, 10, COL[e.w] || 0xffffff, 4, 3, 0.25, 0.3); }
      else if (e.k === 'stun') { burst(e.p.x, e.p.y, 10, 0xcfd6e0, 10, 5, 0.5, 0.4); floaters.push({ x: e.p.x, y: e.p.y, z: 2.6, txt: 'STUNNED', col: '#cfd6e0', t: 1.2, big: true }); shake = Math.max(shake, 0.15); }
      else if (e.k === 'loose') { burst(e.p.x, e.p.y, 3, 0xffffff, 4, 3, 0.3, 0.3); floaters.push({ x: e.p.x, y: e.p.y, z: 2.4, txt: 'LOOSE BALL', col: '#ffd23f', t: 0.9, big: false }); }
      else if (e.k === 'sparks') burst(e.x, e.y, 3, e.col, 6, 4, 0.3, 0.3);
      else if (e.k === 'hit') {
        burst(e.p.x, e.p.y, 12, 0xffffff, 7, 5, 0.3, 0.32); burst(e.p.x, e.p.y, 12, COL[e.p.wpn.id] || 0xffd23f, 4, 4, 0.3, 0.3);
        if (e.dmg > 0) floaters.push({ x: e.p.x, y: e.p.y, z: 2.4, txt: String(e.dmg), col: e.dmg >= 30 ? '#ff5a4a' : '#fff6c8', t: 0.9, big: e.dmg >= 30 });
      } else if (e.k === 'boom') {
        const c = e.w === 'boing' ? 0xb36bff : 0xff8a2a;
        fx(e.x, e.y, 6, 0xfff2c0, 0, 0, 0, 0.35, 3, e.r / 8, 'glow'); fx(e.x, e.y, 6, c, 0, 0, 0, 0.55, 4, e.r / 5.5, 'glow');
        burst(e.x, e.y, 8, c, 22, 14, 0.7, 0.55); for (let i = 0; i < 7; i++) fx(e.x + (Math.random() - 0.5) * 40, e.y + (Math.random() - 0.5) * 40, 6, 0x444448, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 8 + Math.random() * 10, 1.1, 2.2, 5.5, 'smoke', -3);
        ringFx(e.x, e.y, c, e.r); shake = Math.max(shake, e.w === 'boing' ? 0.5 : 0.9);
      } else if (e.k === 'elim') { burst(e.p.x, e.p.y, 10, 0xffffff, 12, 8, 0.6, 0.5); shake = Math.max(shake, 0.3); }
      else if (e.k === 'respawn') { ringFx(e.p.x, e.p.y, G.TEAMS[e.p.team].color ? parseInt(G.TEAMS[e.p.team].color.replace('#', ''), 16) : 0xffffff, 60); burst(e.p.x, e.p.y, 5, 0xffffff, 14, 10, 0.6, 0.4); }
      else if (e.k === 'pick') { burst(e.x, e.y, 10, COL[e.type] || 0xffffff, 16, 10, 0.7, 0.45); floaters.push({ x: e.x, y: e.y, z: 3, txt: NAME[e.type], col: hex(COL[e.type] || 0xffffff), t: 1.3, big: true }); }
      else if (e.k === 'crate') { burst(e.x, e.y, 20, COL[e.type], 10, 6, 0.6, 0.45); }
      else if (e.k === 'kick') { burst(IL.ball.x, IL.ball.y, 2, 0xffffff, 4, 3, 0.25, 0.3); }
      else if (e.k === 'dash') { burst(e.p.x, e.p.y, 2, 0xd8e8d0, 6, 5, 0.4, 0.4); }
      else if (e.k === 'bash') { burst(e.q.x, e.q.y, 10, 0xffffff, 10, 7, 0.4, 0.4); shake = Math.max(shake, 0.2); }
      else if (e.k === 'ballhit') { burst(e.p.x, e.p.y, 12, 0xffffff, 8, 6, 0.4, 0.35); }
      else if (e.k === 'goal') { R.confetti(e.team === 0 ? W : 0); shake = Math.max(shake, 0.4); }
    }
  }

  /* ---------- the frame ---------- */
  const proj = (x, y, z, w, h) => { v3.set(R.toX(x), z, R.toZ(y)).project(R.camera); return v3.z > 1 ? null : [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h]; };

  R.ilRender = function (dt, evs, ctx, cw, ch) {
    if (!built) return;
    handleEvents(evs);
    const t = performance.now() / 1000, b = IL.ball;
    // figures
    IL.players.forEach((p, i) => {
      const f = figs[i], A = f.arms, hide = p.dead > 0 && p.dead < 1.85;
      if (hide && !f.hidden) { burst(p.x, p.y, 8, 0xffffff, 10, 6, 0.5, 0.45); for (let k = 0; k < 4; k++) fx(p.x, p.y, 8, 0x888890, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 6, 0.8, 1.2, 3.5, 'smoke', -2); }
      f.hidden = hide; f.root.visible = !hide && (IL.tac || !(p.inv > 0 && Math.floor(t * 14) % 2 === 0));
      const celeb = IL.phase === 'goal' && IL.scorer === p && IL.phaseT > 0.1;
      if (IL.tac && f.mats) { // stunned: semi-transparent grey, no flashing
        const g = p.stunT > 0 ? 1 : 0; if (g !== f.grey) { f.grey = g; for (const q of f.mats) { if (q.c) q.m.color.copy(q.c).lerp(new T.Color(0x8a9099), g ? 0.7 : 0); q.m.transparent = g ? true : q.tr; q.m.opacity = g ? 0.5 : q.op; q.m.needsUpdate = true; } }
        const rg = rings[i]; if (rg) { rg.visible = f.root.visible; rg.position.set(R.toX(p.x), 0.07, R.toZ(p.y)); const carrier = b.owner === p; rg.material.color.setHex(carrier ? 0xffd23f : p.team === 0 ? 0x3b9bff : 0xff4a4a); rg.scale.setScalar(carrier ? 1.25 + Math.sin(t * 6) * 0.04 : 1); rg.material.opacity = g ? 0.45 : 0.95; }
      }
      R.poseFigure(f, p, celeb ? 'celebrate' : '', celeb ? { t: IL.phaseT, id: p.celeb } : undefined);
      if (p.wpn.id !== f.gunId) { if (f.guns[f.gunId]) f.guns[f.gunId].visible = false; if (!f.guns[p.wpn.id]) { const g = makeGun(p.wpn.id); g.position.set(0, -0.27, 0); A[1].fore.add(g); f.guns[p.wpn.id] = g; } f.guns[p.wpn.id].visible = true; f.gunId = p.wpn.id; }
      f.aimAmt += ((p.aimT > 0 ? 1 : 0) - f.aimAmt) * Math.min(1, dt * 12);
      if (!celeb && p.fallT <= 0 && p.slideT <= 0) {
        const ang = 0.5 + 1.0 * f.aimAmt; A[1].sh.rotation.z = ang; A[1].fore.rotation.z = 0.1 * (1 - f.aimAmt); A[0].sh.rotation.z = ang - 0.12 + (1 - f.aimAmt) * Math.sin(p.anim * 1.5) * 0.35; A[0].fore.rotation.z = 0.15;
        if (f.aimAmt > 0.5) f.body.rotation.z = -0.08;
      }
      f.guns[f.gunId].visible = !celeb && p.fallT <= 0 && !hide;
    });
    R.poseBall(ball, b, dt);
    // control markers
    markers.forEach((M, ti) => {
      const c = IL.ctrl[ti], show = IL.humans[ti] && c && c.dead <= 0 && IL.phase !== 'goal';
      M.ring.visible = M.arrow.visible = !!show; if (!show) return;
      const x = R.toX(c.x), z = R.toZ(c.y);
      M.ring.position.set(x, 0.06, z); M.arrow.position.set(x, 2.75 + Math.sin(t * 5) * 0.1, z);
    });
    // pickups
    const seen = new Set();
    for (const c of IL.crates) {
      seen.add(c.id); let g = crateMeshes.get(c.id); if (!g) { g = makeCrate(c); crateMeshes.set(c.id, g); g.position.set(R.toX(c.x), 0, R.toZ(c.y)); }
      const u = g.userData, k = Math.min(1, c.t * 2.2); g.scale.set(k, k, k); u.item.rotation.y = t * 1.8 + c.x; u.item.position.y = 1.55 + Math.sin(t * 2.4 + c.y) * 0.18; u.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    }
    crateMeshes.forEach((g, id) => { if (!seen.has(id)) { R.scene.remove(g); crateMeshes.delete(id); } });
    // bullets
    bulletPool.forEach((g, i) => {
      const u = IL.bullets[i]; if (!u) { g.visible = false; return; }
      const w = G.il.WEAP[u.w], len = (u.w === 'rocket' ? 0.6 : u.w === 'snipe' ? 3 : u.w === 'boing' ? 0.4 : 0.9) * (IL.tac ? 1.8 : 1);
      g.visible = true; g.position.set(R.toX(u.x), 1.1, R.toZ(u.y)); g.rotation.y = -Math.atan2(u.vy, u.vx);
      g.userData.core.scale.set(len, u.w === 'rocket' || u.w === 'boing' ? 3.2 : 1, u.w === 'rocket' || u.w === 'boing' ? 3.2 : 1); g.userData.core.material.color.setHex(u.w === 'blaster' ? 0xe8fbff : 0xffffff);
      g.userData.halo.material.color.setHex(w.col); g.userData.halo.scale.setScalar(u.w === 'rocket' ? 1.5 : u.w === 'boing' ? 1.3 : 0.75);
      if (u.w === 'rocket' || u.w === 'boing') { u.trail -= dt; if (u.trail <= 0) { u.trail = 0.025; fx(u.x, u.y, 11, u.w === 'rocket' ? 0xffa040 : 0xc99bff, 0, 0, 0, 0.3, 0.9, 0.1, 'glow'); if (u.w === 'rocket') fx(u.x, u.y, 11, 0x555560, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 3, 0.7, 0.7, 1.9, 'smoke', 0); } }
    });
    // effects
    for (const f of fxPool) {
      if (!f.live) continue;
      f.t += dt; const u = f.t / f.life;
      if (u >= 1) { f.live = false; f.spr.visible = false; continue; }
      f.vz -= f.g * dt; const p = f.spr.position; p.x += f.vx * dt / 10 * 1; p.z += f.vy * dt / 10; p.y = Math.max(0.05, p.y + f.vz * dt / 10 * 1);
      f.spr.scale.setScalar(f.s0 + (f.s1 - f.s0) * u); f.spr.material.opacity = f.kind === 'smoke' ? 0.55 * (1 - u) : (1 - u) * (1 - u) * 1.1;
    }
    for (const q of ringPool) { if (!q.live) continue; q.t += dt; const u = q.t / 0.5; if (u >= 1) { q.live = false; q.mesh.visible = false; continue; } q.mesh.scale.setScalar(Math.max(0.1, (q.r / 10) * (0.2 + u * 1.0))); q.mesh.material.opacity = (1 - u) * 0.9; }
    for (const f of floaters) f.t -= dt; floaters = floaters.filter((f) => f.t > 0);

    // camera
    const P = PRESETS[camMode];
    const hum = [0, 1].filter((i) => IL.humans[i] && IL.ctrl[i]).map((i) => IL.ctrl[i]);
    const pts = hum.map((p) => [p.x, p.y]); pts.push([b.x, b.y]); if (hum.length === 1) pts.push([b.x, b.y]);
    let fx0 = 0, fy0 = 0, spread = 0; for (const q of pts) { fx0 += q[0]; fy0 += q[1]; } fx0 /= pts.length; fy0 /= pts.length;
    for (const q of pts) for (const r of pts) spread = Math.max(spread, Math.hypot(q[0] - r[0], q[1] - r[1]));
    const sc = IL.scorer && IL.phase === 'goal' ? null : IL.scorer;
    want.set(clamp(R.toX(fx0), -56, 56), 0, clamp(R.toZ(fy0), -34, 34));
    const asp = cw / ch, kk = Math.max(1, 1.4 / asp) * (1 + clamp((spread - 260) / 800, 0, 0.9));
    camGoal.set(want.x, P.up * kk, Math.min(want.z + P.back * kk, 54));
    if (camGoal.z > 41) camGoal.y = Math.max(camGoal.y, 0.8 + (camGoal.z - 41) * 0.75 + 3);
    if (!started) { look.set(want.x, 0, want.z - 1.5); focus.copy(want); R.camera.position.copy(camGoal); started = true; }
    focus.lerp(want, 1 - Math.exp(-dt * 3.4)); camGoal.x = focus.x; camGoal.z = Math.min(focus.z + P.back * kk, 54);
    let wantFov = P.fov;
    const S = IL.phase === 'goal' && IL.scorer && IL.phaseT > 0.5 ? IL.scorer : null;
    if (S) {
      const sx = R.toX(S.x), sz = R.toZ(S.y);
      camGoal.set(clamp(sx + S.fx * 3.6 - S.fy * 1.2, -57, 57), 1.85, clamp(sz + S.fy * 3.4 + S.fx * 1.2, -38, 38)); wantFov = 30;
      lookT.set(sx, 1.55, sz); R.camera.position.lerp(camGoal, 1 - Math.exp(-dt * 4)); focus.set(sx, 0, sz);
    } else { R.camera.position.lerp(camGoal, 1 - Math.exp(-dt * 3.2)); lookT.set(focus.x, 0, focus.z - 1.5); }
    shake = Math.max(0, shake - dt * 1.8);
    if (shake > 0) R.camera.position.add(new T.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    if (Math.abs(R.camera.fov - wantFov) > 0.05) { R.camera.fov += (wantFov - R.camera.fov) * Math.min(1, dt * 5); R.camera.updateProjectionMatrix(); }
    look.lerp(lookT, 1 - Math.exp(-dt * 5)); R.camera.lookAt(look);
    R.sun.position.set(focus.x + 24, 55, focus.z + 16); R.sun.target.position.set(focus.x, 0, focus.z);
    R.cheerLevel = IL.phase === 'goal' ? 1 : 0.35;
    R.updateCrowd(t);
    R.renderer.render(R.scene, R.camera);
    drawHud(ctx, cw, ch);
  };

  /* ---------- 2D HUD: health bars, reticles, panels, radar, kill feed ---------- */
  function rr(x, y, w, h, r) { x.beginPath(); x.moveTo(x + r, y); }
  function drawHud(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    const u = Math.max(0.7, h / 540), font = (px, wt) => (wt || 800) + ' ' + Math.round(px * u) + 'px "Big Shoulders Display", Impact, "Arial Narrow", sans-serif';
    const TC = (t) => G.TEAMS[t].color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    // health bars over every player
    for (const p of IL.players) {
      if (p.dead > 0) continue;
      const s = proj(p.x, p.y, 2.35, w, h); if (!s) continue;
      if (IL.tac) { // energy bar over the player you control, stun timer over anyone stunned
        const ctl0 = IL.humans[p.team] && IL.ctrl[p.team] === p, bw0 = 46 * u, bh0 = 6 * u, x0 = s[0] - bw0 / 2;
        if (p.stunT > 0) { ctx.fillStyle = 'rgba(8,14,12,0.82)'; ctx.fillRect(x0 - 2 * u, s[1] - 2 * u, bw0 + 4 * u, bh0 + 4 * u); ctx.fillStyle = '#cfd6e0'; ctx.fillRect(x0, s[1], bw0 * (p.stunT / p.stunMax), bh0); }
        else if (ctl0) { ctx.fillStyle = 'rgba(8,14,12,0.82)'; ctx.fillRect(x0 - 2 * u, s[1] - 2 * u, bw0 + 4 * u, bh0 + 4 * u); ctx.fillStyle = p.stamina < 0.2 ? '#ff6a4a' : '#ffd23f'; ctx.fillRect(x0, s[1], bw0 * p.stamina, bh0); }
        continue;
      }
      const ctl = IL.humans[p.team] && IL.ctrl[p.team] === p, bw = (ctl ? 56 : 42) * u, bh = (ctl ? 8 : 6) * u, x = s[0] - bw / 2, y = s[1];
      ctx.fillStyle = 'rgba(8,14,12,0.82)'; ctx.fillRect(x - 2 * u, y - 2 * u, bw + 4 * u, bh + 4 * u);
      const hp = clamp(p.hp / 100, 0, 1); ctx.fillStyle = hp > 0.5 ? '#35e08a' : hp > 0.25 ? '#ffc93c' : '#ff4d4d'; ctx.fillRect(x, y, bw * hp, bh);
      ctx.fillStyle = TC(p.team); ctx.fillRect(x - 2 * u, y - 2 * u, 3 * u, bh + 4 * u);
      if (ctl || p.team !== 0 || true) { ctx.font = font(ctl ? 15 : 12); ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; const nm = (ctl ? 'P' + (p.team + 1) + ' ' : '') + p.name.split(' ').slice(-1)[0].toUpperCase(); ctx.strokeText(nm, s[0], y - 8 * u); ctx.fillStyle = ctl ? '#ffe066' : '#f2f0e6'; ctx.fillText(nm, s[0], y - 8 * u); }
    }
    // reticles on the enemy your shots will go at
    [0, 1].forEach((ti) => {
      const q = IL.humans[ti] && IL.aim[ti]; if (!q || q.dead > 0 || IL.phase !== 'play') return;
      const s = proj(q.x, q.y, 1.1, w, h); if (!s) return; const rad = 20 * u, tt = performance.now() / 400;
      ctx.strokeStyle = ti ? '#ff5ec4' : '#ff5a4a'; ctx.lineWidth = 2.5 * u; ctx.beginPath(); ctx.arc(s[0], s[1], rad + Math.sin(tt) * 2 * u, 0, 6.283); ctx.stroke();
      for (let a = 0; a < 4; a++) { const an = a * 1.5708 + tt * 0.3; ctx.beginPath(); ctx.moveTo(s[0] + Math.cos(an) * rad * 0.7, s[1] + Math.sin(an) * rad * 0.7); ctx.lineTo(s[0] + Math.cos(an) * rad * 1.3, s[1] + Math.sin(an) * rad * 1.3); ctx.stroke(); }
    });
    // pickup labels near the player you control
    for (const c of IL.crates) {
      let close = false; for (const ti of [0, 1]) { const q = IL.humans[ti] && IL.ctrl[ti]; if (q && Math.hypot(q.x - c.x, q.y - c.y) < 260) close = true; } if (!close) continue;
      const s = proj(c.x, c.y, 3.5, w, h); if (!s) continue;
      ctx.font = font(13); ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(NAME[c.type].toUpperCase(), s[0], s[1]); ctx.fillStyle = hex(COL[c.type]); ctx.fillText(NAME[c.type].toUpperCase(), s[0], s[1]);
    }
    // floating numbers
    for (const f of floaters) {
      const age = 1 - f.t / (f.big ? 1.3 : 0.9), s = proj(f.x, f.y, f.z + age * 1.4, w, h); if (!s) continue;
      ctx.globalAlpha = clamp(f.t * 2.5, 0, 1); ctx.font = font(f.big ? 22 : 18, 900); ctx.lineWidth = 4 * u; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(f.txt, s[0], s[1]); ctx.fillStyle = f.col; ctx.fillText(f.txt, s[0], s[1]); ctx.globalAlpha = 1;
    }
    // player panels
    [0, 1].forEach((ti) => {
      const p = IL.humans[ti] && IL.ctrl[ti]; if (!p) return;
      const pw = 270 * u, ph = 76 * u, x = ti === 0 ? 12 * u : w - pw - 12 * u, y = h - ph - 12 * u;
      ctx.fillStyle = 'rgba(8,18,13,0.82)'; ctx.fillRect(x, y, pw, ph); ctx.fillStyle = TC(ti); ctx.fillRect(x, y, 6 * u, ph);
      ctx.textAlign = 'left'; ctx.font = font(18); ctx.fillStyle = '#f2f0e6'; ctx.fillText((IL.humans[1] ? 'P' + (ti + 1) + '  ' : '') + p.name.split(' ').slice(-1)[0].toUpperCase(), x + 16 * u, y + 17 * u);
      const hp = IL.tac ? clamp(p.stamina, 0, 1) : clamp(p.hp / 100, 0, 1); ctx.fillStyle = 'rgba(242,240,230,0.15)'; ctx.fillRect(x + 16 * u, y + 30 * u, pw - 30 * u, 10 * u);
      ctx.fillStyle = IL.tac ? (hp > 0.2 ? '#ffd23f' : '#ff6a4a') : hp > 0.5 ? '#35e08a' : hp > 0.25 ? '#ffc93c' : '#ff4d4d'; ctx.fillRect(x + 16 * u, y + 30 * u, (pw - 30 * u) * hp, 10 * u);
      const wp = G.il.WEAP[p.wpn.id]; ctx.font = font(17); ctx.fillStyle = hex(COL[p.wpn.id]); ctx.fillText(wp.name.toUpperCase(), x + 16 * u, y + 56 * u);
      ctx.textAlign = 'right'; ctx.fillStyle = '#f2f0e6'; ctx.fillText(p.wpn.id === 'blaster' ? 'INFINITE' : String(Math.max(0, p.wpn.ammo)), x + pw - 14 * u, y + 56 * u);
      if (IL.tac) { ctx.textAlign = 'right'; ctx.font = font(11); ctx.fillStyle = '#9fb3a8'; ctx.fillText('ENERGY', x + pw - 14 * u, y + 17 * u); ctx.fillStyle = 'rgba(242,240,230,0.2)'; ctx.fillRect(x + 16 * u, y + 66 * u, pw - 30 * u, 4 * u); const wc = G.il.WEAP[p.wpn.id].cd; ctx.fillStyle = hex(COL[p.wpn.id]); ctx.fillRect(x + 16 * u, y + 66 * u, (pw - 30 * u) * (1 - clamp(p.cd / wc, 0, 1)), 4 * u); }
      if (p.boost > 0) { ctx.fillStyle = '#ffd23f'; ctx.font = font(12); ctx.fillText('SPEED UP', x + pw - 14 * u, y + 17 * u); }
      const c = G.charge(ti + 1);
      if (c.v > 0) { const bw = pw; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(8,18,13,0.82)'; ctx.fillRect(x, y - 22 * u, bw, 18 * u); ctx.fillStyle = c.kind === 'pass' ? '#7fd6ff' : '#ffd23f'; ctx.fillRect(x + 3 * u, y - 19 * u, (bw - 6 * u) * c.v, 12 * u); ctx.font = font(11); ctx.fillStyle = '#0b1210'; ctx.fillText(c.kind === 'pass' ? 'PASS' : 'SHOOT', x + 8 * u, y - 12.5 * u); }
      ctx.textAlign = 'center';
    });
    // radar
    const rw = 150 * u, rh = rw * (H / W), rx = w - rw - 10 * u, ry = 10 * u;
    ctx.fillStyle = 'rgba(8,24,14,0.78)'; ctx.fillRect(rx, ry, rw, rh); ctx.strokeStyle = 'rgba(242,240,230,0.45)'; ctx.lineWidth = 1.5 * u; ctx.strokeRect(rx, ry, rw, rh);
    ctx.beginPath(); ctx.moveTo(rx + rw / 2, ry); ctx.lineTo(rx + rw / 2, ry + rh); ctx.stroke();
    const rp = (x, y) => [rx + (x / W) * rw, ry + (y / H) * rh];
    for (const c of IL.crates) { const q = rp(c.x, c.y); ctx.fillStyle = hex(COL[c.type]); ctx.fillRect(q[0] - 2 * u, q[1] - 2 * u, 4 * u, 4 * u); }
    for (const p of IL.players) { if (p.dead > 0) continue; const q = rp(p.x, p.y), ctl = IL.humans[p.team] && IL.ctrl[p.team] === p; ctx.fillStyle = TC(p.team); ctx.beginPath(); ctx.arc(q[0], q[1], (ctl ? 4.5 : 3.2) * u, 0, 6.283); ctx.fill(); if (ctl) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * u; ctx.stroke(); } }
    const bq = rp(IL.ball.x, IL.ball.y); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bq[0], bq[1], 3 * u, 0, 6.283); ctx.fill();
    // kill feed
    ctx.textAlign = 'right'; ctx.font = font(14);
    IL.feed.forEach((f, i) => {
      const y = ry + rh + (16 + i * 21) * u; ctx.globalAlpha = clamp(f.t, 0, 1); const txt = f.a ? f.a.split(' ').slice(-1)[0] + '  >  ' + f.b.split(' ').slice(-1)[0] : f.b.split(' ').slice(-1)[0] + ' is out';
      ctx.fillStyle = 'rgba(8,18,13,0.75)'; const tw = ctx.measureText(txt).width + 18 * u; ctx.fillRect(w - 10 * u - tw, y - 10 * u, tw, 19 * u); ctx.fillStyle = f.a ? TC(f.at) : '#f2f0e6'; ctx.fillText(txt, w - 18 * u, y); ctx.globalAlpha = 1;
    });
    // countdown
    if (IL.phase === 'intro') {
      const t = IL.phaseT, n = Math.ceil(3 - t), txt = t < 3 ? (n > 0 ? String(n) : 'GO') : 'FIGHT!'; const k = 1 + (1 - (t % 1)) * 0.35;
      { ctx.textAlign = 'center'; ctx.font = font(120 * k, 900); ctx.lineWidth = 8 * u; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(txt, w / 2, h * 0.38); ctx.fillStyle = '#ffd23f'; ctx.fillText(txt, w / 2, h * 0.38); }
    }
    ctx.textAlign = 'center';
  }
})();
