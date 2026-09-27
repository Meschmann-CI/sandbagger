// Sound, made on the phone with Web Audio: no files to download, nothing
// to license. A little music under Season Wrapped, and a short cue for a
// few moments that earn one (a new personal best, attesting the card,
// settling a debt).
//
// Browsers only allow sound after a tap, and iOS only lets an audio
// context start inside one. So the first tap anywhere in the app wakes
// the context (unlockAudio, installed once by the Shell), and from then
// on cues can play. Sound can be switched off under You → This phone;
// short cues also respect the iPhone's silent switch, while Wrapped's
// music plays like a video does.

const PREF = 'sandbagger-sound'

let ctx: AudioContext | null = null

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } }

export function soundOn(): boolean {
  try {
    return localStorage.getItem(PREF) !== 'off'
  } catch {
    return true
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? 'on' : 'off')
  } catch {
    // private mode: the choice lasts until the page closes
  }
}

function context(): AudioContext | null {
  if (ctx) return ctx
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  return ctx
}

/** Wakes the audio context on the first tap. Call once. */
export function unlockAudio() {
  const wake = () => {
    const c = context()
    if (c && c.state !== 'running') void c.resume()
    if (c?.state === 'running') {
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }
  window.addEventListener('pointerdown', wake)
  window.addEventListener('keydown', wake)
}

function ready(): AudioContext | null {
  if (!soundOn()) return null
  const c = context()
  if (!c) return null
  if (c.state !== 'running') void c.resume()
  return c.state === 'running' ? c : null
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** One soft bell-like note. */
function bell(c: AudioContext, out: AudioNode, midi: number, at: number, dur = 0.5, level = 0.18) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'triangle'
  osc.frequency.value = hz(midi)
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(level, at + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g).connect(out)
  osc.start(at)
  osc.stop(at + dur + 0.05)
}

export type Cue = 'best' | 'attest' | 'coin' | 'trophy'

/** A short cue, if sound is on and the app has had a tap. */
export function play(cue: Cue) {
  const c = ready()
  if (!c) return
  const t = c.currentTime + 0.02
  const out = c.createGain()
  out.gain.value = 0.9
  out.connect(c.destination)
  if (cue === 'best') [72, 76, 79, 84].forEach((n, i) => bell(c, out, n, t + i * 0.09, 0.7))
  if (cue === 'attest') [67, 72].forEach((n, i) => bell(c, out, n, t + i * 0.12, 0.6))
  if (cue === 'coin') [88, 95].forEach((n, i) => bell(c, out, n, t + i * 0.07, 0.35, 0.12))
  if (cue === 'trophy') [79, 84, 88, 91].forEach((n, i) => bell(c, out, n, t + i * 0.07, 0.9, 0.13))
}

// ---------- Wrapped's music ----------
//
// Four bars round and round at 100 BPM: C, G, A minor, F. A soft pad, a
// bass on the beat, a plucked arpeggio in eighths, and a light kick and
// hat. Scheduled a little ahead of time, the standard Web Audio way, so
// it keeps time even when the page is busy animating.

const BPM = 100
const BEAT = 60 / BPM
const CHORDS = [
  [60, 64, 67],
  [55, 59, 62],
  [57, 60, 64],
  [53, 57, 60],
]

export function startMusic(): (() => void) | null {
  const c = ready()
  if (!c) return null
  const nav = navigator as AudioSessionNavigator
  const previous = nav.audioSession?.type
  if (nav.audioSession) nav.audioSession.type = 'playback'

  const master = c.createGain()
  master.gain.setValueAtTime(0, c.currentTime)
  master.gain.linearRampToValueAtTime(0.55, c.currentTime + 1.2)
  const lowpass = c.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 2600
  master.connect(lowpass).connect(c.destination)

  const noise = c.createBuffer(1, c.sampleRate * 0.2, c.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  const pad = (notes: number[], at: number, dur: number) => {
    for (const n of notes) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'sawtooth'
      o.frequency.value = hz(n)
      o.detune.value = (Math.random() - 0.5) * 12
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.035, at + 0.4)
      g.gain.setValueAtTime(0.035, at + dur - 0.3)
      g.gain.linearRampToValueAtTime(0, at + dur)
      o.connect(g).connect(master)
      o.start(at)
      o.stop(at + dur + 0.05)
    }
  }
  const bass = (n: number, at: number) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.value = hz(n - 24)
    g.gain.setValueAtTime(0.28, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + BEAT * 0.9)
    o.connect(g).connect(master)
    o.start(at)
    o.stop(at + BEAT)
  }
  const kick = (at: number) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.frequency.setValueAtTime(120, at)
    o.frequency.exponentialRampToValueAtTime(45, at + 0.12)
    g.gain.setValueAtTime(0.4, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18)
    o.connect(g).connect(master)
    o.start(at)
    o.stop(at + 0.2)
  }
  const hat = (at: number) => {
    const src = c.createBufferSource()
    src.buffer = noise
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7000
    const g = c.createGain()
    g.gain.setValueAtTime(0.05, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
    src.connect(hp).connect(g).connect(master)
    src.start(at)
    src.stop(at + 0.06)
  }

  let bar = 0
  let next = c.currentTime + 0.1
  const barLen = BEAT * 4
  const schedule = () => {
    while (next < c.currentTime + 0.6) {
      const chord = CHORDS[bar % CHORDS.length]
      pad(chord, next, barLen)
      for (let b = 0; b < 4; b++) {
        bass(chord[0], next + b * BEAT)
        if (b % 2 === 0) kick(next + b * BEAT)
        hat(next + b * BEAT + BEAT / 2)
      }
      const arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12]
      for (let e = 0; e < 8; e++) bell(c, master, arp[e % 4], next + (e * BEAT) / 2, 0.35, 0.06)
      bar++
      next += barLen
    }
  }
  schedule()
  const timer = window.setInterval(schedule, 200)

  return () => {
    window.clearInterval(timer)
    const now = c.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(0, now + 0.6)
    window.setTimeout(() => {
      master.disconnect()
      if (nav.audioSession && previous) nav.audioSession.type = previous
    }, 700)
  }
}
