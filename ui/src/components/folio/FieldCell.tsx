// FieldCell — render a frontmatter value by its INFERRED type, the way
// folio does: a date reads as a date, an http(s) URL as a link, an
// image URL as a thumbnail, a multi_select as tag chips, a status as
// the pill. Carried in spirit from folio's cell renderers, rebuilt lean
// over worktable's string frontmatter and the ported `inferFieldType`.
//
// Safety: every value renders as TEXT or an attribute, never as HTML.
// A URL becomes an <a href> / <img src> (inert), a string becomes a
// text node — a hostile frontmatter value cannot inject markup.
import { inferFieldType } from "../../lib/ported/field-infer";
import { StatusChip } from "../StatusChip";

export function FieldCell({
  field,
  value,
}: {
  field: string;
  value: string | undefined;
}) {
  if (value === undefined || value === "")
    return <span className="cell-empty">—</span>;

  // status is always the pill, regardless of what it would infer to.
  if (field === "status") return <StatusChip status={value} />;

  const type = inferFieldType(value);
  switch (type) {
    case "url":
      return (
        <a
          className="cell-link"
          href={value}
          target="_blank"
          rel="noreferrer noopener"
          title={value}
        >
          {shorten(value)}
        </a>
      );
    case "image":
      return <img className="cell-img" src={value} alt={field} loading="lazy" />;
    case "multi_select":
      return (
        <span className="cell-tags">
          {splitTags(value).map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </span>
      );
    case "date":
    case "datetime":
      return (
        <time className="cell-date" dateTime={value}>
          {value.slice(0, 10)}
        </time>
      );
    default:
      return <span className="cell-text">{value}</span>;
  }
}

// A multi_select frontmatter value arrives as a comma or bracket list
// string (the server stores frontmatter as strings); split it the same
// way the view definition parser does. Exported for unit coverage.
export function splitTags(raw: string): string[] {
  let s = raw.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  return s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function shorten(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
