// Boot: a stored seat opens its campaign; no seat (or a dead one — declined,
// wiped) lands on the front door. A #seat= fragment sits down in a carried
// seat; a #gauth= fragment finishes a Google round trip. Both are scrubbed
// from the address bar the moment they're consumed.

import { useEffect, useState } from 'preact/hooks';
import { ApiError, fetchAuthConfig, postGoogleLink, postGoogleRecover } from '../api';
import {
  loadActiveSeat,
  parseGauth,
  parseSeatLink,
  rememberSeatGoogle,
  rememberSeatLabel,
  removeSeat,
  saveSeat,
  startGoogleFlow,
  takeGoogleMode,
  type Seat,
} from '../seat';
import { ApiStore } from '../store';
import { Dialogs } from './dialogs';
import { ExampleView } from './ExampleView';
import { Landing } from './Landing';
import { TableView } from './TableView';

type Phase =
  | { at: 'loading' }
  | { at: 'door'; notice?: string }
  | { at: 'example' }
  | { at: 'table'; store: ApiStore };

export function App() {
  const [phase, setPhase] = useState<Phase>({ at: 'loading' });
  const [googleOn, setGoogleOn] = useState(false);

  useEffect(() => {
    fetchAuthConfig()
      .then((c) => setGoogleOn(c.google))
      .catch(() => setGoogleOn(false));
  }, []);

  const boot = async (): Promise<void> => {
    setPhase({ at: 'loading' });
    // a seat link carries a whole seat in the URL fragment — sit down in it,
    // then scrub the token out of the address bar
    const reclaimed = parseSeatLink(location.hash);
    if (reclaimed) {
      history.replaceState(null, '', location.pathname + location.search);
      saveSeat(reclaimed);
    }
    const gauth = parseGauth(location.hash);
    if (gauth) {
      history.replaceState(null, '', location.pathname + location.search);
      await handleGoogleReturn(gauth);
      return;
    }
    const seat = loadActiveSeat();
    if (!seat) {
      setPhase({ at: 'door' });
      return;
    }
    try {
      const store = await ApiStore.boot(seat);
      rememberSeatLabel(seat.campaignId, store.data.campaign.name);
      setPhase({ at: 'table', store });
    } catch (e) {
      // drop the chair only when the seat is genuinely gone — declined, wiped,
      // or its token dead (401/403/404). A transient failure (server blip,
      // offline) must not evict a good seat: it keeps its place in the picker,
      // and the front door shows the error so the reader can retry
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) removeSeat(seat.campaignId);
      setPhase({ at: 'door', notice: e instanceof Error ? e.message : String(e) });
    }
  };

  /**
   * Home from Google: either back the active seat up (link) or pull every
   * linked seat onto this device (recover — the walked-into-the-shop-empty-
   * handed case). The mode rode sessionStorage across the redirect; if it
   * didn't survive, recovery is the safe reading.
   */
  const handleGoogleReturn = async (gauth: string): Promise<void> => {
    const mode = takeGoogleMode();
    try {
      if (mode === 'link') {
        const seat = loadActiveSeat();
        if (!seat) throw new Error('no active seat to back up');
        const { email } = await postGoogleLink(seat, gauth);
        rememberSeatGoogle(seat.campaignId, email);
        void boot();
        return;
      }
      const { email, seats } = await postGoogleRecover(gauth);
      for (const s of seats) saveSeat({ ...s, google: email });
      if (seats.length === 0) {
        setPhase({
          at: 'door',
          notice: `no seats are backed up to ${email || 'that google account'} yet — join with a code, then back your seat up`,
        });
        return;
      }
      void boot();
    } catch (e) {
      setPhase({ at: 'door', notice: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSeated = (seat: Seat): void => {
    saveSeat(seat);
    void boot();
  };

  return (
    <>
      {phase.at === 'loading' && <div class="boot-veil">…</div>}
      {phase.at === 'door' && (
        <Landing
          onSeated={onSeated}
          onResume={() => void boot()}
          onExample={() => setPhase({ at: 'example' })}
          notice={phase.notice}
          google={googleOn}
          onGoogle={() => startGoogleFlow('recover')}
        />
      )}
      {phase.at === 'example' && <ExampleView onBack={() => setPhase({ at: 'door' })} />}
      {phase.at === 'table' && (
        <TableView
          key={phase.store.seat.campaignId}
          store={phase.store}
          googleOn={googleOn}
          onSwitchCampaign={() => setPhase({ at: 'door' })}
          onLeave={() => {
            removeSeat(phase.store.seat.campaignId);
            void boot();
          }}
        />
      )}
      <Dialogs />
    </>
  );
}
