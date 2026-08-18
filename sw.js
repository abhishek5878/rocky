// The service worker. It exists for one reason: this product is for someone
// having a hard week, and a hard week does not wait for signal. Without it the
// page is a network fetch every time and a tunnel is a blank screen.
//
// What it caches: the shell. The page, the icons, the manifest. Things that
// are identical for everyone and contain nobody.
//
// What it refuses to cache, and this is the part that matters:
//
//   - Anything not same-origin. Every call to the backend is cross-origin by
//     construction, so a person's record, their consents and their pairing
//     cannot land in a cache the browser keeps after they close the tab.
//   - Anything that is not a GET. The backend is spoken to over POST, so this
//     is a second, independent guard on the same boundary.
//
// A stale shell is its own hazard: it could pin someone to an old build whose
// published claims no longer match what the backend does. So the version below
// is the content hash of the page, written in by the build, and a new build
// evicts every older cache on activate.

const VERSION = "25780fa1baac";
const CACHE = `rocky-${VERSION}`;
const SHELL = ["./", "./rocky.html", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (event) => {
  // Take over promptly: a person who just installed should not have to close
  // every tab before the thing they installed starts working offline.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network first, so a person opens the current build whenever they can, and
  // the cache is the fallback rather than the default. The alternative caches
  // a page making claims about what the backend does, and serves it after
  // those claims stop being true.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("./rocky.html"))),
  );
});
