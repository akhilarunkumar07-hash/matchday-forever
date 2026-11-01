/* r3_actors.js - the 3D players, referee and ball, plus how they pose. A figure is about 1.8 m tall and faces +X. */
(function () {
  const G = window.G, T = THREE, R = G.R3;
  const std = (c) => new T.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0 });
  const shadowed = (o) => { o.traverse((m) => { if (m.isMesh) m.castShadow = true; }); return o; };

  function numberTexture(num, color) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = color; x.font = '900 52px "Big Shoulders Display", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(num), 32, 36);
    return R.canvasTex(c);
  }


  const mixc = (a, b, t) => '#' + new T.Color(a).lerp(new T.Color(b), t).getHexString();
  // Paints a whole head (equirect, front at the middle) with shaded eyes, brows, nose, lips, cheeks and beard/stubble.
  function faceTexture(o, F) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const x = c.getContext('2d'), rnd = G.rng((o.seed || 1) * 131 + 7), cx = 512;
    const skin = o.skin, shade = mixc(skin, '#4a2012', 0.35), light = mixc(skin, '#ffffff', 0.16), hair = o.hair;
    const g = x.createLinearGradient(0, 60, 0, 430); g.addColorStop(0, light); g.addColorStop(0.45, skin); g.addColorStop(1, shade);
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 3500; i++) { x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.035)'; x.fillRect(rnd() * 1024, rnd() * 512, 2, 2); }
    const rad = (px, py, r, col0, col1) => { const q = x.createRadialGradient(px, py, 0, px, py, r); q.addColorStop(0, col0); q.addColorStop(1, col1); x.fillStyle = q; x.fillRect(px - r, py - r, r * 2, r * 2); };
    const gp = F.gap * 1417, ey = 218;
    [-1, 1].forEach((s) => rad(cx + s * 100, 276, 62, 'rgba(215,105,95,0.2)', 'rgba(215,105,95,0)')); // cheeks
    // beard / stubble goes under the mouth and nose features
    const beardArea = () => { x.beginPath(); x.ellipse(cx, 335, 185, 125, 0, 0, 6.283); x.save(); x.clip(); x.beginPath(); x.rect(0, 292, 1024, 300); x.clip(); };
    if (o.beard) {
      beardArea(); x.fillStyle = mixc(hair, '#000000', 0.1); x.fillRect(0, 280, 1024, 300);
      for (let i = 0; i < 2200; i++) { x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.18)'; x.fillRect(rnd() * 1024, 290 + rnd() * 200, 2, 3); }
      x.restore();
      x.fillStyle = mixc(hair, '#000000', 0.1); x.beginPath(); x.ellipse(cx, 304, 62, 11, 0, 0, 6.283); x.fill(); // moustache
    } else if (F.stubble) {
      beardArea(); for (let i = 0; i < 2600; i++) { x.fillStyle = 'rgba(' + (new T.Color(hair).r * 150 | 0) + ',' + (new T.Color(hair).g * 130 | 0) + ',' + (new T.Color(hair).b * 120 | 0) + ',0.32)'; x.fillRect(rnd() * 1024, 292 + rnd() * 190, 2, 2); } x.restore();
    }
    // eyes
    [-1, 1].forEach((s) => {
      const ex = cx + s * gp, sz = F.size, rx = 21 * sz, ry = 11.5 * sz;
      rad(ex, ey - 4, 40, 'rgba(70,35,25,0.30)', 'rgba(70,35,25,0)'); // socket
      x.save(); x.beginPath(); x.ellipse(ex, ey, rx, ry, 0, 0, 6.283); x.clip();
      x.fillStyle = '#f1ede3'; x.fillRect(ex - rx, ey - ry, rx * 2, ry * 2);
      const sh = x.createLinearGradient(0, ey - ry, 0, ey + ry); sh.addColorStop(0, 'rgba(60,30,25,0.5)'); sh.addColorStop(0.5, 'rgba(60,30,25,0)'); x.fillStyle = sh; x.fillRect(ex - rx, ey - ry, rx * 2, ry * 2);
      const ir = x.createRadialGradient(ex, ey, 1, ex, ey, 10 * sz); ir.addColorStop(0, mixc(F.eye, '#ffffff', 0.25)); ir.addColorStop(0.75, F.eye); ir.addColorStop(1, mixc(F.eye, '#000000', 0.55));
      x.fillStyle = ir; x.beginPath(); x.arc(ex, ey + 1, 10 * sz, 0, 6.283); x.fill();
      x.fillStyle = '#0a0808'; x.beginPath(); x.arc(ex, ey + 1, 4.4 * sz, 0, 6.283); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(ex - 3.5 * sz, ey - 3, 2.3 * sz, 0, 6.283); x.fill();
      x.restore();
      x.strokeStyle = 'rgba(28,14,10,0.9)'; x.lineWidth = 3.4; x.lineCap = 'round'; x.beginPath(); x.ellipse(ex, ey, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95); x.stroke(); // upper lid
      x.lineWidth = 2; x.beginPath(); x.moveTo(ex + s * rx, ey - 1); x.lineTo(ex + s * (rx + 6), ey - 4); x.stroke();
      x.strokeStyle = 'rgba(110,60,50,0.4)'; x.lineWidth = 1.6; x.beginPath(); x.ellipse(ex, ey + 1, rx, ry, 0, 0.1, Math.PI - 0.1); x.stroke(); // lower lid
      x.strokeStyle = 'rgba(80,40,30,0.25)'; x.lineWidth = 3; x.beginPath(); x.ellipse(ex, ey - 3, rx * 1.05, ry * 1.5, 0, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); // crease
      // eyebrow
      const bw = F.brow * 1250, inner = cx + s * (gp - 28), outer = cx + s * (gp + 34), by = ey - 46, tl = F.tilt * 26;
      for (let k = 0; k < 2; k++) {
        x.strokeStyle = k ? mixc(hair, '#000000', 0.2) : mixc(hair, skin, 0.25); x.lineWidth = bw * (k ? 0.55 : 1); x.lineCap = 'round';
        x.beginPath(); x.moveTo(inner, by + tl); x.quadraticCurveTo(cx + s * gp, by - 8 - tl * 0.3, outer, by + 6 - tl); x.stroke();
      }
    });
    // nose
    const nv = F.nose;
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(cx - 7, 195, 14, 80);
    [-1, 1].forEach((s) => { rad(cx + s * 24 * nv, 268, 26, 'rgba(85,42,30,0.2)', 'rgba(85,42,30,0)'); });
    rad(cx, 280, 20 * nv, 'rgba(255,235,220,0.18)', 'rgba(255,235,220,0)');
    x.fillStyle = 'rgba(40,15,10,0.7)'; [-1, 1].forEach((s) => { x.beginPath(); x.ellipse(cx + s * 13 * nv, 289, 6.5 * nv, 4.2 * nv, 0, 0, 6.283); x.fill(); });
    rad(cx, 300, 30, 'rgba(80,35,25,0.14)', 'rgba(80,35,25,0)');
    // mouth
    const mh = F.mouth * 1417 / 2, my = 326, lip = mixc(skin, '#a23a3f', 0.52), lip2 = mixc(skin, '#b04a4c', 0.45), cr = F.smile * 10;
    x.fillStyle = lip; x.beginPath(); x.moveTo(cx - mh, my - cr); x.quadraticCurveTo(cx - mh * 0.4, my - 13, cx, my - 6); x.quadraticCurveTo(cx + mh * 0.4, my - 13, cx + mh, my - cr); x.quadraticCurveTo(cx, my + 1, cx - mh, my - cr); x.fill();
    x.fillStyle = lip2; x.beginPath(); x.moveTo(cx - mh * 0.92, my - cr + 1); x.quadraticCurveTo(cx, my + 24, cx + mh * 0.92, my - cr + 1); x.quadraticCurveTo(cx, my + 1, cx - mh * 0.92, my - cr + 1); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.14)'; x.beginPath(); x.ellipse(cx, my + 10, mh * 0.3, 3, 0, 0, 6.283); x.fill();
    x.strokeStyle = 'rgba(55,18,20,0.9)'; x.lineWidth = 3.2; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx - mh, my - cr); x.quadraticCurveTo(cx, my + 4, cx + mh, my - cr); x.stroke();
    rad(cx, 362, 46, 'rgba(70,30,20,0.16)', 'rgba(70,30,20,0)'); // under the lip
    // jaw shadow and a few freckles
    const jg = x.createLinearGradient(0, 380, 0, 470); jg.addColorStop(0, 'rgba(40,18,10,0)'); jg.addColorStop(1, 'rgba(40,18,10,0.4)'); x.fillStyle = jg; x.fillRect(0, 380, 1024, 130);
    if ((o.seed || 0) % 5 === 0) for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(120,60,30,0.35)'; x.beginPath(); x.arc(cx + (rnd() - 0.5) * 220, 258 + rnd() * 30, 1.5 + rnd() * 1.5, 0, 6.283); x.fill(); }
    const tx = R.canvasTex(c); tx.anisotropy = 4; return tx;
  }

  // opt: shirt, shorts, socks, trim, skin, hair, style, num, ref
  R.makeFigure = function (o) {
    const root = new T.Group(), body = new T.Group();
    body.position.y = 0.92; root.add(body); // the body pivots at the hips
    const shirt = std(o.shirt), shorts = std(o.shorts), socks = std(o.socks), skin = std(o.skin), hair = std(o.hair), boot = std(0x101010);
    const fig = { root, body, legs: [], arms: [] };

    [-1, 1].forEach((s) => {
      const hip = new T.Group(); hip.position.set(0, 0, s * 0.1);
      const up = new T.Mesh(new T.CylinderGeometry(0.085, 0.075, 0.4, 8), shorts); up.position.y = -0.2;
      const low = new T.Group(); low.position.y = -0.4;
      const shin = new T.Mesh(new T.CylinderGeometry(0.065, 0.055, 0.46, 8), socks); shin.position.y = -0.23;
      const foot = new T.Mesh(new T.BoxGeometry(0.27, 0.09, 0.11), boot); foot.position.set(0.06, -0.47, 0);
      low.add(shin, foot); hip.add(up, low); body.add(hip);
      fig.legs.push({ hip, low });
    });

    const shortsBlock = new T.Mesh(new T.CylinderGeometry(0.19, 0.2, 0.27, 10), shorts); shortsBlock.position.y = -0.02; shortsBlock.scale.z = 1.2;
    const torso = new T.Mesh(new T.CylinderGeometry(0.2, 0.17, 0.58, 10), shirt); torso.position.y = 0.3; torso.scale.z = 1.3;
    body.add(shortsBlock, torso);

    [-1, 1].forEach((s) => {
      const sh = new T.Group(); sh.position.set(0, 0.5, s * 0.27);
      const upper = new T.Mesh(new T.CylinderGeometry(0.055, 0.05, 0.3, 8), shirt); upper.position.y = -0.15;
      const fore = new T.Group(); fore.position.y = -0.3;
      const lower = new T.Mesh(new T.CylinderGeometry(0.045, 0.04, 0.27, 8), skin); lower.position.y = -0.135;
      const hand = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), skin); hand.position.y = -0.28;
      fore.add(lower, hand); sh.add(upper, fore); body.add(sh);
      fig.arms.push({ sh, fore });
    });

    // neck and shoulders
    const neck = new T.Mesh(new T.CylinderGeometry(0.048, 0.056, 0.13, 10), skin); neck.position.y = 0.61; body.add(neck);
    [-1, 1].forEach((s) => { const sp = new T.Mesh(new T.SphereGeometry(0.07, 10, 8), shirt); sp.position.set(0, 0.5, s * 0.255); body.add(sp); });

    // head: a smooth sphere with a painted face (every player has their own), plus real hair geometry
    const F = o.face || { eye: '#2b1b10', gap: 0.043, size: 1, brow: 0.011, tilt: 0.15, nose: 1, mouth: 0.056, smile: 0.5, w: 1, h: 1, ears: 1, stubble: false };
    const head = new T.Mesh(new T.SphereGeometry(0.115, 36, 26), new T.MeshStandardMaterial({ map: faceTexture(o, F), roughness: 0.7, metalness: 0 }));
    head.position.y = 0.74; head.scale.set(1, F.h, F.w); body.add(head);
    const hy = 0.74, hw = F.w, HR = 0.1235;
    const hairMat = new T.MeshStandardMaterial({ color: o.hair, roughness: 0.9, metalness: 0 });
    const shaved = new T.MeshStandardMaterial({ color: new T.Color(o.hair).lerp(new T.Color(o.skin), 0.62), roughness: 0.95, metalness: 0 });
    const hairPart = (mat, phiS, phiL, thS, thL, r) => { const m = new T.Mesh(new T.SphereGeometry(r || HR, 28, 16, phiS, phiL, thS, thL), mat); m.position.y = hy; m.scale.set(1, F.h, hw); body.add(m); return m; };
    const st = o.style;
    if (st === 0) { hairPart(hairMat, 0, 6.283, 0, 0.78); hairPart(hairMat, -1.95, 3.9, 0.7, 0.85); }
    else if (st === 1) { hairPart(hairMat, 0, 6.283, 0, 0.84); hairPart(hairMat, -1.8, 3.6, 0.7, 0.6); hairPart(hairMat, 2.7, 0.7, 0.3, 0.5, HR + 0.004); hairPart(hairMat, -3.4, 0.7, 0.3, 0.5, HR + 0.004); }
    else if (st === 2) { hairPart(hairMat, 0, 6.283, 0, 0.7); const r = G.rng(o.seed || 3); for (let i = 0; i < 26; i++) { const th = r() * 0.85, ph = r() * 6.283, rr = 0.118; const m = new T.Mesh(new T.SphereGeometry(0.042, 8, 6), hairMat); m.position.set(-rr * Math.cos(ph) * Math.sin(th), hy + rr * Math.cos(th) * F.h, rr * Math.sin(ph) * Math.sin(th) * hw); body.add(m); } }
    else if (st === 3) { hairPart(hairMat, 0, 6.283, 0, 0.8); hairPart(hairMat, -2.2, 4.4, 0.7, 1.35); const tail = new T.Mesh(new T.CylinderGeometry(0.035, 0.02, 0.2, 8), hairMat); tail.position.set(-0.13, hy - 0.04, 0); tail.rotation.z = 0.5; body.add(tail); }
    else if (st === 4) { hairPart(shaved, 0, 6.283, 0, 0.62); }
    else { hairPart(shaved, 0, 6.283, 0, 0.7); for (let i = 0; i < 6; i++) { const m = new T.Mesh(new T.BoxGeometry(0.05, 0.06, 0.03), hairMat); m.position.set(-0.07 + i * 0.03, hy + 0.115 * F.h + (i === 0 || i === 5 ? -0.01 : 0.012), 0); body.add(m); } }
    // ears
    [-1, 1].forEach((s) => { const ear = new T.Mesh(new T.SphereGeometry(0.028 * F.ears, 10, 8), skin); ear.position.set(-0.005, hy - 0.005, s * 0.114 * hw); ear.scale.set(0.55, 1.2, 0.5); body.add(ear); });
    // open mouth, only shown while shouting a goal
    fig.mouth = new T.Mesh(new T.SphereGeometry(0.03, 10, 8), new T.MeshBasicMaterial({ color: 0x4a0f18 }));
    fig.mouth.position.set(0.1, hy - 0.046 * F.h, 0); fig.mouth.scale.set(0.35, 0.9, 1.15 * Math.max(0.8, F.mouth / 0.056)); fig.mouth.visible = false; body.add(fig.mouth);

    if (!o.ref) { // shirt number on the back
      const plane = new T.Mesh(new T.PlaneGeometry(0.3, 0.3), new T.MeshBasicMaterial({ map: numberTexture(o.num, o.numColor), transparent: true }));
      plane.position.set(-0.27, 0.32, 0); plane.rotation.y = -Math.PI / 2; body.add(plane);
    }
    shadowed(root);
    return fig;
  };

  const ease = (u) => u * u * (3 - 2 * u), cl = (v) => Math.max(0, Math.min(1, v));

  // Goal celebrations. t is seconds since the goal. Returns { yaw, up, fwd } for the whole figure.
  function celebrate(fig, t, id) {
    const A = fig.arms, L = fig.legs, b = fig.body, out = { yaw: 0, up: 0, fwd: 0, shout: 0 };
    const armsUp = () => { A[0].sh.rotation.z = A[1].sh.rotation.z = 2.9; A[0].fore.rotation.z = A[1].fore.rotation.z = 0; };
    const bounce = Math.abs(Math.sin(t * 7));
    if (id === 0) { // SIUUU: turn away, leap, spin round, land with arms out
      const u = cl((t - 0.45) / 0.75);
      out.yaw = Math.PI * (1 - ease(u));
      out.up = u > 0 && u < 1 ? Math.sin(Math.PI * u) * 1.15 : 0;
      if (t < 0.45) { A[0].sh.rotation.z = A[1].sh.rotation.z = -0.3; }
      else if (u < 1) { armsUp(); L[0].low.rotation.z = L[1].low.rotation.z = -0.9; }
      else { A[0].sh.rotation.x = 0.85; A[1].sh.rotation.x = -0.85; A[0].fore.rotation.z = A[1].fore.rotation.z = 0.25; L[0].hip.rotation.x = 0.3; L[1].hip.rotation.x = -0.3; b.position.y = 0.9; out.shout = 1; }
    } else if (id === 1) { // aeroplane
      A[0].sh.rotation.x = 1.5; A[1].sh.rotation.x = -1.5; b.rotation.z = -0.1; out.yaw = Math.sin(t * 2) * 0.8; out.up = bounce * 0.12; out.shout = 1;
    } else if (id === 2) { // knee slide
      const u = cl(t / 1.1); out.fwd = ease(u) * 3.2; out.up = -0.4 * cl(t * 4);
      b.rotation.z = 0.5; b.position.y = 0.62; L[0].hip.rotation.z = -1.0; L[1].hip.rotation.z = -0.2; L[1].low.rotation.z = -1.8; armsUp(); out.shout = 1;
    } else if (id === 3) { // backflips
      const u = (t % 1.7) / 0.95;
      if (u < 1) { b.rotation.z = Math.PI * 2 * ease(u); out.up = Math.sin(Math.PI * u) * 1.5; L[0].low.rotation.z = L[1].low.rotation.z = -1.3; A[0].sh.rotation.z = A[1].sh.rotation.z = 2.4; }
      else { armsUp(); out.up = bounce * 0.2; }
      out.shout = 1;
    } else if (id === 4) { // spin
      out.yaw = t * 9; out.up = bounce * 0.3; armsUp(); out.shout = 1;
    } else if (id === 5) { // dab
      A[0].sh.rotation.z = 2.7; A[0].fore.rotation.z = 0.6; A[1].sh.rotation.x = -1.7; A[1].sh.rotation.z = 0.4; b.rotation.z = 0.12; out.up = 0.05 + bounce * 0.05;
    } else if (id === 6) { // meditate
      b.position.y = 0.4 + Math.sin(t * 2) * 0.02; L[0].hip.rotation.z = L[1].hip.rotation.z = -1.45; L[0].low.rotation.z = L[1].low.rotation.z = -2.1;
      A[0].sh.rotation.z = A[1].sh.rotation.z = 0.9; A[0].fore.rotation.z = A[1].fore.rotation.z = 0.5; out.up = 0;
    } else if (id === 7) { // shush
      A[1].sh.rotation.z = 2.4; A[1].fore.rotation.z = 1.5; A[0].sh.rotation.x = 0.25; b.rotation.z = -0.05;
    } else if (id === 8) { // arms crossed, cool
      A[0].sh.rotation.z = A[1].sh.rotation.z = 0.9; A[0].fore.rotation.z = A[1].fore.rotation.z = 2.3; A[0].sh.rotation.x = -0.55; A[1].sh.rotation.x = 0.55; b.rotation.z = -0.06;
    } else { // point to the sky
      A[1].sh.rotation.z = 3.1; A[0].sh.rotation.z = 0.8; A[0].fore.rotation.z = 1.2; out.up = bounce * 0.06;
    }
    return out;
  }

  // p needs x, y, fx, fy, vx, vy, anim, slideT. mode: '', 'celebrate', 'gk'. ce = { t, id } for celebrations.
  R.poseFigure = function (fig, p, mode, ce) {
    const sp = Math.hypot(p.vx, p.vy), amp = Math.min(1, sp / 75), s = Math.sin(p.anim * 1.5);
    const L = fig.legs, A = fig.arms, b = fig.body;
    fig.root.position.set(R.toX(p.x), 0, R.toZ(p.y));
    fig.root.rotation.y = -Math.atan2(p.fy, p.fx);
    A[0].sh.rotation.x = A[1].sh.rotation.x = 0; L[0].hip.rotation.x = L[1].hip.rotation.x = 0;
    b.rotation.set(0, 0, -0.14 * amp); b.position.y = 0.92 + Math.abs(s) * 0.045 * amp;
    L[0].hip.rotation.z = s * 0.85 * amp; L[1].hip.rotation.z = -s * 0.85 * amp;
    L[0].low.rotation.z = -Math.max(0, -s) * 1.1 * amp; L[1].low.rotation.z = -Math.max(0, s) * 1.1 * amp;
    A[0].sh.rotation.z = -s * 0.75 * amp; A[1].sh.rotation.z = s * 0.75 * amp;
    A[0].fore.rotation.z = A[1].fore.rotation.z = 0.5 * amp;
    let shout = 0;
    if (p.tackleCd > 0.45 && p.tackleCd < 0.7 && !p.slideT && !p.fallT) { L[1].hip.rotation.z = -1.05; L[1].low.rotation.z = 0; b.rotation.z = 0.12; A[0].sh.rotation.z = 1.0; } // poking a foot in
    if (mode === 'celebrate' && ce) {
      A[0].sh.rotation.z = A[1].sh.rotation.z = 0; A[0].fore.rotation.z = A[1].fore.rotation.z = 0;
      L[0].hip.rotation.z = L[1].hip.rotation.z = 0; L[0].low.rotation.z = L[1].low.rotation.z = 0; b.position.y = 0.92; b.rotation.set(0, 0, 0);
      const o = celebrate(fig, ce.t, ce.id);
      fig.root.rotation.y += o.yaw; fig.root.position.y = Math.max(0, o.up);
      if (o.fwd) { fig.root.position.x += p.fx * o.fwd * 1; fig.root.position.z += p.fy * o.fwd * 1; }
      if (o.up < 0) b.position.y += o.up;
      shout = o.shout;
    } else if (p.fallT > 0) { // knocked over: down fast, a pause on the grass, then back up
      const u = p.fallT / (p.fallMax || 1), lie = Math.min(Math.min(1, (1 - u) * 7), Math.min(1, u * 3.2)) * (p.fallKind === 3 ? 0.75 : 1);
      A[0].sh.rotation.z = A[1].sh.rotation.z = 0.6 * lie; A[0].fore.rotation.z = A[1].fore.rotation.z = 0.3 * lie;
      if (p.fallKind === 1) { b.rotation.z = -1.45 * lie; b.position.y = 0.92 - 0.62 * lie; L[0].hip.rotation.z = 0.5 * lie; L[1].hip.rotation.z = 0.1 * lie; L[1].low.rotation.z = -0.9 * lie; A[0].sh.rotation.z = A[1].sh.rotation.z = -2.2 * lie; }
      else if (p.fallKind === 2) { b.rotation.x = 1.4 * lie; b.position.y = 0.92 - 0.6 * lie; L[0].hip.rotation.z = -0.9 * lie; L[0].low.rotation.z = -1.0 * lie; L[1].hip.rotation.z = 0.3 * lie; A[0].sh.rotation.x = 0.9 * lie; }
      else { b.rotation.z = 1.4 * lie; b.position.y = 0.92 - 0.6 * lie; L[0].hip.rotation.z = -0.9 * lie; L[1].hip.rotation.z = -0.5 * lie; L[1].low.rotation.z = -1.0 * lie; A[0].sh.rotation.x = 0.8 * lie; A[1].sh.rotation.x = -0.8 * lie; }
      fig.root.position.y = 0;
    } else if (p.slideT > 0) { // sliding tackle: lie back with legs out front
      b.rotation.z = 1.3; b.position.y = 0.32; L[0].hip.rotation.z = L[1].hip.rotation.z = -1.35;
      L[0].low.rotation.z = L[1].low.rotation.z = 0; A[0].sh.rotation.z = A[1].sh.rotation.z = 2.2;
    } else if (mode === 'gk' && sp > 120) { // keeper diving across the goal
      const lat = Math.max(-1, Math.min(1, (p.vx * -p.fy + p.vy * p.fx) / 200));
      b.rotation.x = lat * 1.15; b.position.y = 0.92 - Math.abs(lat) * 0.35;
      A[0].sh.rotation.z = A[1].sh.rotation.z = 2.7;
    }
    if (fig.mouth) fig.mouth.visible = !!shout;
  };

  /* ---------- the ball ---------- */
  R.makeBall = function () {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d'), r = G.rng(3);
    x.fillStyle = '#fbfbf6'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#1b1e1c';
    for (let i = 0; i < 14; i++) { const cx = r() * 256, cy = 14 + r() * 100; x.beginPath(); for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.283 - 1.57; x.lineTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12); } x.fill(); }
    const mesh = new T.Mesh(new T.SphereGeometry(0.2, 20, 14), new T.MeshStandardMaterial({ map: R.canvasTex(c), roughness: 0.5 }));
    mesh.castShadow = true;
    const blob = new T.Mesh(new T.CircleGeometry(0.34, 16), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    return { mesh, blob };
  };

  const axis = new T.Vector3();
  R.poseBall = function (ball, b, dt) {
    const X = R.toX(b.x), Z = R.toZ(b.y), Y = 0.2 + b.z / 10;
    ball.mesh.position.set(X, Y, Z); ball.blob.position.set(X, 0.03, Z);
    const k = 1 / (1 + b.z / 40); ball.blob.scale.set(k, k, k); ball.blob.material.opacity = 0.38 * k;
    const vx = (b.vx || 0) / 10, vz = (b.vy || 0) / 10, sp = Math.hypot(vx, vz);
    if (sp > 0.05) { axis.set(vz, 0, -vx).normalize(); ball.mesh.rotateOnWorldAxis(axis, (sp * dt) / 0.2); }
  };

  /* ---------- floating name tag ---------- */
  R.makeTag = function () {
    const c = document.createElement('canvas'); c.width = 320; c.height = 72;
    const tex = R.canvasTex(c), spr = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(3.6, 0.81, 1); spr.renderOrder = 10;
    spr.setText = (txt, color) => {
      const x = c.getContext('2d'); x.clearRect(0, 0, 320, 72);
      x.fillStyle = 'rgba(8,18,13,0.78)'; x.fillRect(0, 8, 320, 56);
      x.fillStyle = color; x.fillRect(0, 8, 8, 56);
      x.fillStyle = '#f2f0e6'; x.font = '800 ' + (txt.length > 18 ? 29 : txt.length > 14 ? 34 : 40) + 'px "Big Shoulders Display", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(txt, 164, 38); tex.needsUpdate = true;
    };
    return spr;
  };
})();
