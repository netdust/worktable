import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Mail {
  to: string
  subject: string
  text: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

export const silentMailer: Mailer = { send: async () => {} }

// The development mailer: one file per mail, and the same text on stdout.
export function outboxMailer(dir: string): Mailer {
  return {
    async send({ to, text }) {
      const file = join(dir, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.txt`)
      writeFileSync(file, `To: ${to}\n\n${text}\n`, { mode: 0o600 })
      console.log(`mail to ${to}: ${text}`)
    },
  }
}
