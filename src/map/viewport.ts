// Pan/zoom viewport for the map. Ported from Fragments' tree viewport —
// the SVG re-renders wholesale on state changes, so gesture state lives out
// here on the container element and the transform is re-applied to the fresh
// <g class="vp"> after each render. Taps are synthesized from pointer events
// (movement under a threshold) so panning never mis-fires as pin selection.

export interface ViewportOptions {
  /** Called with the pointerdown target when a gesture ends as a tap. */
  onTap: (target: Element) => void;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 6;
const TAP_SLOP_PX = 8;

interface PointerInfo {
  x: number;
  y: number;
}

export class Viewport {
  scale = 1;
  tx = 0;
  ty = 0;

  private el: HTMLElement;
  private onTap: (target: Element) => void;
  private pointers = new Map<number, PointerInfo>();
  private tapCandidate: { target: Element; x: number; y: number } | null = null;
  private contentW = 0;
  private contentH = 0;

  constructor(el: HTMLElement, opts: ViewportOptions) {
    this.el = el;
    this.onTap = opts.onTap;

    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerCancel);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /** Content extent in unscaled px — used to clamp panning. */
  setContentSize(w: number, h: number): void {
    this.contentW = w;
    this.contentH = h;
  }

  /** Fit the whole map inside the viewport with a little breathing room. */
  fit(): void {
    const vw = this.el.clientWidth;
    const vh = this.el.clientHeight;
    if (!vw || !vh || !this.contentW || !this.contentH) return;
    this.scale = Math.min(vw / this.contentW, vh / this.contentH) * 0.96;
    this.tx = (vw - this.contentW * this.scale) / 2;
    this.ty = (vh - this.contentH * this.scale) / 2;
    this.apply();
  }

  /** Re-apply the current transform to the (possibly re-created) inner group. */
  apply(smooth = false): void {
    const g = this.el.querySelector<SVGGElement>('g.vp');
    if (!g) return;
    g.style.transformOrigin = '0 0';
    g.style.transition = smooth ? 'transform 0.45s ease' : 'none';
    g.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
  }

  /** Smoothly bring a content-space point toward the viewport center. */
  centerOn(cx: number, cy: number): void {
    const vw = this.el.clientWidth;
    const vh = this.el.clientHeight;
    this.tx = vw / 2 - cx * this.scale;
    this.ty = vh * 0.4 - cy * this.scale;
    this.clamp();
    this.apply(true);
  }

  private clamp(): void {
    const vw = this.el.clientWidth;
    const vh = this.el.clientHeight;
    const w = this.contentW * this.scale;
    const h = this.contentH * this.scale;
    // keep at least a third of the viewport over the content
    const pad = Math.min(vw, vh) / 3;
    this.tx = Math.min(Math.max(this.tx, pad - w), vw - pad);
    this.ty = Math.min(Math.max(this.ty, pad - h), vh - pad);
  }

  private zoomAt(px: number, py: number, factor: number): void {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    const applied = next / this.scale;
    // keep the content point under (px, py) anchored while scaling
    this.tx = px - (px - this.tx) * applied;
    this.ty = py - (py - this.ty) * applied;
    this.scale = next;
    this.clamp();
    this.apply();
  }

  private local(ev: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  private onPointerDown = (ev: PointerEvent): void => {
    try {
      this.el.setPointerCapture(ev.pointerId);
    } catch {
      // capture is best-effort: the pointer may already be gone
    }
    const p = this.local(ev);
    this.pointers.set(ev.pointerId, p);
    if (this.pointers.size === 1 && ev.target instanceof Element) {
      this.tapCandidate = { target: ev.target, x: p.x, y: p.y };
    } else {
      this.tapCandidate = null; // a second finger means pinch, not tap
    }
  };

  private onPointerMove = (ev: PointerEvent): void => {
    const prev = this.pointers.get(ev.pointerId);
    if (!prev) return;
    const p = this.local(ev);

    if (this.tapCandidate && Math.hypot(p.x - this.tapCandidate.x, p.y - this.tapCandidate.y) > TAP_SLOP_PX) {
      this.tapCandidate = null;
    }

    if (this.pointers.size === 1) {
      this.tx += p.x - prev.x;
      this.ty += p.y - prev.y;
      this.pointers.set(ev.pointerId, p);
      this.clamp();
      this.apply();
      return;
    }

    if (this.pointers.size === 2) {
      const [a0, b0] = [...this.pointers.values()];
      this.pointers.set(ev.pointerId, p);
      const [a1, b1] = [...this.pointers.values()];
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
      const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
      const c1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
      const c0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
      this.tx += c1.x - c0.x;
      this.ty += c1.y - c0.y;
      if (d0 > 0) this.zoomAt(c1.x, c1.y, d1 / d0);
      else {
        this.clamp();
        this.apply();
      }
    }
  };

  private onPointerUp = (ev: PointerEvent): void => {
    this.pointers.delete(ev.pointerId);
    if (this.tapCandidate && this.pointers.size === 0) {
      const { target } = this.tapCandidate;
      this.tapCandidate = null;
      this.onTap(target);
    }
  };

  private onPointerCancel = (ev: PointerEvent): void => {
    this.pointers.delete(ev.pointerId);
    this.tapCandidate = null;
  };

  private onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) {
      // trackpad pinch arrives as ctrl+wheel; zoom anchored at the cursor
      const p = this.local(ev);
      this.zoomAt(p.x, p.y, Math.exp(-ev.deltaY * 0.0022));
    } else {
      this.tx -= ev.deltaX;
      this.ty -= ev.deltaY;
      this.clamp();
      this.apply();
    }
  };
}
