import type { Category } from '../types'

const SHAPES: Record<Category, React.ReactNode> = {
  open: <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  active: (
    <>
      <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2.75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" />
    </>
  ),
  done: <path d="M3.5 8.4l3 3 6-6.4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />,
  cancelled: <path d="M4.5 4.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />,
}

/** One 16px box per category, drawn in the text colour, so the four marks read as one set. */
export function CategoryMark({ category }: { category: Category }) {
  return (
    <svg className="nv-category" data-category={category} viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      {SHAPES[category]}
    </svg>
  )
}
