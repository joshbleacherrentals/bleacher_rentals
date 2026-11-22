// app/api/distance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/features/userAccess/logic/requireAuth";
import { buildRoutesWaypoint } from "./waypoint";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing API key" }, { status: 500 });

  const origin = req.nextUrl.searchParams.get("origin"); // "lat,lng" or an address string
  const dest = req.nextUrl.searchParams.get("dest"); // "lat,lng" or an address string
  if (!origin || !dest) {
    return NextResponse.json({ error: "origin and dest required" }, { status: 400 });
  }

  // Use the new Routes API (compute routes)
  const url = `https://routes.googleapis.com/directions/v2:computeRoutes`;

  // Build the request body. origin/dest are either a "lat,lng" string (when
  // the address has real coordinates) or address text (the fallback when it
  // doesn't) — the Routes API needs a different Waypoint shape for each; see
  // buildRoutesWaypoint.
  const requestBody = {
    origin: buildRoutesWaypoint(origin),
    destination: buildRoutesWaypoint(dest),
    travelMode: "DRIVE",
    // No live traffic: the same trip gets the same distance and time whenever it is asked (and it is
    // the cheapest tier). Departure time does not matter in this mode.
    routingPreference: "TRAFFIC_UNAWARE",
    computeAlternativeRoutes: false,
    routeModifiers: {
      // Drivers avoid toll roads, so the route and its pay are worked out the same way.
      avoidTolls: true,
      avoidHighways: false,
      avoidFerries: false,
    },
    languageCode: "en-US",
    units: "IMPERIAL",
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify(requestBody),
  });

  const json = await r.json();

  console.log("Google Routes API Response:", JSON.stringify(json, null, 2));

  if (!r.ok || !json.routes || json.routes.length === 0) {
    console.error("Routes API Error:", {
      status: r.status,
      origin,
      dest,
      fullResponse: json,
    });
    return NextResponse.json(
      {
        error: json.error?.message || "No route",
        details: json.error?.details,
        raw: json,
      },
      { status: 400 },
    );
  }

  const route = json.routes[0];

  // Convert duration from seconds string (e.g., "1234s") to number
  const durationSeconds = route.duration ? parseInt(route.duration.replace("s", "")) : null;
  const distanceMeters = route.distanceMeters ?? null;

  // Calculate miles and kilometers
  const miles = distanceMeters ? distanceMeters * 0.000621371 : null;
  const kilometers = distanceMeters ? distanceMeters / 1000 : null;

  // Format for display
  const durationText = durationSeconds ? formatDuration(durationSeconds) : null;
  const distanceText = distanceMeters
    ? `${miles?.toFixed(1)} mi (${kilometers?.toFixed(1)} km)`
    : null;

  // Normalize a compact payload
  const payload = {
    distanceMeters,
    distanceText,
    miles: miles ? parseFloat(miles.toFixed(1)) : null,
    kilometers: kilometers ? parseFloat(kilometers.toFixed(1)) : null,
    durationSeconds,
    durationText,
    // Kept for callers that read it; with TRAFFIC_UNAWARE this is the same drive time, no traffic.
    durationInTrafficSeconds: durationSeconds,
    durationInTrafficText: durationText,
  };

  return NextResponse.json(payload);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
  }
  return `${mins} min`;
}
