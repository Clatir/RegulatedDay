/**
 * The leading computer (spec „Kilka komputerów”): the one with the latest presence at the computer by the synced
 * presences. What is newer is decided by the local time this computer saw the field „last presence” change in the other's
 * file, never by the other's clock (on the first read after the start: now minus the time in its content, not below 0).
 * The leader stays one until it hands over itself – after at least 150 s without presence at it while it sees a newer
 * presence of another computer – so two computers used at once do not pass it to each other. A new computer takes the
 * leader's tasks only when the leader's presence points at it, when the leader wrote „closed”, or when the leader did
 * not refresh its presence for 10 min. A computer with older rules leads only when no computer with the newest rules had
 * presence in the last 10 min, or one handed over to it; a version with a recorded crash never counts as the newest.
 * Without a running OneDrive a computer does not take others for asleep for lack of changes; it keeps leading if it
 * leads, and takes over when it has presence in the last 150 s and no other computer had any in the last 10 min.
 * Pure: the scheduler feeds it what the files and this computer's clock say.
 */
import { FRESH_MS, type Presence } from './presence'

export const HANDOVER_MS = 150_000
export const SILENT_MS = 10 * 60_000

export interface Peer {
  presence: Presence
  /** This computer's clock when it saw the peer's „last presence” change; null before it saw a change. */
  presenceSeenAt: number | null
  /** This computer's clock when it last saw the peer's file change at all. */
  fileSeenAt: number
  /** The peer's running version has a recorded crash. */
  crashed: boolean
}

export interface LeaderInput {
  now: number
  self: {
    computer: string
    rulesVersion: number
    crashed: boolean
    lastPresence: number | null
    oneDriveRunning: boolean
  }
  peers: readonly Peer[]
  /** Who this computer took for the leader at its last decision (null at the start). */
  current: string | null
  /**
   * The current leader has been seen taking the lead itself (its presence pointing at itself) since this computer took it
   * for the leader. Only then does its presence pointing elsewhere hand the lead over: right after a handover the new
   * leader's file still names the old one, written before it saw the handover (T415).
   */
  currentClaimed?: boolean
}

export interface LeaderDecision {
  /** Who leads, as this computer sees it (written into its presence as „widziany prowadzący”). */
  leader: string | null
  iLead: boolean
  why: string
  /** For the next decision: the leader has been seen taking the lead. */
  claimed: boolean
}

/** The local time of a peer's last presence (not after now). */
function presenceTime(p: Peer, now: number): number | null {
  if (p.presenceSeenAt != null) return Math.min(p.presenceSeenAt, now)
  const own = p.presence.lastPresence
  return own == null ? null : Math.min(own, now)
}

export function decideLeader(inp: LeaderInput): LeaderDecision {
  const { now, self } = inp
  // Peers that count: not closed, and – unless OneDrive does not run here – refreshed within 10 min.
  const awake = inp.peers.filter((p) => p.presence.state !== 'closed' && (!self.oneDriveRunning || now - p.fileSeenAt < SILENT_MS || p.fileSeenAt > now))
  const byId = new Map(awake.map((p) => [p.presence.computer, p]))
  const selfTime = self.lastPresence
  const times = new Map<string, number | null>([[self.computer, selfTime], ...awake.map((p) => [p.presence.computer, presenceTime(p, now)] as const)])

  // The newest rules among computers whose version has no crash recorded (all of them when every one crashed).
  const versions = [{ id: self.computer, v: self.rulesVersion, crashed: self.crashed }, ...awake.map((p) => ({ id: p.presence.computer, v: p.presence.rulesVersion, crashed: p.crashed }))]
  const sane = versions.filter((x) => !x.crashed)
  const newest = Math.max(...(sane.length ? sane : versions).map((x) => x.v))
  const versionOf = (id: string) => versions.find((x) => x.id === id)?.v ?? 0
  /** May `id` lead under the rule of versions: newest rules, or no newest-rules computer present in 10 min, or handed over to. */
  const mayLead = (id: string): boolean => {
    if (versionOf(id) >= newest) return true
    for (const x of versions) {
      if (x.v < newest || x.crashed || x.id === id) continue
      const t = times.get(x.id)
      const handedOver = x.id === self.computer ? false : byId.get(x.id)?.presence.seenLeader === id
      if (handedOver) continue
      if (t != null && now - t < SILENT_MS) return false
    }
    return true
  }
  /** The latest presence among those who may lead (ties: the lower id). */
  const latest = (exclude: string | null = null): string | null => {
    let best: string | null = null
    let bestT = Number.NEGATIVE_INFINITY
    for (const [id, t] of times) {
      if (id === exclude || !mayLead(id)) continue
      const tt = t ?? Number.NEGATIVE_INFINITY
      if (tt > bestT || (tt === bestT && best != null && id < best)) {
        best = id
        bestT = tt
      }
    }
    return best
  }
  const decide = (leader: string | null, why: string): LeaderDecision => {
    const claimsNow = leader === self.computer || inp.peers.some((p) => p.presence.computer === leader && p.presence.seenLeader === leader)
    return { leader, iLead: leader === self.computer, why, claimed: claimsNow || (leader === inp.current && inp.currentClaimed === true) }
  }

  if (!awake.length) return decide(self.computer, 'żaden inny komputer nie ma świeżej obecności')

  if (!self.oneDriveRunning) {
    const othersSilent = awake.every((p) => {
      const t = presenceTime(p, now)
      return t == null || now - t >= SILENT_MS
    })
    if (inp.current === self.computer) return decide(self.computer, 'OneDrive nie działa – prowadzi dalej')
    if (selfTime != null && now - selfTime < HANDOVER_MS && othersSilent) return decide(self.computer, 'OneDrive nie działa – przejmuje, inne bez obecności od 10 min')
    return decide(inp.current, 'OneDrive nie działa – nie uznaje innych za uśpione')
  }

  let current = inp.current
  if (current == null) {
    // At the start: a fresh peer that leads (points at itself) keeps leading; else the latest presence.
    const claiming = awake.filter((p) => p.presence.seenLeader === p.presence.computer).map((p) => p.presence.computer).sort()
    current = claiming[0] ?? latest()
  }

  if (current === self.computer) {
    // Rules: an older version gives way to a newest-rules computer present in the last 10 min.
    if (!mayLead(self.computer)) return decide(latest(self.computer), 'starsza wersja reguł oddaje prowadzenie')
    // Two leaders after a pause of sync: the lower id keeps it (both used – no passing back and forth).
    const rival = awake.find((p) => p.presence.seenLeader === p.presence.computer && mayLead(p.presence.computer))
    if (rival && rival.presence.computer < self.computer) {
      const rt = presenceTime(rival, now)
      if (rt != null && now - rt < HANDOVER_MS) return decide(rival.presence.computer, 'dwa prowadzące – zostaje niższy identyfikator')
    }
    const idle = selfTime == null || now - selfTime >= HANDOVER_MS
    if (idle) {
      const next = latest()
      if (next && next !== self.computer && (times.get(next) ?? -Infinity) > (selfTime ?? -Infinity)) return decide(next, 'oddaje prowadzenie: 150 s bez obecności, nowsza obecność gdzie indziej')
    }
    return decide(self.computer, 'prowadzi')
  }

  // Another computer leads: its tasks pass only when it handed over, wrote „closed” or went silent for 10 min.
  const leaderPeer = current ? inp.peers.find((p) => p.presence.computer === current) : undefined
  // At the start (no belief yet) a leader found by its own claim has claimed; later only a claim seen counts.
  const claimed = inp.current == null ? leaderPeer?.presence.seenLeader === current : inp.currentClaimed === true
  const handedTo = claimed && leaderPeer?.presence.seenLeader && leaderPeer.presence.seenLeader !== current ? leaderPeer.presence.seenLeader : null
  const closed = leaderPeer?.presence.state === 'closed'
  const silent = !leaderPeer || now - leaderPeer.fileSeenAt >= SILENT_MS
  if (current && !mayLead(current) && mayLead(self.computer)) {
    // The leader runs older rules while this one has the newest and presence: it gives way to the latest present.
    const next = latest()
    return decide(next, 'prowadzący ma starszą wersję reguł')
  }
  if (handedTo) return decide(handedTo, 'prowadzący oddał prowadzenie')
  if (closed || silent) return decide(latest(current), closed ? 'prowadzący zamknięty' : 'prowadzący bez obecności od 10 min')
  return decide(current, 'prowadzi inny komputer')
}

/**
 * The gate of the minutes (spec „Minuta jest zapisywana dopiero wtedy …”): the latest instant up to which every computer
 * with a fresh presence has written its presence after it, and the last event that presence names is already visible in
 * its log. A computer nobody uses writes its presence every 5 min, so minutes never wait for its events.
 */
export function minuteGate(now: number, day: string, peers: readonly Peer[], visibleLast: Readonly<Record<string, number>>): number {
  let gate = now
  for (const p of peers) {
    if (p.presence.state === 'closed' || now - p.fileSeenAt >= FRESH_MS) continue
    const named = p.presence.lastEvents[day] ?? -1
    const visible = visibleLast[p.presence.computer] ?? -1
    // Its presence is after the minute only up to the moment this computer saw it written.
    const upTo = named > visible ? Number.NEGATIVE_INFINITY : Math.min(p.fileSeenAt, now)
    gate = Math.min(gate, upTo)
  }
  return gate
}
