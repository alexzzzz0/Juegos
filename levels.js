(function () {
  'use strict';

  // ==========================================
  // CONFIGURACIÓN Y CONSTANTES DE GRID/FÍSICA
  // ==========================================
  const TILE = 32;
  const COLS = 30;  // Columnas visibles en pantalla
  const ROWS = 18;  // Filas visibles
  const LEVEL_COLS = 150;

  // Filas clave para la maquetación de plataformas y terrenos
  const GROUND_ROW = 16;
  const LOW_PLATFORM_ROW = 14;
  const MID_PLATFORM_ROW = 12;
  const HIGH_PLATFORM_ROW = 10;
  const CEILING_ROW = 6;

  // Límites físicos de alcance
  const MAX_HIT_REACH_TILES = 4;       // Máximo alcance vertical para golpear bloques
  const MAX_HORIZONTAL_JUMP_TILES = 5; // Ancho máximo seguro de un foso sin plataformas
  const REACH_WINDOW = 3;              // Ventana de búsqueda horizontal para encontrar piso cerca

  const worlds = [
    { name: 'MUNDO 1 · PRADERAS DE LUZ', sky: ['#4a8bd8', '#8ed9f2'], ground: '#4a963c', dirt: '#805038', accent: '#fff0a1', boss: 'REY BABA' },
    { name: 'MUNDO 2 · CAVERNAS DE COBRE', sky: ['#372d64', '#87536f'], ground: '#9b6342', dirt: '#3d2741', accent: '#ffcd72', boss: 'ESCARABAJO MAGNO' },
    { name: 'MUNDO 3 · CIELO MECÁNICO', sky: ['#1d3464', '#5c7fc9'], ground: '#7785a4', dirt: '#3c4e73', accent: '#b8f5ff', boss: 'NÚCLEO OMEGA' },
  ];

  const levelNames = [
    'Sendero de los Brotes', 'Puentes de Menta', 'Colinas de Zafiro', 'El Gran Roble', 'Palacio de Baba',
    'Entrada de Obsidiana', 'Galerías de Cobre', 'Túnel de Vapor', 'La Fundición Perdida', 'Trono de Quitina',
    'Nubes de Estaño', 'Torre de Viento', 'Rieles del Cielo', 'Atardecer de Circuitos', 'Ciudadela Omega',
  ];

  // ==========================================
  // FUNCIONES DE MANIPULACIÓN DEL MAPA Y OBJETOS
  // ==========================================
  function emptyMap(columns) {
    return Array.from({ length: ROWS }, () => Array(columns).fill(0));
  }

  function putPlatform(map, x, y, width) {
    const cols = map[0].length;
    for (let col = Math.max(0, x); col < Math.min(cols, x + width); col++) {
      if (y >= 0 && y < ROWS) map[y][col] = 1;
    }
  }

  function removeFloor(map, x, width) {
    for (let row = GROUND_ROW; row < ROWS; row++) {
      for (let col = x; col < x + width; col++) {
        if (map[row]?.[col] !== undefined) map[row][col] = 0;
      }
    }
  }

  function addCoins(coins, x, y, count, gap = 1) {
    for (let n = 0; n < count; n++) {
      coins.push({ x: (x + n * gap) * TILE + 11, y: y * TILE + 8, taken: false });
    }
  }

  function addEnemy(enemies, type, x, platformY = GROUND_ROW) {
    const size = type === 'beetle' ? 27 : type === 'hopper' ? 26 : 24;
    const air = type === 'flyer' || type === 'ghost';
    const y = air ? (platformY === GROUND_ROW ? 9 : platformY) * TILE : platformY * TILE - size;
    enemies.push({
      type, x: x * TILE, y, homeX: x * TILE, baseY: y,
      dir: x % 2 ? 1 : -1, timer: 75 + x * 3,
      hp: type === 'beetle' ? 2 : 1, maxHp: type === 'beetle' ? 2 : 1
    });
  }

  function addPowerItem(items, type, x, y = GROUND_ROW) {
    items.push({ type, x: x * TILE + 4, y: y * TILE - 24, w: 24, h: 24, vy: 0, born: -1, static: true });
  }

  function addQuestion(blocks, x, y, power) { blocks.push({ x: x * TILE, y: y * TILE, power, used: false }); }
  function addBrick(blocks, x, y) { blocks.push({ x: x * TILE, y: y * TILE, kind: 'brick', used: false }); }

  // ==========================================
  // VALIDADORES DE RED DE SEGURIDAD (FÍSICAS)
  // ==========================================
  function surfaceRowInColumn(map, col) {
    const cols = map[0].length;
    if (col < 0 || col >= cols) return ROWS;
    for (let row = 0; row < ROWS; row++) if (map[row][col]) return row;
    return ROWS;
  }

  function nearestSurfaceRow(map, col) {
    let best = ROWS;
    for (let dc = -REACH_WINDOW; dc <= REACH_WINDOW; dc++) {
      const row = surfaceRowInColumn(map, col + dc);
      if (row < best) best = row;
    }
    return best;
  }

  // Garantiza que los bloques no queden inalcanzables verticalmente
  function ensureBlocksReachable(map, blocks) {
    for (const block of blocks) {
      const col = Math.round(block.x / TILE);
      const blockRow = Math.round(block.y / TILE);
      const surface = nearestSurfaceRow(map, col);
      if (surface >= ROWS) continue;
      const gap = surface - blockRow;
      if (gap > MAX_HIT_REACH_TILES) {
        block.y = (surface - MAX_HIT_REACH_TILES) * TILE;
      }
    }
  }

  // Garantiza que ningún foso sea demasiado ancho para cruzarlo horizontalmente
  function validatePits(map) {
    const cols = map[0].length;
    let pitWidth = 0;

    for (let col = 0; col < cols; col++) {
      const isPit = map[GROUND_ROW][col] === 0;
      if (isPit) {
        pitWidth++;
        if (pitWidth > MAX_HORIZONTAL_JUMP_TILES) {
          const repairCol = col - Math.floor(pitWidth / 2);
          putPlatform(map, repairCol, LOW_PLATFORM_ROW, 2);
          pitWidth = 0;
        }
      } else {
        pitWidth = 0;
      }
    }
  }

  // ==========================================
  // CONSTRUCTORES DE SECCIONES (LOOKUP TABLE)
  // ==========================================
  const SECTION_BUILDERS = {
    0: (map, coins, enemies, blocks, x, ctx) => { // Escalera de Impulso
      putPlatform(map, x + 2, LOW_PLATFORM_ROW, 4);
      putPlatform(map, x + 8, MID_PLATFORM_ROW, 4);
      putPlatform(map, x + 14, HIGH_PLATFORM_ROW, 5);
      putPlatform(map, x + 21, LOW_PLATFORM_ROW - 1, 5);

      addQuestion(blocks, x + 15, CEILING_ROW, ctx.powerUp);
      addBrick(blocks, x + 17, CEILING_ROW);

      addCoins(coins, x + 3, 13, 3);
      addCoins(coins, x + 9, 11, 3);
      addCoins(coins, x + 15, 9, 4);
      addCoins(coins, x + 22, 12, 3);

      addEnemy(enemies, ctx.enemy1, x + 4, LOW_PLATFORM_ROW);
      addEnemy(enemies, ctx.enemy2, x + 9, MID_PLATFORM_ROW);
      addEnemy(enemies, ctx.enemy3, x + 22, LOW_PLATFORM_ROW - 1);
    },

    1: (map, coins, enemies, blocks, x, ctx) => { // Muro y Túnel
      putPlatform(map, x + 5, LOW_PLATFORM_ROW, 2);
      putPlatform(map, x + 12, LOW_PLATFORM_ROW, 8);

      addQuestion(blocks, x + 6, MID_PLATFORM_ROW, 'mushroom');
      addCoins(coins, x + 5, 12, 2);
      addCoins(coins, x + 13, 15, 6, 1);

      addEnemy(enemies, ctx.enemy1, x + 8, GROUND_ROW);
      addEnemy(enemies, ctx.airEnemy, x + 9, 7);
      addEnemy(enemies, ctx.enemy2, x + 21, GROUND_ROW);
    },

    2: (map, coins, enemies, blocks, x, ctx) => { // Foso de Reacción
      removeFloor(map, x + 6, 8);
      putPlatform(map, x + 6, LOW_PLATFORM_ROW, 2);
      putPlatform(map, x + 10, MID_PLATFORM_ROW, 2);

      addQuestion(blocks, x + 10, 8, 'flower');
      addCoins(coins, x + 6, 13, 2);
      addCoins(coins, x + 10, 11, 2);
      addCoins(coins, x + 17, 13, 4);

      addEnemy(enemies, ctx.enemy1, x + 4, GROUND_ROW);
      addEnemy(enemies, ctx.airEnemy, x + 9, 7);
      addEnemy(enemies, ctx.enemy2, x + 19, GROUND_ROW);
    },

    3: (map, coins, enemies, blocks, x, ctx) => { // La Pirámide de la Fluidez
      putPlatform(map, x + 2, LOW_PLATFORM_ROW, 4);
      putPlatform(map, x + 6, MID_PLATFORM_ROW, 4);
      putPlatform(map, x + 10, HIGH_PLATFORM_ROW, 5);
      putPlatform(map, x + 17, 13, 6);

      addBrick(blocks, x + 11, CEILING_ROW);
      addQuestion(blocks, x + 12, CEILING_ROW, 'star');
      addBrick(blocks, x + 13, CEILING_ROW);

      addCoins(coins, x + 3, 13, 2);
      addCoins(coins, x + 7, 11, 2);
      addCoins(coins, x + 11, 9, 3);
      addCoins(coins, x + 18, 12, 4);

      addEnemy(enemies, ctx.enemy1, x + 4, LOW_PLATFORM_ROW);
      addEnemy(enemies, ctx.enemy2, x + 12, HIGH_PLATFORM_ROW);
      addEnemy(enemies, ctx.airEnemy, x + 21, 13);
    },

    4: (map, coins, enemies, blocks, x, ctx) => { // Pista de Derrape / Slide Zone
      putPlatform(map, x + 3, LOW_PLATFORM_ROW, 12);

      addCoins(coins, x + 4, 15, 10, 1);
      addCoins(coins, x + 5, 13, 4, 2);
      addQuestion(blocks, x + 8, HIGH_PLATFORM_ROW, 'mushroom');

      addEnemy(enemies, ctx.enemy1, x + 1, GROUND_ROW);
      addEnemy(enemies, ctx.enemy2, x + 17, GROUND_ROW);
      addEnemy(enemies, ctx.airEnemy, x + 9, 7);
    },

    5: (map, coins, enemies, blocks, x, ctx) => { // El Puente Destruible
      removeFloor(map, x + 5, 10);
      for (let n = 0; n < 10; n++) addBrick(blocks, x + 5 + n, LOW_PLATFORM_ROW);

      addCoins(coins, x + 6, 13, 8, 1);

      addEnemy(enemies, 'turret', x + 3, GROUND_ROW);
      addEnemy(enemies, ctx.airEnemy, x + 9, 8);
      addEnemy(enemies, ctx.enemy1, x + 18, GROUND_ROW);
    },

    6: (map, coins, enemies, blocks, x, ctx) => { // Plaza de Combate Aéreo
      putPlatform(map, x + 3, LOW_PLATFORM_ROW, 6);
      putPlatform(map, x + 15, LOW_PLATFORM_ROW, 6);

      addQuestion(blocks, x + 10, HIGH_PLATFORM_ROW, 'flower');
      addBrick(blocks, x + 11, HIGH_PLATFORM_ROW);
      addQuestion(blocks, x + 12, HIGH_PLATFORM_ROW, 'star');

      addCoins(coins, x + 4, 13, 4);
      addCoins(coins, x + 16, 13, 4);

      addEnemy(enemies, ctx.enemyTypes[0], x + 4, GROUND_ROW);
      addEnemy(enemies, ctx.enemyTypes[1], x + 6, LOW_PLATFORM_ROW);
      addEnemy(enemies, ctx.airEnemy, x + 11, 7);
      addEnemy(enemies, ctx.enemyTypes[3], x + 22, GROUND_ROW);
    },

    7: (map, coins, enemies, blocks, x, ctx) => { // Cañón con Doble Plataforma
      putPlatform(map, x + 2, LOW_PLATFORM_ROW, 5);
      removeFloor(map, x + 9, 5);
      putPlatform(map, x + 16, LOW_PLATFORM_ROW, 6);

      addBrick(blocks, x + 4, HIGH_PLATFORM_ROW);
      addQuestion(blocks, x + 5, HIGH_PLATFORM_ROW, 'mushroom');
      addCoins(coins, x + 3, 13, 3);
      addCoins(coins, x + 17, 13, 4);

      addEnemy(enemies, ctx.enemy1, x + 4, LOW_PLATFORM_ROW);
      addEnemy(enemies, ctx.airEnemy, x + 11, 8);
      addEnemy(enemies, ctx.enemy3, x + 19, LOW_PLATFORM_ROW);
    }
  };

  const KIND_COUNT = Object.keys(SECTION_BUILDERS).length;

  function pickKind(section, phase, world) {
    const pool = phase === 0 ? 5 : KIND_COUNT;
    return (section + phase + world) % pool;
  }

  function addSection(map, coins, enemies, blocks, section, kind, world, phase) {
    const x = 4 + section * 28;

    const enemyTypes = world === 0
      ? ['slime', 'hopper', 'beetle', 'flyer', 'ghost', 'turret']
      : world === 1
        ? ['beetle', 'flyer', 'turret', 'ghost', 'slime', 'hopper']
        : ['hopper', 'turret', 'ghost', 'beetle', 'flyer', 'slime'];

    const pick = (offset) => enemyTypes[(section + phase + offset) % enemyTypes.length];

    const ctx = {
      enemyTypes,
      enemy1: pick(0),
      enemy2: pick(2),
      enemy3: pick(4),
      airEnemy: (section + phase + world) % 2 === 0 ? 'flyer' : 'ghost',
      powerUp: ['mushroom', 'flower', 'star'][(section + world) % 3]
    };

    const builder = SECTION_BUILDERS[kind];
    if (builder) {
      builder(map, coins, enemies, blocks, x, ctx);
    }
  }

  // ==========================================
  // GENERACIÓN GLOBAL DEL NIVEL
  // ==========================================
function buildLevel(index) {
  const world = Math.floor(index / 5);
  const phase = index % 5;
  const theme = worlds[world];
  const isBoss = phase === 4;
  const cols = isBoss ? 124 : LEVEL_COLS;
  const map = emptyMap(cols);
  let blocks = [], coins = [], enemies = [], items = [];

  // 1. Suelo firme de base
  putPlatform(map, 0, GROUND_ROW, cols);
  putPlatform(map, 0, GROUND_ROW + 1, cols);

  if (isBoss) {
    for (let section = 0; section < 3; section++) {
      addSection(map, coins, enemies, blocks, section, pickKind(section, phase, world), world, phase);
    }
    const arenaStart = 92;
    putPlatform(map, arenaStart + 4, MID_PLATFORM_ROW, 5);
    putPlatform(map, arenaStart + 14, HIGH_PLATFORM_ROW, 5);
    putPlatform(map, arenaStart + 25, MID_PLATFORM_ROW, 5);

    addCoins(coins, arenaStart + 4, 11, 4);
    addCoins(coins, arenaStart + 15, 9, 4);
    addCoins(coins, arenaStart + 26, 11, 3);

    addPowerItem(items, 'mushroom', 18);
    addPowerItem(items, 'flower', 54);
    addPowerItem(items, 'star', 88);

    enemies.push({
      type: 'boss', x: 105 * TILE, y: GROUND_ROW * TILE - 50, homeX: 105 * TILE,
      hp: 12 + world * 4, maxHp: 12 + world * 4, dir: -1, timer: 70
    });
  } else {
    for (let section = 0; section < 5; section++) {
      addSection(map, coins, enemies, blocks, section, pickKind(section, phase, world), world, phase);
    }
    addPowerItem(items, 'mushroom', 15);
    addPowerItem(items, 'flower', 68);
    addPowerItem(items, 'star', 121);
  }

  // Pasadas de seguridad física
  ensureBlocksReachable(map, blocks);
  validatePits(map);

  // ==========================================
  // ARREGLO 1: DESPEJAR ÁREA DE LA BANDERA (GOAL)
  // ==========================================
  const goalCol = cols - 4;
  const goalX = goalCol * TILE;

  // Restaurar suelo sólido bajo la bandera y despejar la estructura
  putPlatform(map, goalCol - 2, GROUND_ROW, 6);
  putPlatform(map, goalCol - 2, GROUND_ROW + 1, 6);

  // Limpiar tiles aéreos donde se dibuja el mástil de la bandera (filas 4 a 15)
  for (let r = 4; r < GROUND_ROW; r++) {
    for (let c = goalCol - 2; c <= goalCol + 2; c++) {
      if (map[r]?.[c] !== undefined) map[r][c] = 0;
    }
  }

  // Eliminar bloques/ladrillos que colisionen con la zona de la bandera
  blocks = blocks.filter(b => {
    const bCol = Math.floor(b.x / TILE);
    return bCol < (goalCol - 2) || bCol > (goalCol + 2);
  });

  // ==========================================
  // ARREGLO 2: DESPEJAR OBJETOS / POWER-UPS FLOTANTES
  // ==========================================
  items.forEach(item => {
    const iCol = Math.floor(item.x / TILE);
    
    // Asegurar que haya piso debajo del objeto estático
    putPlatform(map, iCol, GROUND_ROW, 2);
    putPlatform(map, iCol, GROUND_ROW + 1, 2);
    item.y = GROUND_ROW * TILE - item.h;

    // Remover cualquier bloque que haya quedado justo sobre la posición del objeto
    blocks = blocks.filter(b => {
      const bCol = Math.floor(b.x / TILE);
      const bRow = Math.floor(b.y / TILE);
      return !(bCol === iCol && bRow >= GROUND_ROW - 2);
    });
  });

  // Checkpoints y zonas seguras
  const checkpoints = isBoss ? [42, 82] : [48, 100];

  for (const point of checkpoints) {
    putPlatform(map, point - 2, GROUND_ROW, 5);
    putPlatform(map, point - 2, GROUND_ROW + 1, 5);
  }

  const safeZones = checkpoints.map((point) => [(point - 3) * TILE, (point + 4) * TILE]);
  const safeEnemies = enemies.filter((e) => !safeZones.some(([lo, hi]) => e.homeX >= lo && e.homeX <= hi));

  const checkpointObjs = checkpoints.map((tile) => ({ x: tile * TILE, active: false }));

  return {
    index, number: index + 1, name: levelNames[index], world, worldName: theme.name, theme, isBoss,
    cols, width: cols * TILE, map, blocks, coins, enemies: safeEnemies, items,
    checkpoints: checkpointObjs, activeCheckpoint: 0,
    bossArena: isBoss ? { left: 94 * TILE, right: 113 * TILE } : null,
    goal: { x: goalX, y: MID_PLATFORM_ROW * TILE, locked: isBoss, flag: 1 },
    timeLimit: isBoss ? 260 : 220,
  };
}

  function worldTitle(index) {
    return worlds[Math.floor(index / 5)]?.name || 'FIN DEL VIAJE';
  }

  // Exportación del módulo inmutable
  window.Levels = Object.freeze({ TILE, COLS, ROWS, buildLevel, worldTitle });
})();