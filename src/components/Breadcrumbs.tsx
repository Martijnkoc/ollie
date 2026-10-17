import Link from "next/link";

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Kruimelpad" className="small dim" style={{ marginBottom: 8 }}>
      {items.map((item, i) => (
        <span key={item.path}>
          {i > 0 && <span aria-hidden="true"> › </span>}
          {i === items.length - 1 ? (
            <span aria-current="page">{item.name}</span>
          ) : (
            <Link href={item.path} className="dim">
              {item.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
