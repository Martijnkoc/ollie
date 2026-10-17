import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AppConfig } from "@/lib/env";
import type { AnalysisInput } from "./input";
import { ANALYSIS_JSON_SCHEMA } from "./schema";

export interface GeneratedAnalysis {
  raw: unknown;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Any text model can sit behind this interface; the rest of the app never imports an AI SDK. */
export interface AnalysisService {
  readonly provider: string;
  readonly model: string;
  generate(input: AnalysisInput): Promise<GeneratedAnalysis>;
}

export class AnalysisRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisRefused";
  }
}

export const SYSTEM_PROMPT = `Je schrijft korte, feitelijke voetbalanalyses in het Nederlands voor de website Voetbalradar.

Je krijgt één JSON-object met gegevens uit de database van Voetbalradar. Dat object is je enige bron.

Regels:
- Gebruik uitsluitend informatie uit de JSON. Verzin geen spelers, blessures, schorsingen, transfers, citaten, tactiek of achtergrond die er niet in staat.
- Elk punt heeft een soort: "fact" (staat letterlijk in de gegevens), "statistic" (een getal uit de gegevens of een eenvoudige berekening daarop) of "interpretation" (jouw duiding). Getallen gebruik je alleen in "fact" en "statistic", en alleen als ze in de gegevens staan.
- Geef geen kansen, percentages voor uitslagen, voorspelde scores, wed- of goktips. Een voorbeschouwing beschrijft wat de gegevens laten zien en waar het om kan draaien, niet wie wint.
- Wees eerlijk over wat ontbreekt: noem de onderdelen uit "missing" in "missing_data", en zet beperkingen van de gegevens (weinig wedstrijden, alleen opgeslagen seizoenen) in "uncertainties".
- "recent_form" en "head_to_head" bevatten alleen wedstrijden uit de competities en seizoenen die Voetbalradar opslaat; zeg niet dat het de volledige historie is.
- Schrijf neutraal en zakelijk, zonder superlatieven of clickbait. Kop maximaal 12 woorden, samenvatting 2 tot 4 zinnen, hooguit 4 secties met elk hooguit 5 punten.
- Bij "kind": "preview" gaat het om een wedstrijd die nog moet beginnen. Bij "kind": "review" is de wedstrijd gespeeld; beschrijf het verloop aan de hand van de gebeurtenissen en statistieken.`;

/** Models with server-side refusal fallback; for these we opt in by default. */
const FALLBACK_MODELS = /^claude-(opus-5|opus-5-5|fable-5|fable-5-1|sonnet-5-5)$/;

export class AnthropicAnalysisService implements AnalysisService {
  readonly provider = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly effort: "low" | "medium" | "high",
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  }

  async generate(input: AnalysisInput): Promise<GeneratedAnalysis> {
    const fallback = FALLBACK_MODELS.test(this.model);
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 8000,
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      output_config: { effort: this.effort, format: { type: "json_schema", schema: ANALYSIS_JSON_SCHEMA } },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
    if (response.stop_reason === "refusal") throw new AnalysisRefused(`Model weigerde (${response.stop_details?.category ?? "onbekend"})`);
    if (response.stop_reason === "max_tokens") throw new AnalysisRefused("Antwoord afgebroken op max_tokens");
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AnalysisRefused("Antwoord was geen geldige JSON");
    }
    return { raw, model: response.model, inputTokens: response.usage.input_tokens ?? null, outputTokens: response.usage.output_tokens ?? null };
  }
}

export function createAnalysisService(cfg: AppConfig): AnalysisService | null {
  if (!cfg.ai.apiKey || cfg.ai.dailyLimit === 0) return null;
  return new AnthropicAnalysisService(cfg.ai.apiKey, cfg.ai.model, cfg.ai.effort);
}
