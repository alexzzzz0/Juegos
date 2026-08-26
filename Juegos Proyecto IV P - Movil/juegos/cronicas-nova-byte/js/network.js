(function () {
'use strict';
class LanNetwork {
  constructor(onMessage, onStatus) {
    this.socket = null;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.room = null;
    this.role = null;
    this.lastInput = '';

    // conexión en curso (evita crear sockets duplicados si connect() se llama varias veces)
    this.connecting = null;

    // reconexión automática
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 5000;

    // heartbeat de input: reenvía el último input aunque no haya cambiado,
    // para resincronizar rápido si se perdió un paquete o hubo un reconnect
    this.heartbeatMs = 150;
    this.lastInputPayload = null;
    this._heartbeatTimer = null;

    // medición de ping
    this.ping = null;
    this._pingTimer = null;
  }

  connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting; // ya hay un intento en curso, no dupliques

    this.connecting = new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const address = `${protocol}//${location.host}`;
      this.onStatus('Conectando al servidor LAN…');
      const socket = new WebSocket(address);
      this.socket = socket;

      const timer = setTimeout(() => {
        socket.close();
        reject(new Error('Tiempo de conexión agotado'));
      }, 5000);

      socket.onopen = () => {
        clearTimeout(timer);
        this.onStatus('Servidor conectado.');
        this.reconnectAttempts = 0;
        this._startHeartbeat();
        this._startPing();
        resolve();
      };

      socket.onerror = () => {
        clearTimeout(timer);
        this.onStatus('No se encontró el servidor. Ejecuta: npm start');
        reject(new Error('socket'));
      };

      socket.onclose = () => {
        this.onStatus('Conexión LAN cerrada.');
        this._stopHeartbeat();
        this._stopPing();
        this.connecting = null;
        if (this.shouldReconnect) this._scheduleReconnect();
      };

      socket.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; } // mensaje inválido ignorado
        if (msg.type === 'pong') {
          this.ping = Date.now() - msg.t;
          return;
        }
        this.onMessage(msg);
      };
    }).finally(() => { this.connecting = null; });

    return this.connecting;
  }

  _scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(500 * 2 ** (this.reconnectAttempts - 1), this.maxReconnectDelay);
    this.onStatus(`Reintentando conexión en ${(delay / 1000).toFixed(1)}s…`);
    setTimeout(() => {
      if (this.shouldReconnect) this.connect().catch(() => {});
    }, delay);
  }

  disconnect() {
    this.shouldReconnect = false;
    this._stopHeartbeat();
    this._stopPing();
    this.socket?.close();
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this.lastInputPayload) this.send({ type: 'input', input: this.lastInputPayload });
    }, this.heartbeatMs);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
  }

  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      this.send({ type: 'ping', t: Date.now() });
    }, 2000);
  }

  _stopPing() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = null;
  }

  send(data) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(data));
  }

  async createRoom() { await this.connect(); this.send({ type: 'createRoom' }); }
  async joinRoom(room) { await this.connect(); this.send({ type: 'joinRoom', room: room.trim().toUpperCase() }); }
  start() { this.send({ type: 'start' }); }
  state(snapshot) { this.send({ type: 'state', snapshot }); }

  input(input) {
    const packed = `${+input.left}${+input.right}${+input.jump}${+input.fire}${+input.down}`;
    this.lastInputPayload = input; // se usa también para el heartbeat
    if (packed !== this.lastInput) {
      this.lastInput = packed;
      this.send({ type: 'input', input });
    }
  }
}

window.LanNetwork = LanNetwork;
})();
