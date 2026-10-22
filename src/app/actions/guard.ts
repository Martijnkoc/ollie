import "server-only";
import { type Rights, viewer } from "@/lib/access";
import { UserError, errorState } from "@/lib/errors";

/** Rights of the caller of a server action; never trusts anything from the client. */
export async function caller(): Promise<Rights> {
  const v = await viewer();
  if (!v) throw new UserError("Je bent uitgelogd. Log opnieuw in.");
  return v;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** For actions called from client code (not forms): a plain result instead of a thrown error. */
export async function result<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: errorState(err)!.error! };
  }
}

export const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
