import { Brand } from "./utils.ts";

export type EventId = Brand<string, "EventId">;

export type NostrProfile = Brand<string, "NostrProfile">;
export type NostrEvent = Brand<string, "NostrEvent">;
export type NostrPubkey = Brand<string, "NostrPubkey">;

export type RelayUrl = `wss://${string}`;

export * from "./keys.ts";
export * from "./pool.ts";
export * from "./event.ts";
export * from "./admin.ts";
export * from "./puzzle.ts";
export * from "./chat.ts";
