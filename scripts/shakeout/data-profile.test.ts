import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { counts, profile, run } from './data-profile'

const dir = mkdtempSync(join(tmpdir(), 'dp-'))
const dbPath = join(dir, 'fixture.db')

const db = new Database(dbPath)
db.exec(`
create table activiteit (id integer primary key, productie_id integer, soort text, omschrijving text, datum text, start_at text, eind_at text, plandag text, status text, deleted_at text);
create table persoon (id integer primary key, voornaam text, achternaam text, weergavenaam text, email text, actief integer default 1, deleted_at text);
create table toewijzing (id integer primary key, activiteit_id integer, persoon_id integer, naam text, state text default 'bevestigd', deleted_at text);
create table beschikbaarheid (id integer primary key, persoon_id integer, start_at text, eind_at text, deleted_at text);
create table auth_session (id integer primary key, id_hash text);
insert into persoon (id, voornaam, achternaam, weergavenaam, email) values
 (1,'Zorbalina','Quuxwell','Zorbalina Quuxwell','z@example.test'),
 (2,'zorbalina','QUUXWELL','Zorbalina  Quuxwell','z2@example.test'),
 (3,'Lonely','Wibblesby ','Lonely Wibblesby',null),
 (4,'Nbsp','Frobnitz','Nbsp Frobnitz','n@example.test');
update persoon set voornaam = 'Nbsp' || char(160) where id = 4;
insert into activiteit (id, productie_id, soort, omschrijving, datum, start_at, eind_at, plandag, status) values
 (1,1,'repetitie','Gloop Rehearsal','2030-01-01','2030-01-01T10:00','2030-01-01T12:00','2030-01-01','bevestigd'),
 (2,1,'repetitie','Gloop Rehearsal','2030-01-01','2030-01-01T11:00','2030-01-01T13:00','2030-01-01','bevestigd'),
 (3,1,'repetitie','Splat','2030-01-02',null,null,'2030-01-02','optie'),
 (4,1,'repetitie','Splat','2030-01-02',null,null,'2030-01-02','bevestigd'),
 (5,1,'repetitie','Backwards','2030-01-03','2030-01-03T12:00','2030-01-03T10:00','2030-01-03','bevestigd'),
 (6,1,'repetitie','Zero','2030-01-04','2030-01-04T12:00','2030-01-04T12:00','2030-01-04','bevestigd'),
 (7,1,'repetitie','Orphan end','2030-01-05',null,'2030-01-05T12:00','2030-01-05','optie');
insert into toewijzing (activiteit_id, persoon_id, naam) values
 (1,1,null),(2,1,null),(3,3,null),(4,3,null),(99,1,null),(1,null,'Freetext Gnarlington');
insert into beschikbaarheid (persoon_id, start_at, eind_at) values (1,'2030-01-01T10:00','2030-01-01T10:00');
insert into auth_session (id_hash) values ('hash ');
`)
db.close()

const find = (key: string) => counts(profile(dbPath)).find((c) => c.key === key)

describe('data-profile planted cases', () => {
  test('activities with no start, split by status', () => {
    const c = find('activity_no_start')
    expect(c?.count).toBe(3)
    expect(c?.['status:optie']).toBe(2)
    expect(c?.['status:bevestigd']).toBe(1)
  })
  test('end before and equal to start', () => {
    expect(find('activity_end_before_start')?.count).toBe(1)
    expect(find('activity_end_equals_start')?.count).toBe(1)
  })
  test('timed overlap and same-day untimed are separate classes', () => {
    const t = find('overlap_timed')
    expect(t?.count).toBe(1)
    expect(t?.distinct_persons).toBe(1)
    const u = find('overlap_same_day_no_time')
    expect(u?.count).toBe(1)
    expect(u?.distinct_persons).toBe(1)
  })
  test('people with no assignments', () => {
    expect(find('person_no_assignments')?.count).toBe(2)
  })
  test('duplicate names and activity titles', () => {
    expect(find('person_dup_fullname')?.count).toBe(2)
    expect(find('person_dup_first_last')?.count).toBe(2)
    expect(find('activity_dup_title_same_day')?.count).toBe(4)
  })
  test('whitespace per table.column, credential tables skipped', () => {
    expect(find('ws:persoon.achternaam:leading_trailing')?.count).toBe(1)
    expect(find('ws:persoon.weergavenaam:double_space')?.count).toBe(1)
    expect(find('ws:persoon.voornaam:nbsp')?.count).toBe(1)
    expect(counts(profile(dbPath)).some((c) => c.key.startsWith('ws:auth_session'))).toBe(false)
  })
  test('extras', () => {
    expect(find('x_assignment_missing_activity')?.count).toBe(1)
    expect(find('x_assignment_name_only')?.count).toBe(1)
    expect(find('x_end_without_start')?.count).toBe(1)
    expect(find('x_availability_end_not_after_start')?.count).toBe(1)
  })
})

describe('output discipline', () => {
  test('stdout carries no planted value; detail file is 0600 and does', () => {
    const out = run(dbPath, join(dir, 'out'))
    for (const secret of ['Zorbalina', 'Quuxwell', 'Wibblesby', 'Gloop', 'Splat', 'Gnarlington', 'example.test']) {
      expect(out).not.toContain(secret)
    }
    const detail = join(dir, 'out', 'data-profile.detail.json')
    expect(statSync(detail).mode & 0o777).toBe(0o600)
    expect(readFileSync(detail, 'utf8')).toContain('Quuxwell')
    expect(readFileSync(join(dir, 'out', 'data-profile.md'), 'utf8')).not.toContain('Quuxwell')
  })
  test('refuses to write to the source db (readonly)', () => {
    const before = statSync(dbPath).mtimeMs
    profile(dbPath)
    expect(statSync(dbPath).mtimeMs).toBe(before)
  })
})
