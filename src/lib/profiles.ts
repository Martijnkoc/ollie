import { INTENTS, INTERESTS, MIN_AGE, REGIONS } from "./config";
import { type Db } from "./db";
import { UserError } from "./errors";
import { ageOn } from "./time";

export type ProfileInput = {
  alias: string;
  birthDate: string;
  region: string;
  intent: string;
  interests: string[];
  bio: string;
  showAge: boolean;
  showRegion: boolean;
  listed: boolean;
};

export function checkProfile(input: ProfileInput, now = new Date()) {
  const alias = input.alias.trim();
  if (alias.length < 2 || alias.length > 30) throw new UserError("Kies een voornaam of alias van 2 tot 30 tekens.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) throw new UserError("Vul je geboortedatum in.");
  const age = ageOn(input.birthDate, now);
  if (age < MIN_AGE) throw new UserError(`Cafe is alleen voor mensen van ${MIN_AGE} jaar en ouder.`);
  if (age > 120) throw new UserError("Controleer je geboortedatum.");
  if (!REGIONS.some((r) => r.key === input.region)) throw new UserError("Kies je regio.");
  if (!INTENTS.some((i) => i.key === input.intent)) throw new UserError("Kies wat je zoekt.");
  const interests = [...new Set(input.interests)].filter((i) => (INTERESTS as readonly string[]).includes(i));
  if (interests.length > 5) throw new UserError("Kies maximaal vijf interesses.");
  if (input.bio.trim().length > 200) throw new UserError("Houd je introductie onder de 200 tekens.");
  return { ...input, alias, interests, bio: input.bio.trim() };
}

export async function saveProfile(db: Db, userId: string, raw: ProfileInput, now = new Date()) {
  const p = checkProfile(raw, now);
  await db.query(
    `insert into profiles (user_id, alias, birth_date, region, intent, interests, bio, show_age, show_region, listed, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     on conflict (user_id) do update set alias = excluded.alias, region = excluded.region, intent = excluded.intent,
       interests = excluded.interests, bio = excluded.bio, show_age = excluded.show_age, show_region = excluded.show_region,
       listed = excluded.listed, updated_at = excluded.updated_at`,
    [userId, p.alias, p.birthDate, p.region, p.intent, p.interests, p.bio, p.showAge, p.showRegion, p.listed, now],
  );
}
