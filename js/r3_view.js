/* r3_view.js - builds the figures once, then every frame: poses them, moves the camera, draws markers and confetti. */
(function () {
  const G = window.G, T = THREE, R = G.R3;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PRESETS = [{ back: 34, up: 21, fov: 34, name: 'Broadcast' }, { back: 23, up: 13, fov: 34, name: 'Close' }, { back: 14, up: 7.5, fov: 40, name: 'Low' }];
  let trail = null, trailPts = [], camMode = 0, figs = null, refFig = null, ball = null, mk = [], conf = null;
  let cw = 960, ch = 540, quality = 2, acc = 0, nFrames = 0, refAnim = 0, shake = 0, started = false, replayRef = null;
  const look = new T.Vector3(), lookT = new T.Vector3(), focus = new T.Vector3(), want = new T.Vector3(), camGoal = new T.Vector3();

  R.setMatchVisible = function (v) { // the other game mode hides the football figures while it is running
    if (figs) figs.forEach((f) => { f.root.visible = v; });
    if (refFig) refFig.root.visible = v;
    if (ball) ball.mesh.visible = ball.blob.visible = v;
    if (!v) mk.forEach((M) => { M.ring.visible = M.tgt.visible = M.arrow.visible = M.tag.visible = false; });
    if (trail && !v) trail.visible = false;
  };
  R.nextCam = () => { camMode = (camMode + 1) % PRESETS.length; return PRESETS[camMode].name; };
  R.shake = (v) => { shake = Math.max(shake, v); };

  function applyQuality() {
    const dpr = window.devicePixelRatio || 1, pr = quality >= 2 ? Math.min(dpr, 2) : quality === 1 ? Math.min(dpr, 1.25) : 1;
    R.renderer.setPixelRatio(pr); R.renderer.setSize(cw, ch, false);
    const sun = R.sun, size = quality >= 2 ? 2048 : 1024;
    if (quality === 0) {
      R.renderer.shadowMap.enabled = false; sun.castShadow = false;
      R.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((mm) => { mm.needsUpdate = true; }); });
    } else {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }

  R.setup = function (canvas) {
    R.init(canvas);
    ball = R.makeBall(); R.scene.add(ball.mesh, ball.blob);
    mk = [0xffd23f, 0xff5ec4].map((col) => {
      const ring = new T.Mesh(new T.RingGeometry(0.7, 0.92, 32), new T.MeshBasicMaterial({ color: col, transparent: true, side: T.DoubleSide, depthWrite: false }));
      const tgt = new T.Mesh(new T.RingGeometry(0.62, 0.84, 32), new T.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = tgt.rotation.x = -Math.PI / 2; ring.position.y = tgt.position.y = 0.05;
      const arrow = new T.Mesh(new T.ConeGeometry(0.2, 0.46, 10), new T.MeshBasicMaterial({ color: col })); arrow.rotation.x = Math.PI;
      const tag = R.makeTag();
      R.scene.add(ring, tgt, arrow, tag);
      return { ring, tgt, arrow, tag, tagFor: null };
    });
    const n = 320, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    conf = new T.Points(g, new T.PointsMaterial({ size: 0.36, vertexColors: true, transparent: true, depthWrite: false }));
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.BufferAttribute(new Float32Array(36 * 3), 3)); tg.setAttribute('color', new T.BufferAttribute(new Float32Array(36 * 3), 3));
    trail = new T.Points(tg, new T.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); trail.frustumCulled = false; trail.visible = false; R.scene.add(trail);
    conf.frustumCulled = false; conf.visible = false; conf.userData = { vel: new Float32Array(n * 3), age: 99, n };
    R.scene.add(conf);
    started = false;
  };

  R.confetti = function (goalWorldX) {
    const u = conf.userData, p = conf.geometry.attributes.position, c = conf.geometry.attributes.color;
    const gx = R.toX(goalWorldX), side = gx > 0 ? 1 : -1, cols = [[1, 0.82, 0.25], [0.18, 0.48, 1], [0.91, 0.27, 0.17], [1, 1, 1], [0.2, 0.82, 0.5]];
    for (let i = 0; i < u.n; i++) {
      p.setXYZ(i, gx + side * (4 + Math.random() * 10), 10 + Math.random() * 5, (Math.random() - 0.5) * 24);
      u.vel[i * 3] = -side * (2 + Math.random() * 7); u.vel[i * 3 + 1] = 4 + Math.random() * 9; u.vel[i * 3 + 2] = (Math.random() - 0.5) * 8;
      const k = cols[(Math.random() * cols.length) | 0]; c.setXYZ(i, k[0], k[1], k[2]);
    }
    p.needsUpdate = c.needsUpdate = true; u.age = 0; conf.visible = true;
  };

  R.resize = function (w, h) {
    cw = Math.max(2, w); ch = Math.max(2, h);
    if (!R.renderer) return;
    R.camera.aspect = cw / ch; R.camera.updateProjectionMatrix(); applyQuality();
  };

  function ensure(players) {
    const sig = players[0].name + players[11].name + G.TEAMS[0].color + G.TEAMS[1].color;
    if (figs && figs.sig === sig) return;
    if (figs) { figs.forEach((f) => R.scene.remove(f.root)); R.scene.remove(refFig.root); }
    figs = players.map((p) => {
      const t = G.TEAMS[p.team], gk = p.grp === 'GK';
      const f = R.makeFigure({ beard: p.look.beard, face: p.look.f, seed: 1 + ((p.name.length * 7 + p.num * 13 + p.team * 29) | 0), shirt: gk ? t.keeper : t.color, shorts: gk ? '#26262c' : t.shorts, socks: gk ? '#26262c' : t.socks, skin: p.look.skin, hair: p.look.hair, style: p.look.style, num: p.num, numColor: gk ? '#1d1d22' : t.trim });
      R.scene.add(f.root); return f;
    });
    refFig = R.makeFigure({ shirt: '#e8e03a', shorts: '#111111', socks: '#111111', skin: '#d9a273', hair: '#222222', style: 1, ref: true });
    R.scene.add(refFig.root); figs.sig = sig;
  }

  // src: { players, ball, ref }. view: { replay, focus, preset, celebrateIdx }
  R.render = function (src, dt, view) {
    const m = G.m;
    ensure(src.players);
    src.players.forEach((p, i) => {
      const f = figs[i]; f.root.visible = !p.out;
      if (p.out) return;
      if (view.celebrateIdx === i && view.celeb) R.poseFigure(f, view.celeb.pose, 'celebrate', view.celeb);
      else R.poseFigure(f, p, p.grp === 'GK' ? 'gk' : '');
    });
    const r = src.ref; refAnim += (r.moving || 0) * dt * 0.09;
    R.poseFigure(refFig, { x: r.x, y: r.y, fx: r.fx, fy: r.fy, vx: r.fx * (r.moving || 0), vy: r.fy * (r.moving || 0), anim: refAnim, slideT: 0 }, '');
    R.poseBall(ball, src.ball, dt);

    // camera
    const b = src.ball, P = view.preset || PRESETS[camMode];
    let fx = b.x + (b.vx || 0) * 0.35, fy = b.y + (b.vy || 0) * 0.35;
    if (view.focus) { fx = view.focus.x; fy = view.focus.y; }
    want.set(clamp(R.toX(fx), -58, 58), 0, clamp(R.toZ(fy), -36, 36));
    const k = Math.max(1, 1.4 / (cw / ch));
    camGoal.set(want.x, P.up * k, Math.min(want.z + P.back * k, 54));
    if (camGoal.z > 41) camGoal.y = Math.max(camGoal.y, 0.8 + (camGoal.z - 41) * 0.75 + 3); // stay above the seats near the touchline
    if (!started) { look.set(want.x, 0, want.z - 1.5); focus.copy(want); R.camera.position.copy(camGoal); started = true; }
    focus.lerp(want, 1 - Math.exp(-dt * (view.replay ? 2.4 : 3.6)));
    camGoal.x = focus.x; camGoal.z = Math.min(focus.z + P.back * k, 54);
    if (camGoal.z > 41) camGoal.y = Math.max(P.up * k, 0.8 + (camGoal.z - 41) * 0.75 + 3);
    if (!view.face && !view.goalCam && !view.penCam) R.camera.position.lerp(camGoal, 1 - Math.exp(-dt * 3));
    shake = Math.max(0, shake - dt * 1.6);
    if (shake > 0) R.camera.position.add(new T.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    const wantFov = view.penCam ? 40 : view.goalCam ? 36 : view.face ? 30 : P.fov;
    if (Math.abs(R.camera.fov - wantFov) > 0.05) { R.camera.fov += (wantFov - R.camera.fov) * Math.min(1, dt * 5); R.camera.updateProjectionMatrix(); }
    if (false) { R.camera.fov = P.fov; R.camera.updateProjectionMatrix(); }
    const F = view.face, GC = view.goalCam, PC = view.penCam;
    if (PC) { // behind the penalty taker, looking at the keeper and the goal
      const cx = R.toX(PC.x) - PC.d * 6.6, cz = R.toZ(PC.y);
      camGoal.set(cx, 2.9, cz + 1.2);
      R.camera.position.lerp(camGoal, 1 - Math.exp(-dt * 4));
      lookT.set(R.toX(PC.gx) - PC.d * 1.5, 0.7, cz * 0.5 + 0.4); focus.set(R.toX(PC.x), 0, cz);
    } else if (GC) { // low camera behind the goal, looking back up the pitch at the ball
      const gx = R.toX(GC.x), side = gx > 0 ? 1 : -1, bz = R.toZ(b.y);
      camGoal.set(gx + side * 8, 2.0, clamp(bz * 0.35, -7, 7));
      R.camera.position.lerp(camGoal, 1 - Math.exp(-dt * 5));
      lookT.set(R.toX(b.x), 0.6 + b.z / 10, bz); focus.set(R.toX(b.x), 0, bz);
    } else if (F) { // close-up on the scorer's face
      const sx = R.toX(F.x), sz = R.toZ(F.y), up = Math.max(0, view.celeb ? view.celeb.up || 0 : 0);
      camGoal.set(clamp(sx + F.fx * 3.6 - F.fy * 1.2, -57, 57), 1.85, clamp(sz + F.fy * 3.4 + F.fx * 1.2, -38, 38));
      R.camera.position.lerp(camGoal, 1 - Math.exp(-dt * 4));
      lookT.set(sx, 1.62 + up * 0.5, sz); focus.set(sx, 0, sz);
    } else lookT.set(focus.x, 0, focus.z - 1.5);
    look.lerp(lookT, 1 - Math.exp(-dt * 5)); R.camera.lookAt(look);
    R.sun.position.set(focus.x + 24, 55, focus.z + 16); R.sun.target.position.set(focus.x, 0, focus.z);

    // markers for the player(s) you control, and who a pass would go to
    mk.forEach((M, ti) => {
      const c = ti === 0 ? m.ctrl : m.ctrl2, I = ti === 0 ? G.input : G.input2;
      const show = !view.replay && G.isH(ti) && c && !c.out && (m.phase === 'play' || m.phase === 'restart');
      M.ring.visible = M.arrow.visible = M.tag.visible = !!show; M.tgt.visible = false;
      if (!show) return;
      const x = R.toX(c.x), z = R.toZ(c.y), t = performance.now() / 1000;
      M.ring.position.set(x, 0.05, z); M.arrow.position.set(x, 2.75 + Math.sin(t * 5) * 0.1, z); M.tag.position.set(x, 3.4, z);
      if (M.tagFor !== c) { M.tagFor = c; M.tag.setText((G.mode === 'duo' ? 'P' + (ti + 1) + '  ' : '') + '#' + c.num + '  ' + c.name.split(' ')[1].toUpperCase(), G.TEAMS[c.team].color); }
      if (m.ball.owner === c) {
        const mag = Math.hypot(I.x, I.y), best = G.findPass(c, mag > 0.2 ? I.x : c.fx, mag > 0.2 ? I.y : c.fy, false);
        if (best) { M.tgt.visible = true; M.tgt.position.set(R.toX(best.t.x), 0.06, R.toZ(best.t.y)); const sc = 1 + Math.sin(t * 8) * 0.08; M.tgt.scale.set(sc, sc, sc); }
      }
    });

    // confetti
    const u = conf.userData;
    if (conf.visible) {
      u.age += dt;
      const p = conf.geometry.attributes.position;
      for (let i = 0; i < u.n; i++) {
        u.vel[i * 3 + 1] -= 5 * dt;
        p.setXYZ(i, p.getX(i) + u.vel[i * 3] * dt, Math.max(0.05, p.getY(i) + u.vel[i * 3 + 1] * dt), p.getZ(i) + u.vel[i * 3 + 2] * dt);
        if (p.getY(i) <= 0.05) { u.vel[i * 3] *= 0.2; u.vel[i * 3 + 2] *= 0.2; u.vel[i * 3 + 1] = 0; }
      }
      p.needsUpdate = true;
      if (u.age > 6) conf.visible = false;
    }

    if (view.replay) { // a glowing trail behind the ball
      trailPts.push(R.toX(b.x), 0.2 + b.z / 10, R.toZ(b.y)); if (trailPts.length > 36 * 3) trailPts.splice(0, 3);
      const P3 = trail.geometry.attributes.position, C3 = trail.geometry.attributes.color, n = trailPts.length / 3;
      for (let i = 0; i < 36; i++) { const j = Math.max(0, i - (36 - n)), live = i >= 36 - n, f = live ? (i - (36 - n) + 1) / n : 0; P3.setXYZ(i, trailPts[j * 3] || 0, trailPts[j * 3 + 1] || 0, trailPts[j * 3 + 2] || 0); C3.setXYZ(i, f * 0.9, f * 0.85, f * 0.5); }
      P3.needsUpdate = C3.needsUpdate = true; trail.visible = true;
    } else { trail.visible = false; trailPts.length = 0; }
    R.updateCrowd(performance.now() / 1000);
    R.renderer.render(R.scene, R.camera);

    // drop the quality if the device struggles
    if (++nFrames > 60) { acc += dt; if (nFrames >= 180) { if (acc / 120 > 0.034 && quality > 0) { quality--; applyQuality(); } acc = 0; nFrames = 61; } }
  };
})();
