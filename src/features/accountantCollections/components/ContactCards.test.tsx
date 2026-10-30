import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ContactCard } from "../utils/invoiceView";
import { ContactCards } from "./ContactCards";

const WITH_COMPANY: ContactCard = {
  name: "Dana Whitfield",
  phone: "(416) 555-0142",
  email: "dana@riverside.example",
  company: {
    name: "Riverside Foundation",
    phone: "(416) 555-0100",
    email: "office@riverside.example",
  },
};
const FINANCE: ContactCard = {
  name: "Priya Raman",
  phone: "(416) 555-0177",
  email: "priya@ramanco.example",
  company: { name: "Raman & Co.", phone: "(416) 555-0190", email: "accounts@ramanco.example" },
};
const NO_COMPANY: ContactCard = { ...WITH_COMPANY, company: null };
const FINANCE_NO_COMPANY: ContactCard = { ...FINANCE, company: null };

const render = (contact: ContactCard | null, financeContact: ContactCard | null) =>
  renderToStaticMarkup(<ContactCards contact={contact} financeContact={financeContact} />);

describe("ContactCards", () => {
  it("draws both contacts with their companies' lines", () => {
    const html = render(WITH_COMPANY, FINANCE);
    for (const text of [
      ">Contact<",
      ">Finance Contact<",
      "Dana Whitfield",
      "(416) 555-0142",
      "dana@riverside.example",
      "Riverside Foundation",
      "(416) 555-0100",
      "office@riverside.example",
      "Priya Raman",
      "Raman &amp; Co.",
      "accounts@ramanco.example",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Phone number");
    expect(html).toContain("Email address");
    expect(html).toContain("Company name");
    expect(html).toContain("Company number");
    expect(html).toContain("Company email");
    expect(html).toContain('aria-label="Contact and finance contact"');
  });

  it("without a finance contact draws the Contact card and a Company card beside it", () => {
    const html = render(WITH_COMPANY, null);
    expect(html).toContain('aria-label="Contact"');
    expect(html).toContain(">Company<");
    expect(html).toContain("Riverside Foundation");
    expect(html).not.toContain("Finance Contact");
  });

  it("without any company info draws the two contacts and no company lines", () => {
    const html = render(NO_COMPANY, FINANCE_NO_COMPANY);
    expect(html).toContain("Dana Whitfield");
    expect(html).toContain("Priya Raman");
    expect(html).not.toContain("Company name");
    expect(html).not.toContain(">Company<");
  });

  it("draws only the Contact card for a lone contact with no company", () => {
    const html = render(NO_COMPANY, null);
    expect(html).toContain("Dana Whitfield");
    expect(html).not.toContain(">Company<");
    expect(html).not.toContain("Finance Contact");
  });

  it("shows a dash for a missing phone or email", () => {
    const html = render({ ...NO_COMPANY, phone: null, email: null }, null);
    expect(html.match(/>—</g)).toHaveLength(2);
  });

  it("draws nothing when the invoice has no contact", () => {
    expect(render(null, null)).toBe("");
  });
});
