import { z } from "zod";

/**
 * Shapes of the Sportmonks Football API v3 responses we read, written from the public
 * documentation (docs.sportmonks.com/v3). Unknown fields are ignored; fields we rely on are
 * validated so a format change fails loudly in the sync log instead of storing nonsense.
 */

const id = z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform((v) => String(v));
const nullableString = z.string().nullish().transform((v) => v ?? null);
const nullableInt = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
  .pipe(z.number().int().nullable());

export const typeSchema = z.object({
  id: z.number().int(),
  name: nullableString,
  code: nullableString,
  developer_name: nullableString,
});

export const seasonSchema = z.object({
  id,
  name: z.string(),
  is_current: z.boolean().nullish(),
  finished: z.boolean().nullish(),
  starting_at: nullableString,
  ending_at: nullableString,
});

export const leagueSchema = z.object({
  id,
  name: z.string(),
  image_path: nullableString,
  type: nullableString,
  currentseason: seasonSchema.nullish(),
  currentSeason: seasonSchema.nullish(),
  seasons: z.array(seasonSchema).nullish(),
});

export const venueSchema = z.object({
  id: id.nullish(),
  name: nullableString,
  city_name: nullableString,
});

export const participantSchema = z.object({
  id,
  name: z.string(),
  short_code: nullableString,
  image_path: nullableString,
  founded: nullableInt.optional(),
  placeholder: z.boolean().nullish(),
  country: z.object({ name: nullableString }).nullish(),
  venue: venueSchema.nullish(),
  meta: z
    .object({
      location: z.enum(["home", "away"]).nullish(),
      winner: z.boolean().nullish(),
    })
    .nullish(),
});

export const scoreSchema = z.object({
  participant_id: id.nullish(),
  description: nullableString,
  type_id: z.number().int().nullish(),
  score: z.object({
    goals: nullableInt,
    participant: z.enum(["home", "away"]).nullish(),
  }),
});

export const stateSchema = z.object({
  id: z.number().int(),
  state: nullableString,
  name: nullableString,
  short_name: nullableString,
  developer_name: nullableString,
});

export const periodSchema = z.object({
  ticking: z.boolean().nullish(),
  started: z.number().nullish(),
  ended: z.number().nullish(),
  minutes: nullableInt.optional(),
  counts_from: nullableInt.optional(),
  period_length: nullableInt.optional(),
  sort_order: nullableInt.optional(),
  description: nullableString,
});

export const eventSchema = z.object({
  id: id.nullish(),
  participant_id: id.nullish(),
  type_id: z.number().int().nullish(),
  type: typeSchema.nullish(),
  player_id: id.nullish(),
  player_name: nullableString,
  related_player_id: id.nullish(),
  related_player_name: nullableString,
  result: nullableString,
  info: nullableString,
  addition: nullableString,
  minute: nullableInt.optional(),
  extra_minute: nullableInt.optional(),
  sort_order: nullableInt.optional(),
  rescinded: z.boolean().nullish(),
});

export const lineupSchema = z.object({
  player_id: id.nullish(),
  team_id: id,
  position_id: z.number().int().nullish(),
  type_id: z.number().int().nullish(),
  formation_field: nullableString,
  formation_position: nullableInt.optional(),
  player_name: nullableString,
  jersey_number: nullableInt.optional(),
});

export const statisticSchema = z.object({
  participant_id: id.nullish(),
  type_id: z.number().int(),
  type: typeSchema.nullish(),
  location: z.enum(["home", "away"]).nullish(),
  data: z.object({ value: z.union([z.number(), z.string(), z.null()]).nullish() }).nullish(),
});

export const formationSchema = z.object({
  participant_id: id.nullish(),
  formation: nullableString,
  location: z.enum(["home", "away"]).nullish(),
});

export const fixtureSchema = z.object({
  id,
  league_id: id,
  season_id: id,
  state_id: z.number().int().nullish(),
  name: nullableString,
  starting_at: nullableString,
  starting_at_timestamp: z.number().nullish(),
  length: nullableInt.optional(),
  placeholder: z.boolean().nullish(),
  participants: z.array(participantSchema).nullish(),
  scores: z.array(scoreSchema).nullish(),
  state: stateSchema.nullish(),
  periods: z.array(periodSchema).nullish(),
  events: z.array(eventSchema).nullish(),
  lineups: z.array(lineupSchema).nullish(),
  statistics: z.array(statisticSchema).nullish(),
  formations: z.array(formationSchema).nullish(),
  venue: venueSchema.nullish(),
  round: z.object({ name: nullableString }).nullish(),
  stage: z.object({ name: nullableString }).nullish(),
});

export const standingSchema = z.object({
  participant_id: id,
  position: z.number().int(),
  points: nullableInt.optional(),
  participant: participantSchema.nullish(),
  group: z.object({ name: nullableString }).nullish(),
  stage: z.object({ name: nullableString }).nullish(),
  details: z
    .array(
      z.object({
        type_id: z.number().int(),
        value: nullableInt,
        type: typeSchema.nullish(),
      }),
    )
    .nullish(),
  form: z
    .array(
      z.object({
        form: z.string(),
        sort_order: nullableInt.optional(),
      }),
    )
    .nullish(),
  rule: z.object({ type: typeSchema.nullish() }).nullish(),
});

export const envelopeSchema = z.object({
  data: z.unknown().optional(),
  message: z.string().optional(),
  pagination: z
    .object({
      has_more: z.boolean(),
      current_page: z.number().int().optional(),
      next_page: z.string().nullish(),
    })
    .nullish(),
  rate_limit: z
    .object({
      remaining: z.number().nullish(),
      resets_in_seconds: z.number().nullish(),
      requested_entity: z.string().nullish(),
    })
    .nullish(),
});

export type SmFixture = z.infer<typeof fixtureSchema>;
export type SmParticipant = z.infer<typeof participantSchema>;
export type SmLeague = z.infer<typeof leagueSchema>;
export type SmSeason = z.infer<typeof seasonSchema>;
export type SmStanding = z.infer<typeof standingSchema>;
export type SmType = z.infer<typeof typeSchema>;
