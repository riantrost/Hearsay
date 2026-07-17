// db.js — the only thing that touches IndexedDB.
// Two stores: `campaigns` (whole-state JSON, keyed by id) and `images` (Blobs).
// Everything above this layer works with plain objects and never sees a request.

const DB_NAME = 'hearsay';
const DB_VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('campaigns')) {
        db.createObjectStore('campaigns', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images'); // keyed explicitly by imageId
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  async listCampaigns() {
    return tx('campaigns', 'readonly', s => reqAsPromise(s.getAll()));
  },
  async getCampaign(id) {
    return tx('campaigns', 'readonly', s => reqAsPromise(s.get(id)));
  },
  async putCampaign(state) {
    return tx('campaigns', 'readwrite', s => { s.put(state); });
  },
  async deleteCampaign(id) {
    return tx('campaigns', 'readwrite', s => { s.delete(id); });
  },
  async putImage(imageId, blob) {
    return tx('images', 'readwrite', s => { s.put(blob, imageId); });
  },
  async getImage(imageId) {
    return tx('images', 'readonly', s => reqAsPromise(s.get(imageId)));
  },
};
