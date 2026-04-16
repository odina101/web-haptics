/**
 * Web Haptics Engine
 *
 * Multi-layer haptic feedback for mobile web:
 *
 * Layer 1 — Native vibration (Android): navigator.vibrate() with per-style patterns
 * Layer 2 — iOS Taptic Engine: Hidden <input type="checkbox" switch> toggling.
 *           Key: style.all='initial' then style.appearance='auto' — this exact
 *           sequence is required for Safari to fire the Taptic Engine.
 * Layer 3 — Audio click: Short noise burst through AudioContext for extra tactile feel.
 */

export type HapticStyle = 'key' | 'light' | 'medium' | 'heavy';

interface HapticProfile {
	intensity: number;
	vibrate: number[];
}

const PROFILES: Record<HapticStyle, HapticProfile> = {
	key: { intensity: 0.3, vibrate: [8] },
	light: { intensity: 0.6, vibrate: [30] },
	medium: { intensity: 0.85, vibrate: [50] },
	heavy: { intensity: 1.0, vibrate: [60, 15, 60] }
};

class HapticEngine {
	private label: HTMLLabelElement | null = null;
	private domInitialized = false;
	private audioCtx: AudioContext | null = null;
	private audioFilter: BiquadFilterNode | null = null;
	private audioGain: GainNode | null = null;
	private audioBuffer: AudioBuffer | null = null;
	private readonly id = `wh-${Math.random().toString(36).slice(2, 8)}`;
	private readonly canVibrate =
		typeof navigator !== 'undefined' && 'vibrate' in navigator && !!navigator.vibrate;

	/**
	 * Create hidden switch checkbox for iOS Taptic Engine.
	 * Matches the proven rivo.ge technique exactly:
	 *   style.all = 'initial'  → reset all styles
	 *   style.appearance = 'auto' → re-enable native switch rendering
	 *   style.display = 'none' → hide visually
	 * This exact sequence is what makes Safari fire the Taptic Engine.
	 */
	private ensureDOM() {
		if (this.domInitialized || typeof document === 'undefined') return;

		const label = document.createElement('label');
		label.setAttribute('for', this.id);
		label.style.display = 'none';

		const input = document.createElement('input');
		input.type = 'checkbox';
		input.setAttribute('switch', '');
		input.id = this.id;
		input.style.all = 'initial';
		input.style.appearance = 'auto';
		input.style.display = 'none';

		label.appendChild(input);
		document.body.appendChild(label);
		this.label = label;
		this.domInitialized = true;
	}

	private ensureAudio() {
		if (this.audioCtx) return;
		try {
			const Ctx = window.AudioContext || (window as any).webkitAudioContext;
			this.audioCtx = new Ctx();
			this.audioFilter = this.audioCtx.createBiquadFilter();
			this.audioFilter.type = 'lowpass';
			this.audioFilter.connect(this.audioCtx.destination);
			this.audioGain = this.audioCtx.createGain();
			this.audioGain.connect(this.audioFilter);
			this.audioBuffer = this.audioCtx.createBuffer(1, 64, this.audioCtx.sampleRate);
		} catch {
			// AudioContext not available
		}
	}

	private playClick(intensity: number) {
		if (!this.audioCtx || !this.audioBuffer || !this.audioGain || !this.audioFilter) return;
		if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

		const data = this.audioBuffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) {
			data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 25);
		}

		this.audioGain.gain.value = 0.5 * intensity;
		this.audioFilter.frequency.value =
			(2000 + intensity * 2000) * (1 + (Math.random() - 0.5) * 0.3);

		const src = this.audioCtx.createBufferSource();
		src.buffer = this.audioBuffer;
		src.connect(this.audioGain);
		src.onended = () => src.disconnect();
		src.start();
	}

	/** Fire a haptic of the given style */
	trigger(style: HapticStyle = 'light') {
		if (typeof window === 'undefined') return;
		const p = PROFILES[style];

		// Android — native vibrate API
		if (this.canVibrate) navigator.vibrate(p.vibrate);

		// iOS — toggle the hidden switch checkbox to fire Taptic Engine
		if (!this.canVibrate) {
			this.ensureDOM();
			if (this.label) this.label.click();
		}

		// Audio click for extra tactile feel
		this.ensureAudio();
		this.playClick(p.intensity);
	}
}

/** Singleton haptic engine instance */
export const haptic = new HapticEngine();
