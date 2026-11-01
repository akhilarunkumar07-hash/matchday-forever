/* ai.js - how the computer-controlled players (and your team-mates) think. */
(function () {
  const G = window.G, { W, H, GOAL, BOX } = G;
  const clamp = G.clamp, hyp = Math.hypot, rnd = Math.random, hook = G.hook;

  // Where a player "wants" to stand: his formation spot, shifted towards the ball.
  G.anchor = function (p, attacking) {
    const m = G.m, b = m.ball, h = G.home(p), d = G.atkDir(p.team);
    let x = h.x + (b.x - W / 2) * 0.5, y = h.y + (b.y - H / 2) * 0.3;
    const push = p.grp === 'FWD' ? [110, -30] : p.grp === 'MID' ? [70, -15] : p.grp === 'DEF' ? [30, -15] : [0, 0];
    x += d * (attacking ? push[0] : push[1]);
    if (p.grp === 'DEF') x = d > 0 ? Math.min(x, W * 0.62) : Math.max(x, W * 0.38); // defenders stay home
    for (const q of m.players) { // do not bunch up with team-mates
      if (q === p || q.team !== p.team || q.out) continue;
      const dx = x - q.x, dy = y - q.y, dd = hyp(dx, dy);
      if (dd < 38 && dd > 0.1) { x += (dx / dd) * (38 - dd) * 0.5; y += (dy / dd) * (38 - dd) * 0.5; }
    }
    return { x: clamp(x, 30, W - 30), y: clamp(y, 25, H - 25) };
  };

  G.ai = function (p, dt) {
    const m = G.m, b = m.ball, o = b.owner, d = G.atkDir(p.team), team = p.team;
    p.sprint = false; p.mul = 1;
    if (o === p) { carry(p, dt); return; }
    if (o && o.team === team) { // we have the ball: support and make runs
      const a = G.anchor(p, true);
      p.tx = a.x; p.ty = a.y;
      if (p.grp !== 'DEF' && hyp(o.x - p.x, o.y - p.y) < 170) {
        p.tx = clamp(o.x + d * 80, 30, W - 30); p.ty = clamp(o.y + (p.i % 2 ? 1 : -1) * 85, 25, H - 25);
      }
      p.sprint = hyp(p.tx - p.x, p.ty - p.y) > 70;
    } else if (o) { // they have the ball: press, cover, or mark
      if (p === m.chaser[team]) press(p, o, dt);
      else if (p === m.second[team] && hyp(o.x - p.x, o.y - p.y) < 220) {
        p.tx = o.x + (G.ownX(team) - o.x) * 0.22; p.ty = o.y + (H / 2 - o.y) * 0.1; p.sprint = true;
      } else {
        const a = G.anchor(p, false);
        p.tx = a.x; p.ty = a.y;
        if (p.grp !== 'FWD') mark(p, a);
        p.sprint = hyp(p.tx - p.x, p.ty - p.y) > 90;
      }
    } else { // loose ball
      if (p === m.chaser[team] || (p === m.second[team] && hyp(b.x - p.x, b.y - p.y) < 140)) {
        p.tx = b.x + b.vx * 0.3; p.ty = b.y + b.vy * 0.3; p.sprint = true;
      } else {
        const a = G.anchor(p, !!(m.lastTouch && m.lastTouch.team === team));
        p.tx = a.x; p.ty = a.y; p.sprint = hyp(p.tx - p.x, p.ty - p.y) > 90;
      }
    }
    if (p.stamina < 0.2) p.sprint = false;
  };

  function mark(p, a) { // stand goal-side of the nearest attacker
    let best = null, bd = 85;
    for (const q of G.m.players) {
      if (q.team === p.team || q.out || q === G.m.ball.owner || q.grp === 'GK') continue;
      const dd = hyp(q.x - a.x, q.y - a.y);
      if (dd < bd) { bd = dd; best = q; }
    }
    if (best) { p.tx = best.x + (G.ownX(p.team) - best.x) * 0.06; p.ty = best.y; }
  }

  function press(p, o, dt) { // run at the ball carrier and try to take the ball
    const m = G.m;
    p.tx = o.x + o.vx * 0.18; p.ty = o.y + o.vy * 0.18; p.sprint = true;
    const dist = hyp(o.x - p.x, o.y - p.y);
    if (p.tackleCd > 0 || p.stun > 0 || p.fallT > 0) return;
    if (dist < 24 && rnd() < dt * 1.5 * m.diff.tackle) G.tackle(p, false);
    else if (dist >= 26 && dist < 46 && rnd() < dt * 0.2) { // a risky slide
      const d = hyp(o.x - p.x, o.y - p.y) || 1;
      p.fx = (o.x - p.x) / d; p.fy = (o.y - p.y) / d;
      G.tackle(p, true);
    }
  }

  function carry(p, dt) { // dribble towards goal, then decide: shoot, pass, or keep going
    const m = G.m, d = G.atkDir(p.team), gx = G.goalX(p.team);
    let tx = gx, ty = H / 2 + clamp(p.y - H / 2, -120, 120) * 0.4, near = null, nd = 1e9;
    for (const o of m.players) {
      if (o.team === p.team || o.out) continue;
      const dx = o.x - p.x, dy = o.y - p.y, dd = hyp(dx, dy);
      if (dd < nd && dx * d > -10) { nd = dd; near = o; }
    }
    if (near && nd < 75) { ty = p.y + (p.y > near.y ? 1 : -1) * 90; tx = p.x + d * 60; } // go around him
    p.tx = tx; p.ty = ty; p.sprint = p.stamina > 0.2;

    p.think -= dt;
    if (p.think > 0 || m.phase !== 'play') return;
    p.think = 0.12 + rnd() * 0.2 + m.diff.think * 0.5;
    const dist = hyp(gx - p.x, H / 2 - p.y), pressured = near && nd < 48;
    const range = 250 + (p.shot - 70) * 3;
    if (dist < range && rnd() < (dist < 150 ? 0.55 : 0.28) * (p.grp === 'FWD' ? 1.4 : 0.9) * m.diff.shoot) {
      G.doShot(p, 0.12 + rnd() * 0.6, d, 0, rnd() < 0.4 ? (rnd() < 0.5 ? -1 : 1) : 0);
      return;
    }
    const best = G.findPass(p, d, 0, true);
    if (best && ((pressured && rnd() < 0.85) || (best.score > 1.25 && rnd() < 0.4) || (dist > 520 && best.score > 1.0 && rnd() < 0.25))) {
      const t = best.t, far = hyp(t.x - p.x, t.y - p.y) > 260;
      G.doPass(p, 0.6, t.x - p.x, t.y - p.y, far && rnd() < 0.5, t);
    }
  }

  /* ---------------- goalkeepers ---------------- */

  G.aiKeeper = function (k, dt) {
    const m = G.m, b = m.ball, d = G.atkDir(k.team), ox = G.ownX(k.team);
    k.mul = 1; k.sprint = false;
    if (m.phase === 'restart' && m.rs && m.rs.taker === k) { k.tx = k.x; k.ty = k.y; return; }
    if (b.owner === k) { // holding the ball: wait a moment, then throw or kick it out
      k.tx = k.x; k.ty = k.y; k.hold += dt;
      if (k.hold > 1.3) {
        k.hold = 0;
        const best = G.findPass(k, d, 0, true);
        G.doPass(k, 0.8, best ? best.t.x - k.x : d, best ? best.t.y - k.y : 0, true, best ? best.t : undefined);
      }
      return;
    }
    k.hold = 0;
    if (G.isH(k.team) && (k.penLock > 0 || (m.phase === 'restart' && m.rs && m.rs.type === 'penalty' && m.rs.taker && m.rs.taker.team !== k.team))) {
      const I = (k.team === 0 ? G.input : G.input2) || {}, ds = -d;
      if (k.penLock > 0) { // the kick is away: a late lean still counts for a moment
        k.penLock -= dt;
        if (k.penWin > 0) { k.penWin -= dt; if (k.penY === null && Math.abs(I.x || 0) > 0.3) { k.penY = H / 2 + Math.sign(I.x) * ds * 28; k.penT = 1.1; k.penWin = 0; } }
        if (k.penY !== null) { k.tx = ox + d * 6; k.ty = k.penY; k.mul = 2.3 * (k.keep / 80); }
        else { k.tx = k.x; k.ty = k.y; k.mul = 0; }
      } else { // waiting on the line: shuffle a little with the stick
        k.tx = ox + d * 6; k.ty = H / 2 + clamp(I.x || 0, -1, 1) * ds * 16; k.mul = 0.7;
      }
      return;
    }
    let tx = ox + d * clamp(hyp(b.x - ox, b.y - H / 2) * 0.1, 12, 45);
    let ty = clamp(H / 2 + (b.y - H / 2) * 0.32, GOAL.top - 12, GOAL.bot + 12);
    let boost = 1;
    if (!b.owner && b.vx * -d > 150) { // the ball is heading for our goal: move to where it will cross the line
      const t = Math.abs(b.x - ox) / Math.abs(b.vx);
      if (t < 1.1) { ty = clamp(b.y + b.vy * t, GOAL.top - 6, GOAL.bot + 6); tx = ox + d * 8; boost = 1.9; }
    }
    if (k.penY !== null) { ty = k.penY; tx = ox + d * 6; boost = 2.3; } // penalty: dive early
    if (!b.owner && hyp(b.vx, b.vy) < 120 && Math.abs(b.x - ox) < BOX.d && Math.abs(b.y - H / 2) < BOX.w / 2) {
      const mine = m.players.filter((q) => q.team === k.team && !q.out).reduce((a, c) => (hyp(c.x - b.x, c.y - b.y) < hyp(a.x - b.x, a.y - b.y) ? c : a));
      if (mine === k) { tx = b.x; ty = b.y; boost = 1.3; } // come out and claim a loose ball
    }
    k.tx = tx; k.ty = ty;
    k.mul = boost * (k.keep / 80) * (G.isH(k.team) ? 1 : m.diff.keep);
  };

  G.keeperSave = function (k) {
    const m = G.m, b = m.ball, sp = hyp(b.vx, b.vy);
    if (k.kickCd > 0) return;
    let p = clamp(0.97 - sp / 1150 + (k.keep - 75) / 160, 0.12, 0.95);
    if (sp > 650) p *= 0.8; // a very hard shot is a bit harder to hold
    if (k.penY !== null && k.penT > 0) p = clamp(0.9 - (sp - 520) / 1000, 0.45, 0.9); // a keeper who dives the right way usually gets there at a penalty
    if (!G.isH(k.team)) p = Math.min(0.95, p * m.diff.keep);
    if (m.sure && m.sure.team !== k.team && m.time < m.sure.t) { k.kickCd = 0.4; hook('save', false, null); return; } // a power shot cannot be stopped
    if (m.lastShot && m.time - m.lastShot.t < 2.5 && m.lastShot.p.team !== k.team) m.stats.saves[k.team]++;
    if (rnd() < p) { G.takeBall(k); hook('save', true, k); }
    else { // parried away
      const d = G.atkDir(k.team);
      b.vx = d * (120 + rnd() * 120); b.vy = (rnd() - 0.5) * 320; b.vz = 60;
      k.kickCd = 0.5; m.lastTouch = k; hook('save', false, k);
    }
  };

  /* ---------------- set pieces ---------------- */

  G.aiRestart = function (p) { // everyone else walks to a sensible spot while a kick is being set up
    const m = G.m, rs = m.rs;
    p.sprint = false; p.mul = 1;
    if (p === rs.taker || rs.type === 'kickoff' || rs.type === 'penalty') { p.tx = p.x; p.ty = p.y; return; }
    if (p.wall) { p.tx = p.wall.x; p.ty = p.wall.y; p.sprint = true; return; }
    const attacking = p.team === rs.team;
    let a = G.anchor(p, attacking);
    if (rs.type === 'corner') { // crowd into the box
      const gx = G.goalX(rs.team), dd = G.atkDir(rs.team);
      a = { x: gx - dd * (60 + (p.i % 4) * 22), y: H / 2 + ((p.i % 5) - 2) * 36 };
    }
    if (!attacking && hyp(a.x - rs.x, a.y - rs.y) < 95) { // opponents keep their distance
      const dx = a.x - rs.x, dy = a.y - rs.y, k = 95 / (hyp(dx, dy) || 1);
      a = { x: rs.x + dx * k, y: rs.y + dy * k };
    }
    p.tx = clamp(a.x, 10, W - 10); p.ty = clamp(a.y, 10, H - 10);
    p.sprint = hyp(p.tx - p.x, p.ty - p.y) > 60;
  };

  G.aiTake = function (k) { // the computer takes a set piece
    const m = G.m, rs = m.rs, t = rs.type, d = G.atkDir(k.team), gx = G.goalX(k.team);
    const dist = hyp(gx - k.x, H / 2 - k.y);
    const side = rnd() < 0.5 ? -1 : 1;
    if (t === 'penalty') { G.doShot(k, 0.7 + rnd() * 0.2, d, 0, side); return; }
    if (t === 'freekick' && dist < 300 && rnd() < 0.75) { G.doShot(k, 0.8, d, 0, side); return; }
    if (t === 'corner') {
      const box = m.players.filter((q) => q.team === k.team && q !== k && !q.out && q.grp !== 'GK');
      const mate = box.reduce((a, c) => (hyp(c.x - (gx - d * 90), c.y - H / 2) < hyp(a.x - (gx - d * 90), a.y - H / 2) ? c : a));
      G.doPass(k, 0.7, mate.x - k.x, mate.y - k.y, true, mate); return;
    }
    const dx = t === 'throwin' ? d * 0.4 : d, dy = t === 'throwin' ? k.fy * 0.9 : 0;
    const best = G.findPass(k, dx, dy, true);
    const long = t === 'goalkick' || (t === 'freekick' && dist > 300);
    if (best) G.doPass(k, 0.7, best.t.x - k.x, best.t.y - k.y, long, best.t);
    else G.doPass(k, 0.6, dx, dy, long);
  };
})();
