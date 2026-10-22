/** One headline change inside a release. Plain text only: the page, not the author, does the styling. */
export type ChangeSection = {
  icon: string;
  title: string;
  /** Where in the app, e.g. "Quote page → Status button". Shown as a small label above the text. */
  where?: string;
  body: string;
  bullets?: string[];
  /** A heads-up the reader must not miss; drawn as a callout. */
  warning?: string;
};

export type Release = {
  /** Must equal package.json's version for the newest release (CI checks this). */
  version: string;
  /** YYYY-MM-DD */
  date: string;
  /** One line that says what the release is about; shown on cards and in the sidebar. */
  headline: string;
  sections: ChangeSection[];
  video?: string;
};

export type MonthEntry = {
  year: number;
  /** 1-12 */
  month: number;
  /** "This is kind of what happened this month." */
  summary: string;
  /** Newest first. */
  releases: Release[];
};

export type YearEntry = {
  year: number;
  /** "These were the big things this year." */
  summary: string;
};
