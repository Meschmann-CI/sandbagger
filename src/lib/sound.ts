// Sound, all through Web Audio. Matt's song under Season Wrapped (the one
// file this downloads), and a short synthesized cue for a few moments that
// earn one (a new personal best, attesting the card, settling a debt).
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

// ---------- Wrapped's music: Matt's song ----------
//
// A recording in public/wrapped-song.m4a, looped under the recap. It is
// fetched and decoded into the same audio context the cues use, rather
// than played through an <audio> element: iOS only lets a media element
// start inside a tap, and Wrapped starts its music a beat after the tap
// that opened it. The context is already awake by then, so a buffer
// source plays. The service worker caches the file like any other asset,
// so the song works offline once it has played once.

const SONG_URL = '/wrapped-song.m4a'
let song: Promise<AudioBuffer | null> | null = null

function loadSong(c: AudioContext): Promise<AudioBuffer | null> {
  song ??= fetch(SONG_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
    .then((bytes) => c.decodeAudioData(bytes))
    .catch(() => {
      song = null // try again next time
      return null
    })
  return song
}

/** Starts the download early, so the song is ready by the first tap. */
export function preloadMusic() {
  const c = context()
  if (c && soundOn()) void loadSong(c)
}

export function startMusic(): (() => void) | null {
  const c = ready()
  if (!c) return null
  const nav = navigator as AudioSessionNavigator
  const previous = nav.audioSession?.type
  if (nav.audioSession) nav.audioSession.type = 'playback'

  const master = c.createGain()
  master.gain.value = 0.9
  master.connect(c.destination)
  const playing = new Set<AudioBufferSourceNode>()
  let stopped = false

  // The recording ends mid-phrase, so each pass fades in and out and the
  // next one starts under the last few seconds of the one before. Passes
  // are queued on the audio clock one ahead (a pass ending queues the one
  // after next), because a 90-second timer can't be trusted to fire on time.
  const XFADE = 1.5
  const pass = (buffer: AudioBuffer, at: number) => {
    const source = c.createBufferSource()
    const g = c.createGain()
    const end = at + buffer.duration
    source.buffer = buffer
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(1, at + XFADE)
    g.gain.setValueAtTime(1, end - XFADE)
    g.gain.linearRampToValueAtTime(0, end)
    source.connect(g).connect(master)
    source.onended = () => {
      playing.delete(source)
      if (!stopped) pass(buffer, at + 2 * (buffer.duration - XFADE))
    }
    source.start(at)
    source.stop(end)
    playing.add(source)
  }

  void loadSong(c).then((buffer) => {
    if (!buffer || stopped) return
    const at = c.currentTime + 0.05
    pass(buffer, at)
    pass(buffer, at + buffer.duration - XFADE)
  })

  return () => {
    stopped = true
    const now = c.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(0, now + 0.8)
    window.setTimeout(() => {
      for (const source of playing) {
        try {
          source.stop()
        } catch {
          // older Safari throws on a second stop(); it was ending anyway
        }
      }
      master.disconnect()
      if (nav.audioSession && previous) nav.audioSession.type = previous
    }, 900)
  }
}
