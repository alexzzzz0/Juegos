/* ==========================================================================
   level.js - Sistema multi-misión, fondos animados dinámicos y dificultad
   ========================================================================== */

const BASE_LEVEL_WIDTH = 3900;
const GROUND_Y = 232;

// Cuánto crece cada misión respecto a la anterior (misiones más largas
// a medida que se avanza en la campaña).
const MISSION_LENGTH_STEP = 350;

function levelWidthForMission(missionId) {
  return BASE_LEVEL_WIDTH + (missionId - 1) * MISSION_LENGTH_STEP;
}

// Datos de configuración para cada misión. "objective" se muestra al
// jugador como una breve línea de contexto al iniciar la misión, para
// que la campaña se sienta más clara/intuitiva.
const MISSIONS = {
  1: {
    name: "MISIÓN 1: JUNGLE BASE",
    objective: "Asegura la base avanzada y abre paso hacia la jungla.",
    theme: {
      sky: ['#15222b', '#35473a', '#52613d'],
      farHills: '#222e26',
      midRuins: '#282f22',
      ground: '#342c1f',
      weather: 'fog'
    }
  },
  2: {
    name: "MISIÓN 2: SNOW FORTRESS",
    objective: "Resiste el asalto helado y toma la fortaleza enemiga.",
    theme: {
      sky: ['#1c2536', '#3b4e6b', '#60799e'],
      farHills: '#2d3b4e',
      midRuins: '#384759',
      ground: '#424f5e',
      weather: 'snow'
    }
  },
  3: {
    name: "MISIÓN 3: VOLCANIC PLANT",
    objective: "Neutraliza la planta volcánica antes de que colapse.",
    theme: {
      sky: ['#2b1212', '#4d211b', '#733722'],
      farHills: '#381c19',
      midRuins: '#42241f',
      ground: '#2e1d1a',
      weather: 'ash'
    }
  },
  4: {
    name: "MISIÓN 4: DESERT OUTPOST",
    objective: "Cruza la tormenta de arena y despeja el puesto avanzado.",
    theme: {
      sky: ['#3a2a12', '#6b4a1f', '#a9793a'],
      farHills: '#4a3618',
      midRuins: '#5a4020',
      ground: '#5c4322',
      weather: 'sand'
    }
  },
  5: {
    name: "MISIÓN 5: ENEMY HQ",
    objective: "Asalta el cuartel general enemigo. Última línea de defensa.",
    theme: {
      sky: ['#0d0508', '#2b0b10', '#4a1018'],
      farHills: '#1a0a0c',
      midRuins: '#2a1012',
      ground: '#1c1010',
      weather: 'embers'
    }
  }
};

const MISSION_COUNT = Object.keys(MISSIONS).length;

/* -------------------------------------------------------------------- */
/* Dificultad                                                           */
/* -------------------------------------------------------------------- */
const DIFFICULTY_SETTINGS = {
  facil: {
    key: 'facil',
    label: 'FÁCIL',
    waveMult: 0.72,
    damageMult: 0.65,
    bossHpMult: 0.75,
    startLives: 5,
    dropMult: 1.4
  },
  normal: {
    key: 'normal',
    label: 'NORMAL',
    waveMult: 1,
    damageMult: 1,
    bossHpMult: 1,
    startLives: 3,
    dropMult: 1
  },
  dificil: {
    key: 'dificil',
    label: 'DIFÍCIL',
    waveMult: 1.45,
    damageMult: 1.5,
    bossHpMult: 1.35,
    startLives: 2,
    dropMult: 0.7
  }
};

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function buildLevel(missionId = 1) {
  const width = levelWidthForMission(missionId);
  const rand = seededRandom(1337 + missionId * 99);
  const missionConfig = MISSIONS[missionId] || MISSIONS[1];

  const level = {
    missionId: missionId,
    name: missionConfig.name,
    objective: missionConfig.objective,
    theme: missionConfig.theme,
    width: width,
    groundY: GROUND_Y,
    bounds: { left: 10, right: width - 10 },
    bossArena: { start: width - 620, end: width - 40 }
  };

  // Plataformas generadas proceduralmente: la cantidad escala de forma
  // natural con el largo de la misión, y el seed por misión mantiene un
  // trazado distinto pero reproducible para cada una.
  level.solids = [];
  {
    let x = 480;
    const solidLimit = width - 700; // deja libre la arena del jefe
    while (x < solidLimit) {
      const w = 60 + rand() * 50;
      const y = 130 + rand() * 70;
      level.solids.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: 8 });
      x += 300 + rand() * 220;
    }
  }

  // Cajas de suministro repartidas por todo el nivel.
  level.cratePositions = [];
  {
    let cx = 260;
    const crateLimit = width - 500;
    while (cx < crateLimit) {
      level.cratePositions.push({ x: Math.round(cx), y: GROUND_Y - 16, w: 16, h: 16 });
      cx += 550 + rand() * 350;
    }
  }

  // Generación de fondo según la misión
  level.farHills = [];
  for (let x = -100; x < width + 400; x += 80) {
    level.farHills.push({ x, h: 28 + rand() * 32 });
  }

  level.midRuins = [];
  for (let x = 40; x < width; x += 110 + rand() * 80) {
    const type = rand();
    level.midRuins.push({
      x, w: 28 + rand() * 32, h: 42 + rand() * 58,
      type: type < 0.4 ? 'tree' : type < 0.7 ? 'ruin' : 'tower'
    });
  }

  level.groundDetails = [];
  for (let x = 0; x < width; x += 18 + rand() * 24) {
    level.groundDetails.push({ x, s: 2 + rand() * 3, tuft: rand() > 0.4 });
  }

  // Partículas climáticas animadas (nieve/ceniza/niebla/arena/brasas)
  level.weatherParticles = [];
  for (let i = 0; i < 40; i++) {
    level.weatherParticles.push({
      x: rand() * 480,
      y: rand() * 270,
      speedX: -20 - rand() * 30,
      speedY: 15 + rand() * 25,
      size: 1 + rand() * 1.5
    });
  }

  return level;
}

/* -------------------------------------------------------------------- */
/* Fondo con Parallax y Animación de Clima / Ambiente                   */
/* -------------------------------------------------------------------- */
function weatherColorFor(weather) {
  switch (weather) {
    case 'snow': return '#ffffff';
    case 'ash': return '#ff7744';
    case 'sand': return 'rgba(224, 196, 120, 0.6)';
    case 'embers': return 'rgba(255, 90, 40, 0.8)';
    default: return 'rgba(250, 250, 250, 0.4)';
  }
}

function drawBackground(ctx, level, camX, cw, ch, time = 0) {
  const t = level.theme;

  // 1. Cielo Dinámico
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, t.sky[0]);
  grad.addColorStop(0.55, t.sky[1]);
  grad.addColorStop(1, t.sky[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  // 2. Sol/Luna con pulso de luz
  const sunX = cw * 0.78 - camX * 0.05;
  const pulse = Math.sin(time * 2) * 2;
  ctx.fillStyle = 'rgba(255, 230, 170, 0.15)';
  ctx.beginPath();
  ctx.arc(sunX, 46, 24 + pulse, 0, Math.PI * 2);
  ctx.fill();

  // 3. Colinas Lejanas (Parallax pf1)
  const pf1 = 0.18;
  ctx.fillStyle = t.farHills;
  ctx.beginPath();
  ctx.moveTo(-60, ch);
  for (const h of level.farHills) {
    const sx = h.x - camX * pf1;
    if (sx < -100 || sx > cw + 100) continue;
    ctx.lineTo(sx, level.groundY - h.h + 20);
  }
  ctx.lineTo(cw + 60, ch);
  ctx.closePath();
  ctx.fill();

  // 4. Estructuras Medias con bamboleo del viento (Parallax pf2)
  const pf2 = 0.45;
  for (const r of level.midRuins) {
    const sx = r.x - camX * pf2;
    if (sx < -100 || sx > cw + 100) continue;
    const baseY = level.groundY + 26;

    if (r.type === 'tree') {
      const wind = Math.sin(time * 3 + r.x) * 2; // Viento afectando las copas de los árboles
      ctx.fillStyle = t.midRuins;
      ctx.fillRect(sx - 2, baseY - r.h * 0.4, 4, r.h * 0.4);
      ctx.beginPath();
      ctx.moveTo(sx - r.w / 2, baseY - r.h * 0.35);
      ctx.lineTo(sx + wind, baseY - r.h);
      ctx.lineTo(sx + r.w / 2, baseY - r.h * 0.35);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = t.midRuins;
      ctx.fillRect(sx - r.w / 2, baseY - r.h, r.w, r.h);
    }
  }

  // 5. Partículas Climáticas Animadas (Nieve, Niebla, Ceniza, Arena o Brasas)
  ctx.fillStyle = weatherColorFor(t.weather);
  for (const p of level.weatherParticles) {
    // Actualización de posición de partículas
    const px = (p.x + time * p.speedX) % cw;
    const finalX = px < 0 ? px + cw : px;
    const finalY = (p.y + time * p.speedY) % ch;

    ctx.fillRect(Math.round(finalX), Math.round(finalY), p.size, p.size);
  }
}

function drawGround(ctx, level, camX, cw, ch) {
  const groundTop = level.groundY;

  ctx.fillStyle = level.theme.ground;
  ctx.fillRect(0, groundTop, cw, ch - groundTop);
  ctx.fillStyle = '#111813';
  ctx.fillRect(0, groundTop, cw, 2);

  for (const d of level.groundDetails) {
    const sx = d.x - camX;
    if (sx < -20 || sx > cw + 20) continue;
    ctx.fillStyle = d.tuft ? '#5c6b3a' : '#1a1813';
    ctx.fillRect(Math.round(sx), groundTop + 2, d.s, d.tuft ? 3 : 2);
  }

  for (const p of level.solids) {
    const sx = p.x - camX;
    if (sx + p.w < -20 || sx > cw + 20) continue;

    ctx.fillStyle = '#4d5248';
    ctx.fillRect(Math.round(sx), p.y, p.w, p.h);
    ctx.fillStyle = '#1c211a';
    ctx.fillRect(Math.round(sx), p.y + p.h - 2, p.w, 2);
  }
}

/* -------------------------------------------------------------------- */
/* Oleadas por Misión                                                   */
/* -------------------------------------------------------------------- */

// Plantillas base (dificultad NORMAL) para cada misión. Cada misión tiene
// más oleadas que antes, y la composición se vuelve progresivamente más
// exigente a medida que avanza la campaña.
const MISSION_WAVES = {
  1: [
    ['grunt', 'grunt'],
    ['grunt', 'grunt', 'runner'],
    ['grunt', 'runner', 'runner'],
    ['grunt', 'turret', 'runner'],
    ['grunt', 'grunt', 'turret', 'runner']
  ],
  2: [
    ['runner', 'runner'],
    ['runner', 'turret', 'runner'],
    ['grunt', 'runner', 'runner', 'turret'],
    ['grunt', 'turret', 'runner', 'runner'],
    ['grunt', 'turret', 'runner', 'turret', 'runner']
  ],
  3: [
    ['grunt', 'turret'],
    ['grunt', 'grunt', 'turret'],
    ['runner', 'runner', 'turret', 'grunt'],
    ['grunt', 'turret', 'turret', 'runner'],
    ['grunt', 'runner', 'turret', 'grunt', 'turret']
  ],
  4: [
    ['grunt', 'grunt', 'runner'],
    ['runner', 'runner', 'turret'],
    ['grunt', 'turret', 'runner', 'grunt'],
    ['runner', 'runner', 'turret', 'grunt', 'turret'],
    ['grunt', 'turret', 'runner', 'turret', 'grunt', 'runner']
  ],
  5: [
    ['grunt', 'grunt', 'turret'],
    ['runner', 'runner', 'turret', 'grunt'],
    ['grunt', 'turret', 'turret', 'runner'],
    ['runner', 'runner', 'grunt', 'turret', 'turret'],
    ['grunt', 'turret', 'runner', 'turret', 'grunt', 'runner'],
    ['grunt', 'grunt', 'turret', 'turret', 'runner', 'runner']
  ]
};

// Repite o recorta cíclicamente una lista de enemigos según el
// multiplicador de dificultad, manteniendo la proporción de tipos.
function scaleEnemyList(enemies, mult) {
  if (!mult || mult === 1) return enemies.slice();
  const target = Math.max(1, Math.round(enemies.length * mult));
  const result = [];
  for (let i = 0; i < target; i++) {
    result.push(enemies[i % enemies.length]);
  }
  return result;
}

function buildWaves(missionId = 1, difficultyKey = 'normal') {
  const diff = DIFFICULTY_SETTINGS[difficultyKey] || DIFFICULTY_SETTINGS.normal;
  const base = MISSION_WAVES[missionId] || MISSION_WAVES[1];
  return base.map(enemies => ({ enemies: scaleEnemyList(enemies, diff.waveMult) }));
}

// Genera el texto de la oleada mostrado en el HUD ("OLEADA 2 DE 5",
// "OLEADA FINAL"), de forma que siempre coincide con el número real de
// oleadas de la misión, sin importar cuántas haya.
function waveLabel(idx, total) {
  if (idx === total - 1) return 'OLEADA FINAL';
  return `OLEADA ${idx + 1} DE ${total}`;
}