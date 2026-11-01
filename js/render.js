/* render.js - draws the stadium, players, ball and the little radar. */
(function () {
  const G = window.G, { W, H, GOAL, BOX, SIX } = G;
  const PAD = 150, SS = 1.6; // stadium margin and its offscreen resolution
  const cam = (G.cam = { x: W / 2, y: H / 2, z: 1 });
  let stadium = null;

  const ell = (c, x, y, rx, ry) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 6.283); c.fill(); };
  const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); };

  /* ---------- the stadium is painted once and reused ---------- */
  function paintStadium(x) {
    const r = G.rng(11);
    x.fillStyle = '#0c1511'; x.fillRect(-PAD, -PAD, W + 2 * PAD, H + 2 * PAD);
    const cols = ['#d94a3a', '#f2f0e6', '#ffd23f', '#3b6fd6', '#8a8f98', '#2fb7ff'];
    for (let i = 0; i < 5200; i++) { // the crowd
      const px = -PAD + r() * (W + 2 * PAD), py = -PAD + r() * (H + 2 * PAD);
      if (px > -72 && px < W + 72 && py > -72 && py < H + 72) continue;
      x.globalAlpha = 0.3 + r() * 0.5; x.fillStyle = cols[(r() * cols.length) | 0];
      circ(x, px, py, 2.2 + r() * 1.4);
    }
    x.globalAlpha = 1;
    x.fillStyle = '#235c34'; x.fillRect(-60, -60, W + 120, H + 120);
    const n = 15, sw = W / n;
    for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? '#2c7d41' : '#2f8746'; x.fillRect(i * sw, 0, sw + 0.5, H); }
    const ads = ['#ffd23f', '#2f7bff', '#e8452c', '#f2f0e6', '#35d07f'];
    for (let i = 0, xx = -60; xx < W + 60; i++, xx += 80) { x.fillStyle = ads[i % 5]; x.fillRect(xx + 2, -64, 76, 9); x.fillRect(xx + 2, H + 55, 76, 9); }
    for (let i = 0, yy = -52; yy < H + 52; i++, yy += 80) { x.fillStyle = ads[(i + 2) % 5]; x.fillRect(-64, yy + 2, 9, 76); x.fillRect(W + 55, yy + 2, 9, 76); }

    x.strokeStyle = 'rgba(244,244,236,0.92)'; x.lineWidth = 2.4; x.lineCap = 'round';
    x.strokeRect(0, 0, W, H);
    x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();
    x.beginPath(); x.arc(W / 2, H / 2, G.CIRC, 0, 6.283); x.stroke();
    x.fillStyle = 'rgba(244,244,236,0.92)'; circ(x, W / 2, H / 2, 3);
    const a = Math.acos((BOX.d - G.SPOT) / G.CIRC), by = (H - BOX.w) / 2, sy = (H - SIX.w) / 2;
    x.strokeRect(0, by, BOX.d, BOX.w); x.strokeRect(0, sy, SIX.d, SIX.w);
    x.strokeRect(W - BOX.d, by, BOX.d, BOX.w); x.strokeRect(W - SIX.d, sy, SIX.d, SIX.w);
    circ(x, G.SPOT, H / 2, 3); circ(x, W - G.SPOT, H / 2, 3);
    x.beginPath(); x.arc(G.SPOT, H / 2, G.CIRC, -a, a); x.stroke();
    x.beginPath(); x.arc(W - G.SPOT, H / 2, G.CIRC, Math.PI - a, Math.PI + a); x.stroke();
    [[0, 0, 0], [W, 0, Math.PI / 2], [W, H, Math.PI], [0, H, -Math.PI / 2]].forEach(([cx, cy, s]) => { x.beginPath(); x.arc(cx, cy, 10, s, s + Math.PI / 2); x.stroke(); });

    [[-GOAL.depth, 1], [W, 1]].forEach(([gx]) => { // goals with nets
      x.fillStyle = 'rgba(255,255,255,0.14)'; x.fillRect(gx, GOAL.top, GOAL.depth, GOAL.w);
      x.strokeStyle = 'rgba(255,255,255,0.32)'; x.lineWidth = 0.8; x.beginPath();
      for (let i = 0; i <= GOAL.depth; i += 5.5) { x.moveTo(gx + i, GOAL.top); x.lineTo(gx + i, GOAL.bot); }
      for (let j = GOAL.top; j <= GOAL.bot; j += 5.5) { x.moveTo(gx, j); x.lineTo(gx + GOAL.depth, j); }
      x.stroke();
      x.strokeStyle = '#fff'; x.lineWidth = 2.6; x.strokeRect(gx, GOAL.top, GOAL.depth, GOAL.w);
    });
    x.fillStyle = '#fff'; [GOAL.top, GOAL.bot].forEach((y) => { circ(x, 0, y, 3.2); circ(x, W, y, 3.2); });
  }

  function buildStadium() {
    stadium = document.createElement('canvas');
    stadium.width = Math.round((W + PAD * 2) * SS); stadium.height = Math.round((H + PAD * 2) * SS);
    const x = stadium.getContext('2d');
    x.scale(SS, SS); x.translate(PAD, PAD); paintStadium(x);
  }

  /* ---------- people and ball ---------- */
  function person(c, p, o) { // o: {shirt, shorts, trim, socks, look, ctrl}
    const sp = Math.hypot(p.vx || 0, p.vy || 0), L = o.look;
    c.save(); c.translate(p.x, p.y);
    c.fillStyle = 'rgba(0,0,0,0.28)'; ell(c, 0, 2, 9.5, 6);
    if (o.ctrl) { c.strokeStyle = '#ffd23f'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 2, 12, 8, 0, 0, 6.283); c.stroke(); }
    c.rotate(Math.atan2(p.fy, p.fx));
    if (p.slideT > 0) c.scale(1.35, 0.85);
    const sw = Math.sin(p.anim * 2.2) * Math.min(1, sp / 70) * 4.5;
    c.fillStyle = o.socks; ell(c, sw + 2.6, -3.3, 2.6, 1.7); ell(c, -sw + 2.6, 3.3, 2.6, 1.7);
    c.fillStyle = o.shorts; ell(c, sw, -3.2, 3.8, 2.5); ell(c, -sw, 3.2, 3.8, 2.5);
    c.fillStyle = o.shirt; ell(c, 0, 0, 4.9, 7.5);
    c.fillStyle = o.trim; ell(c, 0, -7, 2.1, 1.3); ell(c, 0, 7, 2.1, 1.3);
    c.fillStyle = L.hair; circ(c, 0.1, 0, 3.9);
    c.fillStyle = L.skin; circ(c, 1.4, 0, 3.1);
    c.restore();
  }

  function drawBall(c) {
    const b = G.m.ball, h = b.z;
    c.fillStyle = 'rgba(0,0,0,' + Math.max(0.12, 0.32 - h * 0.006) + ')'; ell(c, b.x + h * 0.2, b.y + 2, 4.2, 2.6);
    const by = b.y - h * 0.9 - 3, r = 4.3 + h * 0.035;
    c.save(); c.translate(b.x, by); c.rotate(b.spin);
    c.fillStyle = '#fafaf5'; circ(c, 0, 0, r);
    c.fillStyle = '#1c1f1d'; circ(c, 0, 0, r * 0.38);
    for (let i = 0; i < 5; i++) { const a = (i * Math.PI * 2) / 5; circ(c, Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.22); }
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.7; c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.stroke();
    c.restore();
  }

  function drawPlayer(c, p, isCtrl) {
    const T = G.TEAMS[p.team], gk = p.grp === 'GK';
    person(c, p, { shirt: gk ? T.keeper : T.color, shorts: gk ? '#26262c' : T.shorts, trim: gk ? '#1d1d22' : T.trim, socks: gk ? '#26262c' : T.socks, look: p.look, ctrl: isCtrl });
    if (isCtrl) {
      c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(p.x, p.y - 15); c.lineTo(p.x - 5, p.y - 23); c.lineTo(p.x + 5, p.y - 23); c.closePath(); c.fill();
      c.font = '700 10px "Atkinson Hyperlegible", system-ui, sans-serif'; c.textAlign = 'center';
      const label = p.num + '  ' + p.name.split(' ')[1].toUpperCase(), w = c.measureText(label).width + 8;
      c.fillStyle = 'rgba(8,18,13,0.75)'; c.fillRect(p.x - w / 2, p.y - 36, w, 12);
      c.fillStyle = '#f2f0e6'; c.fillText(label, p.x, p.y - 26.5);
    }
  }

  function drawCharge(c) {
    const m = G.m, ch = G.charge();
    if (!m.ctrl || ch.v <= 0) return;
    const p = m.ctrl, w = 36;
    c.fillStyle = 'rgba(8,18,13,0.8)'; c.fillRect(p.x - w / 2 - 2, p.y + 14, w + 4, 8);
    c.fillStyle = ch.kind === 'shoot' ? (ch.v > 0.9 ? '#ef4b36' : '#ffd23f') : '#7fd6ff';
    c.fillRect(p.x - w / 2, p.y + 16, w * ch.v, 4);
  }

  function drawRadar(c, cw) {
    const m = G.m, s = Math.max(0.55, cw / 960), rw = 150 * s, rh = (H / W) * rw, x0 = cw - rw - 12 * s, y0 = 12 * s, k = rw / W;
    c.fillStyle = 'rgba(8,18,13,0.62)'; c.fillRect(x0 - 4, y0 - 4, rw + 8, rh + 8);
    c.fillStyle = '#2a7a40'; c.fillRect(x0, y0, rw, rh);
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1;
    c.strokeRect(x0, y0, rw, rh); c.beginPath(); c.moveTo(x0 + rw / 2, y0); c.lineTo(x0 + rw / 2, y0 + rh); c.stroke();
    c.strokeRect(x0, y0 + ((H - BOX.w) / 2) * k, BOX.d * k, BOX.w * k); c.strokeRect(x0 + rw - BOX.d * k, y0 + ((H - BOX.w) / 2) * k, BOX.d * k, BOX.w * k);
    for (const p of m.players) {
      if (p.out) continue;
      c.fillStyle = p.grp === 'GK' ? G.TEAMS[p.team].keeper : G.TEAMS[p.team].color;
      circ(c, x0 + p.x * k, y0 + p.y * k, p === m.ctrl ? 3.2 * s : 2.3 * s);
      if (p === m.ctrl) { c.strokeStyle = '#ffd23f'; c.lineWidth = 1.2; c.beginPath(); c.arc(x0 + p.x * k, y0 + p.y * k, 4.6 * s, 0, 6.283); c.stroke(); }
    }
    c.fillStyle = '#fff'; circ(c, x0 + m.ball.x * k, y0 + m.ball.y * k, 2 * s);
  }

  G.drawRadar = drawRadar;

  /* ---------- the frame ---------- */
  G.draw = function (c, cw, ch, dt, cssW) {
    if (!stadium) buildStadium();
    const m = G.m, b = m.ball;
    const vw = cssW >= 900 ? 820 : Math.max(480, 820 - (900 - cssW) * 0.4);
    cam.z = cw / vw;
    const f = 1 - Math.exp(-dt * 4.5), hw = cw / cam.z / 2, hh = ch / cam.z / 2;
    cam.x += (b.x + (b.vx || 0) * 0.18 - cam.x) * f; cam.y += (b.y + (b.vy || 0) * 0.18 - cam.y) * f;
    cam.x = clamp(cam.x, Math.min(W / 2, -60 + hw), Math.max(W / 2, W + 60 - hw));
    cam.y = clamp(cam.y, Math.min(H / 2, -60 + hh), Math.max(H / 2, H + 60 - hh));

    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0c1511'; c.fillRect(0, 0, cw, ch);
    c.setTransform(cam.z, 0, 0, cam.z, cw / 2 - cam.x * cam.z, ch / 2 - cam.y * cam.z);
    c.drawImage(stadium, -PAD, -PAD, W + PAD * 2, H + PAD * 2);

    const r = m.ref;
    person(c, { x: r.x, y: r.y, vx: r.moving ? r.fx * 40 : 0, vy: r.moving ? r.fy * 40 : 0, fx: r.fx, fy: r.fy, anim: m.time * 6, slideT: 0 },
      { shirt: '#1b1b1f', shorts: '#111', trim: '#ffd23f', socks: '#111', look: { skin: '#d9a273', hair: '#222' } });

    const ps = m.players.filter((p) => !p.out).sort((a, d) => a.y - d.y);
    for (const p of ps) drawPlayer(c, p, p === m.ctrl && m.human >= 0);
    drawBall(c);
    drawCharge(c);

    c.setTransform(1, 0, 0, 1, 0, 0);
    drawRadar(c, cw);
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
})();
