# Retiring the old address

> The addresses here are placeholders (`where-is-it-OLD.pages.dev`, `where-is-it.YOUR-SUBDOMAIN.workers.dev`). Put in your own before deploying this page.


`where-is-it-OLD.pages.dev` (Cloudflare Pages project `where-is-it`) served the old, phone-only
app. It now serves only this folder: a page that removes the old app's offline copy and forwards
to https://where-is-it.YOUR-SUBDOMAIN.workers.dev, passing any data the old version saved on
the device so the new app can import it. `sw.js` is a kill switch for phones that installed the
old app (they check it for updates).

Deployed to both the production and preview branches:

    npx wrangler pages deploy retire-old-site --project-name where-is-it --branch main
    npx wrangler pages deploy retire-old-site --project-name where-is-it --branch phase2-preview
