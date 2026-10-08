import { t } from '../i18n'

/** Something is loading: a ring that turns. */
export function Spinner({ small = false }: { small?: boolean }) {
  return <span role="progressbar" aria-label={t('loading')} className={small ? 'nv-spinner nv-spinner--sm' : 'nv-spinner'} />
}
