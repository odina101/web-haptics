# web-haptics

Real haptic feedback for mobile web. Works on iOS and Android.

## How it works

- **iOS** — Toggles a hidden `<input type="checkbox" switch>` which fires the Safari Taptic Engine
- **Android** — `navigator.vibrate()` with per-style patterns
- **Audio** — Short click sound for extra tactile feel

## Install

```bash
npm install @rowixorg/web-haptics
```

## Quick start

### With a bundler (Vite, SvelteKit, Next.js, etc.)

```js
import { haptic } from '@rowixorg/web-haptics';

document.querySelector('button').addEventListener('click', () => {
  haptic.trigger('medium');
});
```

### Without a bundler (plain HTML)

Copy this into your `<script>` tag:

```html
<button onclick="haptic('medium')">Tap me</button>

<script>
  const HapticEngine = (() => {
    let label = null, init = false, audioCtx = null, filter = null, gain = null, buf = null;
    const id = 'wh-' + Math.random().toString(36).slice(2, 8);
    const vib = !!navigator.vibrate;
    function dom() {
      if (init) return;
      const l = document.createElement('label'); l.setAttribute('for', id); l.style.display = 'none';
      const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.id = id;
      i.style.all = 'initial'; i.style.appearance = 'auto'; i.style.display = 'none';
      l.appendChild(i); document.body.appendChild(l); label = l; init = true;
    }
    function audio() {
      if (audioCtx) return;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.connect(audioCtx.destination);
        gain = audioCtx.createGain(); gain.connect(filter);
        buf = audioCtx.createBuffer(1, 64, audioCtx.sampleRate);
      } catch(e) {}
    }
    function click(v) {
      if (!audioCtx || !buf) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 25);
      gain.gain.value = 0.5 * v;
      filter.frequency.value = (2000 + v * 2000) * (1 + (Math.random() - 0.5) * 0.3);
      const s = audioCtx.createBufferSource(); s.buffer = buf; s.connect(gain); s.onended = () => s.disconnect(); s.start();
    }
    return { trigger(style) {
      const p = { key: {i:.3,v:[8]}, light: {i:.6,v:[30]}, medium: {i:.85,v:[50]}, heavy: {i:1,v:[60,15,60]} }[style] || {i:.6,v:[30]};
      if (vib) navigator.vibrate(p.v);
      if (!vib) { dom(); if (label) label.click(); }
      audio(); click(p.i);
    }};
  })();

  function haptic(s) { HapticEngine.trigger(s); }
</script>
```

### Svelte

```svelte
<script>
  import { useHaptic, useHapticInput } from '@rowixorg/web-haptics/svelte';
</script>

<button use:useHaptic={'medium'}>Tap me</button>
<input use:useHapticInput placeholder="Type here" />
```

## Styles

| Style    | Feel                  | Best for              |
|----------|-----------------------|-----------------------|
| `key`    | Subtle tick           | Keyboard input        |
| `light`  | Soft tap              | List items, stories   |
| `medium` | Firm press            | Buttons, navigation   |
| `heavy`  | Strong thump          | Delete, send, confirm |

## Important notes

- **iOS requires sound on** (ringer switch unmuted) for Taptic Engine to fire
- Works best with a **bundler** (Vite, webpack, etc.) — direct CDN/ESM imports may break the iOS user gesture chain
- The audio click needs a user interaction to start (browser autoplay policy)

## License

MIT
