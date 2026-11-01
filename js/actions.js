/* actions.js - what a player can do with the ball: pass, shoot, tackle. Plus fouls and cards. */
(function () {
  const G = window.G, { W, H, GOAL, BOX } = G;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hyp = Math.hypot, rnd = Math.random;
  G.clamp = clamp;
  G.hook = (n, ...a) => { if (G.hooks && G.hooks[n]) G.hooks[n](...a); };
  const hook = G.hook;
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 0.5; // roughly a bell curve, spread of about 1

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1);
    return hyp(px - (ax + dx * t), py - (ay + dy * t));
  }

  // Lets go of the ball with a velocity. Every kick goes through here.
  function release(p, vx, vy, vz) {
    const m = G.m, b = m.ball;
    b.owner = null; b.vx = vx; b.vy = vy; b.vz = vz; b.z = vz > 0 ? 2 : 0;
    p.kickCd = 0.35; m.lastTouch = p;
    if (m.phase === 'restart') G.beginPlay();
    hook('kick', hyp(vx, vy));
  }

  // Picks the best team-mate to pass to. (dx,dy) is the direction the player wants.
  // ai = true widens the search and prefers forward passes.
  G.findPass = function (p, dx, dy, ai) {
    const m = G.m, d = hyp(dx, dy) || 1;
    dx /= d; dy /= d;
    let best = null;
    for (const t of m.players) {
      if (t.team !== p.team || t === p || t.out) continue;
      if (t.grp === 'GK' && p.grp !== 'GK') continue;
      const vx = t.x - p.x, vy = t.y - p.y, dist = hyp(vx, vy);
      if (dist < 45 || dist > 560) continue;
      const cos = (vx * dx + vy * dy) / dist;
      if (cos < (ai ? -0.35 : 0.6)) continue;
      let open = 1;
      for (const o of m.players) {
        if (o.team === p.team || o.out) continue;
        open = Math.min(open, segDist(o.x, o.y, p.x, p.y, t.x, t.y) / 55);
        open = Math.min(open, 0.35 + (hyp(o.x - t.x, o.y - t.y) / 50) * 0.65);
      }
      if (ai && open < 0.25) continue;
      const fwd = ((t.x - p.x) * G.atkDir(p.team)) / dist;
      const s = cos * 1.1 + open * 0.9 - dist / 900 + (ai ? fwd * 0.7 : 0);
      if (!best || s > best.score) best = { t, score: s, open, cos };
    }
    return best;
  };

  G.doPass = function (p, pw, dx, dy, lofted, tgt) {
    const m = G.m, b = m.ball;
    if (b.owner !== p) return false;
    const best = tgt ? { t: tgt } : G.findPass(p, dx, dy, false);
    let tx, ty;
    if (best) {
      const t = best.t, d0 = hyp(t.x - p.x, t.y - p.y), lead = (d0 / 480) * 0.75;
      tx = t.x + t.vx * lead; ty = t.y + t.vy * lead;
    } else {
      const d = hyp(dx, dy) || 1, d0 = 150 + pw * 330;
      tx = p.x + (dx / d) * d0; ty = p.y + (dy / d) * d0;
    }
    const dist = hyp(tx - p.x, ty - p.y);
    const ang = Math.atan2(ty - p.y, tx - p.x) + gauss() * ((100 - p.pass) / 100) * 0.22;
    const speed = clamp(dist * 1.5 + 170, 250, 640);
    const vz = lofted ? Math.min(330, 350 * (dist / speed)) : 0;
    release(p, Math.cos(ang) * speed, Math.sin(ang) * speed, vz);
    m.stats.passes[p.team]++;
    return true;
  };

  // At a penalty the keeper has to guess a side before the ball is struck.
  function guessKeeper(shooter, ty) {
    const m = G.m;
    const k = m.players.find((q) => q.team !== shooter.team && q.grp === 'GK' && !q.out);
    m.penCamUntil = m.time + 2.8; m.penTaker = shooter;
    if (!k) return;
    if (G.isH(k.team)) { // a person is the keeper: he picks the dive with the stick
      const I = (k.team === 0 ? G.input : G.input2) || {}, ds = G.atkDir(shooter.team);
      k.penLock = 2.2; k.penWin = 0.4; k.penY = null;
      if (Math.abs(I.x || 0) > 0.3) { k.penY = H / 2 + Math.sign(I.x) * ds * 28; k.penT = 1.1; k.penWin = 0; }
      return;
    }
    const right = rnd() < clamp(0.26 * m.diff.keep * (k.keep / 80), 0.2, 0.7);
    const side = Math.sign(ty - H / 2) || 1;
    k.penY = H / 2 + (right ? side : -side) * 26; k.penT = 1.1;
  }

  // The power-shot zone: close enough and not too wide an angle. Outside it even a hard shot can be saved or missed.
  G.inZone = (p) => {
    const gx = G.goalX(p.team), dx = Math.abs(gx - p.x), dy = Math.abs(H / 2 - p.y);
    return dx > 15 && Math.hypot(dx, dy) <= 250 && dy / dx <= 1.5 && (gx - p.x) * G.atkDir(p.team) > 0;
  };
  // pw is power 0..1. vin is the up/down input: it picks the near or far corner.
  G.doShot = function (p, pw, dx, dy, vin) {
    const m = G.m, b = m.ball;
    if (b.owner !== p) return false;
    const gx = G.goalX(p.team), dist = hyp(gx - p.x, H / 2 - p.y);
    // aim: stick up/down picks a corner; otherwise go for the side the keeper is NOT covering
    const gk = m.players.find((q) => q.team !== p.team && q.grp === 'GK' && !q.out);
    const away = gk ? (gk.y < H / 2 ? 1 : -1) : (rnd() < 0.5 ? 1 : -1);
    const isPen = !!(m.rs && m.rs.type === 'penalty');
    const ty = Math.abs(vin || 0) > 0.35 ? H / 2 + Math.sign(vin) * (GOAL.w / 2 - (isPen ? 5 : 8)) : H / 2 + away * ((isPen ? 14 : 6) + rnd() * (GOAL.w / 2 - (isPen ? 22 : 16)));
    if (m.rs && m.rs.type === 'penalty') guessKeeper(p, ty);
    const pen = !!(m.rs && m.rs.type === 'penalty');
    const sure = pw >= 0.68 && !pen && G.inZone(p); // a power shot from the zone cannot be saved, blocked or missed
    const spread = sure ? 0 : ((100 - p.shot) / 100) * 0.11 + pw * 0.03 + dist * 0.00007;
    const ty2 = sure ? Math.max(H / 2 - (GOAL.w / 2 - 14), Math.min(H / 2 + (GOAL.w / 2 - 14), ty)) : ty;
    const ang = Math.atan2(ty2 - p.y, gx - p.x) + gauss() * spread;
    const speed = (430 + pw * 430) * (0.9 + (p.shot - 60) / 200);
    const lift = sure ? 18 + rnd() * 22 : 20 + pw * pw * 80 * (0.3 + rnd() * 0.9) + (pw > 0.9 && dist > 250 && rnd() < 0.4 ? 40 : 0);
    release(p, Math.cos(ang) * speed, Math.sin(ang) * speed, lift);
    m.stats.shots[p.team]++; m.lastShot = { p, t: m.time };
    m.sure = sure ? { team: p.team, t: m.time + 3 } : null;
    hook('shot', p);
    return true;
  };

  /* ---------------- tackling ---------------- */

  // A player goes to ground. kind: 0 on his back, 1 face down, 2 rolls onto his side, 3 sliding recovery.
  G.fall = function (p, dur, kind) {
    if (p.grp === 'GK' && kind !== 3) dur *= 0.7;
    p.fallT = Math.max(p.fallT, dur); p.fallMax = Math.max(0.5, p.fallT); p.fallKind = kind;
    p.vx *= 0.3; p.vy *= 0.3; p.stun = Math.max(p.stun, 0.2);
  };

  G.tackle = function (p, slide) {
    const m = G.m, b = m.ball, o = b.owner;
    if (m.phase !== 'play' || p.out || p.tackleCd > 0 || p.stun > 0 || p.fallT > 0 || p.slideT > 0 || o === p) return;
    p.tackleCd = slide ? 1.5 : 0.7;
    if (slide) { // contact is checked every frame of the slide (see slideContact)
      const d = hyp(p.fx, p.fy) || 1;
      p.slideT = 0.45; p.slideDone = false; p.sdx = p.fx / d; p.sdy = p.fy / d;
      hook('slide');
    } else if (o && o.team !== p.team && hyp(o.x - p.x, o.y - p.y) < 26) {
      resolveTackle(p, o, false);
    } else if (!o && hyp(b.x - p.x, b.y - p.y) < 20 && hyp(b.vx, b.vy) < 260 && b.z < 10) {
      G.takeBall(p);
    }
  };

  // Called every frame while a player is sliding. A slide only makes contact with what is in front of the sliding foot.
  G.slideContact = function (p) {
    const m = G.m, b = m.ball, o = b.owner;
    if (p.slideDone || m.phase !== 'play') return;
    const ahead = (q) => { const dx = q.x - p.x, dy = q.y - p.y, d = hyp(dx, dy) || 1; return (dx * p.sdx + dy * p.sdy) / d > 0.15; };
    if (o && o.team !== p.team && hyp(o.x - p.x, o.y - p.y) < 25 && ahead(o)) {
      p.slideDone = true; resolveTackle(p, o, true);
    } else if (!o && hyp(b.x - p.x, b.y - p.y) < 20 && b.z < 12) {
      p.slideDone = true; // a clean slide on a loose ball sweeps it away
      b.vx = p.sdx * 280 + (rnd() - 0.5) * 60; b.vy = p.sdy * 280 + (rnd() - 0.5) * 60; m.lastTouch = p; hook('kick', 280);
    } else {
      for (const q of m.players) { // taking out a man who does not have the ball
        if (q.team === p.team || q.out || q === o || q.fallT > 0 || hyp(q.x - p.x, q.y - p.y) > 15 || !ahead(q)) continue;
        p.slideDone = true;
        if (rnd() < 0.6) G.foul(p, q, { slide: true, behind: (q.fx * p.sdx + q.fy * p.sdy) > 0.45 });
        else G.fall(q, 0.6, 2); // he hops over the leg, no foul
        break;
      }
    }
  };

  function resolveTackle(p, o, slide) {
    const m = G.m, b = m.ball;
    const vx = o.x - p.x, vy = o.y - p.y, d = hyp(vx, vy) || 1;
    const behind = (o.fx * vx + o.fy * vy) / d > 0.45; // the tackler is coming from behind the ball carrier
    let win = 0.40 + (p.tackle - o.drib) / 180 + (slide ? 0.12 : 0) + (behind ? 0.06 : 0) - (hyp(o.vx, o.vy) > 110 ? 0.05 : 0);
    if (!G.isH(p.team)) win *= m.diff.tackle;
    if (G.isH(o.team)) win *= 0.78; // it is easier to keep the ball when you are the one dribbling
    win = clamp(win, 0.12, 0.88);
    if (rnd() < win) { // took the ball cleanly
      const sp = 150 + rnd() * 100;
      b.owner = null; b.vx = (vx / d) * sp + p.vx * 0.3; b.vy = (vy / d) * sp + p.vy * 0.3; b.vz = 0;
      o.stun = 0.5; p.kickCd = 0.12; m.lastTouch = p;
      hook('tackle');
      if (slide) {
        G.fall(p, 0.7, 3); // the tackler ends up on the floor
        if (rnd() < (behind ? 0.2 : 0.04)) G.foul(p, o, { slide, behind }); // got the ball but took the man too
        else if (rnd() < 0.6) G.fall(o, 0.9 + rnd() * 0.5, behind ? 1 : 2); // the carrier tumbles over the leg, play on
      } else if (rnd() < 0.3) G.fall(o, 0.7 + rnd() * 0.3, 2); // knocked off balance
    } else { // missed the ball
      p.stun = slide ? 0.5 : 0.35;
      const foulP = slide ? (behind ? 0.92 : 0.65) : (behind ? 0.5 : 0.1);
      if (rnd() < foulP) G.foul(p, o, { slide, behind });
      else if (slide) G.fall(p, 0.8, 3);
    }
  }

  /* ---------------- fouls and cards ---------------- */

  function inBox(team, x, y) { return Math.abs(x - G.ownX(team)) <= BOX.d && Math.abs(y - H / 2) <= BOX.w / 2; }

  G.foul = function (off, vic, info) {
    const m = G.m, b = m.ball;
    if (m.phase !== 'play') return;
    m.stats.fouls[off.team]++;
    let card = null;
    const sev = (info.slide ? 1 : 0) + (info.behind ? 1 : 0);
    if (rnd() < 0.006 + (info.slide && info.behind ? 0.04 : 0)) card = 'red';
    else if (rnd() < 0.1 + 0.22 * sev) { off.yellow++; card = off.yellow >= 2 ? 'second' : 'yellow'; }
    if (card === 'yellow' || card === 'second') m.stats.yellow[off.team]++;
    if (card === 'red' || card === 'second') { off.out = true; m.stats.red[off.team]++; }
    m.flash = { card, who: off, t: m.time };

    const pen = inBox(off.team, vic.x, vic.y);
    const d = G.atkDir(vic.team);
    m.pending = pen
      ? { type: 'penalty', team: vic.team, x: G.goalX(vic.team) - d * G.SPOT, y: H / 2 }
      : { type: 'freekick', team: vic.team, x: clamp(vic.x, 10, W - 10), y: clamp(vic.y, 10, H - 10) };
    m.foulAt = { x: vic.x, y: vic.y };
    m.foulDur = card ? 2.8 : 1.4;
    b.owner = null; b.vx = b.vy = 0; b.vz = 0;
    G.fall(vic, card ? 2.6 : 1.8, info.slide ? (info.behind ? 1 : 2) : (info.behind ? 1 : 0)); // the victim goes down
    if (info.slide) G.fall(off, 0.9, 3);
    m.phase = 'foul'; m.phaseT = 0;
    hook('whistle');
    hook('foul', off, vic, card, pen);
  };
})();
