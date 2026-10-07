/** Finance hears about a quote the moment it becomes booked, not on every later save. */
export function shouldNotifyFinanceBooked(
  oldStatus: string | null | undefined,
  newStatus: string | null | undefined,
): boolean {
  return newStatus === "booked" && oldStatus !== "booked";
}

/**
 * Fire-and-forget: the save has already succeeded, so a failed email must never fail it.
 * The server route waits for the local write to sync before it sends.
 */
export function postFinanceBookedNotice(eventId: string): void {
  void fetch(`/api/quotes/${eventId}/booked-notice`, { method: "POST" }).catch((e) => {
    console.error("Could not notify finance of the booking:", e);
  });
}
