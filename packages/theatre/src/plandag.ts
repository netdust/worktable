const pad = (n: number): string => String(n).padStart(2, '0')

function previousDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const day = new Date(Date.UTC(y, m - 1, d - 1))
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`
}

export function plandag(startAt: string, dayLineHour: number): string {
  const [date, time] = startAt.split('T') as [string, string]
  return Number(time.slice(0, 2)) < dayLineHour ? previousDay(date) : date
}
