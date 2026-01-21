// client/src/socketService.js
import { io } from "socket.io-client";

class SocketService {
  socket;
  constructor() {}

  connect(url) {
    if (!this.socket) {
      this.socket = io(url);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }
}

export default new SocketService();