/* Invoice and client data are retrieved live, even in the installed app. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || new URL(event.request.url).pathname !== '/invoices.html') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>GA Invoicing</title><h1>GA Invoicing</h1><p>Connect to the internet to access your invoices and clients.</p><a href="/invoices.html">Try again</a>',
    {status:503, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}}
  )));
});
