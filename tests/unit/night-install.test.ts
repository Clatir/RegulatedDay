/**
 * The night installation on more computers (spec „Instalacja”, D162, T219) – two computers by their presences: the first
 * installs after its random wait, the next one waits for 24 h of the version on the first; a crash on the version holds
 * the next ones; unknown events of the timer install without the 24 h; of two claims at once the lower id goes first.
 */
import { describe, expect, it } from 'vitest'
import { nightDecision, nightReady, RUN_BEFORE_NEXT_MS, type NightInput, type NightState, type PeerVersions } from '@shared/nightInstall'
import { NightInstaller } from '../../src/main/update/night'

const H = 3_600_000
const T0 = Date.UTC(2026, 9, 28, 1, 0)

const night = (o: Partial<NightState> = {}): NightState => ({ now: T0, quiet: true, locked: true, idleMs: 0, onMains: true, blockRunning: false, notificationState: 'accepts', enabled: true, helperRunning: true, ...o })
const input = (o: Partial<NightInput> = {}): NightInput => ({ me: 'pcb', ready: '0.3.0', peers: [], unknownTimerEvents: false, waitFrom: null, waitMs: 0, state: night(), ...o })
const peer = (o: Partial<PeerVersions> = {}): PeerVersions => ({ computer: 'pca', appVersion: '0.2.0', versions: [{ version: '0.2.0', firstRun: T0 - 100 * H, lastRun: T0, crashes: 0 }], installing: null, ...o })

describe('warunki nocy na tym komputerze', () => {
  it('cisza nocna, blokada albo 30 min bez użycia, zasilanie z sieci, bez bloku, stan powiadomień', () => {
    expect(nightReady(night())).toBeNull()
    expect(nightReady(night({ quiet: false }))).toBe('poza ciszą nocną')
    expect(nightReady(night({ locked: false, idleMs: 29 * 60_000 }))).toBe('komputer używany w ostatnich 30 min')
    expect(nightReady(night({ locked: false, idleMs: 30 * 60_000 }))).toBeNull()
    expect(nightReady(night({ onMains: false }))).toBe('zasilanie z baterii')
    expect(nightReady(night({ blockRunning: true }))).toBe('biegnie blok')
    expect(nightReady(night({ notificationState: 'd3dFullscreen' }))).toBe('stan powiadomień: d3dFullscreen')
    // The locked screen itself is „notPresent” in the state of notifications (A5-01).
    expect(nightReady(night({ locked: true, notificationState: 'notPresent' }))).toBeNull()
    for (const s of ['busy', 'presentation', 'app']) expect(nightReady(night({ notificationState: s }))).toBe(`stan powiadomień: ${s}`)
    expect(nightReady(night({ enabled: false }))).toBe('instalacja w nocy wyłączona')
    expect(nightReady(night({ helperRunning: false }))).toBe('pomocnik nie działa')
  })
})

describe('dwa komputery', () => {
  it('laptop z nowoczesnym czuwaniem jako pierwszy instaluje od razu po blokadzie – bez losowego czekania (A5-12, T513)', () => {
    expect(nightDecision(input({ state: night({ modernStandby: true }) }))).toMatchObject({ act: 'install', version: '0.3.0' })
    // Another computer claimed it first: it waits as every other.
    expect(nightDecision(input({ state: night({ modernStandby: true }), peers: [peer({ installing: '0.3.0' })] }))).toMatchObject({ act: 'none' })
  })

  it('pierwszy instaluje bez czekania 24 h – po swoim losowym czekaniu', () => {
    const claim = nightDecision(input({ me: 'pca', peers: [peer({ computer: 'pcb' })] }))
    expect(claim).toMatchObject({ act: 'claim', version: '0.3.0' })
    expect(nightDecision(input({ me: 'pca', peers: [peer({ computer: 'pcb' })], waitFrom: T0, waitMs: 20 * 60_000, state: night({ now: T0 + 10 * 60_000 }) }))).toMatchObject({ act: 'none' })
    expect(nightDecision(input({ me: 'pca', peers: [peer({ computer: 'pcb' })], waitFrom: T0, waitMs: 20 * 60_000, state: night({ now: T0 + 20 * 60_000 }) }))).toMatchObject({ act: 'install', version: '0.3.0' })
  })

  it('kolejny czeka, aż wersja działa na innym komputerze co najmniej 24 h (czas zegarowy od jej pierwszego uruchomienia)', () => {
    const first = (since: number) => peer({ appVersion: '0.3.0', versions: [{ version: '0.3.0', firstRun: since, lastRun: T0, crashes: 0 }] })
    expect(nightDecision(input({ peers: [first(T0 - 23 * H)] }))).toMatchObject({ act: 'none', why: 'wersja 0.3.0 działa na innym komputerze krócej niż 24 h' })
    expect(nightDecision(input({ peers: [first(T0 - RUN_BEFORE_NEXT_MS)] }))).toMatchObject({ act: 'install', version: '0.3.0' })
  })

  it('komputer, który instaluje jako pierwszy („instaluję wersję X”), wstrzymuje inne do 24 h', () => {
    expect(nightDecision(input({ peers: [peer({ installing: '0.3.0' })] }))).toMatchObject({ act: 'none', why: 'inny komputer (pca) instaluje wersję 0.3.0 jako pierwszy' })
  })

  it('awaria zapisana na tej wersji wstrzymuje kolejne komputery do następnego wydania', () => {
    const crashed = peer({ appVersion: '0.3.0', versions: [{ version: '0.3.0', firstRun: T0 - 30 * H, lastRun: T0, crashes: 1 }] })
    expect(nightDecision(input({ peers: [crashed] }))).toMatchObject({ act: 'none' })
    // The next release (not crashed anywhere): this one is the first again.
    expect(nightDecision(input({ ready: '0.3.1', peers: [crashed] }))).toMatchObject({ act: 'claim', version: '0.3.1' })
  })

  it('nieznane zdarzenia timera: instalacja bez czekania 24 h najnowszego wydania bez awarii', () => {
    const young = peer({ appVersion: '0.3.0', versions: [{ version: '0.3.0', firstRun: T0 - H, lastRun: T0, crashes: 0 }] })
    expect(nightDecision(input({ peers: [young], unknownTimerEvents: true }))).toMatchObject({ act: 'install', version: '0.3.0' })
    const crashed = peer({ appVersion: '0.3.0', versions: [{ version: '0.3.0', firstRun: T0 - H, lastRun: T0, crashes: 2 }] })
    expect(nightDecision(input({ peers: [crashed], unknownTimerEvents: true }))).toMatchObject({ act: 'none' })
  })

  it('remis dwóch pierwszych: pierwszeństwo ma niższy identyfikator, drugi wycofuje „instaluję”', () => {
    expect(nightDecision(input({ me: 'pcb', peers: [peer({ installing: '0.3.0' })], waitFrom: T0 - 60_000, waitMs: 10 * 60_000 }))).toMatchObject({ act: 'yield' })
    expect(nightDecision(input({ me: 'pca', peers: [peer({ computer: 'pcb', installing: '0.3.0' })], waitFrom: T0 - 20 * 60_000, waitMs: 10 * 60_000 }))).toMatchObject({ act: 'install' })
  })

  it('w ciągu dnia nic się nie instaluje, także na pierwszym komputerze', () => {
    expect(nightDecision(input({ state: night({ quiet: false }) }))).toMatchObject({ act: 'none', why: 'poza ciszą nocną' })
  })
})

describe('instalator nocy w aplikacji', () => {
  it('pisze „instaluję”, czeka losowo i instaluje; inny pierwszy z niższym identyfikatorem cofa „instaluję”', async () => {
    let now = T0
    const claims: Array<string | null> = []
    let installs = 0
    let peers: PeerVersions[] = [peer({ computer: 'pcc' })]
    const n = new NightInstaller({
      now: () => now,
      me: () => 'pcb',
      ready: () => '0.3.0',
      peers: () => peers,
      unknownTimerEvents: async () => false,
      state: async () => night({ now }),
      claim: (v) => claims.push(v),
      install: () => (installs++, true),
      random: () => 0.5,
      log: () => undefined
    })
    await n.check()
    expect(claims).toEqual(['0.3.0'])
    now += 10 * 60_000
    await n.check()
    expect(installs).toBe(0)
    now += 6 * 60_000
    await n.check()
    expect(installs).toBe(1)

    // Another run: a computer with a lower id claims meanwhile.
    claims.length = 0
    installs = 0
    now = T0
    peers = [peer({ computer: 'pcc' })]
    const m = new NightInstaller({ now: () => now, me: () => 'pcb', ready: () => '0.3.0', peers: () => peers, unknownTimerEvents: async () => false, state: async () => night({ now }), claim: (v) => claims.push(v), install: () => (installs++, true), random: () => 0.9, log: () => undefined })
    await m.check()
    peers = [peer({ computer: 'pca', installing: '0.3.0' })]
    now += 60_000
    await m.check()
    expect(claims).toEqual(['0.3.0', null])
    expect(installs).toBe(0)
  })

  it('nowoczesne czuwanie: instalacja, która nie wystartowała, cofa „instaluję” od razu (przegląd 0.18.0)', async () => {
    const claims: Array<string | null> = []
    const n = new NightInstaller({ now: () => T0, me: () => 'pcb', ready: () => '0.3.0', peers: () => [], unknownTimerEvents: async () => false, state: async () => night({ modernStandby: true }), claim: (v) => claims.push(v), install: () => false, log: () => undefined })
    await n.check()
    expect(claims).toEqual(['0.3.0', null])
  })

  it('po starcie instalacji w nocy żadne sprawdzenie nie cofa „instaluję” (wersja gotowa znika w trakcie wychodzenia)', async () => {
    let now = T0
    let ready: string | null = '0.3.0'
    let installs = 0
    const claims: Array<string | null> = []
    const n = new NightInstaller({ now: () => now, me: () => 'pcb', ready: () => ready, peers: () => [], unknownTimerEvents: async () => false, state: async () => night({ now }), claim: (v) => claims.push(v), install: () => (installs++, true), random: () => 0, log: () => undefined })
    await n.check()
    now += 60_000
    await n.check()
    expect(installs).toBe(1)
    // Quitting: the controller says no version is ready while it installs.
    ready = null
    now += 60_000
    await n.check()
    expect(claims).toEqual(['0.3.0', '0.3.0'])
    expect(installs).toBe(1)
  })

  it('„instaluję” wraca, gdy noc przestaje sprzyjać (bateria, koniec ciszy, wyłączone ustawienie) – nie wstrzymuje innych', async () => {
    let now = T0
    let quiet = true
    const claims: Array<string | null> = []
    const n = new NightInstaller({ now: () => now, me: () => 'pcb', ready: () => '0.3.0', peers: () => [], unknownTimerEvents: async () => false, state: async () => night({ now, quiet }), claim: (v) => claims.push(v), install: () => true, random: () => 0.5, log: () => undefined })
    await n.check()
    quiet = false
    now += 60_000
    await n.check()
    expect(claims).toEqual(['0.3.0', null])
  })
})
