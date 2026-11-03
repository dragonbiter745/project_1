// The legal pages are static HTML on the landing site (apps/landing/public). Apps link to them from here,
// and the consent record stores POLICY_VERSION, so bump it whenever the Privacy Policy or Terms change.

export const LEGAL_SITE = 'https://getqrave.in';

/** The version (date) of the Privacy Policy and Terms a diner agrees to at sign-in. */
export const POLICY_VERSION = '2026-11-01';

export type LegalPage = 'privacy' | 'terms' | 'refunds' | 'cookies' | 'grievance';

export const LEGAL_LABELS: Record<LegalPage, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms',
  refunds: 'Cancellations and refunds',
  cookies: 'Cookie Policy',
  grievance: 'Grievance Officer and contact',
};

export const LEGAL_PAGES = Object.keys(LEGAL_LABELS) as LegalPage[];

export const legalUrl = (page: LegalPage, site: string = LEGAL_SITE): string => `${site.replace(/\/$/, '')}/${page}`;
