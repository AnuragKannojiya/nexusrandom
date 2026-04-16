// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- socket.io-client typings loaded at runtime
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    }) as Socket;

    (socket as Socket).on("connect_error", (error: Error) => {
      console.error("Socket connect error:", error);
    });
  }
  return socket as Socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
