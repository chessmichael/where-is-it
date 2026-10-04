// Kill switch for the old app's service worker. Phones that installed the old
// version check this file for updates; this version deletes the old offline
// copy, unregisters itself, and reloads open pages so they get the forwarding
// page instead of the cached old app.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key)
      await self.registration.unregister()
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
    })(),
  )
})
