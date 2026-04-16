/**
 * Web Haptics Engine
 *
 * Multi-layer haptic feedback for mobile web:
 *
 * Layer 1 — Native vibration (Android): navigator.vibrate() with per-style patterns
 * Layer 2 — iOS Taptic Engine: Hidden <input type="checkbox" switch> toggling.
 *           Multiple rapid toggles for heavier styles.
 * Layer 3 — Sub-bass audio: Low-frequency oscillator pulses that physically vibrate
 *           the device chassis through the speaker. This is the key layer that turns
 *           a "tap" into a real haptic feel, especially on iOS where vibrate() is absent.
 */

export type HapticStyle = 'key' | 'light' | 'medium' | 'heavy';

interface HapticProfile {
	/** Number of iOS taptic toggles (rapid-fire for heavier feel) */
	taps: number;
	/** Delay between iOS taps in ms */
	tapInterval: number;
	/** Android vibrate pattern */
	vibrate: number[];
	/** Sub-bass frequency in Hz (lower = deeper thump) */
	bassFreq: number;
	/** Sub-bass duration in seconds */
	bassDuration: number;
	/** Overall gain (0–1) */
	gain: number;
	/** Noise burst intensity for click texture */
	noiseIntensity: number;
}

const PROFILES: Record<HapticStyle, HapticProfile> = {
	key: {
		taps: 1, tapInterval: 0,
		vibrate: [8],
		bassFreq: 150, bassDuration: 0.02, gain: 0.15, noiseIntensity: 0.2
	},
	light: {
		taps: 1, tapInterval: 0,
		vibrate: [30],
		bassFreq: 80, bassDuration: 0.04, gain: 0.35, noiseIntensity: 0.3
	},
	medium: {
		taps: 2, tapInterval: 12,
		vibrate: [50],
		bassFreq: 50, bassDuration: 0.07, gain: 0.6, noiseIntensity: 0.4
	},
	heavy: {
		taps: 3, tapInterval: 15,
		vibrate: [60, 15, 60],
		bassFreq: 30, bassDuration: 0.12, gain: 0.9, noiseIntensity: 0.5
	}
};

class HapticEngine {
	private labels: HTMLLabelElement[] = [];
	private domInitialized = false;
	private audioCtx: AudioContext | null = null;
	private readonly idPrefix = `wh-${Math.random().toString(36).slice(2, 8)}`;
	private readonly canVibrate =
		typeof navigator !== 'undefined' && 'vibrate' in navigator && !!navigator.vibrate;

	/** Create multiple hidden switch checkboxes for rapid-fire toggling */
	private ensureDOM() {
		if (this.domInitialized || typeof document === 'undefined') return;

		const container = document.createElement('div');
		container.setAttribute('aria-hidden', 'true');
		container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;pointer-events:none;opacity:0';

		for (let i = 0; i < 3; i++) {
			const id = `${this.idPrefix}-${i}`;
			const label = document.createElement('label');
			label.setAttribute('for', id);

			const input = document.createElement('input');
			input.type = 'checkbox';
			input.setAttribute('switch', '');
			input.id = id;
			input.style.cssText = 'all:initial;appearance:auto;display:none';

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

	/**
	 * Play a sub-bass thump + noise burst.
	 * The low-frequency oscillation physically moves the speaker cone,
	 * creating real vibration you can feel through the device.
	 */
	private playBass(profile: HapticProfile) {
		if (!this.audioCtx) return;
		if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
		const ctx = this.audioCtx;
		const now = ctx.currentTime;

		const osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(profile.bassFreq, now);
		osc.frequency.exponentialRampToValueAtTime(
			Math.max(profile.bassFreq * 0.4, 20), now + profile.bassDuration
		);

		const oscGain = ctx.createGain();
		oscGain.gain.setValueAtTime(profile.gain, now);
		oscGain.gain.exponentialRampToValueAtTime(0.001, now + profile.bassDuration);

		osc.connect(oscGain);
		oscGain.connect(ctx.destination);
		osc.start(now);
		osc.stop(now + profile.bassDuration);

		const bufLen = Math.floor(ctx.sampleRate * 0.015);
		const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < bufLen; i++) {
			data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3));
		}

		const noiseSrc = ctx.createBufferSource();
		noiseSrc.buffer = buf;

		const noiseGain = ctx.createGain();
		noiseGain.gain.value = profile.noiseIntensity;

		const lpf = ctx.createBiquadFilter();
		lpf.type = 'lowpass';
		lpf.frequency.value = 1500;

		noiseSrc.connect(noiseGain);
		noiseGain.connect(lpf);
		lpf.connect(ctx.destination);
		noiseSrc.start(now);
	}

	/** Fire iOS taptic toggles, potentially multiple in rapid succession */
	private fireTaptic(profile: HapticProfile) {
		this.ensureDOM();
		if (!this.labels.length) return;

		for (let i = 0; i < profile.taps; i++) {
			if (i === 0) {
				this.labels[0].click();
			} else {
				setTimeout(() => {
					this.labels[i % this.labels.length].click();
				}, i * profile.tapInterval);
			}
		}
	}

	/** Fire a haptic of the given style */
	trigger(style: HapticStyle = 'light') {
		if (typeof window === 'undefined') return;
		const p = PROFILES[style];

		if (this.canVibrate) navigator.vibrate(p.vibrate);
		if (!this.canVibrate) this.fireTaptic(p);

		this.ensureAudio();
		this.playBass(p);
	}
}

/** Singleton haptic engine instance */
export const haptic = new HapticEngine();
