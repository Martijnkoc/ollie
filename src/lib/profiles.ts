import { type Profile, type Rights, PROFILE_JOINS, PROFILE_SELECT, assertActive, isPublic, toProfile } from "./access";
import { AVAILABILITY, CATEGORY_KEYS, MAX_SKILLS, REGIONS } from "./config";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { assertOwnMedia } from "./storage";

const RESERVED = new Set([
  "admin",
  "beheer",
  "beheerder",
  "moderator",
  "support",
  "help",
  "info",
  "team",
  "sellyourself",
  "sell-yourself",
  "official",
  "officieel",
  "security",
  "privacy",
  "api",
  "media",
]);

export function normaliseUsername(input: string) {
  return input.trim().replace(/^@/, "").toLowerCase();
}

export function validateUsername(input: string) {
  const u = normaliseUsername(input);
  if (u.length < 3 || u.length > 30) throw new UserError("Je gebruikersnaam heeft 3 tot 30 tekens.");
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(u)) {
    throw new UserError(
      "Gebruik alleen kleine letters, cijfers, punt, streepje of underscore, en begin en eindig met een letter of cijfer.",
    );
  }
  if (RESERVED.has(u)) throw new UserError("Deze gebruikersnaam is niet beschikbaar.");
  return u;
}

export function suggestUsername(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return base.length >= 3 ? base : `${base || "maker"}-${Math.floor(Math.random() * 900 + 100)}`;
}

function text(value: string | undefined, max: number, what: string, min = 0) {
  const v = (value ?? "").trim();
  if (v.length < min) throw new UserError(min === 1 ? `${what} is verplicht.` : `${what} heeft minimaal ${min} tekens.`);
  if (v.length > max) throw new UserError(`${what} mag maximaal ${max} tekens hebben.`);
  return v;
}

export function parseSkills(raw: string | undefined) {
  const skills = Array.from(
    new Set(
      (raw ?? "")
        .split(/[,\n]/)
        .map((s) => s.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  );
  if (skills.length > MAX_SKILLS) throw new UserError(`Kies maximaal ${MAX_SKILLS} vaardigheden.`);
  if (skills.some((s) => s.length > 40)) throw new UserError("Een vaardigheid heeft maximaal 40 tekens.");
  return skills;
}

function url(value: string | undefined) {
  const v = (value ?? "").trim();
  if (!v) return null;
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error();
    return u.toString().slice(0, 200);
  } catch {
    throw new UserError("Vul een geldig webadres in, bijvoorbeeld jouwnaam.nl.");
  }
}

async function usernameFree(db: Db, username: string, userId: string) {
  const taken = await one(db, `select 1 from profiles where username = $1 and user_id <> $2`, [username, userId]);
  if (taken) throw new UserError("Deze gebruikersnaam is al bezet.");
}

/** First step after logging in: a name and a handle. Selling is a choice, not a different account. */
export async function createProfile(db: Db, r: Rights, input: { displayName: string; username: string; sell: boolean }) {
  if (r.restricted) throw new UserError("Je account is beperkt.");
  if (r.profile) throw new UserError("Je hebt al een profiel.");
  const displayName = text(input.displayName, 60, "Je naam", 2);
  const username = validateUsername(input.username);
  await usernameFree(db, username, r.user.id);
  await db.query(`insert into profiles (user_id, username, display_name) values ($1, $2, $3)`, [r.user.id, username, displayName]);
  return { username, sell: input.sell };
}

export type ProfileInput = {
  displayName: string;
  username: string;
  headline: string;
  bio: string;
  categories: string[];
  skills: string;
  city: string;
  region: string;
  worksRemote: boolean;
  travelKm: string;
  availability: string;
  availabilityNote: string;
  sellerType: string;
  kvkNumber: string;
  website: string;
  avatarId: string | null;
  coverId: string | null;
  published: boolean;
};

export async function updateProfile(db: Db, r: Rights, input: ProfileInput, now = new Date()) {
  assertActive(r);
  const displayName = text(input.displayName, 60, "Je naam", 2);
  const username = validateUsername(input.username);
  await usernameFree(db, username, r.user.id);
  const headline = text(input.headline, 90, "Je kopregel");
  const bio = text(input.bio, 1500, "Je introductie");
  const categories = Array.from(new Set(input.categories)).filter((c) => (CATEGORY_KEYS as string[]).includes(c));
  if (categories.length > 3) throw new UserError("Kies maximaal drie categorieën.");
  const skills = parseSkills(input.skills);
  const city = text(input.city, 60, "Je plaats");
  const region = input.region ? input.region : null;
  if (region && !REGIONS.some((x) => x.key === region)) throw new UserError("Kies een provincie uit de lijst.");
  const travelKm = input.travelKm.trim() ? Number(input.travelKm) : null;
  if (travelKm != null && (!Number.isInteger(travelKm) || travelKm < 0 || travelKm > 500)) {
    throw new UserError("Vul een werkgebied in van 0 tot 500 kilometer.");
  }
  if (!AVAILABILITY.some((a) => a.key === input.availability)) throw new UserError("Kies je beschikbaarheid.");
  const availabilityNote = text(input.availabilityNote, 120, "De toelichting bij je beschikbaarheid");
  const sellerType = input.sellerType === "business" ? "business" : "private";
  const kvk = input.kvkNumber.replace(/\s/g, "");
  if (sellerType === "business" && !/^\d{8}$/.test(kvk))
    throw new UserError("Een zakelijke verkoper vult een KvK-nummer van 8 cijfers in.");
  const website = url(input.website);
  const avatarId = await assertOwnMedia(db, r.user.id, input.avatarId, ["avatar"]);
  const coverId = await assertOwnMedia(db, r.user.id, input.coverId, ["cover"]);
  if (input.published) {
    if (!headline) throw new UserError("Een openbaar profiel heeft een kopregel nodig: zeg in één zin wat je doet.");
    if (categories.length === 0) throw new UserError("Kies minstens één categorie voor een openbaar profiel.");
  }
  await db.query(
    `update profiles set display_name = $2, username = $3, headline = $4, bio = $5, categories = $6, skills = $7, city = $8, region = $9,
       works_remote = $10, travel_km = $11, availability = $12, availability_note = $13, seller_type = $14, kvk_number = $15,
       website = $16, avatar_id = $17, cover_id = $18, published = $19, updated_at = $20
     where user_id = $1`,
    [
      r.user.id,
      displayName,
      username,
      headline,
      bio,
      categories,
      skills,
      city,
      region,
      input.worksRemote,
      travelKm,
      input.availability,
      availabilityNote,
      sellerType,
      sellerType === "business" ? kvk : null,
      website,
      avatarId,
      coverId,
      input.published,
      now,
    ],
  );
  return username;
}

/** The public page of a maker. The owner may preview it while it is not public; anyone else gets nothing. */
export async function profileByUsername(db: Db, username: string, viewerId?: string) {
  const row = await one<Parameters<typeof toProfile>[0]>(
    db,
    `select ${PROFILE_SELECT} from profiles p ${PROFILE_JOINS} where p.username = $1`,
    [normaliseUsername(username)],
  );
  if (!row) return undefined;
  const profile = toProfile(row);
  if (profile.user_id === viewerId) return profile;
  if (!isPublic(profile)) return undefined;
  if (viewerId) {
    const blocked = await one(
      db,
      `select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)`,
      [viewerId, profile.user_id],
    );
    if (blocked) return undefined;
  }
  return profile;
}

export type ProfileStats = { followers: number; reviews: number; rating: number | null; completed: number };

/** Only real counts. A rating is shown only when there is at least one review. */
export async function profileStats(db: Db, userId: string): Promise<ProfileStats> {
  const row = await one<{ followers: number; reviews: number; rating: string | null; completed: number }>(
    db,
    `select (select count(*)::int from follows where followee_id = $1) as followers,
            (select count(*)::int from reviews where seller_id = $1 and hidden_at is null) as reviews,
            (select round(avg(rating)::numeric, 1)::text from reviews where seller_id = $1 and hidden_at is null) as rating,
            (select count(*)::int from orders where seller_id = $1 and status = 'completed') as completed`,
    [userId],
  );
  return { followers: row!.followers, reviews: row!.reviews, rating: row!.rating ? Number(row!.rating) : null, completed: row!.completed };
}

export type MakerCard = Pick<
  Profile,
  | "user_id"
  | "username"
  | "display_name"
  | "headline"
  | "categories"
  | "avatar_url"
  | "cover_url"
  | "city"
  | "works_remote"
  | "availability"
>;

export function profileCompleteness(p: Profile, counts: { services: number; portfolio: number }) {
  const steps = [
    { done: Boolean(p.avatar_url), label: "Profielfoto" },
    { done: Boolean(p.headline), label: "Kopregel" },
    { done: p.bio.length >= 40, label: "Introductie" },
    { done: p.categories.length > 0, label: "Categorie" },
    { done: counts.portfolio > 0, label: "Eerste werk in je portfolio" },
    { done: counts.services > 0, label: "Eerste dienst" },
    { done: p.published, label: "Profiel openbaar" },
  ];
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length };
}
