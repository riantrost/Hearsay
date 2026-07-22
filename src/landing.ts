// The front door: resume a table you already hold a chair at, found a new
// campaign (name + map, minting the owner's seat), or join one by code
// (minting a pending seat). Every path hands back a Seat and the app takes it
// from there. Because one browser can now sit at many tables, the door is
// reachable from inside a campaign too — arriving here never costs a seat.

import { createCampaign, joinCampaign } from './api';
import { loadSeats, removeSeat, setActiveCampaign, type Seat } from './seat';

/** An SVG carries its size in markup — explicit px width/height, else the viewBox. */
function parseSvgSize(text: string): { w: number; h: number } | null {
  const svg = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('svg');
  if (!svg) return null;
  const wAttr = svg.getAttribute('width') ?? '';
  const hAttr = svg.getAttribute('height') ?? '';
  if (!wAttr.includes('%') && !hAttr.includes('%')) {
    const w = parseFloat(wAttr);
    const h = parseFloat(hAttr);
    if (w > 0 && h > 0) return { w, h };
  }
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { w: vb[2], h: vb[3] };
  return null;
}

/**
 * The natural size of the map image, read client-side (the server can't decode
 * images). Pins live in normalized [0,1] coords, so this fixes the coordinate
 * scale and aspect ratio. SVG is parsed from markup — createImageBitmap can't
 * decode it, and an <img> reports a defaulted size, not the real viewBox — so a
 * vector map founds a campaign at its own coordinates; raster maps read pixels.
 */
async function readMapSize(file: File): Promise<{ w: number; h: number }> {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const size = parseSvgSize(await file.text());
    if (size) return size;
  }
  try {
    const bmp = await createImageBitmap(file);
    try {
      if (bmp.width > 0 && bmp.height > 0) return { w: bmp.width, h: bmp.height };
    } finally {
      bmp.close();
    }
  } catch {
    // some formats (svg) can't be decoded this way — fall through to an <img>
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth > 0 && img.naturalHeight > 0) return { w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
  throw new Error('this map’s size could not be read — try a PNG, JPG, or an SVG with a viewBox');
}

export interface LandingHandlers {
  /** A new seat was minted (found or joined) — save it and open its table. */
  onSeated: (seat: Seat) => void;
  /** An existing table was picked from the roster — it's already active, open it. */
  onResume: () => void;
  notice?: string;
  /** Whether this deployment offers the Google recovery thread. */
  google?: boolean;
  /** Leave for Google sign-in to pull linked seats onto this device. */
  onGoogle?: () => void;
}

export function renderLanding(host: HTMLElement, handlers: LandingHandlers): void {
  const { onSeated, onResume, notice, google, onGoogle } = handlers;
  const seats = loadSeats();
  host.innerHTML = `
    <div class="landing">
      <h1>Hearsay</h1>
      <p class="tagline">the shared map remembers — every seat remembers differently</p>
      <p class="landing-notice" hidden></p>
      <section class="landing-card your-tables" hidden>
        <h2>Your tables</h2>
        <ul class="table-list"></ul>
      </section>
      <section class="landing-card">
        <h2>Found a campaign</h2>
        <form class="found-form">
          <input name="name" placeholder="campaign name" required maxlength="80" />
          <input name="ownerName" placeholder="your name" required maxlength="60" />
          <label class="map-pick">the world map <input name="map" type="file" accept="image/*" required /></label>
          <button>found it</button>
        </form>
      </section>
      <section class="landing-card">
        <h2>Join a table</h2>
        <form class="join-form">
          <input name="code" placeholder="join code" required maxlength="12" autocapitalize="characters" />
          <input name="joinName" placeholder="your name" required maxlength="60" />
          <button>take a seat</button>
        </form>
      </section>
      <section class="landing-card google-card" hidden>
        <h2>Been here before?</h2>
        <p class="google-hint">seats backed up to Google follow you to any device</p>
        <button class="google-btn">find my tables</button>
      </section>
      <p class="landing-error" hidden></p>
    </div>`;

  const noticeEl = host.querySelector<HTMLElement>('.landing-notice')!;
  if (notice) {
    noticeEl.textContent = notice;
    noticeEl.hidden = false;
  }
  const errorEl = host.querySelector<HTMLElement>('.landing-error')!;
  const fail = (e: unknown) => {
    errorEl.textContent = e instanceof Error ? e.message : String(e);
    errorEl.hidden = false;
  };

  // The recovery thread, when this deployment carries it: sign in with
  // Google and every backed-up seat follows you to this device.
  if (google && onGoogle) {
    const card = host.querySelector<HTMLElement>('.google-card')!;
    card.hidden = false;
    card.querySelector<HTMLButtonElement>('.google-btn')!.addEventListener('click', onGoogle);
  }

  // Your tables: every chair this browser holds, one tap to sit back down.
  if (seats.length > 0) {
    const section = host.querySelector<HTMLElement>('.your-tables')!;
    const list = section.querySelector<HTMLUListElement>('.table-list')!;
    section.hidden = false;
    for (const seat of seats) {
      const row = document.createElement('li');
      row.className = 'table-row';
      const open = document.createElement('button');
      open.className = 'table-open';
      open.textContent = seat.label ?? 'a table';
      open.addEventListener('click', () => {
        setActiveCampaign(seat.campaignId);
        onResume();
      });
      const leave = document.createElement('button');
      leave.className = 'table-leave';
      leave.title = 'forget this table on this device';
      leave.textContent = '×';
      leave.addEventListener('click', () => {
        if (confirm(`Forget "${seat.label ?? 'this table'}" on this device? Rejoin needs the code or a reclaim link.`)) {
          removeSeat(seat.campaignId);
          renderLanding(host, handlers);
        }
      });
      row.append(open, leave);
      list.appendChild(row);
    }
  }

  const foundForm = host.querySelector<HTMLFormElement>('.found-form')!;
  foundForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    errorEl.hidden = true;
    void (async () => {
      const fd = new FormData(foundForm);
      const map = fd.get('map');
      if (!(map instanceof File) || map.size === 0) throw new Error('a campaign needs its map');
      const { w: mapW, h: mapH } = await readMapSize(map);
      const { campaign, member, token } = await createCampaign({
        name: String(fd.get('name') ?? ''),
        ownerName: String(fd.get('ownerName') ?? ''),
        map,
        mapW,
        mapH,
      });
      onSeated({ campaignId: campaign.id, memberId: member.id, token, label: campaign.name });
    })().catch(fail);
  });

  const joinForm = host.querySelector<HTMLFormElement>('.join-form')!;
  joinForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    errorEl.hidden = true;
    void (async () => {
      const fd = new FormData(joinForm);
      const { campaignId, member, token } = await joinCampaign(
        String(fd.get('code') ?? '').trim(),
        String(fd.get('joinName') ?? '').trim(),
      );
      // the join response carries no campaign name; the label fills in on first boot
      onSeated({ campaignId, memberId: member.id, token });
    })().catch(fail);
  });
}
