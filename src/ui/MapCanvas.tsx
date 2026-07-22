// The map: the campaign image plus its pins, filtered to the viewed session.
// Declarative now — Preact patches the pins that changed instead of
// rebuilding the SVG, so the Viewport's transform on <g class="vp"> simply
// persists across data updates (the old renderer re-applied it after every
// wholesale rebuild). The Viewport class itself is salvaged as-is: it owns
// pointer gestures on the host element and never cares who draws inside it.

import { useEffect, useRef } from 'preact/hooks';
import { ghostPins, pinPulse, pulseClass, siteMarks, stagedPins, visiblePins } from '../derive';
import type { CampaignData, Pin } from '../model';
import { Viewport } from '../map/viewport';

export interface MapCanvasProps {
  data: CampaignData;
  session: number;
  selectedPinId: string | null;
  /** Owner: also render event-less pins (ghosts) and the staged secret layer. */
  withGhosts: boolean;
  /** Armed placement: the next map tap places a pin (owner, at the present). */
  placing: boolean;
  past: boolean;
  onTapPin: (pinId: string | null) => void;
  /** A tap on open ground while armed, in normalized [0,1] map coords. */
  onPlace: (x: number, y: number) => void;
}

function PinGlyph({ data, pin, session, kind, selected }: { data: CampaignData; pin: Pin; session: number; kind: 'live' | 'ghost' | 'staged'; selected: boolean }) {
  const { mapW, mapH } = data.campaign;
  const events = data.events.filter((e) => e.pinId === pin.id && e.session <= session);
  const marks = siteMarks(data, pin.id, session);
  const pulse = kind === 'live' ? pinPulse(data, pin.id, session) : null;
  // pin geometry is authored at a 1600px reference map; scale with the image,
  // then counter-scale by --pin-k (viewport-driven, ~1/zoom) so pins hold a
  // legible screen size at any zoom instead of shrinking to specks
  const u = Math.max(mapW, mapH) / 1600;
  const haloR = 14 + (events.length - 1) * 6;
  const open = pulse ? pulse.total - pulse.filled : 0;
  const jackR = haloR + 5;
  return (
    <g
      class={'pin' + (kind === 'staged' ? ' staged' : kind === 'ghost' ? ' ghost' : pulseClass(pulse!.age)) + (selected ? ' selected' : '')}
      data-pin-id={pin.id}
      style={{
        transformBox: 'view-box',
        transformOrigin: '0 0',
        transform: `translate(${pin.x * mapW}px, ${pin.y * mapH}px) scale(calc(${u} * var(--pin-k, 1)))`,
      }}
    >
      {kind === 'live' && <circle class="pin-halo" r={haloR} />}
      {Array.from({ length: open }, (_, i) => {
        const a = ((-90 + (i - (open - 1) / 2) * 26) * Math.PI) / 180;
        return <circle class="pin-jack" cx={(jackR * Math.cos(a)).toFixed(1)} cy={(jackR * Math.sin(a)).toFixed(1)} r={3.2} />;
      })}
      <circle class="pin-dot" r={9} />
      {events.length > 1 && (
        <text class="pin-count" y={4}>
          {events.length}
        </text>
      )}
      {marks.length > 0 && (
        <text class="pin-scrawl" x={13} y={-10}>
          ✎
        </text>
      )}
      <text class="pin-label" y={32}>
        {pin.name}
      </text>
      {kind === 'staged' && (
        <text class="pin-staged-tag" y={46}>
          hidden
        </text>
      )}
    </g>
  );
}

export function MapCanvas({ data, session, selectedPinId, withGhosts, placing, past, onTapPin, onPlace }: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  // the tap handler closes over fresh props via a ref — the Viewport is
  // constructed once and must not be re-wired on every render
  const tapRef = useRef({ placing, onTapPin, onPlace, mapW: data.campaign.mapW, mapH: data.campaign.mapH });
  tapRef.current = { placing, onTapPin, onPlace, mapW: data.campaign.mapW, mapH: data.campaign.mapH };

  useEffect(() => {
    const host = hostRef.current!;
    const vp = new Viewport(host, {
      onTap(target, cx, cy) {
        const t = tapRef.current;
        if (t.placing) {
          if (cx >= 0 && cy >= 0 && cx <= t.mapW && cy <= t.mapH) t.onPlace(cx / t.mapW, cy / t.mapH);
          return;
        }
        const pinEl = target.closest<SVGGElement>('.pin');
        t.onTapPin(pinEl?.dataset.pinId ?? null);
      },
      onTransform(scale) {
        const k = Math.max(0.5, Math.min(2.4, 1 / scale));
        host.style.setProperty('--pin-k', k.toFixed(3));
      },
    });
    vp.setContentSize(tapRef.current.mapW, tapRef.current.mapH);
    viewportRef.current = vp;

    // the pane can be zero-sized at startup; fit once real dimensions exist,
    // and refit on resize until the user takes over the camera
    let userMoved = false;
    let raf = 0;
    const markMoved = (): void => {
      userMoved = true;
    };
    host.addEventListener('pointerdown', markMoved, { once: true });
    host.addEventListener('wheel', markMoved, { once: true });
    const tryFit = (): void => {
      if (host.clientWidth > 0) vp.fit();
      else raf = requestAnimationFrame(tryFit);
    };
    tryFit();
    const onResize = (): void => {
      if (!userMoved) vp.fit();
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // the <g class="vp"> node persists across renders (keyed diffing), but make
  // sure a freshly mounted one gets the current transform
  useEffect(() => {
    viewportRef.current?.apply();
  });

  const ghosts = withGhosts ? ghostPins(data, session) : [];
  const staged = withGhosts ? stagedPins(data) : [];

  return (
    <div class={'map-host' + (placing ? ' placing' : '') + (past ? ' past' : '')} ref={hostRef}>
      <svg class="map">
        <g class="vp">
          <image href={data.campaign.mapImageUrl} width={data.campaign.mapW} height={data.campaign.mapH} />
          {visiblePins(data, session).map((p) => (
            <PinGlyph key={p.id} data={data} pin={p} session={session} kind="live" selected={p.id === selectedPinId} />
          ))}
          {ghosts.map((p) => (
            <PinGlyph key={p.id} data={data} pin={p} session={session} kind="ghost" selected={p.id === selectedPinId} />
          ))}
          {staged.map((p) => (
            <PinGlyph key={p.id} data={data} pin={p} session={session} kind="staged" selected={p.id === selectedPinId} />
          ))}
        </g>
      </svg>
    </div>
  );
}
