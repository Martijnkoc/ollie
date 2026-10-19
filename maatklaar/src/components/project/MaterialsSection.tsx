"use client";

import { useId } from "react";
import { CATALOG, type CategoryKey } from "@/lib/materials/catalog";
import { CategoryCard } from "./CategoryCard";
import type { StepProps } from "./types";

const GROUPS = [
  { key: "vloer", label: "Vloer" },
  { key: "wand", label: "Wanden" },
  { key: "raam", label: "Raamdecoratie" },
] as const;

/** The paid material library: pick the jobs of this project; each category calculates with its own inputs. */
export function MaterialsSection(props: StepProps) {
  const { project, update } = props;
  const id = useId();
  const selected = new Set(project.materials.selected);
  const toggle = (key: CategoryKey, on: boolean) =>
    update((p) => ({
      ...p,
      materials: {
        ...p.materials,
        selected: on ? [...new Set([...p.materials.selected, key])] : p.materials.selected.filter((k) => k !== key),
      },
    }));

  return (
    <section className="panel stack" aria-labelledby={`${id}-title`}>
      <div className="panel-head">
        <div>
          <h2 id={`${id}-title`} tabIndex={-1}>
            Materialen voor je klussen
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Kies wat je gaat doen. Per categorie zie je wat we kunnen uitrekenen, welke waarden nog een aanname zijn en wat er ontbreekt.
          </p>
        </div>
      </div>
      <div className="grid-3">
        {GROUPS.map((g) => (
          <fieldset key={g.key} className="card-flat stack-sm" style={{ margin: 0 }}>
            <legend style={{ fontWeight: 700 }}>{g.label}</legend>
            {CATALOG.filter((m) => m.group === g.key).map((m) => (
              <label key={m.key} className="row small" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selected.has(m.key)}
                  onChange={(e) => toggle(m.key, e.target.checked)}
                  style={{ width: 20, height: 20, accentColor: "var(--brand)" }}
                />
                {m.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="stack">
        {CATALOG.filter((m) => selected.has(m.key)).map((m) => (
          <CategoryCard key={m.key} module={m} {...props} />
        ))}
        {selected.size === 0 && <p className="notice">Kies hierboven minstens één categorie.</p>}
      </div>
    </section>
  );
}
