import { defineDataset } from './declare'

export const ROLES = { administrator: 'administrator', editor: 'editor', owner: 'owner' } as const

export const account = defineDataset({
  name: 'account',
  label: 'Account',
  title: 'email',
  custom: false,
  columns: {
    email: { type: 'text', label: 'Email' },
    role: { type: 'text', label: 'Role', options: ROLES },
    subject_dataset: { type: 'text', label: 'Subject dataset', nullable: true },
    subject_id: { type: 'integer', label: 'Subject id', nullable: true },
    disabled_at: { type: 'datetime', label: 'Disabled at', nullable: true },
  },
  checks: [
    'CHECK (id > 0)',
    `CHECK (role IN (${Object.keys(ROLES)
      .map((r) => `'${r}'`)
      .join(', ')}))`,
    'UNIQUE (email COLLATE NOCASE)',
  ],
})

export const magicLink = defineDataset({
  name: 'magic_link',
  label: 'Magic link',
  title: 'token_hash',
  custom: false,
  columns: {
    account_id: { type: 'integer', label: 'Account', relation: 'account' },
    token_hash: { type: 'text', label: 'Token hash' },
    expires_at: { type: 'datetime', label: 'Expires at' },
    used_at: { type: 'datetime', label: 'Used at', nullable: true },
  },
  indexes: [['token_hash']],
})

export const authSession = defineDataset({
  name: 'auth_session',
  label: 'Session',
  title: 'id_hash',
  custom: false,
  columns: {
    account_id: { type: 'integer', label: 'Account', relation: 'account' },
    id_hash: { type: 'text', label: 'Id hash' },
    expires_at: { type: 'datetime', label: 'Expires at' },
  },
  indexes: [['id_hash']],
})

export const rateLimit = defineDataset({
  name: 'rate_limit',
  label: 'Rate limit',
  title: 'key',
  custom: false,
  columns: {
    key: { type: 'text', label: 'Key' },
    window_start: { type: 'integer', label: 'Window start' },
    count: { type: 'integer', label: 'Count' },
  },
  checks: ['UNIQUE (key, window_start)'],
})

export const authTables = [account, magicLink, authSession, rateLimit]
