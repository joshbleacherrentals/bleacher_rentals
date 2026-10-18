import { test } from "@playwright/test";
import { runSignatureBannerScenario } from "./helpers/signatureBannerScenario";

/**
 * S3 as an account manager (docs/specs/quote-detail-02-contract-signature.md).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine).
 */
test("S3: the Signed banner follows the signature, as an account manager", async ({ page }) => {
  await runSignatureBannerScenario(page);
});
