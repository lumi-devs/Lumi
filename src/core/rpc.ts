import { createServer } from "node:http";

export interface RpcServerOptions {
  port: number;
  host?: string;
  handler: (req: any, res: any) => Promise<void>;
}

export class RpcServer {
  private server: ReturnType<typeof createServer>;
  private readonly port: number;
  private readonly host: string;
  private readonly handler: (req: any, res: any) => Promise<void>;

  constructor(options: RpcServerOptions) {
    this.port = options.port;
    this.host = options.host ?? "0.0.0.0";
    this.handler = options.handler;

    this.server = createServer(async (req, res) => {
      try {
        await this.handler(req, res);
      } catch (_err) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}

export function createRpcServer(options: RpcServerOptions): RpcServer {
  return new RpcServer(options);
}