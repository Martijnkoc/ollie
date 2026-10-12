import "server-only";
import { cookies } from "next/headers";

export const INVITE_COOKIE = "cafe_invite";

/** The invite a guest opened in this browser. The cookie is httpOnly, so scripts cannot read it. */
export async function inviteTokenFromCookie() {
  return (await cookies()).get(INVITE_COOKIE)?.value;
}
