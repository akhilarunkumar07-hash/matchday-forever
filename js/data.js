/* data.js - pitch size, formation, difficulty, and the two generated squads. */
(function () {
  const G = (window.G = window.G || {});

  // World units: 10 pixels = 1 metre. Pitch is 105 x 68 m.
  G.W = 1050; G.H = 680;
  G.GOAL = { w: 73, depth: 22, h: 24 };
  G.GOAL.top = (G.H - G.GOAL.w) / 2;
  G.GOAL.bot = G.GOAL.top + G.GOAL.w;
  G.BOX = { d: 165, w: 403 };
  G.SIX = { d: 55, w: 183 };
  G.SPOT = 110;
  G.CIRC = 91.5;

  // Seeded random so the generated players look the same every time.
  G.rng = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // role, group, x, y (fractions of the pitch for a team attacking to the right). 4-4-2.
  G.FORMATION = [
    ['GK', 'GK', 0.02, 0.5],
    ['LB', 'DEF', 0.2, 0.14], ['CB', 'DEF', 0.17, 0.38], ['CB', 'DEF', 0.17, 0.62], ['RB', 'DEF', 0.2, 0.86],
    ['LM', 'MID', 0.42, 0.1], ['CM', 'MID', 0.37, 0.37], ['CM', 'MID', 0.37, 0.63], ['RM', 'MID', 0.42, 0.9],
    ['ST', 'FWD', 0.62, 0.38], ['ST', 'FWD', 0.62, 0.62],
  ];

  // Difficulty only changes the computer team (and both keepers' thinking a little).
  G.DIFF = {
    easy:   { label: 'Easy',   speed: 0.92, tackle: 0.7,  keep: 0.8,  think: 0.3,  shoot: 0.7 },
    normal: { label: 'Normal', speed: 1.0,  tackle: 1.0,  keep: 1.0,  think: 0.18, shoot: 1.0 },
    hard:   { label: 'Hard',   speed: 1.06, tackle: 1.25, keep: 1.18, think: 0.1,  shoot: 1.25 },
  };

  // 15 parody clubs from around the world. Squad order matches G.FORMATION: GK, LB, CB, CB, RB, LM, CM, CM, RM, ST, ST.
  const NUMS = [1, 3, 4, 5, 2, 11, 8, 6, 7, 9, 10], BASE = [1, 1, 2, 1, 1, 2, 2, 2, 2, 6, 6];
  const NUM_FIX = { 'Cristiano Ronaldough': 7, 'Bukayo Sacka': 17, 'Lamine Yamaha': 19, 'Kilogram Mbappe': 10, 'Lionel Messy': 10, 'Neymar Diver': 10 };
  const CLUBS = [
    ['Real Madness', 'RMD', 'Spain', 5, ['#2f7bff', '#f4f4f4', '#2f7bff', '#ffffff', '#f2d03b'], ['Manuel Gluer', 'Alphonso Daisies', 'Virgil Vandive', 'Harry Magwhere', 'Trent Alexander-Armpit', 'Vinicius Juniper', 'Jude Bellingjam', 'Kevin De-Brownie', 'Lamine Yamaha', 'Eating Halland', 'Kilogram Mbappe']],
    ['Bayern Munchies', 'BYM', 'Germany', 4, ['#e8452c', '#1b1b1f', '#e8452c', '#ffd23f', '#35d07f'], ['Emiliano Martini', 'Andy Robertsoup', 'Ruben Dice', 'William Salibaba', 'Kyle Talker', 'Mo Salad', 'Declan Rice-Crispy', 'Phil Fodder', 'Bukayo Sacka', 'Cristiano Ronaldough', 'Lionel Messy']],
    ['Manchester Silly', 'MSY', 'England', 5, ['#6cc4ff', '#ffffff', '#6cc4ff', '#1c2c5b', '#ff8a3d'], ['Edward Edersoon', 'Joao Cancelled', 'Nathan Ache', 'John Stones-Throw', 'Manuel Akanjinx', 'Jack Greatfish', 'Rodri Rodeo', 'Bernardo Silverware', 'Jeremy Doku-Mentary', 'Julian Alvaresauce', 'Riyad Marmite']],
    ['Paris Saint-Jam-Main', 'PSJ', 'France', 4, ['#14285e', '#14285e', '#c8102e', '#ffffff', '#f2d03b'], ['Gigi Donnamumma', 'Nuno Mendes-Me', 'Marquinhos Marquee', 'Presnel Kimpleaf', 'Achraf Hackme', 'Ousmane Dembelly', 'Vitinha Vitamin', 'Fabian Ruined', 'Bradley Barcola-Cola', 'Goncalo Ramen', 'Randal Kolo-Mooney']],
    ['Barca-Lona Tapas', 'BCT', 'Spain', 4, ['#a50044', '#1b2f7a', '#1b2f7a', '#f2c400', '#35d07f'], ['Marc Ter-Stagger', 'Alejandro Bald', 'Ronald Aroo-Joe', 'Pau Cubicle', 'Jules Kounder', 'Raphinha Rafiki', 'Pedri Dish', 'Gavi Gravy', 'Ferran Toastes', 'Robert Lewandowhisky', 'Dani Ol-Mojo']],
    ['Juventus Juice', 'JVJ', 'Italy', 2, ['#111111', '#f4f4f4', '#111111', '#ffffff', '#ff5ec4'], ['Wojciech Sneezy', 'Andrea Cambiasoup', 'Gleison Brewer', 'Federico Gatto', 'Danilo Danishes', 'Kenan Yildizzy', 'Manuel Locatelly', 'Khephren Thuramisu', 'Federico Cheesa', 'Dusan Vlahoveach', 'Teun Koopmeaner']],
    ['AC Milkan', 'ACM', 'Italy', 2, ['#c8102e', '#111111', '#c8102e', '#ffffff', '#2f7bff'], ['Mike Magnum', 'Fikayo Tomorrow', 'Matteo Gabbiagh', 'Malick Thiaw-Thaw', 'Davide Calabrie', 'Rafael Leo-Lion', 'Tijjani Reindeers', 'Yunus Musli', 'Christian Pulistick', 'Olivier Giroudini', 'Alvaro Moratatouille']],
    ['Ajax Windex', 'AJW', 'Netherlands', 1, ['#f4f4f4', '#f4f4f4', '#c8102e', '#c8102e', '#f2d03b'], ['Remko Passover', 'Owen Windal', 'Jorrel Hatto', 'Devyne Wrench', 'Jurrien Timber-Tim', 'Steven Burgerwine', 'Kenneth Tailor', 'Davy Klaassy', 'Brian Brobby', 'Mohammed Kudos', 'Dusan Tadpole']],
    ['Porto Wine', 'PRW', 'Portugal', 1, ['#1a4fa3', '#f4f4f4', '#1a4fa3', '#ffffff', '#ff8a3d'], ['Diogo Costa-Plenty', 'Joao Marioh', 'Pepe Pepperoni', 'Otavio Octopus', 'Wendell Wendys', 'Galeno Galleon', 'Alan Vanilla', 'Stephen Eustache', 'Francisco Concoction', 'Mehdi Tar-Remedy', 'Evanilson Evergreen']],
    ['Flamingo FC', 'FLM', 'Brazil', 2, ['#e0405e', '#111111', '#e0405e', '#ffffff', '#35d07f'], ['Agustin Rossy-Posy', 'Ayrton Lukewarm', 'Fabricio Brunch', 'Leo Pear-Era', 'Guillermo Vanilla-Ice', 'Giorgian Arrascaffeta', 'Nicolas De-la-Cruise', 'Gerson Gearbox', 'Luiz Araucaria', 'Pedro Burrito', 'Gabi Gabigoal']],
    ['Boca Seniors', 'BCS', 'Argentina', 1, ['#0b3d91', '#0b3d91', '#f2c400', '#f2c400', '#e8452c'], ['Sergio Romeo', 'Frank Fabrica', 'Marcos Rojo-Rojo', 'Nicolas Figgy', 'Luis Advincoola', 'Exequiel Zebrallos', 'Cristian Medicine', 'Ezequiel Fernandish', 'Kevin Zenith', 'Edinson Cavanilla', 'Miguel Merentil']],
    ['Brazil Samba United', 'BSU', 'Brazil', 5, ['#f7d117', '#1c8f4a', '#f7d117', '#1c8f4a', '#2f7bff'], ['Alisson Bakery', 'Guilherme Banana', 'Eder Mittens', 'Gabriel Magalhaha', 'Dani Alvessalad', 'Rodrygo Rodeo', 'Casemiro Casserole', 'Lucas Pasqueta', 'Antony Anthill', 'Neymar Diver', 'Richarlison Richarlisin']],
    ['Al Nacho', 'ALN', 'Saudi Arabia', 2, ['#1b8a5a', '#f4f4f4', '#1b8a5a', '#ffffff', '#ff8a3d'], ['Bento Boxed', 'Alex Telly', 'Aymeric La-Porter', 'Mohammed Simakin', 'Sultan Al-Gnome', 'Sadio Mango', 'Marcelo Brozoslice', 'Abdul Garibaldi', 'Ayman Yahoo', 'Anderson Talisker', 'Aleksandar Mitrovit']],
    ['Kawasaki Sushi', 'KWS', 'Japan', 0, ['#ff7a1a', '#111111', '#ff7a1a', '#ffffff', '#2f7bff'], ['Shuichi Gondola', 'Takehiro Tomiyasoup', 'Maya Yoshi', 'Ko Itakurry', 'Hiroki Sake-Eye', 'Kaoru Mitomato', 'Wataru Endo-Endo', 'Hidemasa Moritaco', 'Takefusa Kubo-Cube', 'Daichi Kamikaze', 'Ayase Udon']],
    ['Inter Miami Vice', 'IMV', 'USA', 2, ['#ff8fc7', '#111111', '#ff8fc7', '#111111', '#35d07f'], ['Drake Calendar', 'Jordi Albatross', 'Tomas Avocados', 'Nicolas Fryer', 'DeAndre Yodeling', 'Robert Tailgate', 'Sergio Busquits', 'Diego Gumbo', 'Benjamin Cream-Cheese', 'Luis Suarbite', 'Lionello Messini']],
  ];
  G.ALL = CLUBS.map((c) => ({
    name: c[0], short: c[1], country: c[2], color: c[4][0], shorts: c[4][1], socks: c[4][2], trim: c[4][3], keeper: c[4][4],
    squad: c[5].map((n, i) => [n, NUM_FIX[n] || NUMS[i], BASE[i] + c[3]]),
  }));
  G.TEAMS = [G.ALL[0], G.ALL[1]];

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const near = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 135; };
  // Picks the two teams for a match. If the shirts look alike the away side wears a plain alternate kit.
  G.setTeams = function (h, a) {
    const home = G.ALL[h], away = G.ALL[a];
    let aw = away;
    if (near(home.color, away.color)) {
      const light = !near(home.color, '#f4f4f4');
      aw = Object.assign({}, away, light ? { color: '#f4f4f4', shorts: '#222222', socks: '#f4f4f4', trim: '#222222' } : { color: '#222222', shorts: '#f4f4f4', socks: '#222222', trim: '#f4f4f4' });
    }
    G.TEAMS = [home, aw];
    return G.TEAMS;
  };
  G.teamRating = (i) => { const T = G.ALL[i]; const save = G.TEAMS; G.TEAMS = [T, T]; const r = Math.round(G.makePlayers(0).reduce((s, p) => s + p.ovr, 0) / 11); G.TEAMS = save; return r; };

  // Each star has a goal celebration: 0 SIUU, 1 aeroplane, 2 knee slide, 3 backflip, 4 spin, 5 dab, 6 meditate, 7 shush, 8 arms crossed, 9 point to the sky.
  // Hand-made looks for the famous parody stars: skin, hair colour, hair style (0 short, 1 slick, 2 curly, 3 long, 5 mohawk), beard.
  const LOOKS = [
    [/Halland/, '#f1c9a5', '#c9a04a', 3, false], [/Mbappe/, '#8d5524', '#1a1410', 1, false], [/Ronaldough/, '#e0ac7e', '#1a1410', 1, false],
    [/Messy|Messini/, '#e0ac7e', '#6b4423', 0, true], [/Neymar/, '#c68642', '#c9a04a', 5, true], [/Yamaha/, '#8d5524', '#1a1410', 1, false],
    [/Vinicius/, '#8d5524', '#1a1410', 2, false], [/Bellingjam/, '#c68642', '#1a1410', 1, false], [/De-Brownie/, '#f1c9a5', '#c9a04a', 1, true],
    [/Salad/, '#c68642', '#1a1410', 2, true], [/Fodder/, '#f1c9a5', '#c9a04a', 0, false], [/Lewandowhisky/, '#f1c9a5', '#6b4423', 0, true],
    [/Pepe Pepperoni/, '#e0ac7e', '#2b2b2b', 0, true], [/Sacka/, '#5c3a21', '#1a1410', 1, false], [/Greatfish/, '#f1c9a5', '#6b4423', 3, false],
  ];
  const CELEB = [[/Ronaldough/, 0], [/Messy|Messini/, 9], [/Halland/, 6], [/Mbappe/, 8], [/Neymar/, 3], [/Vinicius/, 4], [/Bellingjam/, 8], [/Yamaha/, 5]];
  const celebFor = (name) => {
    for (const c of CELEB) if (c[0].test(name)) return c[1];
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return [1, 2, 3, 4, 5, 7][Math.abs(h) % 6];
  };

  const SKIN = ['#f1c9a5', '#e0ac7e', '#c68642', '#8d5524', '#5c3a21'];
  const HAIR = ['#1a1410', '#3b2314', '#6b4423', '#c9a04a', '#b5412a', '#2b2b2b'];
  const RANGE = { // [min, max] per stat for each group
    GK:  { pace: [55, 65], shot: [40, 55], pass: [55, 72], tackle: [40, 55], drib: [40, 55], keep: [72, 90] },
    DEF: { pace: [62, 78], shot: [42, 60], pass: [58, 74], tackle: [70, 88], drib: [52, 68], keep: [0, 0] },
    MID: { pace: [66, 82], shot: [58, 76], pass: [70, 88], tackle: [58, 76], drib: [66, 84], keep: [0, 0] },
    FWD: { pace: [72, 90], shot: [74, 92], pass: [58, 76], tackle: [38, 56], drib: [70, 88], keep: [0, 0] },
  };

  // Builds the 11 players of a team, with generated stats and faces.
  G.makePlayers = function (ti) {
    const T = G.TEAMS[ti]; let hs = 7; for (const ch of T.name) hs = (hs * 31 + ch.charCodeAt(0)) | 0;
    const r = G.rng(Math.abs(hs) + ti * 977);
    return T.squad.map((s, i) => {
      const f = G.FORMATION[i], grp = f[1], R = RANGE[grp];
      const st = {};
      const bst = s[2] || 0;
      for (const k in R) { st[k] = Math.round(R[k][0] + r() * (R[k][1] - R[k][0])); if (R[k][1] > 0) st[k] = Math.min(99, st[k] + bst); }
      const ovr = grp === 'GK' ? st.keep : grp === 'DEF' ? Math.round((st.tackle * 2 + st.pace + st.pass) / 4)
        : grp === 'MID' ? Math.round((st.pass * 2 + st.drib + st.shot) / 4) : Math.round((st.shot * 2 + st.pace + st.drib) / 4);
      const look = { skin: SKIN[(r() * SKIN.length) | 0], hair: HAIR[(r() * HAIR.length) | 0], style: (r() * 6) | 0, beard: r() < 0.25 };
      // every player gets their own face shape and features
      look.f = { eye: ['#2b1b10', '#4a2c14', '#2f5d8a', '#3f7a52', '#6b6b6b'][(r() * 5) | 0], gap: 0.036 + r() * 0.016, size: 0.9 + r() * 0.35, brow: 0.008 + r() * 0.01, tilt: (r() - 0.4) * 0.5, nose: 0.8 + r() * 0.7, mouth: 0.04 + r() * 0.035, smile: r(), w: 0.92 + r() * 0.2, h: 0.95 + r() * 0.14, ears: 0.8 + r() * 0.7, stubble: r() < 0.3 };
      for (const L of LOOKS) if (L[0].test(s[0])) { look.skin = L[1]; look.hair = L[2]; look.style = L[3]; look.beard = L[4]; }
      return Object.assign({
        team: ti, i, name: s[0], num: s[1], celeb: celebFor(s[0]), role: f[0], grp, ovr,
        look,
        // runtime state
        x: 0, y: 0, vx: 0, vy: 0, fx: ti === 0 ? 1 : -1, fy: 0, stamina: 1, yellow: 0, out: false,
        tackleCd: 0, stun: 0, fallT: 0, fallMax: 1, fallKind: 0, slideT: 0, slideDone: false, sdx: 0, sdy: 0, kickCd: 0, think: r() * 0.3, hold: 0,
        tx: 0, ty: 0, sprint: false, mul: 1, anim: r() * 6, wall: null, penY: null, penT: 0,
      }, st);
    });
  };
})();
