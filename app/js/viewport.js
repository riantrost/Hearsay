// viewport.js — pan / pinch-zoom over a fixed-size "world" element.
// The world div is sized to the map image's natural pixels; pins live inside it in
// image-pixel space, so one transform moves image and pins together. Everything above
// works in normalized [0..1] map coordinates and never sees screen pixels.

export class Viewport {
  constructor(frame, world, { onTap, onTransform } = {}) {
    this.frame = frame;     // the clipping/overflow container (screen space)
    this.world = world;     // the transformed element (image-pixel space)
    this.onTap = onTap;     // (normX, normY, screenEvent) => void
    this.onTransform = onTransform; // (scale) => void — fires whenever the view transform changes
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.min = 0.05;
    this.max = 8;
    this._pointers = new Map();
    this._pinch = null;
    this._moved = 0;
    this._bind();
  }

  setWorldSize(w, h) {
    this.worldW = w;
    this.worldH = h;
    this.world.style.width = w + 'px';
    this.world.style.height = h + 'px';
  }

  fit() {
    const fr = this.frame.getBoundingClientRect();
    if (!this.worldW || !this.worldH) return;
    const s = Math.min(fr.width / this.worldW, fr.height / this.worldH) * 0.96;
    this.scale = s;
    this.tx = (fr.width - this.worldW * s) / 2;
    this.ty = (fr.height - this.worldH * s) / 2;
    this._apply();
  }

  _apply() {
    this.scale = Math.max(this.min, Math.min(this.max, this.scale));
    this.world.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    if (this.onTransform) this.onTransform(this.scale);
  }

  // screen point -> normalized map coordinate
  screenToNorm(clientX, clientY) {
    const fr = this.frame.getBoundingClientRect();
    const x = (clientX - fr.left - this.tx) / this.scale / this.worldW;
    const y = (clientY - fr.top - this.ty) / this.scale / this.worldH;
    return { x, y };
  }

  zoomAt(clientX, clientY, factor) {
    const fr = this.frame.getBoundingClientRect();
    const px = clientX - fr.left, py = clientY - fr.top;
    const before = { x: (px - this.tx) / this.scale, y: (py - this.ty) / this.scale };
    this.scale *= factor;
    this.scale = Math.max(this.min, Math.min(this.max, this.scale));
    this.tx = px - before.x * this.scale;
    this.ty = py - before.y * this.scale;
    this._apply();
  }

  _bind() {
    const f = this.frame;
    f.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      this.zoomAt(e.clientX, e.clientY, factor);
    }, { passive: false });

    f.addEventListener('pointerdown', (e) => {
      // Let taps/clicks on pins and buttons reach them: capturing the pointer to the
      // frame here would retarget the click to the frame and swallow it.
      if (e.target.closest && e.target.closest('button, a, input, .sheet')) return;
      f.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._moved = 0;
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        this._pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      }
    });

    f.addEventListener('pointermove', (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;

      if (this._pointers.size === 2 && this._pinch) {
        const [a, b] = [...this._pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.zoomAt(mid.x, mid.y, dist / this._pinch.dist);
        this._pinch.dist = dist;
      } else if (this._pointers.size === 1) {
        this.tx += dx; this.ty += dy;
        this._moved += Math.abs(dx) + Math.abs(dy);
        this._apply();
      }
    });

    const up = (e) => {
      const onInteractive = e.target.closest && e.target.closest('button, a, input');
      const wasTap = this._pointers.size === 1 && this._moved < 6 && !onInteractive;
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinch = null;
      if (wasTap && this.onTap) {
        const n = this.screenToNorm(e.clientX, e.clientY);
        if (n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1) this.onTap(n.x, n.y, e);
      }
    };
    f.addEventListener('pointerup', up);
    f.addEventListener('pointercancel', (e) => { this._pointers.delete(e.pointerId); this._pinch = null; });
  }
}
