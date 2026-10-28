/**
 * The leading computer and the gate of minutes (spec „Kilka komputerów”): the latest presence by this computer's own
 * clock, the leader keeps it until it hands over after 150 s without presence, a silent or closed leader passes it on,
 * older rules give way, a crashed version is never the newest, OneDrive not running.
 */
import { describe, expect, it } from 'vitest'
import { decideLeader, minuteGate, soundComputer, type LeaderInput, type Peer } from '@shared/sync/leader'
import type { Presence } from '@shared/sync/presence'

const T = 10_000_000
const presence = (computer: string, p: Partial<Presence> = {}): Presence => ({
  format: 1,
  computer,
  name: computer,
  windowsId: null,
  appVersion: '0.2.0',
  rulesVersion: 1,
  versions: [],
  installing: null,
  lastPresence: T,
  lastUse: T,
  lastOutsideInput: T,
  state: 'used',
  locked: false,
  power: null,
  seenLeader: null,
  settled: true,
  lastEvents: {},
  writtenAt: T,
  ...p
})
const peer = (computer: string, seenAt: number | null, fileSeenAt: number, p: Partial<Presence> = {}, crashed = false): Peer => ({ presence: presence(computer, p), presenceSeenAt: seenAt, fileSeenAt, crashed })
const input = (over: Omit<Partial<LeaderInput>, 'self'> & { self?: Partial<LeaderInput['self']> }): LeaderInput => ({
  now: T,
  current: null,
  peers: [],
  ...over,
  self: { computer: 'pca', rulesVersion: 1, crashed: false, lastPresence: T, oneDriveRunning: true, ...over.self }
})

describe('komputer prowadzący', () => {
  it('jedyny komputer prowadzi', () => {
    expect(decideLeader(input({})).iLead).toBe(true)
  })

  it('prowadzący zostaje nim, dopóki ma obecność, także gdy inny jest używany (bez przekazywania co chwilę)', () => {
    const d = decideLeader(input({ current: 'pca', self: { lastPresence: T - 60_000 }, peers: [peer('pcb', T, T)] }))
    expect(d.leader).toBe('pca')
  })

  it('oddaje prowadzenie po 150 s bez obecności, gdy widzi nowszą obecność innego komputera', () => {
    const d = decideLeader(input({ current: 'pca', self: { lastPresence: T - 151_000 }, peers: [peer('pcb', T - 10_000, T - 10_000)] }))
    expect(d).toMatchObject({ leader: 'pcb', iLead: false })
  })

  it('nowszość ocenia lokalnym czasem zobaczenia zmiany, nie zegarem drugiego komputera', () => {
    // B's own clock says its presence is from „the future”, but this computer saw it change long ago.
    const d = decideLeader(input({ current: 'pca', self: { lastPresence: T - 200_000 }, peers: [peer('pcb', T - 300_000, T - 20_000, { lastPresence: T + 3_600_000 })] }))
    expect(d.leader).toBe('pca')
  })

  it('nowy komputer przejmuje zadania, dopiero gdy poprzedni wskaże go jako widzianego prowadzącego', () => {
    const notYet = decideLeader(input({ current: 'pcb', peers: [peer('pcb', T - 200_000, T - 30_000, { seenLeader: 'pcb' })] }))
    expect(notYet.iLead).toBe(false)
    const handed = decideLeader(input({ current: 'pcb', currentClaimed: true, peers: [peer('pcb', T - 200_000, T - 30_000, { seenLeader: 'pca' })] }))
    expect(handed.iLead).toBe(true)
  })

  it('tuż po przekazaniu: plik nowego prowadzącego, zapisany zanim je zobaczył, wskazuje starego – to nie jest oddanie z powrotem', () => {
    // pca handed the lead to pcb; pcb has not taken it yet (its file still names pca).
    const stale = decideLeader(input({ current: 'pcb', currentClaimed: false, self: { lastPresence: T - 200_000 }, peers: [peer('pcb', T - 10_000, T - 10_000, { seenLeader: 'pca' })] }))
    expect(stale).toMatchObject({ leader: 'pcb', iLead: false, claimed: false })
    // Once pcb is seen leading, its pointing away counts.
    const claimed = decideLeader(input({ current: 'pcb', currentClaimed: false, self: { lastPresence: T - 200_000 }, peers: [peer('pcb', T - 10_000, T - 10_000, { seenLeader: 'pcb' })] }))
    expect(claimed.claimed).toBe(true)
  })

  it('albo gdy poprzedni zapisał „zamknięty”, albo nie odświeżył obecności od 10 min', () => {
    expect(decideLeader(input({ current: 'pcb', peers: [peer('pcb', T - 1000, T - 1000, { state: 'closed' })] })).iLead).toBe(true)
    expect(decideLeader(input({ current: 'pcb', peers: [peer('pcb', T - 11 * 60_000, T - 10 * 60_000)] })).iLead).toBe(true)
    expect(decideLeader(input({ current: 'pcb', peers: [peer('pcb', T - 11 * 60_000, T - 9 * 60_000)] })).iLead).toBe(false)
  })

  it('starsze reguły prowadzą tylko, gdy przy komputerze z najnowszymi nie było obecności od 10 min', () => {
    const newer = peer('pcb', T - 5 * 60_000, T - 60_000, { rulesVersion: 2 })
    expect(decideLeader(input({ current: 'pca', peers: [newer] })).iLead).toBe(false)
    const silentNewer = peer('pcb', T - 11 * 60_000, T - 60_000, { rulesVersion: 2 })
    expect(decideLeader(input({ current: 'pca', peers: [silentNewer] })).iLead).toBe(true)
    const handedOver = peer('pcb', T - 5 * 60_000, T - 60_000, { rulesVersion: 2, seenLeader: 'pca' })
    expect(decideLeader(input({ current: 'pca', peers: [handedOver] })).iLead).toBe(true)
  })

  it('komputer z nowszymi regułami w użyciu, który idzie za prowadzącym ze starszymi, dostaje prowadzenie (A8-08)', () => {
    // pcb follows pca (its file names pca) while you use it: that is no handover – pca gives way and points at pcb.
    const following = peer('pcb', T - 30_000, T - 30_000, { rulesVersion: 2, seenLeader: 'pca' })
    const old = decideLeader(input({ current: 'pca', peers: [following] }))
    expect(old).toMatchObject({ leader: 'pcb', iLead: false, why: 'starsza wersja reguł oddaje prowadzenie' })
    // pcb sees pca (seen leading) point at it: it takes the lead.
    const pcaGave = peer('pca', T - 60_000, T - 10_000, { rulesVersion: 1, seenLeader: 'pcb' })
    expect(decideLeader(input({ current: 'pca', currentClaimed: true, self: { computer: 'pcb', rulesVersion: 2 }, peers: [pcaGave] })).iLead).toBe(true)
  })

  it('komputer z nowszymi regułami przejmuje dopiero, gdy prowadzący ze starszymi go wskaże – nigdy dwaj naraz (A8-08)', () => {
    const self = { rulesVersion: 2 }
    const oldLeading = peer('pcb', T - 60_000, T - 60_000, { rulesVersion: 1, seenLeader: 'pcb' })
    expect(decideLeader(input({ current: 'pcb', currentClaimed: true, self, peers: [oldLeading] })).iLead).toBe(false)
    const handed = peer('pcb', T - 60_000, T - 30_000, { rulesVersion: 1, seenLeader: 'pca' })
    expect(decideLeader(input({ current: 'pcb', currentClaimed: true, self, peers: [handed] })).iLead).toBe(true)
  })

  it('wersja z zapisaną awarią nie liczy się jako najnowsza', () => {
    const crashedNewer = peer('pcb', T - 5 * 60_000, T - 60_000, { rulesVersion: 2 }, true)
    expect(decideLeader(input({ current: 'pca', peers: [crashedNewer] })).iLead).toBe(true)
  })

  it('przy starcie: świeży komputer, który prowadzi, prowadzi dalej', () => {
    const d = decideLeader(input({ current: null, peers: [peer('pcb', null, T - 60_000, { seenLeader: 'pcb', lastPresence: T - 100_000 })] }))
    expect(d.leader).toBe('pcb')
  })

  it('bez działającego OneDrive: prowadzi dalej, a przejmuje, gdy sam ma obecność i inne milczą od 10 min', () => {
    const others = [peer('pcb', T - 20 * 60_000, T - 20 * 60_000, { seenLeader: 'pcb' })]
    expect(decideLeader(input({ current: 'pca', self: { oneDriveRunning: false, lastPresence: T - 900_000 }, peers: others })).iLead).toBe(true)
    expect(decideLeader(input({ current: 'pcb', self: { oneDriveRunning: false, lastPresence: T - 30_000 }, peers: others })).iLead).toBe(true)
    const recent = [peer('pcb', T - 5 * 60_000, T - 20 * 60_000, { seenLeader: 'pcb' })]
    expect(decideLeader(input({ current: 'pcb', self: { oneDriveRunning: false, lastPresence: T - 30_000 }, peers: recent })).iLead).toBe(false)
  })

  it('dwa prowadzące po wstrzymanej synchronizacji: zostaje niższy identyfikator', () => {
    const d = decideLeader(input({ current: 'pcb', self: { computer: 'pcb' }, peers: [peer('pca', T - 10_000, T - 10_000, { seenLeader: 'pca' })] }))
    expect(d.leader).toBe('pca')
  })
})

describe('bramka minut', () => {
  it('minuta czeka na obecność zapisaną po niej i na zdarzenie, które ta obecność podaje', () => {
    const p = peer('pcb', T - 30_000, T - 30_000, { lastEvents: { '2026-10-21': 7 } })
    expect(minuteGate(T, '2026-10-21', [p], { pcb: 7 })).toBe(T - 30_000)
    expect(minuteGate(T, '2026-10-21', [p], { pcb: 6 })).toBe(Number.NEGATIVE_INFINITY)
    // A computer without a fresh presence (10 min) is not waited for.
    const stale = peer('pcc', T - 11 * 60_000, T - 11 * 60_000, { lastEvents: { '2026-10-21': 9 } })
    expect(minuteGate(T, '2026-10-21', [stale], {})).toBe(T)
  })
})

describe('dźwięk na jednym komputerze (A8-04)', () => {
  const sound = (peers: Peer[], o: { selfAt?: number | null; leader?: string | null; recorder?: string | null; oneDrive?: boolean } = {}) =>
    soundComputer({ now: T, self: { computer: 'pca', lastPresence: o.selfAt === undefined ? T - 60_000 : o.selfAt }, peers, leader: o.leader ?? 'pca', recorders: o.recorder ? [o.recorder] : [], oneDriveRunning: o.oneDrive ?? true })

  it('gra komputer z najnowszą obecnością, bez względu na jej wiek', () => {
    expect(sound([peer('pcb', T - 10_000, T - 10_000)])).toBe('pcb')
    expect(sound([peer('pcb', T - 3 * 3_600_000, T - 60_000)], { selfAt: T - 4 * 3_600_000 })).toBe('pcb')
    expect(sound([peer('pcb', T - 120_000, T - 60_000)])).toBe('pca')
  })

  it('uśpiony (plik starszy niż 10 min) i zamknięty nie grają; nagrywający w czasie wykładu nigdy', () => {
    expect(sound([peer('pcb', T - 10_000, T - 11 * 60_000)])).toBe('pca')
    expect(sound([peer('pcb', T - 10_000, T - 10_000, { state: 'closed' })])).toBe('pca')
    expect(sound([peer('pcb', T - 10_000, T - 10_000)], { recorder: 'pcb' })).toBe('pca')
    expect(sound([], { recorder: 'pca' })).toBeNull()
  })

  it('plik bez „ostatniej obecności” (aplikacja uruchomiona bez nikogo) nie ma obecności; bez OneDrive nikt nie jest uśpiony (przegląd 0.23.0)', () => {
    expect(sound([peer('pcb', T - 1_000, T - 1_000, { lastPresence: null })])).toBe('pca')
    expect(sound([peer('pcb', T - 10_000, T - 11 * 60_000)], { oneDrive: false })).toBe('pcb')
  })

  it('odblokowanie ekranu na komputerze z blokadą usypiania bloku pasywnego liczy się jak obecność – tylko tu (D331)', () => {
    // The user watches a lecture on pcb (screen unlocked, no input); pca had input a minute ago.
    expect(sound([peer('pcb', T - 10 * 60_000, T - 10_000, { soundPresence: T - 20_000 })], { selfAt: T - 60_000 })).toBe('pcb')
    // Seen changing by this computer's clock: its own clock is never trusted.
    expect(sound([{ ...peer('pcb', T - 10 * 60_000, T - 10_000, { soundPresence: T + 3_600_000 }), soundSeenAt: T - 90_000 }], { selfAt: T - 60_000 })).toBe('pca')
    expect(soundComputer({ now: T, self: { computer: 'pca', lastPresence: T - 60_000, soundPresence: T - 5_000 }, peers: [peer('pcb', T - 20_000, T - 20_000)], leader: 'pcb', recorders: [], oneDriveRunning: true })).toBe('pca')
  })

  it('remis – prowadzący, potem niższy identyfikator', () => {
    expect(sound([peer('pcb', T - 60_000, T - 60_000)], { leader: 'pcb' })).toBe('pcb')
    expect(sound([peer('pcb', T - 60_000, T - 60_000)], { leader: null })).toBe('pca')
  })
})
