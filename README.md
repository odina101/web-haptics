# web-haptics

Real haptic feedback for mobile web. Three layers working together:

1. **iOS Taptic Engine** — hidden `<input type="checkbox" switch>` toggling (multiple rapid toggles for heavier styles)
2. **Android vibrate** — `navigator.vibrate()` with per-style patterns
3. **Sub-bass audio** — low-frequency oscillator pulses that physically vibrate the device through the speaker

## Install

```bash
npm install web-haptics
```

## Usage

### Vanilla JS / any framework

```js
import { haptic } from 'web-haptics';

button.addEventListener('click', () => {
  haptic.trigger('medium');
});
```

### Svelte

```svelte
<script>
  import { useHaptic, useHapticInput } from 'web-haptics/svelte';
</script>

<button use:useHaptic={'heavy'}>Delete</button>
<input use:useHapticInput placeholder="Type here" />
```

## Styles

| Style    | Feel                          |
|----------|-------------------------------|
| `key`    | Subtle keystroke tick          |
| `light`  | Soft tap                      |
| `medium` | Firm press with bass thump    |
| `heavy`  | Strong impact, multi-tap buzz |

## How it works

On iOS, `navigator.vibrate()` doesn't exist. The library uses a Safari-specific trick: toggling a hidden `<input type="checkbox" switch>` fires the Taptic Engine. For heavier styles, it rapid-fires multiple toggles across separate checkboxes.

On all devices, a sub-bass sine wave (30–150 Hz) plays through the speaker, physically vibrating the device chassis. This is tuned per style — `heavy` uses 30 Hz with high gain for a deep thump you can actually feel.

## License

MIT
