// Smooth 1D noise for organic-looking walls.

// Value noise: random heights on a lattice, blended with smoothstep. Returns 0..1.
function valueNoise() {
  const vals = Float32Array.from({ length: 256 }, () => Math.random());
  return (x) => {
    const i = Math.floor(x);
    const t = x - i;
    const a = vals[i & 255];
    const b = vals[(i + 1) & 255];
    return a + (b - a) * t * t * (3 - 2 * t);
  };
}

// Layers of value noise ("octaves"), each [wavelength in px, weight]: big slow
// swells plus smaller bumps on top. Stretched a little so it uses more of the
// 0..1 range (blending layers pulls values toward the middle).
export function layeredNoise(layers, stretch = 1.6) {
  const octaves = layers.map(([wavelength, weight]) => ({ n: valueNoise(), wavelength, weight }));
  const total = octaves.reduce((sum, o) => sum + o.weight, 0);
  return (x) => {
    let v = 0;
    for (const o of octaves) v += o.n(x / o.wavelength) * o.weight;
    v /= total;
    return Math.min(1, Math.max(0, 0.5 + (v - 0.5) * stretch));
  };
}
