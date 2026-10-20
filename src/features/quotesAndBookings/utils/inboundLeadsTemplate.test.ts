import { describe, expect, it } from "vitest";
import {
  matchesInboundLeads,
  type InboundLeadsEvent,
  type InboundLeadsUser,
} from "./inboundLeadsTemplate";

const ME = "user-me";
const OTHER = "user-other";

const lead = (over: Partial<InboundLeadsEvent> = {}): InboundLeadsEvent => ({
  lead_submission: '{"name":"Ada"}',
  event_status: "draft",
  created_by_user_uuid: null,
  zone_uuid: null,
  ...over,
});

const user = (over: Partial<InboundLeadsUser>): InboundLeadsUser => ({
  userId: ME,
  isAdmin: false,
  isAccountManager: false,
  accountManagerZoneIds: [],
  unstaffedZoneIds: [],
  ...over,
});

const admin = user({ isAdmin: true, unstaffedZoneIds: ["zone-6"] });
const am = user({ isAccountManager: true, accountManagerZoneIds: ["zone-1", "zone-3"] });
const both = user({
  isAdmin: true,
  isAccountManager: true,
  accountManagerZoneIds: ["zone-1"],
  unstaffedZoneIds: ["zone-6"],
});

describe("a lead", () => {
  it("is a website quote that is still a draft, for every role", () => {
    for (const u of [admin, am, both, user({})]) {
      expect(matchesInboundLeads(lead({ event_status: "quoted" }), u)).toBe(false);
      expect(matchesInboundLeads(lead({ event_status: "booked" }), u)).toBe(false);
      expect(matchesInboundLeads(lead({ event_status: "lost" }), u)).toBe(false);
      expect(matchesInboundLeads(lead({ event_status: null }), u)).toBe(false);
      expect(matchesInboundLeads(lead({ lead_submission: null }), u)).toBe(false);
      expect(matchesInboundLeads(lead({ lead_submission: "  " }), u)).toBe(false);
    }
  });

  it("reads the status ignoring case", () => {
    expect(matchesInboundLeads(lead({ event_status: "Draft", zone_uuid: null }), admin)).toBe(true);
  });
});

describe("an admin", () => {
  it("sees an unassigned lead in Zone Unknown or in a zone nobody works", () => {
    expect(matchesInboundLeads(lead({ zone_uuid: null }), admin)).toBe(true);
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-6" }), admin)).toBe(true);
  });

  it("does not see a lead in a zone that has an account manager", () => {
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-1" }), admin)).toBe(false);
  });

  it("keeps a lead assigned to themselves on their list", () => {
    expect(
      matchesInboundLeads(lead({ zone_uuid: "zone-6", created_by_user_uuid: ME }), admin),
    ).toBe(true);
    expect(matchesInboundLeads(lead({ zone_uuid: null, created_by_user_uuid: ME }), admin)).toBe(
      true,
    );
  });

  it("loses a lead the moment it is assigned to someone else", () => {
    expect(
      matchesInboundLeads(lead({ zone_uuid: "zone-6", created_by_user_uuid: OTHER }), admin),
    ).toBe(false);
    expect(matchesInboundLeads(lead({ zone_uuid: null, created_by_user_uuid: OTHER }), admin)).toBe(
      false,
    );
  });
});

describe("an account manager", () => {
  it("sees an unassigned lead in their zones", () => {
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-1" }), am)).toBe(true);
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-3" }), am)).toBe(true);
  });

  it("does not see a lead assigned to another account manager, even in their own zone", () => {
    expect(
      matchesInboundLeads(lead({ zone_uuid: "zone-1", created_by_user_uuid: OTHER }), am),
    ).toBe(false);
    expect(
      matchesInboundLeads(lead({ zone_uuid: "zone-3", created_by_user_uuid: OTHER }), am),
    ).toBe(false);
  });

  it("sees a lead assigned to them wherever it is", () => {
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-6", created_by_user_uuid: ME }), am)).toBe(
      true,
    );
    expect(matchesInboundLeads(lead({ zone_uuid: null, created_by_user_uuid: ME }), am)).toBe(true);
  });

  it("does not see other zones, Zone Unknown, or unstaffed zones unless assigned to them", () => {
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-2" }), am)).toBe(false);
    expect(matchesInboundLeads(lead({ zone_uuid: null }), am)).toBe(false);
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-6" }), am)).toBe(false);
    expect(
      matchesInboundLeads(lead({ zone_uuid: "zone-2", created_by_user_uuid: OTHER }), am),
    ).toBe(false);
  });

  it("sees only what is assigned to them when they work no zones", () => {
    const noZones = user({ isAccountManager: true });
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-1" }), noZones)).toBe(false);
    expect(matchesInboundLeads(lead({ created_by_user_uuid: ME }), noZones)).toBe(true);
  });

  it("matches no owner when the user id is not known yet", () => {
    const unknownUser = user({ isAccountManager: true, userId: null });
    expect(matchesInboundLeads(lead({ created_by_user_uuid: null }), unknownUser)).toBe(false);
  });
});

describe("someone who is both admin and account manager", () => {
  it("sees the admin list and the account manager list together", () => {
    expect(matchesInboundLeads(lead({ zone_uuid: null }), both)).toBe(true);
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-6" }), both)).toBe(true);
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-1" }), both)).toBe(true);
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-2", created_by_user_uuid: ME }), both)).toBe(
      true,
    );
  });

  it("does not see another zone's lead, or a lead in any zone given to someone else", () => {
    expect(matchesInboundLeads(lead({ zone_uuid: "zone-2" }), both)).toBe(false);
    expect(
      matchesInboundLeads(lead({ zone_uuid: "zone-1", created_by_user_uuid: OTHER }), both),
    ).toBe(false);
    expect(
      matchesInboundLeads(lead({ zone_uuid: "zone-6", created_by_user_uuid: OTHER }), both),
    ).toBe(false);
  });
});

describe("anyone else", () => {
  it("sees every lead", () => {
    const viewer = user({});
    expect(
      matchesInboundLeads(lead({ zone_uuid: "zone-2", created_by_user_uuid: OTHER }), viewer),
    ).toBe(true);
    expect(matchesInboundLeads(lead({ zone_uuid: null }), viewer)).toBe(true);
  });
});
