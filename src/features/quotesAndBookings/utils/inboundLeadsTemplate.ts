import { isInbound } from "./filterEvents";

/**
 * The "My Inbound Leads" template: the website quotes waiting to be handled by this person. It is a
 * live rule, not a set of filter values, because it depends on who is looking (their role, their
 * zones, the zones nobody works) and must follow assignments as they happen.
 *
 * A lead is a quote with a website form submission whose status is still `draft` (not sent yet) and
 * that nobody has marked Responded (`hide_lead_alert`). It leaves everyone's list the moment it
 * stops being any of these.
 *
 * - An admin sees a lead in Zone Unknown or in a zone nobody works, as long as it is unassigned or
 *   assigned to themselves. Once it is assigned to someone else it leaves their list.
 * - An account manager sees a lead assigned to them, or an unassigned one in a zone they are
 *   assigned to. A lead assigned to another account manager is theirs alone, even in a zone you share.
 * - Someone who is both sees both.
 * - Anyone else (read-only roles) sees every lead.
 */

/** The value of `?template=` that turns the rule on. */
export const INBOUND_LEADS_TEMPLATE = "my_inbound_leads";

/** Who is looking, as far as the rule cares. */
export type InboundLeadsUser = {
  /** `Users.id`; an event's owner (`created_by_user_uuid`) is one. */
  userId: string | null;
  isAdmin: boolean;
  isAccountManager: boolean;
  /** The zones this person is assigned to as an account manager. */
  accountManagerZoneIds: string[];
  /** Zones no active account manager works (see `unstaffedZoneIds`). */
  unstaffedZoneIds: string[];
};

/** The fields of a list row the rule reads. `zone_uuid` is null for an event in no known zone. */
export type InboundLeadsEvent = {
  lead_submission?: string | null;
  /** 1 once someone has answered the request (Events.hide_lead_alert). */
  hide_lead_alert?: number | null;
  event_status: string | null;
  created_by_user_uuid: string | null;
  zone_uuid?: string | null;
};

export function matchesInboundLeads(event: InboundLeadsEvent, user: InboundLeadsUser): boolean {
  if (!isInbound(event) || (event.event_status ?? "").toLowerCase() !== "draft") return false;
  if (event.hide_lead_alert === 1) return false;
  if (!user.isAdmin && !user.isAccountManager) return true;

  const owner = event.created_by_user_uuid;
  const zone = event.zone_uuid ?? null;
  const mine = user.userId !== null && owner === user.userId;

  const asAdmin =
    user.isAdmin &&
    (zone === null || user.unstaffedZoneIds.includes(zone)) &&
    (owner === null || mine);

  const asAccountManager =
    user.isAccountManager &&
    (mine || (owner === null && zone !== null && user.accountManagerZoneIds.includes(zone)));

  return asAdmin || asAccountManager;
}
