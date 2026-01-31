// client/src/socketService.js
import { io } from "socket.io-client";

class SocketService {
  constructor() {
    this.socket = null;
    this.pendingListeners = []; // 暫存還沒綁定的監聽器
  }

  connect(url) {
    if (this.socket && this.socket.connected) {
      console.log('[SocketService] Already connected.');
      return;
    }

    if (this.socket) {
      console.log('[SocketService] Socket exists but not connected. Re-initializing...');
      this.socket.disconnect();
      this.socket.removeAllListeners(); // 移除所有舊的監聽器
      this.socket = null;
    }

    console.log('[SocketService] Connecting to:', url);
    this.socket = io(url, {
      path: '/socket.io',
      reconnectionAttempts: 10
    });

    // 綁定基礎監聽器
    this.setupListeners();

    // 綁定所有暫存的監聽器
    if (this.pendingListeners.length > 0) {
      console.log(`[SocketService] Attaching ${this.pendingListeners.length} pending listeners`);
      this.pendingListeners.forEach(({ event, callback }) => {
        this.socket.on(event, callback);
      });
      this.pendingListeners = []; // 清空
    }
  }

  // 基礎監聽器，例如 connect, connect_error
  setupListeners() {
    this.socket.on('connect', () => {
      console.log('[SocketService] Connected:', this.socket.id);
      // Note: The pending listeners are now attached directly in the connect method
      // after the socket is initialized, not inside the 'connect' event handler.
    });

    this.socket.on('connect_error', (err) => {
      console.error('[SocketService] Connection Error:', err);
    });
  }

  // --- 事件監聽 ---
  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    } else {
      // 如果 socket 還沒建立，先存起來
      console.log(`[SocketService] Queueing listener for: ${event}`);
      this.pendingListeners.push({ event, callback });
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    } else {
      this.queue = this.queue.filter(q => q.event !== event || q.callback !== callback);
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    } else {
      console.warn('[SocketService] Attempted to emit before connection:', event);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.queue = [];
    }
  }
}

export default new SocketService();