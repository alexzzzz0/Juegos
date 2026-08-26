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

/* Joystick de movimiento: se arrastra en cualquier dirección y, según el
   ángulo, activa izquierda / derecha / agachar-derrapar (las mismas
   banderas que ya lee el motor desde el teclado). Un solo círculo grande
   es más cómodo con el pulgar que tres botones pequeños pegados al borde. */
const tcJoystick = document.getElementById('tc-joystick');
if (tcJoystick) {
  const stick = tcJoystick.querySelector('.tc-joystick-stick');
  let base = null;
  const DEADZONE = 14;
  const MAX_R = 34;

  function setDirection(left, right, down) {
    game.controls[0].left = left;
    game.controls[0].right = right;
    game.controls[0].down = down;
  }

  function updateFromDelta(dx, dy) {
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len || 0, MAX_R);
    const ang = Math.atan2(dy, dx);
    if (stick) {
      stick.style.transform = len > 0
        ? `translate(${Math.cos(ang) * clamped}px, ${Math.sin(ang) * clamped}px)`
        : 'translate(0,0)';
    }
    if (len < DEADZONE) { setDirection(false, false, false); return; }
    // Ocho sectores: izquierda/derecha dominan salvo que el arrastre sea
    // mayormente hacia abajo, que agacha/derrapa.
    const degrees = (ang * 180) / Math.PI; // -180..180, 90 = abajo
    const isDown = degrees > 55 && degrees < 125;
    const isLeft = !isDown && Math.abs(degrees) > 90;
    const isRight = !isDown && Math.abs(degrees) <= 90;
    setDirection(isLeft, isRight, isDown);
  }

  function start(e) {
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    base = { x: t.clientX, y: t.clientY };
    tcJoystick.classList.add('pressed');
  }
  function move(e) {
    if (!base) return;
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    updateFromDelta(t.clientX - base.x, t.clientY - base.y);
  }
  function end(e) {
    if (e) e.preventDefault();
    base = null;
    tcJoystick.classList.remove('pressed');
    setDirection(false, false, false);
    if (stick) stick.style.transform = 'translate(0,0)';
  }

  tcJoystick.addEventListener('pointerdown', start);
  tcJoystick.addEventListener('pointermove', move);
  tcJoystick.addEventListener('pointerup', end);
  tcJoystick.addEventListener('pointerleave', end);
  tcJoystick.addEventListener('pointercancel', end);
}

wireHoldButton('tc-jump', () => { game.controls[0].jump = true; }, () => { game.controls[0].jump = false; });
wireHoldButton('tc-fire', () => { game.controls[0].fire = true; }, () => { game.controls[0].fire = false; });

const tcPause = document.getElementById('tc-pause');
if (tcPause) {
  const fire = (e) => { if (e) e.preventDefault(); game.togglePause(); };
  tcPause.addEventListener('pointerdown', fire);
}

/* Alinea los controles táctiles con el área real del canvas (que puede
   quedar centrado con franjas negras a los lados al forzar una relación
   de aspecto fija en pantalla completa horizontal), en vez de con todo
   el contenedor. Así el joystick y los botones quedan pegados al juego
   visible y no "flotan" en el espacio vacío. */
function syncTouchControlsToCanvas() {
  if (!touchControls || !canvas) return;
  touchControls.style.left = canvas.offsetLeft + 'px';
  touchControls.style.top = canvas.offsetTop + 'px';
  touchControls.style.width = canvas.offsetWidth + 'px';
  touchControls.style.height = canvas.offsetHeight + 'px';
}
window.addEventListener('resize', syncTouchControlsToCanvas);
window.addEventListener('orientationchange', () => setTimeout(syncTouchControlsToCanvas, 50));
if (window.ResizeObserver) new ResizeObserver(syncTouchControlsToCanvas).observe(canvas);
syncTouchControlsToCanvas();
})();
