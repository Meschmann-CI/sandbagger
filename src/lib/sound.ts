// Sound, made on the phone with Web Audio: no files to download, nothing
// to license. Pachelbel's Canon under Season Wrapped, and a short cue for a
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

// ---------- Wrapped's music: Pachelbel's Canon in D ----------
//
// The end-of-year song. Pachelbel's Canon (about 1680, public domain):
// the eight-chord ground in D, its bass line, and the descending lines
// the violins pass around, arranged the way a graduation-season pop
// song would have it. Soft strings and bass first, then a broken-chord
// piano, then the melody, then a backbeat under the lot as the recap
// builds. Every note is scheduled a little ahead, the standard Web
// Audio way, so it keeps time while the cards animate.

const BPM = 88
const BEAT = 60 / BPM
/** Each chord of the ground lasts two beats; eight chords make a pass. */
const CHORD_LEN = BEAT * 2

// The ground: D, A, Bm, F#m, G, D, G, A.
const BASS = [50, 45, 47, 42, 43, 38, 43, 45]
const CHORDS = [
  [62, 66, 69],
  [57, 61, 64],
  [59, 62, 66],
  [54, 57, 61],
  [55, 59, 62],
  [54, 57, 62],
  [55, 59, 62],
  [57, 61, 64],
]
// The violins' first two entries: one note to a chord.
const LINE_1 = [78, 76, 74, 73, 71, 69, 71, 73] // F# E D C# B A B C#
const LINE_2 = [74, 73, 71, 69, 67, 66, 67, 64] // D C# B A G F# G E
// The running eighth-note variation, four to a chord.
const LINE_3 = [
  [74, 78, 81, 79],
  [78, 74, 78, 76],
  [74, 71, 74, 69],
  [67, 71, 69, 67],
  [66, 62, 64, 73],
  [74, 78, 81, 81],
  [83, 79, 81, 78],
  [74, 74, 74, 73],
]

export function startMusic(): (() => void) | null {
  const c = ready()
  if (!c) return null
  const nav = navigator as AudioSessionNavigator
  const previous = nav.audioSession?.type
  if (nav.audioSession) nav.audioSession.type = 'playback'

  const master = c.createGain()
  master.gain.setValueAtTime(0, c.currentTime)
  master.gain.linearRampToValueAtTime(0.6, c.currentTime + 1.5)
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 3200
  master.connect(tone).connect(c.destination)

  const noise = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  // Strings: detuned saws, slow in, slow out.
  const strings = (notes: number[], at: number, dur: number, level: number) => {
    for (const n of notes) {
      for (const detune of [-7, 7]) {
        const o = c.createOscillator()
        const g = c.createGain()
        o.type = 'sawtooth'
        o.frequency.value = hz(n)
        o.detune.value = detune
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(level, at + 0.35)
        g.gain.setValueAtTime(level, at + dur - 0.25)
        g.gain.linearRampToValueAtTime(0, at + dur + 0.1)
        o.connect(g).connect(master)
        o.start(at)
        o.stop(at + dur + 0.15)
      }
    }
  }
  // Piano-ish: a quick strike that rings off.
  const piano = (n: number, at: number, level = 0.1, ring = 1.2) => {
    for (const [type, mult, amt] of [
      ['triangle', 1, 1],
      ['sine', 2, 0.35],
    ] as const) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = type
      o.frequency.value = hz(n) * mult
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(level * amt, at + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, at + ring)
      o.connect(g).connect(master)
      o.start(at)
      o.stop(at + ring + 0.05)
    }
  }
  // The violin line: two saws with a touch of vibrato, filtered warm.
  const violin = (n: number, at: number, dur: number, level = 0.07) => {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 2400
    const g = c.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(level, at + 0.08)
    g.gain.setValueAtTime(level, at + Math.max(0.1, dur - 0.12))
    g.gain.linearRampToValueAtTime(0, at + dur)
    const lfo = c.createOscillator()
    const depth = c.createGain()
    lfo.frequency.value = 5.2
    depth.gain.value = 6
    lfo.connect(depth)
    for (const detune of [-4, 4]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = hz(n)
      o.detune.value = detune
      depth.connect(o.detune)
      o.connect(f)
      o.start(at)
      o.stop(at + dur + 0.05)
    }
    f.connect(g).connect(master)
    lfo.start(at)
    lfo.stop(at + dur + 0.05)
  }
  const bass = (n: number, at: number, dur: number) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.value = hz(n - 12)
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(0.32, at + 0.02)
    g.gain.exponentialRampToValueAtTime(0.05, at + dur)
    g.gain.linearRampToValueAtTime(0, at + dur + 0.05)
    o.connect(g).connect(master)
    o.start(at)
    o.stop(at + dur + 0.1)
  }
  const kick = (at: number) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.frequency.setValueAtTime(110, at)
    o.frequency.exponentialRampToValueAtTime(42, at + 0.14)
    g.gain.setValueAtTime(0.45, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22)
    o.connect(g).connect(master)
    o.start(at)
    o.stop(at + 0.25)
  }
  const snap = (at: number) => {
    const src = c.createBufferSource()
    src.buffer = noise
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    const g = c.createGain()
    g.gain.setValueAtTime(0.16, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16)
    src.connect(bp).connect(g).connect(master)
    src.start(at)
    src.stop(at + 0.18)
  }

  let step = 0 // chord number since the start, across passes
  let next = c.currentTime + 0.15
  const schedule = () => {
    while (next < c.currentTime + 0.8) {
      const i = step % 8
      const pass = Math.floor(step / 8)
      const chord = CHORDS[i]

      // Pass 1: strings and bass. The ground, alone, the way it opens.
      bass(BASS[i], next, CHORD_LEN)
      strings(chord, next, CHORD_LEN, pass === 0 ? 0.018 : 0.013)

      // From pass 2: the broken-chord piano in eighths.
      if (pass >= 1) {
        const broken = [chord[0], chord[1], chord[2], chord[1] + 12]
        broken.forEach((n, k) => piano(n + 12, next + (k * BEAT) / 2, 0.075, 0.9))
      }
      // Pass 2 carries the first violin line, pass 3 the second, and
      // from pass 4 the running eighths, then round again.
      const line = pass === 0 ? null : (pass - 1) % 3
      if (line === 0) violin(LINE_1[i], next, CHORD_LEN)
      if (line === 1) violin(LINE_2[i], next, CHORD_LEN)
      if (line === 2) LINE_3[i].forEach((n, k) => violin(n, next + (k * BEAT) / 2, BEAT / 2, 0.06))

      // From pass 3: a soft backbeat, kick on one and three, snap on two and four.
      if (pass >= 2) {
        kick(next)
        snap(next + BEAT)
        if (i % 2 === 1) kick(next + BEAT * 1.5)
      }
      step++
      next += CHORD_LEN
    }
  }
  schedule()
  const timer = window.setInterval(schedule, 200)

  return () => {
    window.clearInterval(timer)
    const now = c.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(0, now + 0.8)
    window.setTimeout(() => {
      master.disconnect()
      if (nav.audioSession && previous) nav.audioSession.type = previous
    }, 900)
  }
}
