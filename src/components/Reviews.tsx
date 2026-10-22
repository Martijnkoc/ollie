import { formatMonthYear } from "@/lib/format";
import type { Review } from "@/lib/reviews";
import { Dialog } from "./Dialog";
import { ReplyForm } from "./forms/OrderForms";
import { ReportForm } from "./forms/SafetyForms";
import { Avatar, Stars } from "./Visuals";

export function ReviewList({
  reviews,
  sellerName,
  viewerId,
  sellerId,
}: {
  reviews: Review[];
  sellerName: string;
  viewerId?: string;
  sellerId: string;
}) {
  if (reviews.length === 0) {
    return <p className="muted">Nog geen reviews. Reviews kunnen alleen geschreven worden na een afgeronde opdracht via Sell Yourself.</p>;
  }
  return (
    <ul className="divided">
      {reviews.map((r) => (
        <li key={r.id} className="stack-sm">
          <div className="row between">
            <span className="byline">
              <Avatar name={r.author_name} url={r.author_avatar} size={28} />
              <span>
                <strong style={{ color: "var(--ink)" }}>{r.author_name}</strong> · {formatMonthYear(r.created_at)}
              </span>
            </span>
            <Stars rating={r.rating} />
          </div>
          <p className="tiny faint" style={{ margin: 0 }}>
            Geverifieerde opdracht: {r.order_title}
          </p>
          <p className="pre" style={{ margin: 0 }}>
            {r.body}
          </p>
          {r.reply && (
            <div className="card tight" style={{ marginLeft: 16 }}>
              <p className="small" style={{ margin: 0 }}>
                <strong>Reactie van {sellerName}</strong>
              </p>
              <p className="small pre muted" style={{ margin: 0 }}>
                {r.reply}
              </p>
            </div>
          )}
          <div className="row">
            {viewerId === sellerId && !r.reply && (
              <Dialog trigger="Reageren" triggerClassName="btn ghost small" title="Reageren op deze review">
                <ReplyForm reviewId={r.id} />
              </Dialog>
            )}
            {viewerId && (
              <Dialog trigger="Melden" triggerClassName="btn ghost small" title="Review melden">
                <ReportForm context="review" contextId={r.id} allowBlock={false} />
              </Dialog>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
