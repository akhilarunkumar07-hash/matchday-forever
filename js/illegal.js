/* illegal.js - Illegal Soccer: 5v5 football with cartoon blasters, pickups and no rules. Pure game logic, no drawing (see illegal_view.js).
   World units are the same as the normal game: 10 px = 1 m, pitch 1050 x 680. Team 0 attacks right, team 1 attacks left. */
(function () {
  const G = window.G, { W, H, GOAL } = G;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), hyp = Math.hypot, rnd = Math.random;
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  G.fire = [false, false]; // is the fire button held (set by input.js)

  // Cartoon blasters. cd = seconds between shots, spd = bullet speed, kb = knockback, ex = explosion radius.
  const WEAP = {
    blaster: { name: 'Blaster', dmg: 9, cd: 0.36, spd: 1150, spread: 0.025, ammo: 999, range: 640, col: 0x7fd6ff, kb: 55, n: 1, min: 0 },
    spray:   { name: 'Spray SMG', dmg: 5, cd: 0.075, spd: 1050, spread: 0.1, ammo: 48, range: 520, col: 0xffe14a, kb: 22, n: 1, min: 0 },
    boom:    { name: 'Boomstick', dmg: 8, cd: 0.85, spd: 950, spread: 0.2, ammo: 7, range: 330, col: 0xff9a3d, kb: 125, n: 6, min: 0 },
    snipe:   { name: 'Longshot', dmg: 46, cd: 1.1, spd: 2300, spread: 0.004, ammo: 5, range: 1100, col: 0xff4d6d, kb: 280, n: 1, min: 200 },
    rocket:  { name: 'Rocketeer', dmg: 44, cd: 1.15, spd: 640, spread: 0.01, ammo: 4, range: 760, col: 0xff6a1a, kb: 0, n: 1, ex: 112, min: 110 },
    boing:   { name: 'Boing Cannon', dmg: 0, cd: 0.7, spd: 850, spread: 0.03, ammo: 7, range: 520, col: 0xb36bff, kb: 0, n: 1, ex: 80, min: 0 },
  };
  G.IL_WEAP = WEAP;
  const CRATES = [['spray', 20], ['boom', 18], ['snipe', 14], ['rocket', 13], ['boing', 12], ['medkit', 14], ['boots', 9]];
  const SQUAD = [2, 7, 6, 10, 9]; // which squad members play 5-a-side (a defender, two midfielders, two strikers)
  const HOME = [[0.15, 0.5], [0.3, 0.24], [0.3, 0.76], [0.42, 0.4], [0.42, 0.6]];
  const SQUAD_T = [7, 10], HOME_T = [[0.2, 0.5], [0.4, 0.5]]; // Tactical 2v2: a back player and a forward
  const HM = () => (G.il.tac ? HOME_T : HOME);
  const BASE = JSON.parse(JSON.stringify(WEAP));
  // Tactical weapons: slow, deliberate fire rates and slow bullets you can see and dodge
  const TAC = { blaster: { name: 'Pistol', cd: 0.6, spd: 480, spread: 0.02 }, spray: { cd: 0.45, spd: 460, ammo: 20, spread: 0.06 }, boom: { cd: 1.5, spd: 400, ammo: 5 }, snipe: { cd: 1.8, spd: 760, ammo: 3 }, rocket: { cd: 2, spd: 290, ammo: 3 }, boing: { cd: 1.2, spd: 360, ammo: 5 } };
  const SKILL = { easy: 0.6, normal: 0.85, hard: 1.1 };

  const IL = (G.il = { active: false, over: false, ev: [] });
  const dirOf = (t) => (t === 0 ? 1 : -1), goalXof = (t) => (t === 0 ? W : 0), ownXof = (t) => (t === 0 ? 0 : W);
  const ev = (o) => { if (IL.ev.length < 200) IL.ev.push(o); };
  IL.WEAP = WEAP;

  /* ---------------- setup ---------------- */
  IL.start = function (o) {
    const sk = SKILL[o.diff] || 0.85, tac = !!o.tac;
    for (const k in WEAP) Object.assign(WEAP[k], BASE[k], tac ? TAC[k] : {});
    Object.assign(IL, {
      active: true, tac, over: false, ev: [], humans: o.humans || [true, false], limit: o.limit || 180, target: o.target || 5, skill: sk,
      timeLeft: o.limit || 180, sudden: false, score: [0, 0], phase: 'intro', phaseT: 0, time: 0, players: [], bullets: [], crates: [], crateT: 0,
      ball: { x: W / 2, y: H / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, last: null, lock: 0, shooter: null, spin: 0 },
      ctrl: [null, null], scorer: null, winner: -1, feed: [], aim: [null, null], hitCd: 0, chasers: [[], []],
      stats: { goals: [0, 0], elims: [0, 0], kicks: [0, 0], picks: [0, 0] }, celebT: 0,
    });
    for (let t = 0; t < 2; t++) {
      const sq = G.makePlayers(t);
      (tac ? SQUAD_T : SQUAD).forEach((si, i) => {
        const s = sq[si];
        IL.players.push({
          team: t, i, name: s.name, num: s.num, look: s.look, celeb: s.celeb, pace: s.pace, shot: s.shot, drib: s.drib,
          x: 0, y: 0, vx: 0, vy: 0, fx: dirOf(t), fy: 0, anim: Math.random() * 6, hp: 100, wpn: { id: 'blaster', ammo: 999 },
          cd: 0, inv: 0, stunT: 0, stunMax: 1.5, dead: 0, fallT: 0, fallMax: 1, fallKind: 0, slideT: 0, sdx: 1, sdy: 0, dashCd: 0, stun: 0, boost: 0, stamina: 1,
          aimT: 0, react: 0, tgt: null, think: Math.random() * 0.4, elims: 0, goals: 0, tackleCd: 0, hitList: null, lunge: 0, kickT: 0,
        });
      });
    }
    IL.kickoff();
    const nSq = tac ? 2 : 5, fwd = (t) => IL.players.find((q) => q.team === t && q.i === nSq - 1);
    IL.ctrl[0] = IL.humans[0] ? fwd(0) : null; IL.ctrl[1] = IL.humans[1] ? fwd(1) : null;
    for (let i = 0; i < (tac ? 3 : 4); i++) spawnCrate(true);
    return IL;
  };
  IL.stop = function () { IL.active = false; IL.ev = []; };

  IL.kickoff = function () {
    const b = IL.ball;
    Object.assign(b, { x: W / 2, y: H / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, last: null, lock: 0, shooter: null });
    for (const p of IL.players) {
      const h = HM()[p.i], d = dirOf(p.team);
      p.x = d > 0 ? h[0] * W : W - h[0] * W; p.y = h[1] * H; p.vx = p.vy = 0; p.fx = d; p.fy = 0;
      p.hp = 100; p.dead = 0; p.fallT = 0; p.slideT = 0; p.stun = 0; p.stunT = 0; p.hx = undefined; p.inv = IL.tac ? 0 : 1.2; p.cd = 0.3; p.tgt = null;
    }
    IL.bullets.length = 0;
  };

  function spawnCrate(initial) {
    if (IL.crates.length >= (IL.tac ? 4 : 6)) return;
    let tries = 0, x, y;
    do { x = 140 + rnd() * (W - 280); y = 60 + rnd() * (H - 120); tries++; }
    while (tries < 12 && IL.crates.some((c) => hyp(c.x - x, c.y - y) < 130));
    let r = rnd() * CRATES.reduce((s, c) => s + c[1], 0), type = CRATES[0][0];
    for (const c of CRATES) { r -= c[1]; if (r <= 0) { type = c[0]; break; } }
    IL.crates.push({ x, y, type, t: 0, id: Math.random() });
    ev({ k: 'crate', x, y, type, initial: !!initial });
  }

  /* ---------------- helpers ---------------- */
  const alive = (p) => p.dead <= 0;
  const mates = (p) => IL.players.filter((q) => q.team === p.team && q !== p && alive(q));
  const foes = (p) => IL.players.filter((q) => q.team !== p.team && alive(q));
  const near = (list, x, y) => list.reduce((a, c) => (!a || hyp(c.x - x, c.y - y) < hyp(a.x - x, a.y - y) ? c : a), null);

  function release(p, vx, vy, vz) {
    const b = IL.ball;
    b.owner = null; b.vx = vx; b.vy = vy; b.vz = vz; b.lock = 0.28; b.last = p; b.shooter = p;
  }
  function take(p) {
    const b = IL.ball;
    b.owner = p; b.last = p; p.hx = undefined; b.vx = b.vy = b.vz = 0; b.z = 0; b.shooter = null;
  }

  /* ---------------- ball actions ---------------- */
  function kickBall(p, kind, pw, dx, dy) {
    const b = IL.ball;
    const kcost = kind === 'shoot' ? 0.15 : 0.08;
    if (IL.tac && p.stamina < kcost) return false; // too tired to kick
    const mine = b.owner === p, loose = !b.owner && hyp(b.x - p.x, b.y - p.y) < 26 && b.z < 20;
    if (!mine && !loose) return false;
    let m = hyp(dx, dy); if (m < 0.01) { dx = p.fx; dy = p.fy; m = 1; } dx /= m; dy /= m;
    const gx = goalXof(p.team);
    if (kind === 'shoot') {
      const dist = hyp(gx - p.x, H / 2 - p.y), toG = Math.atan2(H / 2 - p.y, gx - p.x), mine_a = Math.atan2(dy, dx);
      let diff = Math.abs(mine_a - toG); if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < 0.75 && dist < 700) { // aim assist: a shot roughly at goal goes at a corner of it
        const ty = H / 2 + (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 24), a = Math.atan2(ty - p.y, gx - p.x);
        dx = Math.cos(a) * 0.75 + dx * 0.25; dy = Math.sin(a) * 0.75 + dy * 0.25; const mm = hyp(dx, dy); dx /= mm; dy /= mm;
      }
      const sp = (500 + pw * 520) * (0.92 + (p.shot - 60) / 260);
      release(p, dx * sp, dy * sp, 8 + pw * pw * 46 * (0.3 + rnd() * 0.8));
    } else {
      let best = null, bs = 0.45;
      for (const q of mates(p)) {
        const ex = q.x - p.x, ey = q.y - p.y, dd = hyp(ex, ey); if (dd < 50 || dd > 640) continue;
        const cos = (ex * dx + ey * dy) / dd, s = cos - dd / 2600; if (s > bs) { bs = s; best = q; }
      }
      if (best) { const dd = hyp(best.x - p.x, best.y - p.y), t = dd / 600; let ex = best.x + best.vx * t * 0.7 - p.x, ey = best.y + best.vy * t * 0.7 - p.y; const e = hyp(ex, ey) || 1; dx = ex / e; dy = ey / e; }
      const tgtD = best ? hyp(best.x - p.x, best.y - p.y) : 300, sp = clamp(tgtD * 1.55 + 180, 300, 760) * (0.6 + 0.4 * pw);
      release(p, dx * sp, dy * sp, tgtD > 300 ? 30 : 0);
      IL.passTo = best;
    }
    p.fx = dx; p.fy = dy; p.lunge = 0.15; p.kickT = 0.18;
    if (IL.tac) p.stamina -= kcost;
    IL.stats.kicks[p.team]++; ev({ k: 'kick', p, kind });
    return true;
  }

  /* ---------------- weapons ---------------- */
  function fireWeapon(p, aimx, aimy) {
    if (p.cd > 0 || p.fallT > 0 || p.slideT > 0 || p.dead > 0 || p.stunT > 0) return false;
    if (IL.tac && p.stamina < 0.1) return false; // too tired to shoot
    let w = WEAP[p.wpn.id];
    if (p.wpn.ammo <= 0) { p.wpn = { id: 'blaster', ammo: 999 }; w = WEAP.blaster; }
    const m = hyp(aimx, aimy) || 1; aimx /= m; aimy /= m;
    p.fx = aimx; p.fy = aimy; p.cd = w.cd; p.aimT = 0.7; p.wpn.ammo--;
    if (IL.tac) p.stamina = Math.max(0, p.stamina - (w.cd > 1 ? 0.2 : 0.09));
    const base = Math.atan2(aimy, aimx);
    for (let i = 0; i < w.n; i++) {
      const a = base + (rnd() - 0.5) * 2 * w.spread + (w.n > 1 ? (i - (w.n - 1) / 2) * 0.07 : 0);
      const sp = w.spd * (0.92 + rnd() * 0.16);
      IL.bullets.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, team: p.team, own: p, w: p.wpn.id, life: w.range / sp, z: 11, trail: 0 });
    }
    if (p.wpn.id === 'boom' || p.wpn.id === 'rocket') { p.vx -= aimx * 70; p.vy -= aimy * 70; }
    ev({ k: 'muzzle', p, w: p.wpn.id, ax: aimx, ay: aimy });
    return true;
  }

  // Tactical: a hit never hurts or knocks anyone over. It stuns for exactly 1.5 s: slow, grey, ball dropped.
  function stunPlayer(p, dx, dy, src) {
    if (p.stunT > 0) return;
    p.stunT = p.stunMax = 1.5; p.vx += dx * 40; p.vy += dy * 40;
    const b = IL.ball; if (b.owner === p) { release(p, dx * 110, dy * 110, 10); b.lock = 0.4; }
    ev({ k: 'stun', p });
  }
  function hurt(p, dmg, dx, dy, kb, src, how) {
    if (!alive(p) || p.inv > 0 || IL.phase !== 'play') return;
    if (IL.tac) return stunPlayer(p, dx, dy, src);
    p.hp -= dmg; p.vx += dx * kb; p.vy += dy * kb; p.stun = Math.max(p.stun, 0.14);
    const heavy = kb >= 200 || dmg >= 30;
    if (heavy && p.fallT <= 0) { const fromFront = (dx * p.fx + dy * p.fy) < 0; fall(p, 0.85 + rnd() * 0.3, fromFront ? 0 : 1); }
    const b = IL.ball;
    if (b.owner === p && (heavy || rnd() < 0.5)) { release(p, dx * 260 + p.vx * 0.5, dy * 260 + p.vy * 0.5, 24); b.lock = 0.35; }
    if (dmg > 0) ev({ k: 'hit', x: p.x, y: p.y, dmg: Math.round(dmg), p, how });
    if (p.hp <= 0) eliminate(p, src);
  }
  function fall(p, dur, kind) {
    p.fallT = Math.max(p.fallT, dur); p.fallMax = Math.max(0.5, p.fallT); p.fallKind = kind; p.slideT = 0;
    const b = IL.ball; if (b.owner === p) release(p, p.vx * 0.5, p.vy * 0.5, 12);
  }
  function eliminate(p, src) {
    p.hp = 0; p.dead = 3.4; p.fallKind = 0; p.fallT = 2.2; p.fallMax = 2.2; p.vx *= 0.3; p.vy *= 0.3;
    const b = IL.ball; if (b.owner === p) release(p, 0, 0, 20);
    if (src && src.team !== p.team) { src.elims++; IL.stats.elims[src.team]++; }
    IL.feed.unshift({ t: 4, a: src && src !== p ? src.name : '', b: p.name, at: src ? src.team : -1, bt: p.team, w: src ? (src.wpn && src.wpn.id) : '' }); if (IL.feed.length > 5) IL.feed.pop();
    ev({ k: 'elim', p, src });
  }
  function respawn(p) {
    const d = dirOf(p.team), h = HM()[p.i];
    p.x = (d > 0 ? ownXof(p.team) + 90 + rnd() * 120 : ownXof(p.team) - 90 - rnd() * 120); p.y = 90 + rnd() * (H - 180);
    p.hp = 100; p.dead = 0; p.fallT = 0; p.vx = p.vy = 0; p.inv = 2; p.wpn = { id: 'blaster', ammo: 999 }; p.fx = d; p.fy = 0; p.cd = 0.3;
    ev({ k: 'respawn', p });
  }

  function explode(x, y, w, src, team) {
    const R = w.ex; ev({ k: 'boom', x, y, r: R, w: w === WEAP.boing ? 'boing' : 'rocket' });
    for (const p of IL.players) {
      if (!alive(p) || p.inv > 0) continue;
      const dx = p.x - x, dy = p.y - y, d = hyp(dx, dy);
      if (d > R + 12) continue;
      const k = 1 - d / (R + 12), ux = d > 1 ? dx / d : 0, uy = d > 1 ? dy / d : 1;
      if (p.team === team && p !== src) { p.vx += ux * 300 * k; p.vy += uy * 300 * k; continue; } // friends are only shoved
      if (p === src) { p.vx += ux * 240 * k; p.vy += uy * 240 * k; continue; } // a rocket jump, no damage
      if (IL.tac) { stunPlayer(p, ux, uy, src); p.vx += ux * 160 * k; p.vy += uy * 160 * k; continue; }
      if (w === WEAP.boing) { p.vx += ux * 520 * k; p.vy += uy * 520 * k; fall(p, 0.9, 0); p.stun = 0.3; continue; }
      hurt(p, w.dmg * (0.35 + 0.65 * k), ux, uy, 380 * k + 60, src, 'boom'); if (alive(p) && k > 0.35 && p.fallT <= 0) fall(p, 1.0, 0);
    }
    const b = IL.ball, dx = b.x - x, dy = b.y - y, d = hyp(dx, dy);
    if (d < R + 40) { const k = 1 - d / (R + 40), ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0; if (b.owner) release(b.owner, 0, 0, 0); b.vx += ux * 800 * k; b.vy += uy * 800 * k; b.vz += 120 * k; b.lock = 0.2; b.last = src || b.last; b.shooter = src; }
  }

  /* ---------------- intents: what a human or the computer wants to do this frame ---------------- */
  const newIntent = () => ({ mx: 0, my: 0, sprint: false, fire: false, aim: null, kick: null, dash: false });

  function pickTarget(p, cone, bias) { // the enemy a shot would go at (also drives the on-screen reticle)
    const w = WEAP[p.wpn.id], dirx = bias ? bias[0] : p.fx, diry = bias ? bias[1] : p.fy;
    let best = null, bs = -1;
    for (const q of foes(p)) {
      const ex = q.x - p.x, ey = q.y - p.y, d = hyp(ex, ey); if (d > w.range || d < Math.max(30, w.min * 0.5)) continue;
      const cos = (ex * dirx + ey * diry) / (d || 1); if (cos < Math.cos(cone)) continue;
      const s = cos * 1.2 - d / 1400; if (s > bs) { bs = s; best = q; }
    }
    return best;
  }
  function leadAim(p, q, err) {
    const w = WEAP[p.wpn.id], d = hyp(q.x - p.x, q.y - p.y), t = d / w.spd;
    let ax = q.x + q.vx * t * 0.9 - p.x, ay = q.y + q.vy * t * 0.9 - p.y;
    if (err) { const a = Math.atan2(ay, ax) + gauss() * err, m = hyp(ax, ay); ax = Math.cos(a) * m; ay = Math.sin(a) * m; }
    return [ax, ay];
  }

  function humanIntent(p, ti) {
    const I = ti === 0 ? G.input : G.input2, it = newIntent();
    let ix = I.x || 0, iy = I.y || 0; const mag = hyp(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    if (mag > 0.12) { it.mx = ix; it.my = iy; }
    it.sprint = !!I.sprint;
    const dirx = mag > 0.2 ? ix : p.fx, diry = mag > 0.2 ? iy : p.fy;
    const tgt = pickTarget(p, 0.95, [dirx, diry]);
    IL.aim[ti] = tgt;
    if (G.fire[ti]) { it.fire = true; it.aim = tgt ? leadAim(p, tgt, 0.01) : [dirx, diry]; }
    if (I.slide) { I.slide = false; it.dash = true; }
    if (I.tackle) I.tackle = false;
    if (I.rel) { const r = I.rel; I.rel = null; it.kick = { kind: r.kind, pw: clamp(r.t / 0.85, 0.4, 1), dx: dirx, dy: diry }; }
    if (I.sw) { I.sw = false; switchCtrl(ti); }
    return it;
  }
  function switchCtrl(ti) {
    const cur = IL.ctrl[ti], b = IL.ball;
    const list = IL.players.filter((q) => q.team === ti && alive(q) && q !== cur && q !== IL.ctrl[1 - ti]);
    const nxt = near(list, b.x, b.y); if (nxt) IL.ctrl[ti] = nxt;
  }

  function aiIntent(p, dt) {
    const it = newIntent(), b = IL.ball, d = dirOf(p.team), own = ownXof(p.team), gx = goalXof(p.team), sk = IL.skill;
    const fl = foes(p), ml = mates(p), w = WEAP[p.wpn.id];
    const bd = hyp(b.x - p.x, b.y - p.y);
    let tx = p.x, ty = p.y, speedMul = 1;
    const chaser = IL.chasers[p.team].includes(p);
    const hold = b.owner === p;
    const me = IL.players.filter((q) => q.team === p.team && q.i === 0)[0];
    // crates: grab a weapon or a medkit when it is close, or when we are not busy with the ball
    let crate = null, cs = 1e9;
    for (const c of IL.crates) {
      const dd = hyp(c.x - p.x, c.y - p.y), want = c.type === 'medkit' ? p.hp < 60 : c.type === 'boots' ? true : (p.wpn.id === 'blaster' || p.wpn.ammo < 3);
      if (!want) continue;
      const lim = hold ? 70 : chaser ? 150 : 330; if (dd < lim && dd < cs) { cs = dd; crate = c; }
    }
    if (hold) {
      const gd = hyp(gx - p.x, H / 2 - p.y), nf = near(fl, p.x, p.y), nfd = nf ? hyp(nf.x - p.x, nf.y - p.y) : 999;
      tx = gx; ty = H / 2 + clamp((p.y - H / 2) * 0.5, -120, 120);
      if (nf && nfd < 120) { const ax = p.x - nf.x, ay = p.y - nf.y, m = hyp(ax, ay) || 1; tx = p.x + (gx - p.x) * 0.5 + (ax / m) * 90; ty = p.y + (H / 2 - p.y) * 0.3 + (ay / m) * 120; }
      p.shootT = (p.shootT || 0) + dt;
      if (gd < 360 + (p.shot - 60) * 3 && Math.abs(p.y - H / 2) < 300 && p.shootT > 0.18 + p.think) { it.kick = { kind: 'shoot', pw: 0.78 + rnd() * 0.22, dx: gx - p.x, dy: H / 2 - p.y }; p.shootT = 0; }
      else if (nf && nfd < 60 && p.shootT > 0.5 && ml.length && rnd() < 0.03 * sk * 6) {
        const open = ml.filter((q) => (q.x - p.x) * d > 20).sort((a, c) => Math.abs(a.y - p.y) - Math.abs(c.y - p.y))[0];
        if (open) { it.kick = { kind: 'pass', pw: 0.8, dx: open.x - p.x, dy: open.y - p.y }; p.shootT = 0; }
      }
      it.sprint = true;
    } else if (crate && !(chaser && b.owner && b.owner.team !== p.team && bd < 120)) { tx = crate.x; ty = crate.y; it.sprint = true; }
    else if (b.owner && b.owner.team === p.team) { // support the carrier
      const o = b.owner, lat = (p.i % 2 ? 1 : -1) * (110 + p.i * 12);
      tx = clamp(o.x + d * (120 + p.i * 18), 60, W - 60); ty = clamp(o.y + lat, 50, H - 50);
      if (p.i === 0) { tx = own + d * 150; ty = H / 2 + (b.y - H / 2) * 0.4; }
    } else if (p.i === 0 && bd > 300 && Math.abs(b.x - own) > 330) { // the sweeper stays back
      tx = own + d * clamp(Math.abs(b.x - own) * 0.28, 110, 230); ty = H / 2 + (b.y - H / 2) * 0.38;
    } else if (chaser || bd < 140) {
      const o = b.owner; tx = o ? o.x + o.vx * 0.2 : b.x + b.vx * 0.25; ty = o ? o.y + o.vy * 0.2 : b.y + b.vy * 0.25; it.sprint = true;
      if (o && hyp(o.x - p.x, o.y - p.y) < 85 && p.dashCd <= 0 && p.stamina > 0.2 && rnd() < dt * 1.2 * sk) it.dash = true;
      if (!o && bd < 24 && b.z < 20 && rnd() < dt * 5) { // loose ball: clear it forward
        const a = Math.atan2(H / 2 - p.y, gx - p.x); it.kick = { kind: 'shoot', pw: 0.6, dx: Math.cos(a), dy: Math.sin(a) };
      }
    } else { // keep shape
      const h = HM()[p.i], hx = d > 0 ? h[0] * W : W - h[0] * W, hy = h[1] * H;
      tx = hx + (b.x - W / 2) * 0.42; ty = hy + (b.y - H / 2) * 0.32;
    }
    if (IL.tac && p.stamina < 0.45) it.sprint = false; // keep an energy reserve for kicks and shots
    const dx = tx - p.x, dy = ty - p.y, dd = hyp(dx, dy);
    if (dd > 14) { it.mx = dx / dd; it.my = dy / dd; speedMul = clamp(dd / 38, 0.25, 1); it.mx *= speedMul; it.my *= speedMul; }
    // shooting at enemies
    let tgt = null;
    if (!(hold && hyp(gx - p.x, H / 2 - p.y) < 330)) {
      tgt = pickTarget(p, 3.2, null);
      if (tgt && hyp(tgt.x - p.x, tgt.y - p.y) < Math.max(w.min, 40)) tgt = null;
    }
    if (tgt !== p.tgt) { p.tgt = tgt; p.react = (0.12 + rnd() * 0.3) / sk; }
    if (tgt) {
      p.react -= dt;
      if (p.react <= 0) { it.fire = true; it.aim = leadAim(p, tgt, (IL.tac ? 0.2 : 0.12) / sk); }
    }
    return it;
  }

  /* ---------------- per-player update ---------------- */
  function actPlayer(p, it, dt) {
    const b = IL.ball;
    p.cd = Math.max(0, p.cd - dt); p.inv = Math.max(0, p.inv - dt); p.stun = Math.max(0, p.stun - dt); p.dashCd = Math.max(0, p.dashCd - dt);
    p.stunT = Math.max(0, p.stunT - dt); p.aimT = Math.max(0, p.aimT - dt); p.boost = Math.max(0, p.boost - dt); p.lunge = Math.max(0, p.lunge - dt); p.kickT = Math.max(0, p.kickT - dt);
    p.tackleCd = 0;
    if (p.dead > 0) {
      p.dead -= dt; p.fallT = Math.max(p.fallT, 0.01); p.vx *= Math.exp(-6 * dt); p.vy *= Math.exp(-6 * dt);
      if (p.dead <= 0) respawn(p);
      return;
    }
    if (p.fallT > 0) { p.fallT -= dt; p.vx *= Math.exp(-5 * dt); p.vy *= Math.exp(-5 * dt); return; }
    const sprinting = it.sprint && p.stamina > 0.04 && !(IL.tac && p.stunT > 0), stunned = IL.tac && p.stunT > 0;
    let sp = (126 + (p.pace - 60) * 0.9) * (sprinting ? 1.32 : 1) * (p.boost > 0 ? 1.3 : 1) * (IL.humans[p.team] && IL.ctrl[p.team] === p ? 1 : (p.team === 0 ? 1 : 1) * (0.94 + IL.skill * 0.07));
    if (b.owner === p) sp *= 0.94;
    if (IL.tac) sp *= 0.7; // 30% slower than normal Illegal Soccer
    if (stunned) sp *= 0.3;
    if (p.stun > 0) sp *= 0.35;
    if (IL.tac) { const mv = hyp(it.mx, it.my) > 0.1; p.stamina = sprinting && mv ? Math.max(0, p.stamina - dt * 0.22) : Math.min(1, p.stamina + dt * (mv ? 0.1 : 0.22)); }
    else p.stamina = sprinting && (it.mx || it.my) ? Math.max(0, p.stamina - dt * 0.2) : Math.min(1, p.stamina + dt * 0.12);
    if (p.slideT > 0) { // dash tackle
      p.slideT -= dt; const k = Math.max(0, p.slideT / 0.42);
      p.vx = p.sdx * (70 + 430 * k * k); p.vy = p.sdy * (70 + 430 * k * k);
      for (const q of foes(p)) {
        if (q.inv > 0 || (p.hitList && p.hitList.includes(q))) continue;
        if (hyp(q.x - p.x, q.y - p.y) < 24) {
          (p.hitList = p.hitList || []).push(q);
          hurt(q, 14, p.sdx, p.sdy, 220, p, 'dash'); if (alive(q) && !IL.tac) fall(q, 1.0, rnd() < 0.5 ? 1 : 2);
          if (b.owner === q) { release(q, p.sdx * 280, p.sdy * 280, 14); b.lock = 0.1; }
          ev({ k: 'bash', p, q });
        }
      }
    } else {
      p.vx += (it.mx * sp - p.vx) * Math.min(1, dt * 9); p.vy += (it.my * sp - p.vy) * Math.min(1, dt * 9);
      if (it.dash && !stunned && p.dashCd <= 0 && p.stamina > (IL.tac ? 0.25 : 0.12)) {
        const m = hyp(p.vx, p.vy), ux = m > 20 ? p.vx / m : p.fx, uy = m > 20 ? p.vy / m : p.fy, n = hyp(ux, uy) || 1;
        p.slideT = 0.42; p.sdx = ux / n; p.sdy = uy / n; p.dashCd = 1.5; p.stamina -= IL.tac ? 0.25 : 0.1; p.hitList = []; p.fx = p.sdx; p.fy = p.sdy; ev({ k: 'dash', p });
      }
      if (it.fire && !stunned) { if (it.aim) { const m = hyp(it.aim[0], it.aim[1]) || 1; if (p.cd <= 0) fireWeapon(p, it.aim[0] / m, it.aim[1] / m); else { p.fx = it.aim[0] / m; p.fy = it.aim[1] / m; p.aimT = Math.max(p.aimT, 0.4); } } }
      else {
        const v = hyp(p.vx, p.vy);
        if (v > 18) { const f = Math.min(1, dt * 12); p.fx += (p.vx / v - p.fx) * f; p.fy += (p.vy / v - p.fy) * f; const n = hyp(p.fx, p.fy) || 1; p.fx /= n; p.fy /= n; }
      }
      if (it.kick && !stunned) kickBall(p, it.kick.kind, it.kick.pw, it.kick.dx, it.kick.dy);
    }
    p.x = clamp(p.x + p.vx * dt, 10, W - 10); p.y = clamp(p.y + p.vy * dt, 10, H - 10);
    p.anim += dt * hyp(p.vx, p.vy) * 0.075;
  }

  /* ---------------- bullets ---------------- */
  function stepBullets(dt) {
    const b = IL.ball;
    for (let i = IL.bullets.length - 1; i >= 0; i--) {
      const u = IL.bullets[i], w = WEAP[u.w], sp = hyp(u.vx, u.vy), n = Math.max(1, Math.ceil((sp * dt) / 9));
      let dead = false;
      for (let s = 0; s < n && !dead; s++) {
        u.x += (u.vx * dt) / n; u.y += (u.vy * dt) / n; u.life -= dt / n;
        if (u.life <= 0 || u.x < -30 || u.x > W + 30 || u.y < -10 || u.y > H + 10) { dead = true; if (w.ex && u.life <= 0) explode(u.x, u.y, w, u.own, u.team); break; }
        for (const p of IL.players) {
          if (!alive(p) || p.team === u.team || p.inv > 0) continue;
          if (hyp(p.x - u.x, p.y - u.y) < 14 && !(p.fallT > 0.6 && p.fallKind !== 3 && hyp(u.vx, u.vy) < 0)) {
            if (w.ex) explode(u.x, u.y, w, u.own, u.team);
            else { const m = hyp(u.vx, u.vy) || 1; hurt(p, w.dmg, u.vx / m, u.vy / m, w.kb, u.own, u.w); }
            dead = true; break;
          }
        }
        if (dead) break;
        if (!b.owner && hyp(b.x - u.x, b.y - u.y) < 12 && b.z < 22) { // shots push the ball
          const m = hyp(u.vx, u.vy) || 1;
          if (w.ex) { explode(u.x, u.y, w, u.own, u.team); }
          else { b.vx += (u.vx / m) * (180 + w.kb * 1.6); b.vy += (u.vy / m) * (180 + w.kb * 1.6); b.vz += 12; b.lock = 0.12; b.last = u.own; b.shooter = u.own; ev({ k: 'sparks', x: b.x, y: b.y, col: w.col }); }
          dead = true;
        }
      }
      if (dead) { ev({ k: 'bulletEnd', x: u.x, y: u.y, w: u.w }); IL.bullets.splice(i, 1); }
    }
  }

  /* ---------------- the ball ---------------- */
  function stepBall(dt) {
    const b = IL.ball;
    b.lock = Math.max(0, b.lock - dt);
    const o = b.owner;
    if (o) {
      if (!alive(o) || o.fallT > 0) release(o, o.vx * 0.5, o.vy * 0.5, 10);
      else {
        if (IL.tac) { // magnetism: the ball is drawn to the front of the dribbler, but a sharp change of direction breaks it
          const v = hyp(o.vx, o.vy);
          if (v > 35) {
            const ux = o.vx / v, uy = o.vy / v; if (o.hx === undefined) { o.hx = ux; o.hy = uy; }
            if (ux * o.hx + uy * o.hy < 0.0) { const hx = o.hx, hy = o.hy; o.hx = undefined; release(o, hx * v * 1.1, hy * v * 1.1, 6); b.lock = 0.3; ev({ k: 'loose', p: o }); }
            else { const f = Math.min(1, dt * 8); o.hx += (ux - o.hx) * f; o.hy += (uy - o.hy) * f; const n = hyp(o.hx, o.hy) || 1; o.hx /= n; o.hy /= n; }
          }
        }
      }
      if (b.owner === o) { const mg = IL.tac ? 13 : 22, off = IL.tac ? 13 : 12; b.x += (o.x + o.fx * off - b.x) * Math.min(1, dt * mg); b.y += (o.y + o.fy * off - b.y) * Math.min(1, dt * mg); b.vx = o.vx; b.vy = o.vy; b.z = 0; b.vz = 0; }
    }
    if (!b.owner) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= 150 * dt;
      if (b.z <= 0) { b.z = 0; if (b.vz < -14) b.vz = -b.vz * (IL.tac ? 0.32 : 0.52); else b.vz = 0; }
      const fr = b.z > 0 ? 0.12 : 0.85; const k = Math.exp(-fr * (IL.tac ? 2.2 : 1) * dt * (hyp(b.vx, b.vy) > 200 ? 0.9 : 1.6)); b.vx *= k; b.vy *= k;
      if (hyp(b.vx, b.vy) < 6 && b.z === 0) { b.vx = b.vy = 0; }
    }
    // goals and walls
    const mouth = Math.abs(b.y - H / 2) < GOAL.w / 2 - 1 && b.z < GOAL.h;
    if (IL.phase === 'play') {
      if (b.x >= W && mouth) return scoreGoal(0);
      if (b.x <= 0 && mouth) return scoreGoal(1);
    }
    const lim = IL.phase === 'goal' ? 22 : 0;
    if (b.x > W + lim) { b.x = W + lim; b.vx = -Math.abs(b.vx) * 0.55; if (b.owner) b.x = W - 1; }
    if (b.x < -lim) { b.x = -lim; b.vx = Math.abs(b.vx) * 0.55; if (b.owner) b.x = 1; }
    if (b.y < 3) { b.y = 3; b.vy = Math.abs(b.vy) * 0.6; }
    if (b.y > H - 3) { b.y = H - 3; b.vy = -Math.abs(b.vy) * 0.6; }
    if (IL.phase !== 'play') return;
    // players and the ball
    if (!b.owner) {
      const sp = hyp(b.vx, b.vy);
      for (const p of IL.players) {
        if (!alive(p) || p.fallT > 0 || p.slideT > 0 || p.stunT > 0) continue;
        const d = hyp(b.x - p.x, b.y - p.y);
        if (b.lock > 0 && b.last === p) continue;
        if (d < 15 && b.z < 14 && sp < 430 + (p.drib - 60) * 3) { take(p); ev({ k: 'take', p }); break; }
        if (d < 14 && b.z < 18 && sp >= 430 && b.shooter && b.shooter.team !== p.team && p.inv <= 0) { // a hard shot smacks into a player
          const ux = b.vx / sp, uy = b.vy / sp; hurt(p, clamp(sp / 55, 8, 20), ux, uy, 180, b.shooter, 'ball');
          b.vx *= -0.35; b.vy *= -0.35; b.vz = 30; b.lock = 0.2; b.last = p; ev({ k: 'ballhit', p }); break;
        }
      }
    }
  }

  function scoreGoal(team) {
    const b = IL.ball;
    IL.score[team]++; IL.stats.goals[team]++;
    let sc = b.last && b.last.team === team ? b.last : near(IL.players.filter((q) => q.team === team && alive(q)), b.x, b.y) || IL.players.find((q) => q.team === team);
    sc.goals++; IL.scorer = sc; IL.phase = 'goal'; IL.phaseT = 0;
    if (b.owner) release(b.owner, 0, 0, 0);
    b.vx *= 0.3; b.vy *= 0.3;
    ev({ k: 'goal', team, p: sc, og: !(b.last && b.last.team === team) });
  }

  /* ---------------- main step ---------------- */
  IL.step = function (dt) {
    if (!IL.active || IL.over) return;
    dt = Math.min(dt, 0.05);
    IL.time += dt; IL.phaseT += dt;
    for (const f of IL.feed) f.t -= dt; IL.feed = IL.feed.filter((f) => f.t > 0);
    if (IL.phase === 'intro') {
      if (IL.phaseT >= 3) { IL.phase = 'play'; IL.phaseT = 0; ev({ k: 'fight' }); }
      for (const p of IL.players) { p.anim += dt; }
      return;
    }
    if (IL.phase === 'goal') {
      stepBall(dt); stepBullets(dt);
      for (const p of IL.players) { p.vx *= 0.9; p.vy *= 0.9; p.fallT = Math.max(0, p.fallT - dt); if (p.dead > 0) { p.dead = Math.max(0.01, p.dead - dt); } }
      if (IL.phaseT > 3.8) {
        if (IL.score[0] >= IL.target || IL.score[1] >= IL.target || IL.sudden) return endMatch();
        IL.kickoff(); IL.phase = 'intro'; IL.phaseT = 1.6; IL.scorer = null;
      }
      return;
    }
    // play
    IL.timeLeft -= dt;
    if (IL.timeLeft <= 0 && !IL.sudden) { if (IL.score[0] === IL.score[1]) { IL.sudden = true; ev({ k: 'sudden' }); } else return endMatch(); }
    for (let t = 0; t < 2; t++) { // chasers: the two closest team-mates to the ball
      const c = IL.players.filter((q) => q.team === t && alive(q) && q.fallT <= 0 && !(q.i === 0 && Math.abs(IL.ball.x - ownXof(t)) > 380) && !(IL.humans[t] && IL.ctrl[t] === q))
        .sort((a, c2) => hyp(a.x - IL.ball.x, a.y - IL.ball.y) - hyp(c2.x - IL.ball.x, c2.y - IL.ball.y));
      IL.chasers[t] = c.slice(0, 2);
    }
    for (let t = 0; t < 2; t++) if (IL.humans[t] && (!IL.ctrl[t] || !alive(IL.ctrl[t]))) { const c = near(IL.players.filter((q) => q.team === t && alive(q)), IL.ball.x, IL.ball.y); if (c) IL.ctrl[t] = c; }
    for (const p of IL.players) {
      const human = IL.humans[p.team] && IL.ctrl[p.team] === p;
      const it = alive(p) ? (human ? humanIntent(p, p.team) : aiIntent(p, dt)) : newIntent();
      actPlayer(p, it, dt);
    }
    for (let a = 0; a < IL.players.length; a++) { // players do not overlap
      const p = IL.players[a]; if (!alive(p)) continue;
      for (let c = a + 1; c < IL.players.length; c++) {
        const q = IL.players[c]; if (!alive(q)) continue;
        const dx = q.x - p.x, dy = q.y - p.y, d = hyp(dx, dy);
        if (d < 19 && d > 0.01) { const push = (19 - d) * (IL.tac ? 0.35 : 0.5), ux = dx / d, uy = dy / d; p.x = clamp(p.x - ux * push, 10, W - 10); p.y = clamp(p.y - uy * push, 10, H - 10); q.x = clamp(q.x + ux * push, 10, W - 10); q.y = clamp(q.y + uy * push, 10, H - 10); }
      }
    }
    // the ball, kicked by a free player who is not carrying it
    stepBullets(dt); stepBall(dt);
    if (IL.phase !== 'play') return;
    for (const c of IL.crates) c.t += dt;
    IL.crateT -= dt; if (IL.crateT <= 0) { spawnCrate(false); IL.crateT = 3.5 + rnd() * 3; }
    for (let i = IL.crates.length - 1; i >= 0; i--) {
      const c = IL.crates[i];
      for (const p of IL.players) {
        if (!alive(p) || p.fallT > 0 || hyp(p.x - c.x, p.y - c.y) > 22) continue;
        if (c.type === 'medkit') { if (p.hp >= 100) continue; p.hp = Math.min(100, p.hp + 45); }
        else if (c.type === 'boots') p.boost = 9;
        else p.wpn = { id: c.type, ammo: WEAP[c.type].ammo };
        IL.stats.picks[p.team]++; ev({ k: 'pick', p, type: c.type, x: c.x, y: c.y }); IL.crates.splice(i, 1); break;
      }
    }
  };

  function endMatch() {
    IL.over = true; IL.phase = 'end'; IL.winner = IL.score[0] === IL.score[1] ? -1 : IL.score[0] > IL.score[1] ? 0 : 1; ev({ k: 'end' });
  }
})();
