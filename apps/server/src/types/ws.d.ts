// 最小化 `ws` 模块声明（ ambient module ）。
// 项目当前离线环境无法安装 @types/ws，这里仅声明代码中实际用到的子集，
// 足以通过 tsc 类型检查。联网环境下建议改为安装 @types/ws 以获得完整类型：
//   pnpm --filter @adcraft/server add -D @types/ws
declare module 'ws' {
  import { EventEmitter } from 'events'
  import { IncomingMessage, Server as HttpServer } from 'http'

  export class WebSocket extends EventEmitter {
    send(data: string): void
    close(): void
    on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[]) => void): this
    on(event: 'close', listener: (code?: number) => void): this
    on(event: 'error', listener: (err: Error) => void): this
    on(event: 'open', listener: () => void): this
    on(event: string, listener: (...args: any[]) => void): this
  }

  export interface WebSocketServerOptions {
    server?: HttpServer
    path?: string
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: WebSocketServerOptions)
    on(event: 'connection', listener: (ws: WebSocket, request: IncomingMessage) => void): this
    on(event: 'listening', listener: () => void): this
    on(event: 'error', listener: (err: Error) => void): this
    on(event: string, listener: (...args: any[]) => void): this
    close(callback?: (err?: Error) => void): void
  }
}
