import { haptic, type HapticStyle } from './engine';

export { haptic, type HapticStyle } from './engine';

type Action<E extends HTMLElement, P> = (node: E, parameter: P) => {
	update?: (parameter: P) => void;
	destroy?: () => void;
};

/**
 * Svelte action for declarative haptic feedback.
 * Usage: <button use:useHaptic={'medium'}>Click me</button>
 */
export const useHaptic: Action<HTMLElement, HapticStyle | undefined> = (
	node,
	style = 'light'
) => {
	let currentStyle = style;
	const handler = () => haptic.trigger(currentStyle);
	node.addEventListener('pointerdown', handler);

	return {
		update(newStyle: HapticStyle | undefined) {
			currentStyle = newStyle ?? 'light';
		},
		destroy() {
			node.removeEventListener('pointerdown', handler);
		}
	};
};

/**
 * Svelte action for haptic on every keystroke (input fields).
 * Usage: <input use:useHapticInput />
 */
export const useHapticInput: Action<HTMLElement, undefined> = (node) => {
	const handler = () => haptic.trigger('key');
	node.addEventListener('input', handler);
	node.addEventListener('beforeinput', handler);

	return {
		update() {},
		destroy() {
			node.removeEventListener('input', handler);
			node.removeEventListener('beforeinput', handler);
		}
	};
};
