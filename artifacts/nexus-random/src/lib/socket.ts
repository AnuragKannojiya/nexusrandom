// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- socket.io-client typings loaded at runtime
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

const SOCKET_OPTIONS = {
  path: "/socket.io",
  transports: ["websocket", "polling"],
};

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = (
      API_URL ? io(API_URL, SOCKET_OPTIONS) : io(SOCKET_OPTIONS)
    ) as Socket;

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
