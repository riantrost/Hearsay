// The front door: found a campaign (name + map, minting the owner's seat)
// or join one by code (minting a pending seat). Both hand back a Seat and
// the app takes it from there.

import { createCampaign, joinCampaign } from './api';
import type { Seat } from './seat';

export function renderLanding(host: HTMLElement, onSeated: (seat: Seat) => void, notice?: string): void {
  host.innerHTML = `
    <div class="landing">
      <h1>Hearsay</h1>
      <p class="tagline">the shared map remembers — every seat remembers differently</p>
      <p class="landing-notice" hidden></p>
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

  const foundForm = host.querySelector<HTMLFormElement>('.found-form')!;
  foundForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    errorEl.hidden = true;
    void (async () => {
      const fd = new FormData(foundForm);
      const map = fd.get('map');
      if (!(map instanceof File) || map.size === 0) throw new Error('a campaign needs its map');
      // the server can't decode images: the client reads the natural size
      const bmp = await createImageBitmap(map);
      const { campaign, member, token } = await createCampaign({
        name: String(fd.get('name') ?? ''),
        ownerName: String(fd.get('ownerName') ?? ''),
        map,
        mapW: bmp.width,
        mapH: bmp.height,
      });
      bmp.close();
      onSeated({ campaignId: campaign.id, memberId: member.id, token });
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
      onSeated({ campaignId, memberId: member.id, token });
    })().catch(fail);
  });
}
