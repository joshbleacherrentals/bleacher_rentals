import { getBaseUrl, getQboAccessTokenAndRealmId } from "@/features/quickbooks-integration/util";
import { requireAuth } from "@/features/userAccess/logic/requireAuth";
import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient } from "@/utils/supabase/getClerkSupabaseServerClient";
import { DateTime } from "luxon";
import { generateDriverPdfBuffer } from "@/features/workTrackers/generatePdf";
import { interpretQboBillError } from "@/features/quickbooks-integration/interpretQboBillError";

// Kept for when this project is on a plan where it isn't silently capped
// (see the `after()` use below for what actually fixes this on Hobby): on
// Hobby every function is hard-capped at 10s regardless of what's set here,
// no override possible; on Pro/Enterprise this raises the real limit for
// this route only.
export const maxDuration = 60;

async function uploadPdfToQbo(
  accessToken: string,
  realmId: string,
  baseUrl: string,
  billId: string,
  fileName: string,
  pdfBuffer: Buffer,
): Promise<void> {
  const metadata = JSON.stringify({
    AttachableRef: [{ EntityRef: { type: "Bill", value: billId } }],
    ContentType: "application/pdf",
    FileName: fileName,
  });

  const formData = new FormData();
  formData.append(
    "file_metadata_01",
    new Blob([metadata], { type: "application/json" }),
    "attachment.json",
  );
  formData.append(
    "file_content_01",
    new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }),
    fileName,
  );

  const res = await fetch(`${baseUrl}/${realmId}/upload?minorversion=40`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("Failed to upload PDF attachment to QBO:", err);
  }
}

export async function POST(req: NextRequest) {
  let workTrackerGroupId: string | undefined;

  try {
    await requireAuth();
    const body = await req.json();
    workTrackerGroupId = body.workTrackerGroupId;
    const { driverUuid, startDate, billId, syncToken } = body;

    if (!driverUuid || !startDate) {
      return NextResponse.json(
        { error: "Missing required fields: driverUuid, startDate" },
        { status: 400 },
      );
    }

    // Get Supabase client
    const supabase = createServerSupabaseClient();

    // Calculate end date (7 days after start)
    const endDate = DateTime.fromISO(startDate).plus({ days: 7 }).toISODate();

    // Fetch driver with vendor info (including qbo_connection_uuid)
    const { data: driver, error: driverError } = await supabase
      .from("Drivers")
      .select(
        `
        id,
        vendor_uuid,
        user_uuid,
        vendor:Vendors(id, qbo_vendor_id, qbo_connection_uuid, display_name),
        user:Users(first_name, last_name)
      `,
      )
      .eq("id", driverUuid)
      .single();

    if (driverError || !driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    // Check if vendor is assigned
    if (!driver.vendor_uuid || !driver.vendor) {
      return NextResponse.json(
        { error: "Driver must have a vendor assigned to create a bill" },
        { status: 400 },
      );
    }

    // Check if vendor has QBO ID and connection
    const vendor = Array.isArray(driver.vendor) ? driver.vendor[0] : driver.vendor;
    if (!vendor.qbo_vendor_id) {
      return NextResponse.json(
        { error: `Vendor "${vendor.display_name}" is not linked to QuickBooks` },
        { status: 400 },
      );
    }
    if (!vendor.qbo_connection_uuid) {
      return NextResponse.json(
        { error: `Vendor "${vendor.display_name}" has no QuickBooks connection assigned` },
        { status: 400 },
      );
    }

    const connectionId = vendor.qbo_connection_uuid;

    // Fetch connection's default tax code
    const { data: connectionRow } = await supabase
      .from("QboConnections")
      .select("qbo_tax_code_id")
      .eq("id", connectionId)
      .single();
    const defaultTaxCodeId = connectionRow?.qbo_tax_code_id ?? "NON";

    // Fetch work trackers for this driver and week with address info
    const { data: workTrackers, error: wtError } = await supabase
      .from("WorkTrackers")
      .select(
        `
        id,
        pay_cents,
        date,
        pickup_address_uuid,
        dropoff_address_uuid,
        work_tracker_type_uuid,
        pickup_address:Addresses!worktrackers_pickup_address_uuid_fkey(street, city),
        dropoff_address:Addresses!worktrackers_dropoff_address_uuid_fkey(street, city, state_province),
        work_tracker_type:WorkTrackerTypes(display_name)
      `,
      )
      .eq("driver_uuid", driverUuid)
      .gte("date", startDate)
      .lt("date", endDate);

    if (wtError) {
      return NextResponse.json(
        { error: `Failed to fetch work trackers: ${wtError.message}` },
        { status: 500 },
      );
    }

    if (!workTrackers || workTrackers.length === 0) {
      return NextResponse.json(
        { error: "No work trackers found for this driver in the specified week" },
        { status: 404 },
      );
    }

    // Calculate total amount in dollars
    const totalCents = workTrackers.reduce((sum: number, wt: any) => sum + (wt.pay_cents || 0), 0);
    const totalAmount = totalCents / 100;

    // Format bill date (Sunday of the week - end date minus 1 day)
    const billDate = DateTime.fromISO(endDate!).minus({ days: 1 }).toISODate();

    // Format bill number (MM/DD-MM/DD)
    const startDateObj = DateTime.fromISO(startDate);
    const endDateObj = DateTime.fromISO(endDate!).minus({ days: 1 });
    const billNumber = `${startDateObj.toFormat("MM/dd")}-${endDateObj.toFormat("MM/dd")}`;

    // Fetch zone QBO class mappings for this connection
    const { data: zoneClasses, error: zcError } = await supabase
      .from("ZoneQboClasses")
      .select("qbo_class_id, zone:Zones(id, state_provinces:ZoneStateProvinces(state_province))")
      .eq("qbo_connection_uuid", connectionId);

    if (zcError) {
      return NextResponse.json(
        { error: `Failed to fetch zone classes: ${zcError.message}` },
        { status: 500 },
      );
    }

    // Build mapping: state_province → qbo_class_id for this connection
    const stateToClassId: Record<string, string> = {};
    for (const zc of zoneClasses || []) {
      const zone = Array.isArray(zc.zone) ? zc.zone[0] : zc.zone;
      if (!zone) continue;
      const stateProvinces = (zone as any).state_provinces as { state_province: string }[];
      for (const sp of stateProvinces) {
        stateToClassId[sp.state_province] = zc.qbo_class_id;
      }
    }

    // Fetch work tracker type QBO account mappings for this connection
    const { data: typeAccounts, error: taError } = await supabase
      .from("WorkTrackerTypeQboAccounts")
      .select("work_tracker_type_uuid, qbo_account_id")
      .eq("qbo_connection_uuid", connectionId);

    if (taError) {
      return NextResponse.json(
        { error: `Failed to fetch type accounts: ${taError.message}` },
        { status: 500 },
      );
    }

    // Build mapping: work_tracker_type_uuid → qbo_account_id
    const typeToAccountId: Record<string, string> = {};
    for (const ta of typeAccounts || []) {
      typeToAccountId[ta.work_tracker_type_uuid] = ta.qbo_account_id;
    }

    // Validate that every work tracker has a type with a QB account for this connection
    const missingCategories: string[] = [];
    for (const wt of workTrackers) {
      const typeUuid = (wt as any).work_tracker_type_uuid;
      if (!typeUuid || !typeToAccountId[typeUuid]) {
        const typeData = Array.isArray(wt.work_tracker_type)
          ? wt.work_tracker_type[0]
          : wt.work_tracker_type;
        const typeName = typeData?.display_name ?? "Unknown type";
        if (!missingCategories.includes(typeName)) missingCategories.push(typeName);
      }
    }

    if (missingCategories.length > 0) {
      const typeList = missingCategories.join(", ");
      return NextResponse.json(
        {
          error: `Cannot create bill: the following work tracker ${missingCategories.length === 1 ? "type has" : "types have"} no QuickBooks account assigned for this connection: ${typeList}. Please edit work tracker types and assign a QuickBooks account.`,
        },
        { status: 400 },
      );
    }

    const lineItems = workTrackers.map((wt: any) => {
      const pickupAddr = Array.isArray(wt.pickup_address)
        ? wt.pickup_address[0]
        : wt.pickup_address;
      const dropoffAddr = Array.isArray(wt.dropoff_address)
        ? wt.dropoff_address[0]
        : wt.dropoff_address;

      const pickupLocation = pickupAddr
        ? `${pickupAddr.street || "Unknown"}${pickupAddr.city ? `, ${pickupAddr.city}` : ""}`
        : "Unknown";
      const dropoffLocation = dropoffAddr
        ? `${dropoffAddr.street || "Unknown"}${dropoffAddr.city ? `, ${dropoffAddr.city}` : ""}`
        : "Unknown";

      const description = `From ${pickupLocation} to ${dropoffLocation}`;
      const amount = (wt.pay_cents || 0) / 100;

      // Look up QuickBooks class from the dropoff state/province's zone
      const dropoffState = dropoffAddr?.state_province;
      const classId = dropoffState ? stateToClassId[dropoffState] : undefined;

      // Look up QB account from the junction table mapping
      const typeUuid = wt.work_tracker_type_uuid;
      const accountId = typeUuid ? typeToAccountId[typeUuid] : undefined;

      return {
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: amount,
        Description: description,
        AccountBasedExpenseLineDetail: {
          AccountRef: {
            value: accountId!,
          },
          TaxCodeRef: { value: defaultTaxCodeId },
          ...(classId ? { ClassRef: { value: classId } } : {}),
        },
      };
    });

    // Get QuickBooks credentials for the vendor's connection
    const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);
    const baseUrl = getBaseUrl();

    // Create or update the bill in QuickBooks
    const isUpdate = !!(billId && syncToken);
    const billPayload = {
      ...(isUpdate ? { Id: billId, SyncToken: syncToken } : {}),
      VendorRef: {
        value: vendor.qbo_vendor_id,
      },
      Line: lineItems,
      TxnDate: billDate,
      DocNumber: billNumber,
      GlobalTaxCalculation: "TaxExcluded",
    };

    console.log(
      `${isUpdate ? "Updating" : "Creating"} bill with payload:`,
      JSON.stringify(billPayload, null, 2),
    );

    const response = await fetch(`${baseUrl}/${realmId}/bill?minorversion=40`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(billPayload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      console.error("QuickBooks API error:", JSON.stringify(errorData, null, 2));

      // Update WorkTrackerGroup status to error
      if (workTrackerGroupId) {
        const { error: updateError } = await supabase
          .from("WorkTrackerGroups")
          .update({ status: "qbo_bill_error" })
          .eq("id", workTrackerGroupId);

        if (updateError) {
          console.error("Failed to update error status:", updateError);
        }
      }

      return NextResponse.json(
        {
          error: interpretQboBillError(errorData),
          details: errorData,
        },
        { status: response.status },
      );
    }

    const billData = await response.json();
    console.log("Bill created successfully:", billData);

    const savedBillId = billData.Bill?.Id;

    // Update WorkTrackerGroup with bill ID and status — before responding,
    // and before the PDF step below. The client re-queries WorkTrackerGroups
    // after this request settles rather than reading status off this JSON
    // body, so this has to have landed by the time the response goes out.
    if (workTrackerGroupId) {
      const { error: updateError } = await supabase
        .from("WorkTrackerGroups")
        .update({
          qbo_bill_id: savedBillId,
          status: "qbo_bill_created",
        })
        .eq("id", workTrackerGroupId);

      if (updateError) {
        console.error("Failed to update WorkTrackerGroup:", updateError);
        // Don't fail the request if this update fails
      }
    }

    // Attach the PDF *after* responding, not before. It's the slowest part
    // of this route (a react-pdf render plus a second QBO upload call) and
    // isn't required for the bill to exist in QuickBooks or for the DB
    // update above. Doing it before the response meant a slow PDF step
    // could push the whole request past Hobby's 10s cap — and since the
    // Bill POST above had *already* succeeded by then, the client saw a
    // timeout with no billId to retry against, risking an actual duplicate
    // bill in QuickBooks on retry, not just a confusing error message.
    const pdfUserUuid = driver.user_uuid;
    if (savedBillId && pdfUserUuid) {
      after(async () => {
        try {
          const pdfBuffer = await generateDriverPdfBuffer(supabase, pdfUserUuid, startDate);
          const fileName = `work-trackers-${billNumber.replace(/\//g, "-")}.pdf`;
          await uploadPdfToQbo(accessToken, realmId, baseUrl, savedBillId, fileName, pdfBuffer);
        } catch (pdfErr) {
          console.error("Failed to generate or attach PDF to QBO bill:", pdfErr);
        }
      });
    }

    // Return success with bill details
    return NextResponse.json({
      success: true,
      billId: savedBillId,
      billNumber,
      totalAmount,
      message: `Bill created successfully for ${totalAmount.toFixed(2)}`,
    });
  } catch (error: any) {
    console.error("Create bill error:", error);

    // Update WorkTrackerGroup status to error if we have the ID
    if (workTrackerGroupId) {
      try {
        const errorSupabase = createServerSupabaseClient();
        const { error: updateError } = await errorSupabase
          .from("WorkTrackerGroups")
          .update({ status: "qbo_bill_error" })
          .eq("id", workTrackerGroupId);

        if (updateError) {
          console.error("Failed to update error status:", updateError);
        }
      } catch (err) {
        console.error("Failed to update error status:", err);
      }
    }

    if (error instanceof Response) return error;
    return NextResponse.json({ error: error.message || "Failed to create bill" }, { status: 500 });
  }
}
