(function () {
'use strict';
const GameClass = window.PixelQuest;
const NetworkClass = window.LanNetwork;

const canvas = document.querySelector('#game');
const overlay = document.querySelector('#overlay');
const hud = document.querySelector('#hud');
const worldLabel = document.querySelector('#world-label');
const lanStatus = document.querySelector('#lan-status');
const lanStart = document.querySelector('#lan-start-btn');
const soundButton = document.querySelector('#sound-btn');
const pauseMenu = document.querySelector('#pause-menu');
let lanRole = null;
const audio = new window.PixelAudio();

const game = new GameClass(canvas, {
  onLevel(level) { worldLabel.textContent = `${level.worldName} · ${level.number}/15`; audio.setWorld(level.world, level.index); },
  onSound(effect) { audio.play(effect); },
  onPause(paused) {
    pauseMenu.classList.toggle('hidden', !paused);
    if (paused) audio.stopMusic();
    else audio.startMusic();
  },
  onHud(players, level, mode) {
    const cards = players.filter((p) => mode !== 'solo' || p.id === 0).map((p) => {
      const power = p.starTimer > 0 ? '★ ESTRELLA' : p.power === 'flower' ? '✿ FLOR' : p.power === 'mushroom' ? '● HONGO' : '· PEQUEÑO';
      const name = p.id === 0 ? 'NOVA' : 'BYTE';
      const tag = p.id === 0 && mode === 'lan-host' ? ' · HOST' : p.id === 1 && mode === 'lan-guest' ? ' · LAN' : '';
      const lives = p.active ? `<em class="life-label">VIDAS ${p.lives}</em> <em class="heart">${'♥'.repeat(Math.max(0, p.lives))}</em>` : '<em>SIN VIDAS</em>';
      return `<div class="player-card ${p.id ? 'p2' : ''} ${p.active ? '' : 'out'}"><div><strong>${name}${tag}</strong>${lives} &nbsp;${p.coins} ◉</div><div><strong>${power}</strong><em>${p.running ? 'CORRIENDO · ' : ''}${p.score.toString().padStart(5, '0')}</em></div></div>`;
    }).join('');
    const lead = Math.max(0, ...players.filter((p) => p.active).map((p) => p.x));
    const progress = Math.min(100, Math.round((lead / level.width) * 100));
    const timeLeft = Math.max(0, Math.ceil(level.timeLeft ?? 0));
    const timeClass = timeLeft <= 30 ? ' low-time' : '';
    hud.innerHTML = `${cards}<div class="stage-card"><strong>${level.name}</strong><em>RECORRIDO ${progress}% · CONTROL ${level.activeCheckpoint}/2</em><em class="timer${timeClass}">TIEMPO ${timeLeft.toString().padStart(3, '0')}</em></div>`;
  },
  onEnd(result) { showEnd(result.type === 'won'); },
});

const network = new NetworkClass(handleNetworkMessage, (message) => { lanStatus.textContent = message; });
game.setNetwork(network);

function startGame(mode) { audio.unlock(); overlay.classList.add('hidden'); game.start(mode); }
function setLanStatus(message) { lanStatus.textContent = message; }

function handleNetworkMessage(message) {
  if (message.type === 'registered') {
    lanRole = message.role;
    setLanStatus(message.role === 'host' ? `Sala creada: ${message.room}. Comparte este código.` : `Te uniste a la sala ${message.room}. Espera al anfitrión.`);
  }
  if (message.type === 'peer') { setLanStatus('¡Compañero conectado! Ya pueden iniciar.'); if (lanRole === 'host') lanStart.classList.remove('hidden'); }
  if (message.type === 'start') startGame(lanRole === 'host' ? 'lan-host' : 'lan-guest');
  if (message.type === 'state' && lanRole === 'guest') game.receiveSnapshot(message.snapshot);
  if (message.type === 'input' && lanRole === 'host') game.setRemoteInput(message.input);
  if (message.type === 'peerLeft') { setLanStatus('El otro jugador se desconectó.'); lanStart.classList.add('hidden'); }
  if (message.type === 'error') setLanStatus(`Error: ${message.message}`);
}

function showEnd(won) {
  overlay.classList.remove('hidden');
  overlay.innerHTML = `<div class="panel"><p class="eyebrow">CRÓNICAS DE NOVA &amp; BYTE</p><h1>${won ? '¡Aventura<br /><span>completada!</span>' : 'Fin de<br /><span>la partida</span>'}</h1><p class="intro">${won ? 'Las tres Gemas de Prisma vuelven a brillar. ¡Has superado los 15 niveles!' : 'Las criaturas del Reino Píxel resistieron esta vez. ¡Una partida más y lo lograrás!'}</p><button id="play-again" class="primary">Volver a jugar</button></div>`;
  document.querySelector('#play-again').addEventListener('click', () => location.reload());
}

document.querySelector('#solo-btn').addEventListener('click', () => startGame('solo'));
document.querySelector('#local-btn').addEventListener('click', () => startGame('local'));
document.querySelector('#host-btn').addEventListener('click', async () => { audio.unlock(); try { await network.createRoom(); } catch {} });
document.querySelector('#join-btn').addEventListener('click', async () => {
  const code = document.querySelector('#room-code').value.trim();
  if (code.length < 3) { setLanStatus('Escribe el código de sala que recibió el anfitrión.'); return; }
  audio.unlock();
  try { await network.joinRoom(code); } catch {}
});
lanStart.addEventListener('click', () => { audio.unlock(); network.start(); });
document.querySelector('#resume-btn').addEventListener('click', () => game.setPaused(false));
document.querySelector('#retry-btn').addEventListener('click', () => game.restartCurrentLevel());
document.querySelector('#exit-btn').addEventListener('click', () => location.reload());
soundButton.addEventListener('click', () => {
  const enabled = audio.toggle();
  soundButton.textContent = enabled ? '♫ SONIDO: ON' : '♪ SONIDO: OFF';
  soundButton.classList.toggle('muted', !enabled);
  soundButton.setAttribute('aria-pressed', String(!enabled));
});

/* ================= Controles táctiles (móvil) =================
   Escriben directamente sobre game.controls[0] (el mismo objeto que
   ya usa el motor para leer el teclado del Jugador 1), así que el
   resto del código del juego no se modifica. Solo se muestran en
   dispositivos táctiles y en modo solitario (el modo local de 2
   jugadores necesita el teclado completo). */
function isTouchDevice() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer:coarse)').matches;
}

const touchControls = document.getElementById('touch-controls');

function updateTouchControlsVisibility() {
  if (!touchControls) return;
  const show = isTouchDevice() && game.running && !game.paused && game.mode === 'solo';
  touchControls.classList.toggle('active', show);
}

setInterval(updateTouchControlsVisibility, 200);

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

wireHoldButton('tc-left', () => { game.controls[0].left = true; }, () => { game.controls[0].left = false; });
wireHoldButton('tc-right', () => { game.controls[0].right = true; }, () => { game.controls[0].right = false; });
wireHoldButton('tc-down', () => { game.controls[0].down = true; }, () => { game.controls[0].down = false; });
wireHoldButton('tc-jump', () => { game.controls[0].jump = true; }, () => { game.controls[0].jump = false; });
wireHoldButton('tc-fire', () => { game.controls[0].fire = true; }, () => { game.controls[0].fire = false; });

const tcPause = document.getElementById('tc-pause');
if (tcPause) {
  const fire = (e) => { if (e) e.preventDefault(); game.togglePause(); };
  tcPause.addEventListener('pointerdown', fire);
}
})();
