-- Events.hide_lead_alert: when true, the "inbound lead waiting" notification is hidden for this event.
ALTER TABLE public."Events"
  ADD COLUMN IF NOT EXISTS hide_lead_alert boolean NOT NULL DEFAULT false;
