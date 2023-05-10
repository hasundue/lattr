import { Brand } from "./utils.ts";
import { Event, Sub } from "npm:nostr-tools";

export type EventId = Brand<string, "EventId">;

export type NostrProfile = Brand<string, "NostrProfile">;
export type NostrEvent = Brand<string, "NostrEvent">;

export function createSubReadableStream(sub: Sub, opts: { realtime: boolean }) {
  return new ReadableStream<Event>({
    start: (controller) => {
      sub.on("event", (event) => {
        controller.enqueue(event);
      });
      sub.on("eose", () => {
        if (opts.realtime) return;
        sub.unsub();
        controller.close();
      });
    },
    cancel: () => {
      sub.unsub();
    },
  });
}

export * from "./event.ts";
export * from "./keys.ts";
export * from "./admin.ts";
export * from "./chat.ts";
export * from "./puzzle.ts";
