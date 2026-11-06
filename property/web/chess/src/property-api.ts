export type MiniAppJson = null | boolean | number | string | MiniAppJson[] | { [key: string]: MiniAppJson };

export interface MiniAppPeerEvent {
  open: boolean;
}

export interface MiniAppApi {
  context(): Promise<{ inChat: boolean; peer: MiniAppPeerEvent | null; locale?: string; theme?: "light" | "dark" }>;
  storage: {
    get(key: string): Promise<MiniAppJson | undefined>;
    set(key: string, value: MiniAppJson): Promise<void>;
    delete(key: string): Promise<void>;
  };
  chat: {
    send(data: MiniAppJson): Promise<void>;
    on(event: "message", listener: (data: MiniAppJson) => void): () => void;
    on(event: "peer", listener: (peer: MiniAppPeerEvent) => void): () => void;
  };
}
