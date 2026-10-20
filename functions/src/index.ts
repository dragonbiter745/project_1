import { setGlobalOptions } from 'firebase-functions/v2';
import { REGION } from './config';

setGlobalOptions({ region: REGION, maxInstances: 100 });

export { startSession } from './callable/startSession';
export { createCheckout } from './callable/createCheckout';
export { vendorAction } from './callable/vendorAction';
export { reportIssue } from './callable/reportIssue';
export { adminAction } from './callable/adminAction';
export { accountAction } from './callable/account';
export { customerInsights } from './callable/customers';
export { couponAdmin, dinerCoupons } from './callable/coupons';
export { campaignAction, campaignSweeper, pushAction } from './callable/messages';
export { onTicketNotify } from './triggers/notify';
export { cashfreeWebhook } from './webhook/cashfreeWebhook';
export { sweeper } from './scheduled/sweeper';
export { onTicketFailed } from './triggers/refunds';
export { financeReport, financeAction, founderReport, shopReport } from './callable/finance';
