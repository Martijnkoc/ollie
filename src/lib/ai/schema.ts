import { z } from "zod";

/** What an analysis looks like once validated. Stored as JSON and rendered as-is. */
export const pointSchema = z.object({
  kind: z.enum(["fact", "statistic", "interpretation"]),
  text: z.string().trim().min(3).max(400),
});

export const analysisSchema = z.object({
  headline: z.string().trim().min(5).max(120),
  summary: z.string().trim().min(20).max(800),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(80),
        points: z.array(pointSchema).min(1).max(6),
      }),
    )
    .min(1)
    .max(4),
  uncertainties: z.array(z.string().trim().min(3).max(300)).max(5),
  missing_data: z.array(z.string().trim().min(3).max(200)).max(8),
});

export type Analysis = z.infer<typeof analysisSchema>;
export type AnalysisKind = "preview" | "review";

/**
 * The same structure as JSON Schema for the model's structured output. Kept to the subset that
 * structured outputs accept; lengths and counts are enforced by `analysisSchema` afterwards.
 */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "sections", "uncertainties", "missing_data"],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "points"],
        properties: {
          title: { type: "string" },
          points: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["kind", "text"],
              properties: {
                kind: { type: "string", enum: ["fact", "statistic", "interpretation"] },
                text: { type: "string" },
              },
            },
          },
        },
      },
    },
    uncertainties: { type: "array", items: { type: "string" } },
    missing_data: { type: "array", items: { type: "string" } },
  },
} as const;
