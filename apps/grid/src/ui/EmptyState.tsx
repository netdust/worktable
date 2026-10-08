import { Inbox } from 'lucide-react'

/** Nothing to show: what, and why or what next. */
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="nv-empty" role="status">
      <span className="nv-empty__chip" aria-hidden="true"><Inbox size={18} /></span>
      <p className="nv-empty__title">{title}</p>
      <p className="nv-empty__desc">{description}</p>
    </div>
  )
}
