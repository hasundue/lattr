import { retry } from "https://deno.land/std@0.185.0/async/mod.ts";
import {
  Event,
  Filter,
  Relay,
  relayInit,
  Sub,
  SubscriptionOptions,
} from "npm:nostr-tools";
import { EventId, RelayUrl } from "./nostr.ts";
import { now } from "./utils.ts";

export type RelayConfig = {
  url: RelayUrl;
  read: boolean;
  write: boolean;
};

type RelayConn = Relay & RelayConfig;

export type SubscribeOptions = SubscriptionOptions & {
  name?: string;
  close_on_eose?: boolean;
};

export type SubscriptionEvent = Event & {
  relay: RelayUrl;
};

export class Subscription {
  private subs = new Map<Relay, Sub>();
  private events_recieved = new Set<EventId>();
  private eose_recieved = new Set<RelayUrl>();

  stream: ReadableStream<SubscriptionEvent>;

  constructor(
    relays: RelayConn[],
    public filter: Filter,
    public options: SubscribeOptions = {},
  ) {
    this.stream = new ReadableStream<SubscriptionEvent>({
      start: (controller) => {
        for (const relay of relays) {
          const sub = relay.sub([filter], options);

          sub.on("event", (event) => {
            if (!this.events_recieved.has(event.id as EventId)) {
              // console.debug(`Recieved a new event from ${relay.url}:`, event);
              this.events_recieved.add(event.id as EventId);
              controller.enqueue({ ...event, relay: relay.url });
            }
          });

          if (options.close_on_eose) {
            sub.on("eose", () => {
              // console.log(`Recieved EOSE from ${relay.url}.`);
              if (this.eose_recieved.add(relay.url).size >= relays.length) {
                controller.close();
                this.stop();
              }
            });
          }

          this.subs.set(relay, sub);
          // console.log(`Subscribed to ${relay.url}:`, filter);
        }
      },
      cancel: () => {
        this.stop();
      },
    });
  }

  restart() {
    this.filter = { ...this.filter, since: now() };
    for (const relay of this.subs.keys()) {
      const sub = relay.sub([this.filter], this.options);
      this.subs.set(relay, sub);
      console.log(`Resubscribed to ${relay.url}:`, this.filter);
    }
  }

  stop() {
    this.subs.forEach((sub) => sub.unsub());
    // console.debug(`Unsubscribed from the events:`, this.filter);
  }

  update(filter: Filter, options: SubscriptionOptions = this.options) {
    this.filter = { since: now(), ...filter };
    for (const [relay, sub] of this.subs) {
      sub.sub([filter], options);
      console.debug(`Updated subscription to ${relay.url}:`, filter);
    }
  }
}

export class RelayPool {
  private subs: Subscription[] = [];

  relays: RelayConn[] = [];

  constructor(relays: RelayConfig[]) {
    for (const config of relays) {
      const relay = relayInit(config.url);
      const conn = { ...relay, ...config };
      this.relays.push(conn);
    }
  }

  async connect() {
    for (const relay of this.relays) {
      relay.on("connect", () => {
        console.log(`Connected to ${relay.url}.`);
      });

      relay.on("disconnect", async () => {
        console.log(`Disconnected from ${relay.url}.`);

        // We reconnect to write-only relays on demand.
        if (!relay.read) return;

        // Reconnect to the relay.
        await relay.connect();
        console.log(`Reconnected to ${relay.url}.`);

        // Resubscribe to all filters.
        this.subs.forEach((sub) => {
          sub.restart();
        });
      });

      relay.on("error", () => {
        throw new Error(`Failed to connect to ${relay.url}.`);
      });

      await relay.connect();
    }
  }

  subscribe(filter: Filter, options?: SubscribeOptions) {
    return new Subscription(
      this.relays.filter((conn) => conn.read),
      { since: now(), ...filter },
      options,
    );
  }

  retrieve(filter: Filter, options?: SubscribeOptions) {
    const sub = new Subscription(
      this.relays.filter((conn) => conn.read),
      filter,
      { close_on_eose: true, ...options },
    );
    return sub.stream;
  }

  async getLatestEvent(filter: Filter): Promise<Event | null> {
    const sub = new Subscription(
      this.relays.filter((conn) => conn.read),
      { limit: 1, ...filter },
      { close_on_eose: true },
    );
    for await (const event of sub.stream) {
      return event;
    }
    return null;
  }

  async publish(event: Event) {
    const env = Deno.env.get("RAILWAY_ENVIRONMENT");

    await Promise.all(
      this.relays.filter((conn) => conn.write).map((relay) =>
        retry(async () => {
          console.log(`Publishing an event ${event.id} to ${relay.url}...`);

          if (env !== "production") {
            console.log(`Skipped (env: ${env})`);
            return;
          }

          // Reconnect to the relay if it's disconnected.
          if (relay.status !== 1) {
            await relay.connect();
            console.log(`Reconnected to ${relay.url}.`);
          }

          const sub = this.subscribe({ ids: [event.id] });
          const pub = relay.publish(event);

          pub.on("failed", (reason: string) => {
            throw new Error(
              `Failed to publish an event ${event.id} to ${relay.url}:`,
              { cause: reason },
            );
          });

          // Wait for the event to be published.
          for await (const event of sub.stream) {
            console.log(
              `Event ${event.id} has been published to ${relay.url}.`,
            );
            return;
          }
        })
      ),
    );
  }

  close() {
    this.relays.forEach((relay) => {
      relay.close();
    });
  }
}
