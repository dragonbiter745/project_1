import { setGlobalOptions } from 'firebase-functions/v2';
import { REGION } from './config';

setGlobalOptions({ region: REGION, maxInstances: 100 });

export { startSession } from './callable/startSession';
export { createCheckout } from './callable/createCheckout';
export { vendorAction } from './callable/vendorAction';
export { reportIssue } from './callable/reportIssue';
export { adminAction } from './callable/adminAction';
export { cashfreeWebhook } from './webhook/cashfreeWebhook';
export { sweeper } from './scheduled/sweeper';
export { onTicketFailed } from './triggers/refunds';
