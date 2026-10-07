import { badgeRows, seedDomainWith } from './seed-domain'

// The second badge row is refused by the badge writer.
export default seedDomainWith([badgeRows[0] as Record<string, unknown>, { name: 'bad' }])
