"use client";

import type { QuoteDetail } from "../../db/fetchQuoteDetail";
import { ProjectInfoBlock } from "./blocks/projectInfo/ProjectInfoBlock";

/** The Contract tab of page version 2: built from blocks that each edit and save on their own. */
export function ContractTabV2({ quote, canEdit }: { quote: QuoteDetail; canEdit: boolean }) {
  return (
    <div className="space-y-6">
      <ProjectInfoBlock quote={quote} canEdit={canEdit} />
    </div>
  );
}
