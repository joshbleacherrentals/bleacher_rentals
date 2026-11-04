import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  parsePushBody,
  pubSubAuthConfigFromEnv,
  verifyPubSubPush,
  type IdTokenVerifier,
} from "./pubsubAuth";

const config = {
  audience: "https://app.example.com/api/gmail/push",
  serviceAccount: "gmail-push@bleacher-rentals.iam.gserviceaccount.com",
};

const request = (headers: Record<string, string> = {}) =>
  new Request("https://app.example.com/api/gmail/push", { method: "POST", headers });

const verifierFor = (payload: Awaited<ReturnType<IdTokenVerifier>>) =>
  vi.fn<IdTokenVerifier>(async () => payload);

describe("verifyPubSubPush", () => {
  it("accepts a token for the expected service account, checked against the audience", async () => {
    const verify = verifierFor({ email: config.serviceAccount, email_verified: true });

    const result = await verifyPubSubPush(
      request({ authorization: "Bearer abc.def" }),
      config,
      verify,
    );

    expect(result).toEqual({ ok: true });
    expect(verify).toHaveBeenCalledWith("abc.def", config.audience);
  });

  it("compares the service account without regard to case", async () => {
    const verify = verifierFor({
      email: config.serviceAccount.toUpperCase(),
      email_verified: true,
    });

    expect(await verifyPubSubPush(request({ authorization: "bearer t" }), config, verify)).toEqual({
      ok: true,
    });
  });

  it("refuses a request with no token", async () => {
    const verify = verifierFor(undefined);

    expect(await verifyPubSubPush(request(), config, verify)).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it("refuses a token Google does not accept", async () => {
    const verify = vi.fn<IdTokenVerifier>(async () => {
      throw new Error("Wrong recipient");
    });

    expect(
      await verifyPubSubPush(request({ authorization: "Bearer bad" }), config, verify),
    ).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses a valid token for another service account, or one whose email is not verified", async () => {
    for (const payload of [
      { email: "someone-else@bleacher-rentals.iam.gserviceaccount.com", email_verified: true },
      { email: config.serviceAccount, email_verified: false },
      {},
      undefined,
    ]) {
      expect(
        await verifyPubSubPush(
          request({ authorization: "Bearer t" }),
          config,
          verifierFor(payload),
        ),
      ).toMatchObject({ ok: false, status: 403 });
    }
  });

  it("accepts nothing while the audience or service account is not configured", async () => {
    const verify = verifierFor({ email: config.serviceAccount, email_verified: true });

    for (const partial of [
      { audience: undefined, serviceAccount: config.serviceAccount },
      { audience: config.audience, serviceAccount: undefined },
    ]) {
      expect(
        await verifyPubSubPush(request({ authorization: "Bearer t" }), partial, verify),
      ).toMatchObject({ ok: false, status: 500 });
    }
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("pubSubAuthConfigFromEnv", () => {
  const unset = {
    GMAIL_PUSH_AUDIENCE: "",
    GMAIL_PUSH_SERVICE_ACCOUNT: "",
    GMAIL_DWD_SERVICE_ACCOUNT_EMAIL: "",
    NEXT_PUBLIC_APP_URL: "",
  };

  const withEnv = (env: Record<string, string>) => {
    for (const [name, value] of Object.entries({ ...unset, ...env })) vi.stubEnv(name, value);
    return pubSubAuthConfigFromEnv();
  };

  afterEach(() => vi.unstubAllEnvs());

  it("defaults to the app's own push URL and the mailbox access's service account", () => {
    expect(
      withEnv({
        NEXT_PUBLIC_APP_URL: "https://app.example.com/",
        GMAIL_DWD_SERVICE_ACCOUNT_EMAIL: "dwd@p.iam.gserviceaccount.com",
      }),
    ).toEqual({
      audience: "https://app.example.com/api/gmail/push",
      serviceAccount: "dwd@p.iam.gserviceaccount.com",
    });
  });

  it("lets the push settings override those defaults", () => {
    expect(
      withEnv({
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
        GMAIL_DWD_SERVICE_ACCOUNT_EMAIL: "dwd@p.iam.gserviceaccount.com",
        GMAIL_PUSH_AUDIENCE: "https://other.example.com/hook",
        GMAIL_PUSH_SERVICE_ACCOUNT: "push@p.iam.gserviceaccount.com",
      }),
    ).toEqual({
      audience: "https://other.example.com/hook",
      serviceAccount: "push@p.iam.gserviceaccount.com",
    });
  });

  it("has no service account when neither is set, so nothing is accepted", () => {
    expect(withEnv({ NEXT_PUBLIC_APP_URL: "https://app.example.com" }).serviceAccount).toBe(
      undefined,
    );
  });
});

describe("parsePushBody", () => {
  const envelope = (note: unknown) => ({
    message: { data: Buffer.from(JSON.stringify(note)).toString("base64"), messageId: "1" },
    subscription: "projects/p/subscriptions/s",
  });

  it("reads the mailbox and history id out of Pub/Sub's envelope", () => {
    expect(
      parsePushBody(envelope({ emailAddress: "Paul@BleacherRentals.com", historyId: 1234 })),
    ).toEqual({
      mailbox: "paul@bleacherrentals.com",
      historyId: "1234",
    });
    expect(parsePushBody(envelope({ emailAddress: "a@b.com", historyId: "99" }))).toEqual({
      mailbox: "a@b.com",
      historyId: "99",
    });
  });

  it("is null for anything that is not a Gmail notification", () => {
    expect(parsePushBody(null)).toBeNull();
    expect(parsePushBody({})).toBeNull();
    expect(parsePushBody({ message: {} })).toBeNull();
    expect(parsePushBody({ message: { data: "!!!not base64 json!!!" } })).toBeNull();
    expect(parsePushBody(envelope({ emailAddress: "not-an-address", historyId: 1 }))).toBeNull();
    expect(parsePushBody(envelope({ emailAddress: "a@b.com" }))).toBeNull();
    expect(parsePushBody(envelope("just a string"))).toBeNull();
  });
});
