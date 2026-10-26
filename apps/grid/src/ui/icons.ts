import { Box, Calendar, CircleCheck, Clock, DatabaseSearch, Film, Flag, List, LogIn, type LucideIcon, MapPin, Star, Table, Tag, User, Users } from 'lucide-react'

/** The engine's icon set, each name as the tree draws it and as the picker names it. */
export const ICONS: { name: string; icon: LucideIcon; label: string }[] = [
  { name: 'table', icon: Table, label: 'Tabel' },
  { name: 'calendar', icon: Calendar, label: 'Kalender' },
  { name: 'users', icon: Users, label: 'Mensen' },
  { name: 'clock', icon: Clock, label: 'Klok' },
  { name: 'tag', icon: Tag, label: 'Label' },
  { name: 'pin', icon: MapPin, label: 'Plaats' },
  { name: 'check', icon: CircleCheck, label: 'Vinkje' },
  { name: 'list', icon: List, label: 'Lijst' },
  { name: 'film', icon: Film, label: 'Film' },
  { name: 'box', icon: Box, label: 'Doos' },
  { name: 'star', icon: Star, label: 'Ster' },
  { name: 'flag', icon: Flag, label: 'Vlag' },
  { name: 'user', icon: User, label: 'Gebruiker' },
  { name: 'query', icon: DatabaseSearch, label: 'Zoekvraag' },
  { name: 'log-in', icon: LogIn, label: 'Inloggen' },
]

export const iconNamed = (name: string | undefined): LucideIcon | undefined => ICONS.find((i) => i.name === name)?.icon
