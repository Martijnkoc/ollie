import { z } from "zod";

/** One suggestion from the PDOK Locatieserver suggest endpoint. */
export const addressSuggestionSchema = z.object({
  id: z.string(),
  weergavenaam: z.string(),
});
export type AddressSuggestion = z.infer<typeof addressSuggestionSchema>;

/** A confirmed address, as returned by our /api/adres/[id] route (Locatieserver lookup). */
export const addressSchema = z.object({
  id: z.string(),
  weergavenaam: z.string(),
  straat: z.string().nullable(),
  huisnummer: z.number().int().nullable(),
  huisletter: z.string().nullable(),
  toevoeging: z.string().nullable(),
  postcode: z.string().nullable(),
  woonplaats: z.string().nullable(),
  gemeente: z.string().nullable(),
  /** WGS84 point of the address (Locatieserver centroide_ll). */
  point: z.object({ lat: z.number(), lon: z.number() }).nullable(),
  /** BAG identificatie of the verblijfsobject (Locatieserver adresseerbaarobject_id). */
  verblijfsobjectId: z.string().nullable(),
});
export type Address = z.infer<typeof addressSchema>;

/** Only fields the BAG actually returned; everything else stays null. */
export const buildingSchema = z.object({
  fetchedAt: z.string(),
  verblijfsobject: z
    .object({
      id: z.string(),
      /** Registered gebruiksoppervlakte in m² (BAG). Not the sum of room floors. */
      oppervlakteM2: z.number().nullable(),
      gebruiksdoelen: z.array(z.string()),
      status: z.string().nullable(),
    })
    .nullable(),
  pand: z
    .object({
      id: z.string(),
      bouwjaar: z.number().int().nullable(),
      status: z.string().nullable(),
      /** Outline rings in WGS84 [lon, lat]; the whole building, not one apartment. */
      outline: z.array(z.array(z.tuple([z.number(), z.number()]))).nullable(),
    })
    .nullable(),
  /** Plain-language notes about what could not be fetched or verified. */
  notes: z.array(z.string()),
});
export type Building = z.infer<typeof buildingSchema>;
