/** Remembers in the guest's browser which date an invite link led to, so reopening the link brings them back. */
export function guestCookieName(code: string) {
  return `ollie_guest_${code}`;
}
