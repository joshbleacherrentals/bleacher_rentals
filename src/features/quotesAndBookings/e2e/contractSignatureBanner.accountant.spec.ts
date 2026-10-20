import { test } from "@playwright/test";
import { runSignatureBannerScenario } from "./helpers/signatureBannerScenario";

/**
 * S3 as an accountant (docs/specs/quote-detail-02-contract-signature.md). The accountant's stream
 * gets `ContractSignatures` only once the sync rules of that spec are deployed, so this spec
 * fails against a service that still runs the old file.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine).
 */
test("S3: the Signed banner follows the signature, as an accountant", async ({ page }) => {
  await runSignatureBannerScenario(page);
});
