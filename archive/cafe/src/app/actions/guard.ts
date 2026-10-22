import "server-only";
import { type Rights, viewer } from "@/lib/access";
import { UserError } from "@/lib/errors";

/** Rights of the caller of a server action; never trusts anything from the client. */
export async function caller(): Promise<Rights> {
  const v = await viewer();
  if (!v) throw new UserError("Je bent uitgelogd. Log opnieuw in.");
  return v;
}
