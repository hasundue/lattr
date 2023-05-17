import { assert, assertEquals } from "testing/asserts";
import { beforeEach, describe, it } from "testing/bdd";
import { Event, generatePrivateKey, nip10 } from "nostr-tools";
import { createEvent, createReplyEvent, EventTemplateInit } from "./event.ts";
import { PrivateKey } from "./keys.ts";

const privateKey = generatePrivateKey() as PrivateKey;
const privateKey_someone = generatePrivateKey() as PrivateKey;
const relay_recommend = "wss://example.com";

describe("createReplyEvent", () => {
  const root_id = "xxxxxx";
  const reply_id = "yyyyyy";

  let event_target: Event;
  let template: EventTemplateInit;
  let reply: Event;
  let tags: nip10.NIP10Result;

  beforeEach(() => {
    template = {
      kind: 1,
      content: "hello",
    };
  });

  describe("a reply to a non-reply event", () => {
    beforeEach(() => {
      event_target = createEvent(privateKey_someone, {
        kind: 1,
        tags: [],
        created_at: 123,
        content: "hello",
      });
      reply = createReplyEvent({
        event_target,
        relay_recommend,
        template,
        privateKey,
      });
      tags = nip10.parse(reply);
    });

    it("does not include a reply tags", () => {
      assertEquals(tags.reply, undefined);
    });

    it("has a root tag pointing to the non-reply event", () => {
      assert(tags.root);
      assertEquals(tags.root.id, event_target.id);
      assertEquals(tags.root.relays, [relay_recommend]);
    });
  });

  describe("a reply to a reply-to-non-reply event in a deprecated style", () => {
    beforeEach(() => {
      event_target = createEvent(privateKey_someone, {
        kind: 1,
        tags: [
          ["e", root_id],
        ],
        created_at: 123,
        content: "hello",
      });
      reply = createReplyEvent({
        event_target,
        relay_recommend,
        template,
        privateKey,
      });
      tags = nip10.parse(reply);
    });

    it("has a root tag pointing to the non-reply event", () => {
      assert(tags.root);
      assertEquals(tags.root.id, root_id);
      assertEquals(tags.root.relays, []);
    });

    it("has a reply tag pointing to the reply event", () => {
      assert(tags.reply);
      assertEquals(tags.reply.id, event_target.id);
    });
  });

  describe("a reply to a reply-to-reply event in a deprecated style", () => {
    beforeEach(() => {
      event_target = createEvent(privateKey_someone, {
        kind: 1,
        tags: [
          ["e", root_id],
          ["e", reply_id],
        ],
        created_at: 123,
        content: "hello",
      });
      reply = createReplyEvent({
        event_target,
        relay_recommend,
        template,
        privateKey,
      });
      tags = nip10.parse(reply);
    });

    it("has a root tag pointing to the root event", () => {
      assert(tags.root);
      assertEquals(tags.root.id, root_id);
      assertEquals(tags.root.relays, []);
    });

    it("has a reply tag pointing to the reply event", () => {
      assert(tags.reply);
      assertEquals(tags.reply.id, event_target.id);
    });
  });

  describe("a reply to a reply-to-non-reply event in a preferred style", () => {
    beforeEach(() => {
      event_target = createEvent(privateKey_someone, {
        kind: 1,
        tags: [
          ["e", root_id, relay_recommend, "root"],
        ],
        created_at: 123,
        content: "hello",
      });
      reply = createReplyEvent({
        event_target,
        relay_recommend,
        template,
        privateKey,
      });
      tags = nip10.parse(reply);
    });

    it("has a root tag pointing to the non-reply event", () => {
      assert(tags.root);
      assertEquals(tags.root.id, root_id);
      assertEquals(tags.root.relays, [relay_recommend]);
    });

    it("has a reply tag pointing to the reply event", () => {
      assert(tags.reply);
      assertEquals(tags.reply.id, event_target.id);
    });
  });

  describe("a reply to a reply-to-reply event in a preferred style", () => {
    beforeEach(() => {
      event_target = createEvent(privateKey_someone, {
        kind: 1,
        tags: [
          ["e", root_id, relay_recommend, "root"],
          ["e", reply_id, relay_recommend, "reply"],
        ],
        created_at: 123,
        content: "hello",
      });
      reply = createReplyEvent({
        event_target,
        relay_recommend,
        template,
        privateKey,
      });
      tags = nip10.parse(reply);
    });

    it("has a root tag pointing to the non-reply event", () => {
      assert(tags.root);
      assertEquals(tags.root.id, root_id);
      assertEquals(tags.root.relays, [relay_recommend]);
    });

    it("has a reply tag pointing to the reply event", () => {
      assert(tags.reply);
      assertEquals(tags.reply.id, event_target.id);
    });
  });
});
