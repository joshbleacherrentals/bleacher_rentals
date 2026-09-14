"use client";

import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
  type Suggestion,
} from "use-places-autocomplete";
import { parseGoogleAddressComponents } from "./parseGoogleAddressComponents";

interface AddressData {
  address: string;
  city?: string;
  state?: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  country?: string;
  /**
   * The business/POI name Google attached to this result (its
   * `structured_formatting.main_text` when `types` marks it as an
   * establishment or point of interest), e.g. "Jester King Brewery" for a
   * brewery address. Undefined for a plain street address — most results.
   * Callers that want to prefill a name field (a Venue's name, say) from
   * this should still let the user freely overwrite it; it's a suggestion,
   * not the address itself.
   */
  businessName?: string;
}

interface AddressAutocompleteProps {
  onAddressSelect: (data: AddressData) => void;
  initialValue?: string;
  /**
   * Like `initialValue`, but also actively fetches suggestions right away
   * instead of just sitting there as static text — for seeding the field
   * with free text the user already typed somewhere else (a search box,
   * say) so a dropdown of real addresses shows immediately. Set once when
   * the field first appears; typing after that behaves normally either
   * way. Pass at most one of `initialValue` / `initialSearchQuery`.
   */
  initialSearchQuery?: string;
  className?: string;
}

export default function AddressAutocomplete({
  onAddressSelect,
  initialValue,
  initialSearchQuery,
  className = "",
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0, width: 0 });
  const addressData = useCurrentEventStore().addressData;
  const {
    ready,
    value,
    setValue,
    suggestions: { status, data },
    clearSuggestions,
  } = usePlacesAutocomplete({
    defaultValue: initialValue,
    debounce: 300,
  });

  useEffect(() => {
    if (initialValue) {
      setValue(initialValue, false);
    } else {
      setValue(addressData?.address ?? "", false);
    }
  }, [initialValue, addressData]);

  // Separate from the effect above: this one fetches (shouldFetchData=true)
  // so suggestions actually populate right away, rather than just filling
  // the box with text and waiting for the next keystroke.
  useEffect(() => {
    if (initialSearchQuery) {
      setValue(initialSearchQuery, true);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    if (status === "OK" && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setSuggestionPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [status]);

  const handleSelect = async (suggestion: Suggestion) => {
    const { place_id: placeId, description } = suggestion;
    setValue(description, false);
    clearSuggestions();

    try {
      // Geocode the specific place the user picked, not the raw suggestion
      // text — forward-geocoding a compound string like "Business Name,
      // Street, City, Province, Country" leaves Google guessing at which
      // part is which, and it guesses wrong often enough (a rural/business
      // result's county ending up in `city` instead of its actual town).
      const results = await getGeocode({ placeId });
      const { lat, lng } = await getLatLng(results[0]);
      const { address, city, state, postalCode, country } = parseGoogleAddressComponents(
        results[0].address_components,
        description,
      );

      // Replace the raw suggestion text (which can lead with a business/POI
      // name, e.g. "Jester King Brewery, Fitzhugh Road, Austin, TX, USA")
      // with the plain parsed address — this is an address field, not a
      // place-name field.
      setValue([address, city, state, postalCode].filter(Boolean).join(", "), false);

      const isPlace = suggestion.types?.some(
        (t: string) => t === "establishment" || t === "point_of_interest",
      );
      const businessName = isPlace ? suggestion.structured_formatting?.main_text : undefined;

      onAddressSelect({
        address,
        city,
        state,
        postalCode,
        lat,
        lng,
        placeId,
        country,
        businessName,
      });
    } catch (error) {
      console.error("Error fetching address details:", error);
    }
  };

  return (
    <>
      <div ref={containerRef} className="relative w-full">
        <input
          ref={inputRef}
          className={`w-full p-2 border rounded ${className}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!ready}
          placeholder="Enter address..."
        />
      </div>

      {typeof window !== "undefined" &&
        createPortal(
          status === "OK" ? (
            <ul
              className="absolute bg-white border shadow-lg rounded z-[9999]"
              style={{
                top: suggestionPos.top,
                left: suggestionPos.left,
                width: suggestionPos.width,
                position: "absolute",
                pointerEvents: "auto",
              }}
            >
              {data.map((suggestion) => (
                <li
                  key={suggestion.place_id}
                  className="p-2 cursor-pointer hover:bg-gray-200 text-sm"
                  onClick={() => handleSelect(suggestion)}
                >
                  {suggestion.description}
                </li>
              ))}
            </ul>
          ) : null,
          document.body,
        )}
    </>
  );
}
