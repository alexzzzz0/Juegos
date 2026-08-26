/* ==========================================================================
   game.js - Integración de Victoria, Animación y Selección de Misiones
   ========================================================================== */

(function () {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const CW = canvas.width, CH = canvas.height;

  const els = {
    healthFill: document.getElementById('health-bar-fill'),
    livesIcons: document.getElementById('lives-icons'),
    weaponName: document.getElementById('weapon-name'),
    score: document.getElementById('score'),
    waveBanner: document.getElementById('wave-banner'),
    waveObjective: document.getElementById('wave-objective'),
    difficultyLabel: document.getElementById('difficulty-label'),
    diffButtons: document.querySelectorAll('.diff-btn'),
    bossHud: document.getElementById('boss-hud'),
    bossName: document.getElementById('boss-name'),
    bossFill: document.getElementById('boss-bar-fill'),
    menu: document.getElementById('overlay-menu'),
    pause: document.getElementById('overlay-pause'),
    confirm: document.getElementById('overlay-confirm'),
    confirmMessage: document.getElementById('confirm-message'),
    btnConfirmYes: document.getElementById('btn-confirm-yes'),
    btnConfirmNo: document.getElementById('btn-confirm-no'),
    gameover: document.getElementById('overlay-gameover'),
    gameoverTitle: document.getElementById('gameover-title'),
    gameoverScore: document.getElementById('gameover-score'),
    victory: document.getElementById('overlay-victory'),
    victoryTitle: document.getElementById('victory-title'),
    victorySubtitle: document.getElementById('victory-subtitle'),
    victoryScore: document.getElementById('victory-score'),
    btnStart: document.getElementById('btn-start'),
    btnResume: document.getElementById('btn-resume'),
    btnRestartMission: document.getElementById('btn-restart-mission'),
    btnQuitMenu: document.getElementById('btn-quit-menu'),
    btnRetry: document.getElementById('btn-retry'),
    btnVictoryRetry: document.getElementById('btn-victory-retry'),
    btnVictoryMenu: document.getElementById('btn-victory-menu'),
    sliderMusic: document.getElementById('slider-music'),
    sliderSfx: document.getElementById('slider-sfx'),
    btnMuteMusic: document.getElementById('btn-mute-music'),
    btnMuteSfx: document.getElementById('btn-mute-sfx')
  };

  const input = {
    left: false, right: false, down: false,
    jumpPressed: false, jumpHeld: false,
    reloadPressed: false,
    mouseDown: false,
    worldMouseX: 0, worldMouseY: 0,
    rawClientX: 0, rawClientY: 0,
    wheelDelta: 0,
    key1: false, key2: false, key3: false, key4: false
  };

  // Nota: esta lista es solo para sortear qué arma soltar como power-up
  // (no incluye 'pistol' a propósito). La lista real de armas del jugador
  // vive en player.js como WEAPON_KEYS.
  const DROP_WEAPON_KEYS = ['machinegun', 'shotgun', 'spread'];

  let state = 'menu'; // menu | playing | paused | gameover | victory
  let currentMission = 1;
  const MAX_MISSIONS = (typeof MISSION_COUNT !== 'undefined') ? MISSION_COUNT : 5;
  let currentDifficulty = 'normal';
  let pendingAction = null;

  let level, player, camX = 0;
  let bullets = [], particles = [], enemies = [], powerups = [], crates = [], boss = null;
  let WAVES = [];
  let waveIndex = 0, waveClearTimer = 0.8, bossActive = false, bannerTimer = 0, endTimer = 0;
  let lastTime = 0;

  const audioState = {
    musicVol: 0.7,
    sfxVol: 1.0,
    musicMuted: false,
    sfxMuted: false
  };

  function triggerVictoryFireworks() {
    const colors = ['#ff4d3d', '#ffe066', '#7ed957', '#38b6ff', '#ff66c4', '#ffffff'];
    for (let i = 0; i < 150; i++) {
      const px = camX + Math.random() * CW;
      const py = Math.random() * (CH * 0.7);
      spawnExplosion(particles, px, py, 1, [colors[Math.floor(Math.random() * colors.length)]], 220);
    }
  }

  function getDifficulty() {
    return (typeof DIFFICULTY_SETTINGS !== 'undefined' && DIFFICULTY_SETTINGS[currentDifficulty])
      ? DIFFICULTY_SETTINGS[currentDifficulty]
      : { key: 'normal', label: 'NORMAL', waveMult: 1, damageMult: 1, bossHpMult: 1, startLives: 3, dropMult: 1 };
  }

  function updateDifficultyLabel() {
    if (!els.difficultyLabel) return;
    const diff = getDifficulty();
    els.difficultyLabel.textContent = diff.label;
    els.difficultyLabel.classList.remove('diff-facil', 'diff-normal', 'diff-dificil');
    els.difficultyLabel.classList.add('diff-' + diff.key);
  }

  function resetGame(missionId = 1) {
    currentMission = missionId;
    const diff = getDifficulty();

    level = buildLevel(currentMission);
    WAVES = buildWaves(currentMission, currentDifficulty);

    player = new Player(60, level.groundY);
    player.lives = diff.startLives;

    // Aplica el multiplicador de daño de la dificultad en un único punto:
    // todo el daño recibido por el jugador (contacto, balas enemigas y
    // jefe) pasa por takeDamage().
    const baseTakeDamage = player.takeDamage.bind(player);
    player.takeDamage = (dmg) => baseTakeDamage(dmg * diff.damageMult);

    camX = 0;
    
    bullets.length = 0;
    particles.length = 0;
    enemies.length = 0;
    powerups.length = 0;
    boss = null;

    crates = level.cratePositions.map(c => new Crate(c.x, c.y, c.w, c.h));
    waveIndex = 0;
    waveClearTimer = 0.8;
    bossActive = false;
    bannerTimer = 3.0;
    endTimer = 0;

    els.waveBanner.textContent = level.name;
    els.waveBanner.classList.add('flash');
    if (els.waveObjective) els.waveObjective.textContent = level.objective || '';

    updateDifficultyLabel();
    updateHud();
    els.bossHud.classList.add('hidden');
  }

  /* Teclado y Controles */
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    const k = e.key.toLowerCase();
    
    if (k === 'a' || e.key === 'ArrowLeft') input.left = true;
    if (k === 'd' || e.key === 'ArrowRight') input.right = true;
    if (k === 's' || e.key === 'ArrowDown') input.down = true;
    if (k === 'w' || e.key === 'ArrowUp' || e.key === ' ') {
      if (!input.jumpHeld) input.jumpPressed = true;
      input.jumpHeld = true;
    }
    
    if (k === 'r') input.reloadPressed = true;

    if (e.key === '1') input.key1 = true;
    if (e.key === '2') input.key2 = true;
    if (e.key === '3') input.key3 = true;
    if (e.key === '4') input.key4 = true;
    
    if (e.key === 'Escape' || k === 'p') {
      if (!els.confirm.classList.contains('hidden')) {
        closeConfirmDialog();
      } else {
        togglePause();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a' || e.key === 'ArrowLeft') input.left = false;
    if (k === 'd' || e.key === 'ArrowRight') input.right = false;
    if (k === 's' || e.key === 'ArrowDown') input.down = false;
    if (k === 'w' || e.key === 'ArrowUp' || e.key === ' ') input.jumpHeld = false;
    
    if (k === 'r') input.reloadPressed = false;

    if (e.key === '1') input.key1 = false;
    if (e.key === '2') input.key2 = false;
    if (e.key === '3') input.key3 = false;
    if (e.key === '4') input.key4 = false;
  });

  window.addEventListener('wheel', (e) => {
    input.wheelDelta = e.deltaY;
  }, { passive: true });

  function updateMouseCoordinates(clientX, clientY) {
    input.rawClientX = clientX;
    input.rawClientY = clientY;
    const rect = canvas.getBoundingClientRect();
    const localX = (clientX - rect.left) * (CW / rect.width);
    const localY = (clientY - rect.top) * (CH / rect.height);
    input.worldMouseX = camX + localX;
    input.worldMouseY = localY;
  }

  canvas.addEventListener('mousemove', (e) => updateMouseCoordinates(e.clientX, e.clientY));
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.mouseDown = true;
    if (typeof AUDIO !== 'undefined') AUDIO.unlock();
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* Eventos UI */
  els.btnStart.addEventListener('click', () => {
    if (typeof AUDIO !== 'undefined') AUDIO.unlock();
    resetGame(1);
    state = 'playing';
    els.menu.classList.add('hidden');
    if (typeof AUDIO !== 'undefined') AUDIO.startMusic();
  });

  els.diffButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentDifficulty = btn.dataset.diff;
      els.diffButtons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  els.btnResume.addEventListener('click', () => togglePause());

  els.btnRestartMission.addEventListener('click', () => {
    showConfirmDialog('¿REINICIAR LA MISIÓN ACTUAL?', () => {
      resetGame(currentMission);
      state = 'playing';
      els.pause.classList.add('hidden');
      if (typeof AUDIO !== 'undefined') AUDIO.startMusic();
    });
  });

  els.btnQuitMenu.addEventListener('click', () => {
    showConfirmDialog('¿VOLVER AL MENÚ PRINCIPAL?\nPERDERÁS EL PROGRESO DE LA MISIÓN.', () => {
      state = 'menu';
      els.pause.classList.add('hidden');
      els.menu.classList.remove('hidden');
      if (typeof AUDIO !== 'undefined') AUDIO.stopMusic();
    });
  });

  els.btnRetry.addEventListener('click', () => {
    resetGame(currentMission);
    state = 'playing';
    els.gameover.classList.add('hidden');
    if (typeof AUDIO !== 'undefined') AUDIO.startMusic();
  });

  els.btnVictoryRetry.addEventListener('click', () => {
    const nextMission = currentMission < MAX_MISSIONS ? currentMission + 1 : 1;
    resetGame(nextMission);
    state = 'playing';
    els.victory.classList.add('hidden');
    if (typeof AUDIO !== 'undefined') AUDIO.startMusic();
  });

  els.btnVictoryMenu.addEventListener('click', () => {
    state = 'menu';
    els.victory.classList.add('hidden');
    els.menu.classList.remove('hidden');
    if (typeof AUDIO !== 'undefined') AUDIO.stopMusic();
  });

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      input.mouseDown = false;
      els.pause.classList.remove('hidden');
      if (typeof AUDIO !== 'undefined') AUDIO.stopMusic();
    } else if (state === 'paused') {
      state = 'playing';
      els.pause.classList.add('hidden');
      if (typeof AUDIO !== 'undefined') AUDIO.startMusic();
    }
  }

  // Pausa automática al cambiar de pestaña o minimizar la ventana,
  // para que el jugador no reciba daño mientras no está mirando.
  window.addEventListener('blur', () => {
    if (state === 'playing') togglePause();
  });

  function showConfirmDialog(message, onConfirm) {
    els.confirmMessage.textContent = message;
    pendingAction = onConfirm;
    els.confirm.classList.remove('hidden');
  }

  function closeConfirmDialog() {
    pendingAction = null;
    els.confirm.classList.add('hidden');
  }

  els.btnConfirmYes.addEventListener('click', () => {
    if (pendingAction) pendingAction();
    closeConfirmDialog();
  });

  els.btnConfirmNo.addEventListener('click', () => closeConfirmDialog());

  /* Configuración Audio */
  els.sliderMusic.addEventListener('input', (e) => {
    audioState.musicVol = parseFloat(e.target.value);
    if (typeof AUDIO !== 'undefined' && AUDIO.setMusicVolume) {
      AUDIO.setMusicVolume(audioState.musicMuted ? 0 : audioState.musicVol);
    }
  });

  els.sliderSfx.addEventListener('input', (e) => {
    audioState.sfxVol = parseFloat(e.target.value);
    if (typeof AUDIO !== 'undefined' && AUDIO.setSfxVolume) {
      AUDIO.setSfxVolume(audioState.sfxMuted ? 0 : audioState.sfxVol);
    }
  });

  els.btnMuteMusic.addEventListener('click', () => {
    audioState.musicMuted = !audioState.musicMuted;
    els.btnMuteMusic.textContent = audioState.musicMuted ? '🔇' : '🔊';
    if (typeof AUDIO !== 'undefined' && AUDIO.setMusicVolume) {
      AUDIO.setMusicVolume(audioState.musicMuted ? 0 : audioState.musicVol);
    }
  });

  els.btnMuteSfx.addEventListener('click', () => {
    audioState.sfxMuted = !audioState.sfxMuted;
    els.btnMuteSfx.textContent = audioState.sfxMuted ? '🔇' : '🔊';
    if (typeof AUDIO !== 'undefined' && AUDIO.setSfxVolume) {
      AUDIO.setSfxVolume(audioState.sfxMuted ? 0 : audioState.sfxVol);
    }
  });

  /* Lógica de Oleadas y Colisiones */
  function spawnWave(idx) {
    const wave = WAVES[idx];
    if (!wave) return;
    els.waveBanner.textContent = (typeof waveLabel === 'function')
      ? waveLabel(idx, WAVES.length)
      : `OLEADA ${idx + 1}`;
    els.waveBanner.classList.add('flash');
    if (els.waveObjective) els.waveObjective.textContent = '';
    bannerTimer = 2.0;

    wave.enemies.forEach((kind, i) => {
      let spawnX = player.x + CW * 0.65 + i * 42 + Math.random() * 20;
      spawnX = Math.max(level.bounds.left + 20, Math.min(level.bounds.right - 20, spawnX));
      const e = new Enemy(kind, spawnX, level.groundY);
      enemies.push(e);
    });
  }

function startBossFight() {
    bossActive = true;

    // La arena se genera siempre alrededor de la posición ACTUAL del
    // jugador (no de level.bossArena.start), porque las oleadas spawnean
    // relativas al jugador y pueden limpiarse sin haber avanzado mucho
    // en el nivel. Si usáramos un punto fijo del nivel, level.bounds.left
    // podía terminar muy por delante del jugador, y el clamp de posición
    // en update() lo "teletransportaba" de golpe hasta ahí.
    const arenaWidth = level.bossArena.end - level.bossArena.start;
    let left = player.x - 40;
    let right = left + arenaWidth;

    // No dejar que la arena se salga de los límites reales del nivel
    if (right > level.width - 10) {
      right = level.width - 10;
      left = right - arenaWidth;
    }
    if (left < 10) left = 10;

    level.bounds.left = left;
    level.bounds.right = right;

    // El jefe aparece más adelante según el nuevo límite
    const diff = getDifficulty();
    const bossHp = Math.round((150 + currentMission * 30) * diff.bossHpMult);
    const bossX = level.bounds.left + arenaWidth * 0.75;
    boss = new Boss(bossX, level.groundY, bossHp, 'MECH DESTRUCTOR');
    
    els.bossHud.classList.remove('hidden');
    els.bossName.textContent = boss.name;
    els.waveBanner.textContent = '¡¡ JEFE FINAL !!';
    els.waveBanner.classList.add('flash');
    bannerTimer = 2.5;
    
    if (typeof AUDIO !== 'undefined') AUDIO.bossRoar();
  }

  function rollDrop(x, y) {
    const dropMult = getDifficulty().dropMult || 1;
    const r = Math.random();
    if (r < 0.14 * dropMult) {
      powerups.push(new PowerUp(x, y - 10, 'health'));
    } else if (r < 0.19 * dropMult) {
      powerups.push(new PowerUp(x, y - 10, 'life'));
    } else if (r < 0.36 * dropMult) {
      const wk = DROP_WEAPON_KEYS[Math.floor(Math.random() * DROP_WEAPON_KEYS.length)];
      powerups.push(new PowerUp(x, y - 10, 'weapon', wk));
    }
  }

  function updateHud() {
    if (!player) return;
    const pct = Math.max(0, player.health / player.maxHealth);
    els.healthFill.style.width = (pct * 100) + '%';
    els.healthFill.style.background = pct < 0.3
      ? 'linear-gradient(180deg, #ff8a75, #b5241a)'
      : 'linear-gradient(180deg, #7ed957, #3f8f2a)';

    els.livesIcons.innerHTML = '';
    for (let i = 0; i < Math.max(0, player.lives); i++) {
      const d = document.createElement('div');
      d.className = 'life-icon';
      els.livesIcons.appendChild(d);
    }

    const w = player.weapon;
    const ammoLabel = (typeof player.currentAmmoLabel === 'function') ? player.currentAmmoLabel() : (w.ammo || '∞');
    els.weaponName.textContent = w.name + (w.infinite ? '' : ' ×' + ammoLabel);
    els.score.textContent = String(player.score).padStart(6, '0');

    if (boss) {
      els.bossFill.style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
    }
  }

  function boxOf(e) { return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h }; }

  function resolveCrateCollision(entity) {
    for (const c of crates) {
      if (c.dead) continue;
      const box = { x: entity.x - entity.w / 2, y: entity.y - entity.h, w: entity.w, h: entity.h };
      if (aabbOverlap(box, c)) {
        const entityCenter = entity.x;
        const crateCenter = c.x + c.w / 2;
        if (entityCenter < crateCenter) entity.x = c.x - entity.w / 2 - 0.5;
        else entity.x = c.x + c.w + entity.w / 2 + 0.5;
      }
    }
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      b.update(dt);
      if (b.x < camX - 40 || b.x > camX + CW + 40 || b.y < -20 || b.y > CH + 40) b.dead = true;
      if (b.dead) continue;

      if (b.fromPlayer) {
        for (const c of crates) {
          if (c.dead) continue;
          if (bulletBoxOverlap(b, c)) {
            b.dead = true;
            if (c.hit()) { 
              if (typeof AUDIO !== 'undefined') AUDIO.crateBreak(); 
              spawnExplosion(particles, c.x + c.w / 2, c.y + c.h / 2, 8, ['#7a5230', '#4a3018']); 
            }
            break;
          }
        }
        if (b.dead) continue;

        for (const en of enemies) {
          if (en.dead) continue;
          const box = boxOf(en);
          if (bulletBoxOverlap(b, box)) {
            b.dead = true;
            const killed = en.takeDamage(b.damage);
            spawnExplosion(particles, b.x, b.y, 4, ['#ffe066', '#ff9d3a'], 60);
            if (killed) {
              player.score += en.stats.score;
              spawnExplosion(particles, en.x, en.y - en.h / 2, 14, ['#ff9d3a', '#ffe066', '#7a2b24']);
              rollDrop(en.x, en.y);
            }
            break;
          }
        }
        if (!b.dead && boss && !boss.dead && boss.introTimer <= 0) {
          const bossBox = { x: boss.x - boss.w / 2, y: boss.y - boss.h, w: boss.w, h: boss.h };
          if (bulletBoxOverlap(b, bossBox)) {
            b.dead = true;
            const killed = boss.takeDamage(b.damage);
            spawnExplosion(particles, b.x, b.y, 5, ['#ffe066', '#ff9d3a'], 70);
            if (killed) {
              player.score += 5000;
              endTimer = 1.6;
              spawnExplosion(particles, boss.x, boss.y - 20, 40, ['#ff9d3a', '#ffe066', '#ff4d3d', '#ffffff'], 160);
              if (typeof AUDIO !== 'undefined') AUDIO.explosion(true);
            }
          }
        }
      } else {
        const pbox = { x: player.x - player.w / 2, y: player.y - player.h, w: player.w, h: player.h };
        if (!player.dead && player.invuln <= 0 && bulletBoxOverlap(b, pbox)) {
          b.dead = true;
          player.takeDamage(b.damage);
          spawnExplosion(particles, b.x, b.y, 4, ['#ff6b5c', '#ffe066'], 50);
        }
        for (const c of crates) {
          if (c.dead) continue;
          if (bulletBoxOverlap(b, c)) { b.dead = true; break; }
        }
      }
    }
    for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].dead) bullets.splice(i, 1);
  }

  function updateEnemies(dt) {
    for (const en of enemies) {
      en.update(dt, player, level, bullets);
      if (en.dead) continue;
      resolveCrateCollision(en);
      const enBox = boxOf(en);
      const pBox = { x: player.x - player.w / 2, y: player.y - player.h, w: player.w, h: player.h };
      if (!player.dead && aabbOverlap(enBox, pBox)) {
        player.takeDamage(en.stats.contactDamage || 8);
      }
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      if (en.dead) {
        en.deathTimer -= dt;
        if (en.deathTimer <= 0) enemies.splice(i, 1);
      }
    }
  }

  function updatePowerups(dt) {
    for (const p of powerups) {
      p.update(dt, level.groundY - 2);
      if (!player.dead) {
        const pBox = { x: player.x - player.w / 2, y: player.y - player.h, w: player.w, h: player.h };
        const box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
        if (aabbOverlap(pBox, box)) {
          p.dead = true;
          if (typeof AUDIO !== 'undefined') AUDIO.powerup();
          if (p.kind === 'health') player.heal(35);
          else if (p.kind === 'life') player.lives += 1;
          else if (p.kind === 'weapon') player.pickWeapon(p.payload);
        }
      }
    }
    for (let i = powerups.length - 1; i >= 0; i--) if (powerups[i].dead) powerups.splice(i, 1);
  }

  /* Loop de Actualización y Renderizado */
  function update(dt) {
    if (state !== 'playing' && state !== 'victory') return;

    if (state === 'playing') {
      player.update(dt, input, level);
      player.tryFire(input.mouseDown, bullets);
      
      input.jumpPressed = false;
      input.reloadPressed = false;
      input.key1 = false;
      input.key2 = false;
      input.key3 = false;
      input.key4 = false;

      resolveCrateCollision(player);
      player.x = Math.max(level.bounds.left + player.w / 2, Math.min(level.bounds.right - player.w / 2, player.x));

      if (player.dead && player.respawnTimer <= 0) {
        if (player.lives > 0) {
          player.respawn(Math.max(40, camX + 40), level.groundY);
        } else {
          state = 'gameover';
          els.gameoverTitle.textContent = 'GAME OVER';
          els.gameoverScore.textContent = 'PUNTAJE: ' + player.score;
          els.gameover.classList.remove('hidden');
          if (typeof AUDIO !== 'undefined') {
            AUDIO.stopMusic();
            AUDIO.gameOverJingle();
          }
          return;
        }
      }

      const targetCam = player.x - CW * 0.42;
      camX += (targetCam - camX) * Math.min(1, dt * 6);
      camX = Math.max(0, Math.min(level.width - CW, camX));
      updateMouseCoordinates(input.rawClientX, input.rawClientY);

      updateBullets(dt);
      updateEnemies(dt);
      updatePowerups(dt);

      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) {
          els.waveBanner.classList.remove('flash');
          if (els.waveObjective) els.waveObjective.textContent = '';
        }
      }

      if (!bossActive) {
        if (enemies.length === 0) {
          waveClearTimer -= dt;
          if (waveClearTimer <= 0) {
            if (waveIndex < WAVES.length) {
              spawnWave(waveIndex);
              waveIndex++;
              // No decrementar de nuevo hasta que el bloque de abajo
              // (enemies.length > 0) fije el valor real de espera (1.1s)
              // en cuanto haya enemigos vivos en pantalla.
              waveClearTimer = Number.POSITIVE_INFINITY;
            } else {
              startBossFight();
            }
          }
        } else {
          waveClearTimer = 1.1;
        }
      } else if (boss) {
        boss.update(dt, player, bullets);
        if (!boss.dead && boss.introTimer <= 0 && !player.dead) {
          const bossBox = { x: boss.x - boss.w / 2, y: boss.y - boss.h, w: boss.w, h: boss.h };
          const pBox = { x: player.x - player.w / 2, y: player.y - player.h, w: player.w, h: player.h };
          if (aabbOverlap(bossBox, pBox)) player.takeDamage(18);
        }
        if (boss.dead) {
          if (endTimer > 0) {
            endTimer -= dt;
            if (endTimer <= 0) {
              state = 'victory';
              els.victoryScore.textContent = 'PUNTAJE FINAL: ' + player.score;
              
              if (currentMission < MAX_MISSIONS) {
                els.victoryTitle.textContent = '¡MISIÓN CUMPLIDA!';
                els.victorySubtitle.textContent = '¡Excelente trabajo, soldado! Prepárate para el siguiente sector.';
                els.btnVictoryRetry.textContent = 'SIGUIENTE MISIÓN';
                els.btnVictoryMenu.classList.add('hidden');
              } else {
                els.victoryTitle.textContent = '¡¡HEROE DE GUERRA!!';
                els.victorySubtitle.textContent = '¡Felicidades! Has exterminado a todas las amenazas y completado el juego.';
                els.btnVictoryRetry.textContent = 'REINICIAR DESDE M-1';
                els.btnVictoryMenu.classList.remove('hidden');
                triggerVictoryFireworks();
              }

              els.victory.classList.remove('hidden');
              els.bossHud.classList.add('hidden');
              
              if (typeof AUDIO !== 'undefined') {
                AUDIO.stopMusic();
                AUDIO.victoryJingle();
              }
            }
          }
        }
      }

      updateHud();
    }

    for (const pt of particles) pt.update(dt);
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].dead) particles.splice(i, 1);
  }

  function draw(timeInSeconds) {
    ctx.clearRect(0, 0, CW, CH);
    if (!level) return;

    drawBackground(ctx, level, camX, CW, CH, timeInSeconds);
    drawGround(ctx, level, camX, CW, CH);

    ctx.save();
    ctx.translate(-Math.round(camX), 0);

    for (const c of crates) if (!c.dead) c.draw(ctx);
    for (const p of powerups) p.draw(ctx);
    for (const en of enemies) en.draw(ctx);
    if (boss) boss.draw(ctx);
    if (player && !player.dead) player.draw(ctx);
    for (const b of bullets) drawBullet(ctx, b);
    for (const pt of particles) drawParticle(ctx, pt);

    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, CW, 10);
    ctx.fillRect(0, CH - 4, CW, 4);
  }

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = Math.min(0.033, (ts - lastTime) / 1000 || 0);
    lastTime = ts;
    const timeInSeconds = ts / 1000;

    if (state === 'playing' || state === 'victory') {
      update(dt);
      draw(timeInSeconds);
    }
    if (state !== lastTouchState) {
      lastTouchState = state;
      updateTouchControlsVisibility();
    }
    requestAnimationFrame(loop);
  }

  /* ================= Controles táctiles (móvil) =================
     No reemplaza el teclado/mouse: solo alimenta el mismo objeto
     `input` que ya usa el juego, así que el resto del código no se
     modifica. Los botones se muestran solo en dispositivos táctiles. */
  function isTouchDevice() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer:coarse)').matches;
  }

  const touchControls = document.getElementById('touch-controls');
  let lastTouchState = null;

  function updateTouchControlsVisibility() {
    if (!touchControls) return;
    const show = isTouchDevice() && state === 'playing';
    touchControls.classList.toggle('active', show);
  }

  function wireHoldButton(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = (e) => { e.preventDefault(); el.classList.add('pressed'); onDown(); };
    const end = (e) => { if (e) e.preventDefault(); el.classList.remove('pressed'); onUp(); };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointercancel', end);
  }

  wireHoldButton('tc-left', () => { input.left = true; }, () => { input.left = false; });
  wireHoldButton('tc-right', () => { input.right = true; }, () => { input.right = false; });
  wireHoldButton('tc-down', () => { input.down = true; }, () => { input.down = false; });
  wireHoldButton('tc-jump',
    () => { if (!input.jumpHeld) input.jumpPressed = true; input.jumpHeld = true; if (typeof AUDIO !== 'undefined') AUDIO.unlock(); },
    () => { input.jumpHeld = false; }
  );
  wireHoldButton('tc-reload', () => { input.reloadPressed = true; }, () => { input.reloadPressed = false; });

  const tcWeapon = document.getElementById('tc-weapon');
  if (tcWeapon) {
    const cycle = (e) => { if (e) e.preventDefault(); input.wheelDelta = 1; };
    tcWeapon.addEventListener('pointerdown', cycle);
  }

  const tcPause = document.getElementById('tc-pause');
  if (tcPause) {
    const pause = (e) => { if (e) e.preventDefault(); togglePause(); };
    tcPause.addEventListener('pointerdown', pause);
  }

  /* Palanca de puntería + disparo: se toca y arrastra sobre la zona
     derecha; mientras se mantiene presionada, el jugador dispara
     hacia donde apunta el arrastre (igual que sostener clic con el
     mouse apuntando hacia esa dirección). */
  const tcAim = document.getElementById('tc-aim');
  if (tcAim) {
    const stick = tcAim.querySelector('.tc-aim-stick');
    let aimBase = null;

    function setAimFromDelta(dx, dy) {
      const maxR = 40;
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(len, maxR);
      if (stick) stick.style.transform = `translate(${(dx / len) * clamped}px, ${(dy / len) * clamped}px)`;
      const dirX = dx / len, dirY = dy / len;
      const aimY = player.y - (player.crouch ? 12 : 17);
      input.worldMouseX = player.x + dirX * 300;
      input.worldMouseY = aimY + dirY * 300;
    }

    function aimStart(e) {
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      aimBase = { x: t.clientX, y: t.clientY };
      input.mouseDown = true;
      tcAim.classList.add('pressed');
      if (typeof AUDIO !== 'undefined') AUDIO.unlock();
    }
    function aimMove(e) {
      if (!aimBase) return;
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      setAimFromDelta(t.clientX - aimBase.x, t.clientY - aimBase.y);
    }
    function aimEnd(e) {
      if (e) e.preventDefault();
      aimBase = null;
      input.mouseDown = false;
      tcAim.classList.remove('pressed');
      if (stick) stick.style.transform = 'translate(0,0)';
    }

    tcAim.addEventListener('pointerdown', aimStart);
    tcAim.addEventListener('pointermove', aimMove);
    tcAim.addEventListener('pointerup', aimEnd);
    tcAim.addEventListener('pointercancel', aimEnd);
  }

  resetGame(1);
  requestAnimationFrame(loop);
})();
