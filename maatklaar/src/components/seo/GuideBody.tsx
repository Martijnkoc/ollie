import type { Block } from "@/content/guides";
import { Icon } from "../brand/Icon";

/** Renders the content blocks of a guide; formulas and examples get their own, recognisable form. */
export function GuideBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "p":
            return <p key={i}>{b.text}</p>;
          case "steps":
            return (
              <ol key={i} className="guide-steps">
                {b.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
            );
          case "list":
            return (
              <ul key={i} className="ticks">
                {b.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            );
          case "formula":
            return (
              <div key={i} className="formula framed">
                <code>{b.text}</code>
                {b.note && <span className="small muted">{b.note}</span>}
              </div>
            );
          case "example":
            return (
              <figure key={i} className="example-calc">
                <figcaption>
                  <span className="badge badge-demo">Rekenvoorbeeld</span> {b.title}
                </figcaption>
                <table className="data">
                  <tbody>
                    {b.rows.map(([k, v], j) => (
                      <tr key={k} className={j === b.rows.length - 1 ? "total" : undefined}>
                        <th scope="row">{k}</th>
                        <td className="num">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="tiny muted">{b.note}</p>
              </figure>
            );
          case "callout":
            return (
              <p key={i} className={`notice ${b.tone === "warn" ? "notice-warn" : ""} callout`}>
                <Icon name={b.tone === "warn" ? "alert" : "info"} />
                <span>{b.text}</span>
              </p>
            );
        }
      })}
    </>
  );
}
