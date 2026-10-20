import { INBOUND_LEADS_TEMPLATE } from "./inboundLeadsTemplate";

/** The window event the quotes list listens for, to show the template when the list is open. */
export const SHOW_INBOUND_LEADS_EVENT = "quotes-list:show-inbound-leads";

/**
 * A link that opens the quotes list on the My Inbound Leads template. The template is a live rule,
 * so the link carries only its name; the list opens it oldest first.
 */
export function inboundLeadsHref(): string {
  return `/quotes-bookings?template=${INBOUND_LEADS_TEMPLATE}`;
}
