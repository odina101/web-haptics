/**
 * Web Haptics Engine
 *
 * Multi-layer haptic feedback for mobile web:
 *
 * Layer 1 — Native vibration (Android): navigator.vibrate() with per-style patterns
 * Layer 2 — iOS Taptic Engine: Hidden <input type="checkbox" switch> toggling.
 *           The checkbox MUST be rendered (not display:none) for Safari to fire
 *           the Taptic Engine. We use clip-rect to hide it visually.
 *           Multiple rapid toggles across separate checkboxes for heavier styles.
 * Layer 3 — Speaker vibration via audio: Square/sawtooth waves at frequencies the
 *           phone speaker can actually reproduce (150–300Hz), pushed through a
 *           waveshaper for hard clipping. This makes the speaker cone slam against
 *           its limits, creating physical vibration you can feel.
 */

export type HapticStyle = 'key' | 'light' | 'medium' | 'heavy';

interface HapticProfile {
	/** Number of iOS taptic toggles (rapid-fire for heavier feel) */
	taps: number;
	/** Delay between iOS taps in ms */
	tapInterval: number;
	/** Android vibrate pattern */
	vibrate: number[];
	/** Primary oscillator frequency — must be >100Hz for phone speakers */
	freq: number;
	/** Secondary frequency for beating effect (0 = disabled) */
	freq2: number;
	/** Waveform type */
	wave: OscillatorType;
	/** Duration in seconds */
	duration: number;
	/** Overall gain (0–1) */
	gain: number;
	/** Distortion amount (0–1) — higher = harder speaker clipping */
	distortion: number;
}

const PROFILES: Record<HapticStyle, HapticProfile> = {
	key: {
		taps: 1, tapInterval: 0,
		vibrate: [8],
		freq: 200, freq2: 0, wave: 'sine',
		duration: 0.025, gain: 0.4, distortion: 0
	},
	light: {
		taps: 1, tapInterval: 0,
		vibrate: [30],
		freq: 150, freq2: 0, wave: 'square',
		duration: 0.04, gain: 0.6, distortion: 0.3
	},
	medium: {
		taps: 2, tapInterval: 15,
		vibrate: [50],
		freq: 150, freq2: 155, wave: 'sawtooth',
		duration: 0.07, gain: 0.8, distortion: 0.6
	},
	heavy: {
		taps: 3, tapInterval: 18,
		vibrate: [60, 15, 60],
		freq: 120, freq2: 127, wave: 'sawtooth',
		duration: 0.12, gain: 1.0, distortion: 0.85
	}
};

/** Build a waveshaper curve for hard clipping distortion */
function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
	const samples = 256;
	const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
	const k = amount * 100;
	for (let i = 0; i < samples; i++) {
		const x = (i * 2) / samples - 1;
		curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
	}
	return curve;
}

class HapticEngine {
	private labels: HTMLLabelElement[] = [];
	private domInitialized = false;
	private audioCtx: AudioContext | null = null;
	private distortionCurves = new Map<number, Float32Array<ArrayBuffer>>();
	private readonly idPrefix = `wh-${Math.random().toString(36).slice(2, 8)}`;
	private readonly canVibrate =
		typeof navigator !== 'undefined' && 'vibrate' in navigator && !!navigator.vibrate;

	/**
	 * Create hidden switch checkboxes for iOS Taptic Engine.
	 * CRITICAL: inputs must NOT use display:none — Safari only fires the
	 * Taptic Engine for checkboxes that are part of the render tree.
	 * We use clip + fixed positioning to hide them visually while keeping
	 * them rendered.
	 */
	private ensureDOM() {
		if (this.domInitialized || typeof document === 'undefined') return;

		const container = document.createElement('div');
		container.setAttribute('aria-hidden', 'true');
		// Position far offscreen — NOT at top:0/left:0 which can intercept
		// touch events on iOS even with pointer-events:none
		container.style.cssText =
			'position:fixed;bottom:-200px;left:-200px;width:1px;height:1px;overflow:hidden;pointer-events:none;z-index:-9999';

		for (let i = 0; i < 3; i++) {
			const id = `${this.idPrefix}-${i}`;
			const label = document.createElement('label');
			label.setAttribute('for', id);
			label.style.cssText = 'position:absolute;overflow:hidden';

			const input = document.createElement('input');
			input.type = 'checkbox';
			input.setAttribute('switch', '');
			input.id = id;
			// Must be rendered (not display:none) for Safari Taptic Engine.
			// Keep offscreen and non-interactive.
			input.style.cssText =
				'position:absolute;opacity:0.01;width:1px;height:1px;pointer-events:none;-webkit-appearance:none';

			label.appendChild(input);
			container.appendChild(label);
			this.labels.push(label);
		}

		document.body.appendChild(container);
		this.domInitialized = true;
	}

	private ensureAudio() {
		if (this.audioCtx) return;
		try {
			const Ctx = window.AudioContext || (window as any).webkitAudioContext;
			this.audioCtx = new Ctx();
		} catch {
			// AudioContext not available
		}
	}

	private getDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
		const key = Math.round(amount * 100);
		if (!this.distortionCurves.has(key)) {
			this.distortionCurves.set(key, makeDistortionCurve(amount));
		}
		return this.distortionCurves.get(key)!;
	}

	/**
	 * Play a speaker-vibration pulse. Uses frequencies the phone speaker
	 * can actually reproduce (120–300Hz) with aggressive waveforms and
	 * distortion to drive the speaker cone into hard clipping — this is
	 * what creates the physical buzz you feel in your hand.
	 */
	private playPulse(p: HapticProfile) {
		if (!this.audioCtx) return;
		if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
		const ctx = this.audioCtx;
		const now = ctx.currentTime;

		// Master gain with fast attack + exponential decay
		const master = ctx.createGain();
		master.gain.setValueAtTime(p.gain, now);
		master.gain.exponentialRampToValueAtTime(0.001, now + p.duration);

		// Optional distortion for harder speaker clipping
		let outputNode: AudioNode = master;
		if (p.distortion > 0) {
			const shaper = ctx.createWaveShaper();
			shaper.curve = this.getDistortionCurve(p.distortion);
			shaper.oversample = '2x';
			master.connect(shaper);
			shaper.connect(ctx.destination);
			outputNode = master; // osc -> master -> shaper -> dest
		} else {
			master.connect(ctx.destination);
		}

		// Primary oscillator
		const osc1 = ctx.createOscillator();
		osc1.type = p.wave;
		osc1.frequency.setValueAtTime(p.freq, now);
		osc1.frequency.exponentialRampToValueAtTime(
			Math.max(p.freq * 0.6, 80), now + p.duration
		);
		osc1.connect(master);
		osc1.start(now);
		osc1.stop(now + p.duration + 0.01);

		// Secondary oscillator for beating/interference pattern
		if (p.freq2 > 0) {
			const osc2 = ctx.createOscillator();
			osc2.type = p.wave;
			osc2.frequency.setValueAtTime(p.freq2, now);
			osc2.frequency.exponentialRampToValueAtTime(
				Math.max(p.freq2 * 0.6, 80), now + p.duration
			);
			osc2.connect(master);
			osc2.start(now);
			osc2.stop(now + p.duration + 0.01);
		}
	}

	/** Fire iOS taptic toggles, potentially multiple in rapid succession */
	private fireTaptic(p: HapticProfile) {
		this.ensureDOM();
		if (!this.labels.length) return;

		for (let i = 0; i < p.taps; i++) {
			if (i === 0) {
				this.labels[0].click();
			} else {
				setTimeout(() => {
					this.labels[i % this.labels.length].click();
				}, i * p.tapInterval);
			}
		}
	}

	/** Fire a haptic of the given style */
	trigger(style: HapticStyle = 'light') {
		if (typeof window === 'undefined') return;
		const p = PROFILES[style];

		// Android — native vibrate API
		if (this.canVibrate) navigator.vibrate(p.vibrate);

		// iOS — toggle rendered (not display:none!) switch checkboxes
		if (!this.canVibrate) this.fireTaptic(p);

		// Speaker vibration — works on all devices with sound on
		this.ensureAudio();
		this.playPulse(p);
	}
}

/** Singleton haptic engine instance */
export const haptic = new HapticEngine();
