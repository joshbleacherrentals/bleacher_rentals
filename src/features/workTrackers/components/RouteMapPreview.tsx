type RouteMapPreviewProps = {
  origin: string;
  destination: string;
  pickUpAddress: unknown;
  dropOffAddress: unknown;
  isLoading: boolean;
  error: unknown;
  distanceData: {
    distanceText: string | null;
    durationText: string | null;
    durationInTrafficText?: string | null;
  } | null;
};

export default function RouteMapPreview({
  origin,
  destination,
  pickUpAddress,
  dropOffAddress,
  isLoading,
  error,
  distanceData,
}: RouteMapPreviewProps) {
  if (!pickUpAddress || !dropOffAddress) {
    return (
      <div className="text-sm text-gray-500 italic">
        Once you enter a to/from address, I'll get the Google Maps Data for you
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-sm text-gray-600">Calculating route…</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">Couldn't get a route.</div>;
  }

  if (!distanceData) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center text-sm text-gray-700">
        <span>Distance: {distanceData.distanceText}</span>
        <span>•</span>
        <span>ETA: {distanceData.durationInTrafficText ?? distanceData.durationText}</span>
      </div>
      {/* Embedded Map */}
      <div className="w-full h-[300px] rounded-lg overflow-hidden border border-gray-300">
        <iframe
          width="100%"
          height="100%"
          frameBorder="0"
          style={{ border: 0 }}
          referrerPolicy="no-referrer-when-downgrade"
          src={`https://www.google.com/maps/embed/v1/directions?key=${
            process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          }&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
            destination,
          )}&mode=driving&avoid=tolls`}
          allowFullScreen
        />
      </div>
    </div>
  );
}
