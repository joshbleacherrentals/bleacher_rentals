/**
 * The Google Maps JavaScript API, loaded once for every signed-in page by SignedInShell's script tag
 * (`loading=async`). Resolves the libraries the caller asks for once the script is ready. There are
 * no Google Maps types in this project, so what comes back is loosely typed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type GoogleMaps = any;

const READY_TIMEOUT_MS = 15_000;

export async function loadGoogleMaps(libraries: string[] = ["maps"]): Promise<GoogleMaps> {
  const started = Date.now();
  while (!(window as any).google?.maps?.importLibrary) {
    if (Date.now() - started > READY_TIMEOUT_MS) {
      throw new Error("Google Maps did not load. Check the API key and the network.");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const maps = (window as any).google.maps;
  await Promise.all(libraries.map((name) => maps.importLibrary(name)));
  return maps;
}
