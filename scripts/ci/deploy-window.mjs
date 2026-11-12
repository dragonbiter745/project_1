// Refuses a production deploy during lunch service (11:30-15:00 IST), when a bad release would hit the most
// diners and the fewest people are free to roll it back. A run started by hand (workflow_dispatch) with
// FORCE_DEPLOY=true is let through for an emergency fix.
const now = new Date(Date.now() + 330 * 60_000); // IST, no daylight saving
const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
const lunch = minutes >= 11 * 60 + 30 && minutes < 15 * 60;
if (lunch && process.env.FORCE_DEPLOY !== 'true') {
  console.error(`::error::Deploys are paused during lunch service (11:30-15:00 IST; it is ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}). Re-run after 15:00, or run the workflow by hand with FORCE_DEPLOY for an emergency fix.`);
  process.exit(1);
}
console.log('Deploy window open.');
