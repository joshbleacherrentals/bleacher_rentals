import {
  fetchDriverName,
  fetchDriverHeaderInfo,
  fetchWorkTrackersForUserUuidAndStartDate,
} from "@/features/workTrackers/db/db";
import { headers } from "next/headers";
import React from "react";
import { renderToStream } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import {
  calculateFinancialTotals,
  calculateTravelTotals,
  getDateRange,
} from "@/features/workTrackers/util";
import { MyDocument } from "@/features/workTrackers/components/PdfComponent";
import { createServerSupabaseClient } from "@/utils/supabase/getClerkSupabaseServerClient";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ userUuid: string; startDate: string }>;
  },
) {
  const { userUuid, startDate } = await context.params;
  // const numericUserId = Number(userId);

  const headerStore = headers();
  // const authHeader = (await headerStore).get("authorization");

  const supabase = createServerSupabaseClient();
  const data = await fetchWorkTrackersForUserUuidAndStartDate(supabase, userUuid, startDate, true);
  const financialTotals = calculateFinancialTotals(data);
  const travelTotals = calculateTravelTotals(data);
  console.log("financialTotals", financialTotals);
  const dateRange = getDateRange(startDate);
  const [driverName, driverHeaderInfo] = await Promise.all([
    fetchDriverName(userUuid, supabase),
    fetchDriverHeaderInfo(supabase, userUuid),
  ]);

  const stream = await renderToStream(
    <MyDocument
      workTrackers={data.workTrackers}
      header={{ dateRange, driverName }}
      financialTotals={financialTotals}
      travelTotals={travelTotals}
      driverHeaderInfo={driverHeaderInfo}
    />,
  );

  return new NextResponse(stream as unknown as ReadableStream);
}
