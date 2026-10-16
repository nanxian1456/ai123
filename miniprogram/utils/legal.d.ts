export interface LegalSection {
  heading: string;
  paragraphs: string[];
}
export interface LegalDoc {
  title: string;
  updated: string;
  sections: LegalSection[];
}
export const DOCS: { privacy: LegalDoc; terms: LegalDoc };
