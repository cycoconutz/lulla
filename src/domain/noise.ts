// Noise machine: a synthesized sound loop for helping baby sleep.
// Every sound is generated with the Web Audio API, so nothing is downloaded
// and the offline SW bundle stays untouched. The whole graph is routed
// through a looping <audio> element fed by a MediaStream so playback keeps
// running when the screen locks and the phone goes to background.

export const NOISE_SOUNDS = [
  { id: 'white', label: 'White noise' },
  { id: 'pink', label: 'Pink noise' },
  { id: 'brown', label: 'Brown noise' },
  { id: 'rain', label: 'Rain' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'wind', label: 'Wind' },
  { id: 'fan', label: 'Fan' },
  { id: 'fire', label: 'Fireplace' },
  { id: 'heartbeat', label: 'Heartbeat' },
  { id: 'thunder', label: 'Thunder' },
] as const

export type NoiseSound = (typeof NOISE_SOUNDS)[number]['id']

export const NOISE_FADE_MINUTES = [0, 15, 30, 60] as const

export interface NoiseSettings {
  enabled: boolean
  sound: NoiseSound
  volume: number
  fadeMinutes: number
}

export const DEFAULT_SOUND: NoiseSound = 'brown'
export const DEFAULT_VOLUME = 0.6
export const DEFAULT_FADE_MINUTES = 30

export function defaultNoiseSettings(): NoiseSettings {
  return { enabled: false, sound: DEFAULT_SOUND, volume: DEFAULT_VOLUME, fadeMinutes: DEFAULT_FADE_MINUTES }
}

export function clampNoiseVolume(value: unknown): number {
  if (value == null || value === '') return DEFAULT_VOLUME
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_VOLUME
  return Math.min(1, Math.max(0, n))
}

export function normalizeFadeMinutes(value: unknown): number {
  if (value == null || value === '') return DEFAULT_FADE_MINUTES
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_FADE_MINUTES
  // Snap legacy off-grid values to the supported options.
  return NOISE_FADE_MINUTES.reduce((best, m) => {
    const db = Math.abs(best - n)
    const dm = Math.abs(m - n)
    if (dm < db) return m
    if (dm > db) return best
    // tie: prefer the larger option
    return m > best ? m : best
  }, NOISE_FADE_MINUTES[0])
}

function isNoiseSound(value: unknown): value is NoiseSound {
  return NOISE_SOUNDS.some((s) => s.id === value)
}

/** Coerce a stored noise row. Missing or junk fields fall back to defaults. */
export function normalizeNoiseSettings(raw: unknown): NoiseSettings {
  const fallback = defaultNoiseSettings()
  if (!raw || typeof raw !== 'object') return fallback
  const r = raw as Partial<NoiseSettings>
  return {
    enabled: r.enabled === true,
    sound: isNoiseSound(r.sound) ? r.sound : fallback.sound,
    volume: clampNoiseVolume(r.volume),
    fadeMinutes: normalizeFadeMinutes(r.fadeMinutes),
  }
}

// ---- engine ----

export interface NoisePlayOpts {
  sound: NoiseSound
  volume: number
  fadeMinutes: number
  onFadeEnd?: () => void
}

interface Session {
  stop: () => void
}

/** Safety cap so full volume tuning stays comfortable no matter the sound. */
const OUTPUT_SCALE = 0.75

let ctx: AudioContext | null = null
let master: GainNode | null = null
let mediaDest: MediaStreamAudioDestinationNode | null = null
let audioEl: HTMLAudioElement | null = null
let session: Session | null = null
let playing = false
let route: 'stream' | 'direct' | null = null
let currentVolume = 0
let fadeTimer: number | null = null
let fadeEndTimer: number | null = null
let fadeEndCb: (() => void) | null = null
let pendingStop: number | null = null
let lastOpts: NoisePlayOpts | null = null
// Bumped whenever playback is stopped or (re)started, so a playNoise that was
// awaiting a suspended context resume can tell it was superseded and back out.
let generation = 0
const listeners = new Set<() => void>()

let bufCtx: AudioContext | null = null
let whiteBuf: AudioBuffer | null = null
let pinkBuf: AudioBuffer | null = null
let brownBuf: AudioBuffer | null = null

function notify(): void {
  listeners.forEach((l) => l())
}

export function subscribeNoise(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function isNoisePlaying(): boolean {
  return playing
}

function audioCtor(): (new () => AudioContext) | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as {
    AudioContext?: new () => AudioContext
    webkitAudioContext?: new () => AudioContext
  }
  return w.AudioContext ?? w.webkitAudioContext
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = audioCtor()
  if (!Ctor) return null
  ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = 0
  try {
    mediaDest = ctx.createMediaStreamDestination()
    audioEl = document.createElement('audio')
    audioEl.srcObject = mediaDest.stream
    audioEl.loop = true
audioEl.autoplay = true
    try {
      ;(audioEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
    } catch {
      // no-op in older DOM types
    }
    audioEl.setAttribute('playsinline', '')
    audioEl.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;'
    // Keep the element in the DOM: a detached media element is unreliable for
    // MediaStream playback on iOS and stops when the screen locks.
    if (document.body) document.body.appendChild(audioEl)
  } catch {
    mediaDest = null
    audioEl = null
  }
  return ctx
}

function ensureRoutes(c: AudioContext): void {
  if (route || !master) return
  if (mediaDest && audioEl) {
    master.connect(mediaDest)
    route = 'stream'
  } else {
    master.connect(c.destination)
    route = 'direct'
  }
}

async function startElement(): Promise<void> {
  if (route !== 'stream' || !audioEl || !master) return
  let retried = false
  const play = async (): Promise<void> => {
    try {
      if (audioEl!.paused) await audioEl!.play()
    } catch (e) {
      if (!retried && (e as DOMException | undefined)?.name === 'AbortError') {
        retried = true
        await play()
        return
      }
      try {
        master!.disconnect()
      } catch {
        // already disconnected
      }
      if (ctx) master!.connect(ctx.destination)
      route = 'direct'
      try {
        audioEl!.pause()
      } catch {
        // no-op
      }
    }
  }
  if (audioEl.paused) await play()
}

function clearPendingStop(): void {
  if (pendingStop !== null) {
    window.clearTimeout(pendingStop)
    pendingStop = null
  }
}

function clearFade(): void {
  if (fadeTimer !== null) {
    window.clearTimeout(fadeTimer)
    fadeTimer = null
  }
  if (fadeEndTimer !== null) {
    window.clearTimeout(fadeEndTimer)
    fadeEndTimer = null
  }
  fadeEndCb = null
}

function makeNoiseBuffer(c: AudioContext, color: 'white' | 'pink' | 'brown'): AudioBuffer {
  const rate = c.sampleRate
  const len = Math.floor(rate * 5)
  const buf = c.createBuffer(1, len, rate)
  const data = buf.getChannelData(0)
  if (color === 'white') {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  } else if (color === 'pink') {
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let b3 = 0
    let b4 = 0
    let b5 = 0
    let b6 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
  } else {
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02
      data[i] = last * 3.5
    }
  }
  // Blend the tail into the head so the loop point does not click.
  const fade = Math.min(Math.floor(rate * 0.2), Math.floor(len / 4))
  for (let i = 0; i < fade; i++) {
    const t = i / fade
    data[len - fade + i] = data[len - fade + i] * (1 - t) + data[i] * t
  }
  return buf
}

function buffers(c: AudioContext): { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer } {
  if (bufCtx !== c) {
    bufCtx = c
    whiteBuf = null
    pinkBuf = null
    brownBuf = null
  }
  const w = (whiteBuf ??= makeNoiseBuffer(c, 'white'))
  const p = (pinkBuf ??= makeNoiseBuffer(c, 'pink'))
  const b = (brownBuf ??= makeNoiseBuffer(c, 'brown'))
  return { white: w, pink: p, brown: b }
}

type NoiseColorBuffer = AudioBuffer

function buildSession(c: AudioContext, sound: NoiseSound, out: GainNode): Session {
  const bufs = buffers(c)
  const live = new Set<AudioScheduledSourceNode>()
  const intervals = new Set<number>()
  const entry = c.createGain()
  entry.connect(out)

  const track = <T extends AudioScheduledSourceNode>(s: T, cleanup?: () => void): T => {
    live.add(s)
    s.onended = () => {
      live.delete(s)
      try {
        s.disconnect()
      } catch {
        // already disconnected
      }
      try {
        cleanup?.()
      } catch {
        // no-op
      }
    }
    return s
  }

  const loop = (buf: NoiseColorBuffer, rate = 1): AudioBufferSourceNode => {
    const s = c.createBufferSource()
    s.buffer = buf
    s.loop = true
    s.playbackRate.value = rate
    s.start()
    return track(s)
  }

  const gain = (value: number): GainNode => {
    const g = c.createGain()
    g.gain.value = value
    return g
  }

  const filter = (type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode => {
    const f = c.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    return f
  }

  const every = (ms: number, fn: () => void): void => {
    intervals.add(window.setInterval(fn, ms))
  }

  // Short filtered-noise burst used for rain drops, fire cracks and thunder cracks.
  const burst = (opts: {
    bandBase: number
    bandRange: number
    q: number
    peak: number
    durMs: number
  }): void => {
    const t = c.currentTime + Math.random() * 0.05
    const s = c.createBufferSource()
    s.buffer = bufs.white
    s.loop = false
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = opts.bandBase + Math.random() * opts.bandRange
    bp.Q.value = opts.q
    const g = c.createGain()
    const durS = opts.durMs / 1000
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(opts.peak, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + durS)
    s.connect(bp)
    bp.connect(g)
    g.connect(entry)
    s.start(t, Math.random() * 4)
    s.stop(t + durS + 0.05)
    track(s, () => {
      bp.disconnect()
      g.disconnect()
    })
  }

  const thump = (t: number, f: number, peak: number, dur: number): void => {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(f * 1.5, t)
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + dur)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(entry)
    o.start(t)
    o.stop(t + dur + 0.03)
    track(o, () => {
      g.disconnect()
    })
  }

  switch (sound) {
    case 'white': {
      const g = gain(0.45)
      loop(bufs.white).connect(g)
      g.connect(entry)
      break
    }
    case 'pink': {
      const g = gain(0.5)
      loop(bufs.pink).connect(g)
      g.connect(entry)
      break
    }
    case 'brown': {
      const lp = filter('lowpass', 600, 0.7)
      const g = gain(0.95)
      loop(bufs.brown).connect(lp)
      lp.connect(g)
      g.connect(entry)
      break
    }
    case 'rain': {
      const hp = filter('highpass', 420, 0.7)
      const lp = filter('lowpass', 6200, 0.7)
      const bed = gain(0.22)
      loop(bufs.white).connect(hp)
      hp.connect(lp)
      lp.connect(bed)
      bed.connect(entry)
      every(80, () => {
        if (Math.random() > 0.5) return
        burst({
          bandBase: 1600,
          bandRange: 3600,
          q: 7,
          peak: 0.05 + Math.random() * 0.13,
          durMs: 50 + Math.random() * 70,
        })
      })
      break
    }
    case 'ocean': {
      const lp = filter('lowpass', 520, 0.7)
      const bed = gain(0.5)
      loop(bufs.brown).connect(lp)
      lp.connect(bed)
      bed.connect(entry)
      const lfo = c.createOscillator()
      lfo.frequency.value = 0.09
      const lfoG = gain(0.35)
      lfo.connect(lfoG)
      lfoG.connect(bed.gain)
      lfo.start()
      track(lfo)
      const bp = filter('bandpass', 1100, 0.6)
      const surf = gain(0.16)
      loop(bufs.pink).connect(bp)
      bp.connect(surf)
      surf.connect(entry)
      const lfo2 = c.createOscillator()
      lfo2.frequency.value = 0.055
      const lfoG2 = gain(0.1)
      lfo2.connect(lfoG2)
      lfoG2.connect(surf.gain)
      lfo2.start()
      track(lfo2)
      break
    }
    case 'wind': {
      const bp = filter('bandpass', 620, 0.9)
      const g = gain(0.5)
      loop(bufs.pink).connect(bp)
      bp.connect(g)
      g.connect(entry)
      const lfo = c.createOscillator()
      lfo.frequency.value = 0.065
      const lfoG = gain(320)
      lfo.connect(lfoG)
      lfoG.connect(bp.frequency)
      lfo.start()
      track(lfo)
      const lfo2 = c.createOscillator()
      lfo2.frequency.value = 0.045
      const lfoG2 = gain(0.28)
      lfo2.connect(lfoG2)
      lfoG2.connect(g.gain)
      lfo2.start()
      track(lfo2)
      break
    }
    case 'fan': {
      const lp = filter('lowpass', 720, 0.7)
      const bed = gain(0.5)
      loop(bufs.brown).connect(lp)
      lp.connect(bed)
      bed.connect(entry)
      const bp = filter('bandpass', 1750, 1.1)
      const hiss = gain(0.05)
      loop(bufs.white).connect(bp)
      bp.connect(hiss)
      hiss.connect(entry)
      const hum1 = c.createOscillator()
      hum1.frequency.value = 62
      const g1 = gain(0.05)
      hum1.connect(g1)
      g1.connect(entry)
      hum1.start()
      track(hum1)
      const hum2 = c.createOscillator()
      hum2.frequency.value = 124
      const g2 = gain(0.022)
      hum2.connect(g2)
      g2.connect(entry)
      hum2.start()
      track(hum2)
      const flutter = c.createOscillator()
      flutter.frequency.value = 11
      const flutterG = gain(0.05)
      flutter.connect(flutterG)
      flutterG.connect(bed.gain)
      flutter.start()
      track(flutter)
      break
    }
    case 'fire': {
      const lp = filter('lowpass', 340, 0.7)
      const bed = gain(0.55)
      loop(bufs.brown).connect(lp)
      lp.connect(bed)
      bed.connect(entry)
      every(60, () => {
        if (Math.random() < 0.03) {
          burst({ bandBase: 700, bandRange: 600, q: 3, peak: 0.3, durMs: 300 })
        }
        if (Math.random() < 0.4) {
          const n = 1 + Math.floor(Math.random() * 3)
          for (let i = 0; i < n; i++) {
            burst({
              bandBase: 1300,
              bandRange: 2800,
              q: 7,
              peak: 0.03 + Math.random() * 0.1,
              durMs: 40 + Math.random() * 110,
            })
          }
        }
      })
      break
    }
    case 'heartbeat': {
      const lp = filter('lowpass', 170, 0.7)
      const bed = gain(0.4)
      loop(bufs.brown).connect(lp)
      lp.connect(bed)
      bed.connect(entry)
      every(1150, () => {
        const t = c.currentTime + 0.02
        thump(t, 58, 0.5, 0.1)
        thump(t + 0.32, 50, 0.34, 0.13)
      })
      break
    }
    case 'thunder': {
      const lp = filter('lowpass', 130, 0.7)
      const bed = gain(0.2)
      loop(bufs.brown, 0.8).connect(lp)
      lp.connect(bed)
      bed.connect(entry)
      let countdown = 4 + Math.random() * 6
      const rumble = (): void => {
        const t = c.currentTime + 0.05
        const s = c.createBufferSource()
        s.buffer = bufs.brown
        s.loop = true
        s.playbackRate.value = 0.5
        const rp = c.createBiquadFilter()
        rp.type = 'lowpass'
        rp.frequency.value = 110
        const g = c.createGain()
        const dur = 4 + Math.random() * 4
        g.gain.setValueAtTime(0.001, t)
        g.gain.linearRampToValueAtTime(0.75, t + 0.9)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        s.connect(rp)
        rp.connect(g)
        g.connect(entry)
        s.start(t)
        s.stop(t + dur + 0.1)
        track(s, () => {
          rp.disconnect()
          g.disconnect()
        })
        if (Math.random() < 0.35) {
          burst({ bandBase: 700, bandRange: 900, q: 4, peak: 0.25, durMs: 120 })
        }
      }
      every(1000, () => {
        countdown -= 1
        if (countdown <= 0) {
          countdown = 9 + Math.random() * 13
          rumble()
        }
      })
      break
    }
  }

  return {
    stop() {
      intervals.forEach((id) => window.clearInterval(id))
      intervals.clear()
      live.forEach((s) => {
        try {
          s.stop()
        } catch {
          // never started
        }
      })
      live.clear()
      try {
        entry.disconnect()
      } catch {
        // already disconnected
      }
    },
  }
}

function scheduleFade(minutes: number, onFadeEnd?: () => void): void {
  clearFade()
  const c = ctx
  const g = master
  if (!c || !g) return
  const totalMs = minutes * 60000
  const rampSec = Math.min(4, totalMs / 4000)
  fadeEndCb = onFadeEnd ?? null
  fadeTimer = window.setTimeout(() => {
    fadeTimer = null
    const now = c.currentTime
    g.gain.cancelScheduledValues(now)
    g.gain.setValueAtTime(currentVolume, now)
    g.gain.linearRampToValueAtTime(0, now + rampSec)
  }, Math.max(0, totalMs - rampSec * 1000))
  fadeEndTimer = window.setTimeout(() => {
    fadeTimer = null
    fadeEndTimer = null
    const done = fadeEndCb
    fadeEndCb = null
    stopNoise(0)
    done?.()
  }, totalMs)
}

function updateMediaSession(sound: NoiseSound): void {
  if (!('mediaSession' in navigator)) return
  try {
    const label = NOISE_SOUNDS.find((s) => s.id === sound)
    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: label?.label ?? 'White noise',
        artist: 'Lulla',
        album: 'Noise machine',
      })
    }
    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // handler type unsupported
      }
    }
    setHandler('play', () => {
      if (lastOpts) void playNoise(lastOpts)
    })
    setHandler('pause', () => stopNoise(0.4))
    setHandler('stop', () => stopNoise(0.4))
  } catch {
    // media session unavailable
  }
}

export async function playNoise(opts: NoisePlayOpts): Promise<boolean> {
  const c = ensureContext()
  if (!c || !master) return false
  generation += 1
  const gen = generation
  clearPendingStop()
  clearFade()
  if (session) {
    session.stop()
    session = null
  }
  playing = true
  notify()
  try {
    if (c.state === 'suspended') await c.resume()
    if (c.state !== 'running') throw new Error('audio output blocked')
  } catch {
    playing = false
    notify()
    return false
  }
  if (gen !== generation) return false
  lastOpts = { ...opts }
  currentVolume = clampNoiseVolume(opts.volume) * OUTPUT_SCALE
  const now = c.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setValueAtTime(currentVolume, now)
  ensureRoutes(c)
  session = buildSession(c, opts.sound, master)
  await startElement()
  updateMediaSession(opts.sound)
  if (opts.fadeMinutes > 0) scheduleFade(opts.fadeMinutes, opts.onFadeEnd)
  return true
}

export function setNoiseVolume(volume: number): void {
  if (!ctx || !master || !playing) return
  currentVolume = clampNoiseVolume(volume) * OUTPUT_SCALE
  const now = ctx.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setValueAtTime(currentVolume, now)
}

export function rescheduleNoiseFade(fadeMinutes: number, onFadeEnd?: () => void): void {
  clearFade()
  if (!playing || !ctx || !master) return
  const now = ctx.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setValueAtTime(currentVolume, now)
  if (fadeMinutes > 0) scheduleFade(normalizeFadeMinutes(fadeMinutes), onFadeEnd)
}

export function stopNoise(fadeSeconds = 1.2): void {
  if (!playing) return
  generation += 1
  clearFade()
  const c = ctx
  const g = master
  const finish = (): void => {
    if (session) {
      session.stop()
      session = null
    }
    if (audioEl) {
      try {
        audioEl.pause()
      } catch {
        // already paused
      }
    }
    playing = false
    notify()
  }
  if (!c || !g || fadeSeconds <= 0) {
    finish()
    return
  }
  const now = c.currentTime
  g.gain.cancelScheduledValues(now)
  g.gain.setValueAtTime(g.gain.value, now)
  g.gain.linearRampToValueAtTime(0, now + fadeSeconds)
  pendingStop = window.setTimeout(() => {
    pendingStop = null
    finish()
  }, fadeSeconds * 1000 + 80)
}