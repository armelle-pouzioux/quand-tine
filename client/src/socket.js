import { io } from "socket.io-client";

export const socket = io("http://localhost:4000", {
  transports: ["websocket"],
});

export function registerClient(client_token) {
  socket.emit("client:register", { client_token });
}