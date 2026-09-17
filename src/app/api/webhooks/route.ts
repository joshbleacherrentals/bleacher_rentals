import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { STATUSES } from "@/features/manageTeam/constants";

export async function POST(req: Request) {
  try {
    // console.log("Triggered");
    const CLERK_WEBHOOK_SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

    if (!CLERK_WEBHOOK_SIGNING_SECRET) {
      console.error("Missing Clerk signing secret.");
      return new Response("Server misconfiguration: Missing signing secret", {
        status: 500,
      });
    }

    // Create new Svix instance with secret
    const wh = new Webhook(CLERK_WEBHOOK_SIGNING_SECRET);

    // Get headers
    const headerPayload = await headers();
    const svix_id = headerPayload.get("svix-id");
    const svix_timestamp = headerPayload.get("svix-timestamp");
    const svix_signature = headerPayload.get("svix-signature");

    // If there are no headers, error out
    if (!svix_id || !svix_timestamp || !svix_signature) {
      console.warn("Missing Svix headers");
      return new Response("Missing Svix headers", { status: 400 });
    }

    // Get body
    let body: string;
    try {
      const payload = await req.json();
      body = JSON.stringify(payload);
    } catch (err) {
      console.error("Failed to parse JSON body:", err);
      return new Response("Invalid JSON body", { status: 400 });
    }

    // Verify payload with headers
    let evt: WebhookEvent;
    try {
      evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      }) as WebhookEvent;
    } catch (err) {
      console.error("❌ Webhook verification failed:", err);
      return new Response("Webhook verification failed", { status: 400 });
    }

    // Do something with payload
    // For this guide, log payload to console
    const { id } = evt.data;
    // console.log(`Received webhook with ID ${id} and event type of ${eventType}`);
    // console.log("Webhook payload:", body);

    if (!id) {
      console.warn("⚠️ Event missing user ID");
      return new Response("Event missing user ID", { status: 400 });
    }

    const supabase = await createServiceRoleClient(); // no permission issues.
    if (evt.type === "user.created") {
      const { first_name, last_name, email_addresses, phone_numbers, primary_email_address_id } =
        evt.data;
      // Users are created in clerk when they accept the invitation so they should already exist in the db. This set's the user as Active status instead of prending for this reason

      // Find the primary email address or fallback to non-private-relay email
      const primaryEmail = email_addresses?.find((email) => email.id === primary_email_address_id);
      const emailToUse = primaryEmail?.email_address || email_addresses?.[0]?.email_address || null;

      const result = await supabase.from("Users").upsert(
        {
          clerk_user_id: id,
          first_name: first_name || null,
          last_name: last_name || null,
          email: emailToUse,
          // email: email_addresses?.[0]?.email_address || null,
          phone: phone_numbers?.[0]?.phone_number || null,
          status_uuid: STATUSES.active,
          // role: 1,
        },
        { onConflict: "email" },
      );

      if (result.error) {
        console.error("❌ Supabase upsert error:", result.error);
        return new Response(`Supabase upsert error: ${result.error.message}`, { status: 500 });
      }

      // console.log("✅ User created in Supabase");
    } else if (evt.type === "user.updated") {
      const { first_name, last_name, email_addresses, phone_numbers, primary_email_address_id } =
        evt.data;

      // Find the primary email address or fallback to non-private-relay email
      const primaryEmail = email_addresses?.find((email) => email.id === primary_email_address_id);
      const emailToUse = primaryEmail?.email_address || email_addresses?.[0]?.email_address || null;

      const result = await supabase
        .from("Users")
        .update({
          first_name: first_name || null,
          last_name: last_name || null,
          email: emailToUse,
          phone: phone_numbers?.[0]?.phone_number || null,
        })
        .eq("clerk_user_id", id);

      if (result.error) {
        console.error("❌ Supabase update error:", result.error);
        return new Response(`Supabase update error: ${result.error.message}`, { status: 500 });
      }

      // console.log("✅ User updated in Supabase");
    } else if (evt.type === "user.deleted") {
      const result = await supabase
        .from("Users")
        .update({
          status_uuid: STATUSES.inactive,
        })
        .eq("clerk_user_id", id);

      if (result.error) {
        console.error("❌ Supabase delete error:", result.error);
        return new Response(`Supabase delete error: ${result.error.message}`, { status: 500 });
      }

      // console.log("✅ User deleted from Supabase");
    }
    // updateDataBase(["Users"]);
    return new Response("Webhook received", { status: 200 });
  } catch (err: any) {
    console.error("❌ Unexpected server error:", err);
    return new Response(`Unexpected error: ${err?.message || "unknown"}`, { status: 500 });
  }
}
