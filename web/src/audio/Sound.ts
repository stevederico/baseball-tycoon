/**
 * Every sound is synthesised with WebAudio, so there is nothing to download.
 * The context is created on the first user gesture (browsers require it).
 */
const MUTE_KEY = 'baseball-tycoon-muted'

export type SoundName =
  | 'click'
  | 'build'
  | 'demolish'
  | 'error'
  | 'cash'
  | 'bat'
  | 'cheer'
  | 'groan'
  | 'organ'
  | 'win'
  | 'lose'

export class SoundBoard {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private crowd: GainNode | null = null
  private noise: AudioBuffer | null = null
  muted = false

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      this.muted = false
    }
  }

  /** Call from a click/tap handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume()
      return
    }
    if (typeof AudioContext === 'undefined') return
    const context = new AudioContext()
    const master = context.createGain()
    master.gain.value = this.muted ? 0 : 0.5
    master.connect(context.destination)

    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1

    this.context = context
    this.master = master
    this.noise = noise
    this.startCrowdBed()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.context.currentTime, 0.02)
    }
  }

  /** Low murmur of a crowd, faded up while a home game is on. */
  private startCrowdBed(): void {
    if (!this.context || !this.master || !this.noise) return
    const source = this.context.createBufferSource()
    source.buffer = this.noise
    source.loop = true
    const filter = this.context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 700
    filter.Q.value = 0.6
    const gain = this.context.createGain()
    gain.gain.value = 0
    source.connect(filter).connect(gain).connect(this.master)
    source.start()
    this.crowd = gain
  }

  /** 0 = empty park, 1 = a full house. */
  setCrowdLevel(level: number): void {
    if (!this.crowd || !this.context) return
    this.crowd.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.16, this.context.currentTime, 0.6)
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    slideTo?: number,
  ): void {
    if (!this.context || !this.master) return
    const t0 = this.context.currentTime + start
    const osc = this.context.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(frequency, t0)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration)
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    osc.connect(gain).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  private burst(
    start: number,
    duration: number,
    frequency: number,
    volume: number,
    type: BiquadFilterType = 'bandpass',
    attack = 0.01,
  ): void {
    if (!this.context || !this.master || !this.noise) return
    const t0 = this.context.currentTime + start
    const source = this.context.createBufferSource()
    source.buffer = this.noise
    const filter = this.context.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = 0.8
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(volume, t0 + attack)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    source.connect(filter).connect(gain).connect(this.master)
    source.start(t0, Math.random())
    source.stop(t0 + duration + 0.05)
  }

  play(name: SoundName): void {
    if (!this.context || this.muted) return
    switch (name) {
      case 'click':
        this.tone(660, 0, 0.06, 'square', 0.08)
        break
      case 'build':
        this.burst(0, 0.12, 300, 0.5, 'lowpass')
        this.tone(180, 0, 0.12, 'triangle', 0.3, 90)
        this.tone(520, 0.08, 0.1, 'square', 0.08)
        break
      case 'demolish':
        this.burst(0, 0.35, 500, 0.5, 'lowpass')
        this.tone(140, 0, 0.3, 'sawtooth', 0.15, 50)
        break
      case 'error':
        this.tone(200, 0, 0.12, 'square', 0.1)
        this.tone(150, 0.1, 0.18, 'square', 0.1)
        break
      case 'cash':
        this.tone(1320, 0, 0.09, 'square', 0.08)
        this.tone(1760, 0.07, 0.2, 'square', 0.08)
        break
      case 'bat':
        this.burst(0, 0.06, 2400, 0.7, 'bandpass', 0.001)
        this.tone(900, 0, 0.05, 'triangle', 0.25, 300)
        break
      case 'cheer':
        this.burst(0, 1.6, 1100, 0.55, 'bandpass', 0.25)
        this.burst(0.1, 1.3, 2200, 0.25, 'bandpass', 0.3)
        break
      case 'groan':
        this.burst(0, 1.1, 320, 0.4, 'bandpass', 0.2)
        break
      case 'organ': {
        // An original little ballpark riff.
        const notes = [392, 494, 587, 784, 587, 784]
        notes.forEach((f, i) => {
          this.tone(f, i * 0.13, i === notes.length - 1 ? 0.5 : 0.14, 'square', 0.07)
          this.tone(f / 2, i * 0.13, i === notes.length - 1 ? 0.5 : 0.14, 'sine', 0.1)
        })
        break
      }
      case 'win': {
        const notes = [523, 659, 784, 1047, 784, 1047, 1319]
        notes.forEach((f, i) => this.tone(f, i * 0.14, i === notes.length - 1 ? 0.8 : 0.16, 'square', 0.08))
        this.burst(0.3, 2.4, 1200, 0.5, 'bandpass', 0.4)
        break
      }
      case 'lose': {
        const notes = [392, 370, 349, 294]
        notes.forEach((f, i) => this.tone(f, i * 0.28, i === notes.length - 1 ? 0.9 : 0.3, 'triangle', 0.16))
        break
      }
    }
  }
}
