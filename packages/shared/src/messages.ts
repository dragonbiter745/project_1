// Messages from the court: campaigns to diners (in-app inbox, and web push for those who agreed to
// offers), order updates by push, and announcements to the kitchens. Email comes later.

export type CampaignAudience =
  | { kind: 'MEMBERS' }
  | { kind: 'REGULARS' }
  | { kind: 'NEW' }
  | { kind: 'LAPSED' }
  | { kind: 'SHOP'; vendorId: string }
  | { kind: 'CATEGORY'; vendorId: string; categoryId: string }
  | { kind: 'PEOPLE'; uids: string[] }
  | { kind: 'KITCHENS'; vendorIds: string[] };

export type CampaignStatus = 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED' | 'FAILED';

export interface CampaignStats {
  /** Signed-in diners (or kitchens) it was meant for. */
  recipients: number;
  /** Inbox messages written. */
  inbox: number;
  /** Diners who agreed to offers and have a phone set up for notifications. */
  pushTargets: number;
  pushSent: number;
  pushFailed: number;
}

export interface Campaign {
  id: string;
  title: string;
  body: string;
  audience: CampaignAudience;
  /** Offered with a "Use coupon" button in the inbox. */
  couponCode?: string;
  status: CampaignStatus;
  sendAt: number;
  sentAt?: number;
  createdAt: number;
  createdBy: string;
  stats?: CampaignStats;
  error?: string;
}

export interface InboxMessage {
  id: string;
  uid: string;
  campaignId: string;
  title: string;
  body: string;
  couponCode?: string;
  createdAt: number;
  readAt?: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  /** 'ALL' or the vendor ids it is for. */
  audience: string[];
  createdAt: number;
  expiresAt: number;
}

export const MESSAGE_TITLE_MAX = 60;
export const MESSAGE_BODY_MAX = 240;

export function audienceLabel(a: CampaignAudience, names: { shop?: (id: string) => string; category?: (vendorId: string, categoryId: string) => string } = {}): string {
  switch (a.kind) {
    case 'MEMBERS':
      return 'All signed-in diners';
    case 'REGULARS':
      return 'Regulars';
    case 'NEW':
      return 'New this week';
    case 'LAPSED':
      return 'Lapsed (30+ days)';
    case 'SHOP':
      return `Ordered from ${names.shop?.(a.vendorId) ?? 'a shop'}`;
    case 'CATEGORY':
      return `Ordered ${names.category?.(a.vendorId, a.categoryId) ?? 'a category'}`;
    case 'PEOPLE':
      return `${a.uids.length} chosen ${a.uids.length === 1 ? 'diner' : 'diners'}`;
    case 'KITCHENS':
      return a.vendorIds.includes('ALL') ? 'Every kitchen' : `${a.vendorIds.length} ${a.vendorIds.length === 1 ? 'kitchen' : 'kitchens'}`;
  }
}
