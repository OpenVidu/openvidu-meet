/**
 * Global type declarations for browser libraries
 */

declare const io: () => SocketIOClient.Socket;

interface Window {
  meetApiKey: string;
}

declare namespace SocketIOClient {
  interface Socket {
    on(event: string, callback: (data: any) => void): Socket;
    emit(event: string, data: any): Socket;
    disconnect(): void;
  }
}