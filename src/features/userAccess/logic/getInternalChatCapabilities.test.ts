import { describe, it, expect } from "vitest";
import type { WebRole } from "./determineAccess";
import {
  getInternalChatCapabilities,
  type InternalChatCapabilities,
} from "./getInternalChatCapabilities";

// docs/specs/accountant-quotes-11-accountant-internal-chat.md §3 and §9.2. Written before the
// function: it is the contract the function is made to satisfy.

const caps = (roles: WebRole[], isSubscribed = false) =>
  getInternalChatCapabilities({ roles, isSubscribed });

const NOTHING: InternalChatCapabilities = {
  useInternalChat: false,
  postInChat: false,
  joinChat: false,
  leaveChat: false,
  manageChatMembers: false,
};

describe("the shape of the answer", () => {
  it("is exactly the five capabilities of the spec, and nothing else", () => {
    expect(Object.keys(caps(["admin"])).sort()).toEqual([
      "joinChat",
      "leaveChat",
      "manageChatMembers",
      "postInChat",
      "useInternalChat",
    ]);
  });
});

describe("admin", () => {
  it("subscribed: everything", () => {
    expect(caps(["admin"], true)).toEqual({
      useInternalChat: true,
      postInChat: true,
      joinChat: true,
      leaveChat: true,
      manageChatMembers: true,
    });
  });

  it("not subscribed: still posts and manages members (an admin never has to join first), cannot leave a chat they are not in", () => {
    expect(caps(["admin"], false)).toEqual({
      useInternalChat: true,
      postInChat: true,
      joinChat: true,
      leaveChat: false,
      manageChatMembers: true,
    });
  });
});

describe("account manager", () => {
  it("subscribed: everything", () => {
    expect(caps(["account_manager"], true)).toEqual({
      useInternalChat: true,
      postInChat: true,
      joinChat: true,
      leaveChat: true,
      manageChatMembers: true,
    });
  });

  it("not subscribed: reads and can join, but cannot post, leave or manage members", () => {
    expect(caps(["account_manager"], false)).toEqual({
      useInternalChat: true,
      postInChat: false,
      joinChat: true,
      leaveChat: false,
      manageChatMembers: false,
    });
  });
});

describe("accountant (D1: only themselves, D2: can leave)", () => {
  it("subscribed: posts, can leave, can join — and still manages no members", () => {
    expect(caps(["accountant"], true)).toEqual({
      useInternalChat: true,
      postInChat: true,
      joinChat: true,
      leaveChat: true,
      manageChatMembers: false,
    });
  });

  it("not subscribed: uses the chat and can join any event's chat, but cannot post or leave", () => {
    expect(caps(["accountant"], false)).toEqual({
      useInternalChat: true,
      postInChat: false,
      joinChat: true,
      leaveChat: false,
      manageChatMembers: false,
    });
  });

  it.each([true, false])(
    "never manages members — neither adds nor removes anyone (subscribed: %s)",
    (isSubscribed) => {
      expect(caps(["accountant"], isSubscribed).manageChatMembers).toBe(false);
    },
  );
});

describe("every other role gets nothing, subscribed or not", () => {
  it.each(["viewer", "maintainer", "developer", "driver"] as const)("%s", (role) => {
    expect(caps([role], false)).toEqual(NOTHING);
    // A stale subscription must not open the chat to a role that cannot use it.
    expect(caps([role], true)).toEqual(NOTHING);
  });

  it("no roles at all (the store before sign-in completes)", () => {
    expect(caps([], false)).toEqual(NOTHING);
    expect(caps([], true)).toEqual(NOTHING);
  });

  it("a role the function does not know", () => {
    expect(caps(["superuser" as WebRole], true)).toEqual(NOTHING);
  });
});

describe("roles are additive", () => {
  it("accountant + account manager, subscribed: gets the account manager's manageChatMembers", () => {
    expect(caps(["accountant", "account_manager"], true).manageChatMembers).toBe(true);
  });

  it("accountant + account manager, not subscribed: manageChatMembers needs the subscription", () => {
    expect(caps(["accountant", "account_manager"], false).manageChatMembers).toBe(false);
  });

  it("accountant + account manager equals the account manager, subscribed or not", () => {
    for (const isSubscribed of [true, false]) {
      expect(caps(["accountant", "account_manager"], isSubscribed)).toEqual(
        caps(["account_manager"], isSubscribed),
      );
    }
  });

  it("accountant + admin equals the admin, subscribed or not", () => {
    for (const isSubscribed of [true, false]) {
      expect(caps(["accountant", "admin"], isSubscribed)).toEqual(caps(["admin"], isSubscribed));
    }
  });

  it("viewer + accountant: the accountant's rights, no more", () => {
    for (const isSubscribed of [true, false]) {
      expect(caps(["viewer", "accountant"], isSubscribed)).toEqual(
        caps(["accountant"], isSubscribed),
      );
    }
  });

  it("admin + viewer equals the admin", () => {
    expect(caps(["admin", "viewer"], false)).toEqual(caps(["admin"], false));
  });
});

// Behaviour for an admin and an account manager must not change: the rules the hook
// `useEventChatMemberAccess` and the four places applied before this spec, written out here as the
// reference the function is held to.
describe("an admin and an account manager get exactly what they got before", () => {
  const before = (roles: WebRole[], isSubscribed: boolean) => {
    const isAdmin = roles.includes("admin");
    const isAccountManager = roles.includes("account_manager");
    return {
      useInternalChat: isAdmin || isAccountManager,
      postInChat: isAdmin || isSubscribed,
      manageChatMembers: isAdmin || (isAccountManager && isSubscribed),
    };
  };

  const combos: WebRole[][] = [["admin"], ["account_manager"], ["admin", "account_manager"]];

  it.each(combos)("%s", (...roles) => {
    for (const isSubscribed of [true, false]) {
      const now = caps(roles, isSubscribed);
      const was = before(roles, isSubscribed);
      expect(now.useInternalChat, `useInternalChat, subscribed: ${isSubscribed}`).toBe(
        was.useInternalChat,
      );
      expect(now.postInChat, `postInChat, subscribed: ${isSubscribed}`).toBe(was.postInChat);
      expect(now.manageChatMembers, `manageChatMembers, subscribed: ${isSubscribed}`).toBe(
        was.manageChatMembers,
      );
    }
  });
});

describe("who opens the chat pages", () => {
  it("is an admin, an account manager and an accountant — and nobody else", () => {
    const roles = [
      "admin",
      "account_manager",
      "accountant",
      "viewer",
      "maintainer",
      "developer",
      "driver",
    ] as const;
    const opens = roles.filter((role) => caps([role]).useInternalChat);
    expect(opens).toEqual(["admin", "account_manager", "accountant"]);
  });
});
