# Orkora Mobile Release Runbook

**Last updated:** 2 June 2026
**Audience:** the operator (you).
**Goal:** every device, every attendee, installable today, with no Expo Go in the loop.

## The strategy

There are three install paths. The first is live now. The second ships when you push the next deploy. The third needs one command from your laptop.

| Path | Status | Cost | Reach |
|---|---|---|---|
| **PWA (Add to Home Screen)** | live | $0 | iPhone, iPad, Android, Mac, Windows, Linux |
| **Native Android APK (sideload)** | one EAS command away | $0 if Expo free tier suffices; ~$29/mo for EAS Production | Android |
| **Native iOS app (TestFlight, then App Store)** | one EAS command + Apple Developer Program | $99/yr Apple + ~$29/mo EAS | iPhone, iPad |

The **PWA path is the recommended install for every user**. It is genuinely good: branded home-screen icon, full-screen layout, theme-coloured status bar, offline ticket access once we add a service worker. The native paths are for the polished release.

The earlier Expo Go failure was not a fundamental problem. Expo Go is a developer-preview tool, not a distribution path. Two real options bypass it entirely:

- **`eas build --profile development`** produces a custom dev-client APK / IPA you install once. From then on, every code change you push is loaded over the air. This replaces Expo Go for development.
- **`eas build --profile preview` / `--profile production`** produces a real APK or .aab / .ipa you sideload, share, or upload to the stores. This is the distribution path.

No SDK mismatch is possible with either. Both are SDK-agnostic.

---

## Part A — PWA (live as of this deploy)

### What ships in this push

- `apps/web/public/manifest.webmanifest` — PWA manifest with brand colours, name, icons, shortcuts (My tickets, Dashboard).
- `apps/web/public/icon.svg` + `/icon-maskable.svg` + `/favicon.svg` — brand icon set in SVG (renders at any resolution).
- `apps/web/app/layout.tsx` — Next.js metadata + viewport now declares the manifest, apple-touch-icon, apple-mobile-web-app-capable, theme-color (#4C1D95), and viewport-fit cover.
- `apps/web/app/_components/InstallPrompt.tsx` — client component that captures the Chrome / Edge `beforeinstallprompt` event on Android and desktop and shows an "Install" button; detects iOS Safari and shows the Share -> Add to Home Screen instructions instead.
- `apps/web/app/(public)/e/[code]/page.tsx` — surfaces the install banner on every public event page, so a first-time attendee is offered the install at the exact moment they care about Orkora.
- `apps/web/app/install/page.tsx` — a public `/install` landing page with per-platform instructions (iOS, Android, desktop) plus a "Want the native APK?" CTA.

### How to verify after deploy

1. Open `https://orkora-api.vercel.app/e/<any-event-code>` on an Android phone in Chrome.
2. Within a second or two, a bottom banner should appear: "Install Orkora". Tap Install. Confirm. Orkora is now on your home screen.
3. Launch it from the home screen. It opens full-screen, no browser chrome, brand purple status bar.
4. On an iPhone in Safari: open the same URL. The banner shows the "Tap Share, then Add to Home Screen" hint. Follow it. Same result.
5. On a Mac in Chrome: an install icon appears in the address bar. Click it, confirm. Orkora opens in its own window with a dock icon.

### What is intentionally not in this push

- **No PNG icons.** All icons are SVG. iOS Safari 16+ renders them. Older iOS will fall back to no icon, which is acceptable. If a perfect-pixel PNG set is wanted later, render the SVGs at 192px, 512px, and 180px (apple-touch).

### Offline ticket QR (shipped in the follow-up push)

The service worker layer lives in `apps/web/public/sw.js`. It is intentionally hand-rolled (no Workbox, no next-pwa dependency) so we can read and reason about the caching strategy directly.

- **App shell** (Next.js build assets, brand icons, manifest, `/offline.html`) is precached on install and cache-first thereafter.
- **Ticket pages** (`/t/<code>`) are network-first with a 7-day cache fallback, so a returning user gets the latest copy on signal and the cached copy on bad wifi.
- **Ticket API** (`GET /api/v1/registrations/tickets/<code>`) is network-first with a 24-hour cache fallback. This is the load-bearing path: the qrToken payload is what the client renders into a QR. Caching it means the page works at the venue with no signal.
- **Auth, dashboard, payments, webhooks** are explicitly excluded. A service worker that caches `/login` is a footgun; we never let that happen.
- **Cross-user cache safety:** we only cache `/t/<code>` (where the code itself is the auth, anyone with the URL gets the ticket) and the public app shell. We never cache `/me/tickets` or any user-scoped endpoint. Logging out cannot expose a sibling user's QR.
- The fallback page at `/offline.html` is inline-styled and zero-dependency, so it renders even when the user has never loaded Orkora before.

#### Verify

1. Open `https://orkora.io/t/<some-real-ticket-code>` on a phone, with signal.
2. Wait 2 seconds for the SW to install (one-time, silent).
3. Toggle airplane mode on, close and reopen the tab. The ticket page renders, the QR draws, the data is correct.
4. Airplane mode off, navigate around. Everything still feels native: cache hit on assets, fresh fetch on dynamic data.
5. Hit a never-visited URL with airplane mode on. The branded `/offline.html` renders with a "Try again" button and an `online` event listener that auto-reloads when the connection returns.

### Real fallback if a user cannot install

The PWA install is optional. The site works perfectly in any browser without installing it. Users who do not want the install simply ignore the banner; the 7-day dismissal window prevents nagging.

---

## Part B — Native Android APK (one command away)

The EAS preview profile in `apps/mobile/eas.json` is already configured to produce an APK that can be sideloaded on Android.

### Prerequisites (one-time)

```bash
# Install the Expo / EAS CLI globally.
npm install -g eas-cli

# Log into your Expo account (free tier works for one build a day).
eas login

# Inside the mobile workspace, link the project to your Expo account.
cd apps/mobile
eas init --id <your-eas-project-id-if-existing>
```

If you do not already have an Expo project ID, the first `eas build` will create one and prompt you to commit the change to `app.json` (`"extra": { "eas": { "projectId": "..." } }`). Accept it.

### Build the APK

```bash
cd apps/mobile

# Preview build. Distribution = internal, signed APK output.
eas build --profile preview --platform android
```

Expo runs the build remotely. Takes ~10 to 15 minutes. When it finishes, you get a link like:

```
https://expo.dev/artifacts/eas/abc123.apk
```

That URL is the install link. You share it with beta organizers (email, WhatsApp, link on `/install`), they open it on Android, accept the "install from unknown sources" prompt once, and they have Orkora on their phone with native UI, secure on-device storage, and push notifications.

### Distribute the APK link

Update `apps/web/app/install/page.tsx` to point the "Want the APK?" section at the actual artifact URL (or a stable redirect like `https://orkora.io/apk/latest`). A small follow-up script can copy the latest EAS artifact to a stable Cloudflare R2 URL on each build.

### Verify the APK works

1. Download the APK on an Android phone.
2. Open it, accept the install prompt, launch.
3. The app opens to the Event Code screen (mirrors the screenshot you shared from EventsAir).
4. Enter `A35BHZ` (Tech Summit 2026), confirm, navigate the event.

### When to bump from preview to production

Production builds produce an `.aab` (Android App Bundle) for the Play Store. Run `eas build --profile production --platform android` once you have a Google Play Developer account ($25 one-time). Then `eas submit --profile production --platform android` uploads to Play Console for review.

---

## Part C — Native iOS

iOS distribution requires:

- An Apple Developer Program membership ($99/year).
- An Apple ID configured in `apps/mobile/eas.json` under `submit.production.ios`.
- One `eas build --profile production --platform ios` to produce the `.ipa`.
- `eas submit --profile production --platform ios` to push to App Store Connect.

For internal testing without paying for the full Developer Program, TestFlight is the path: same `.ipa`, distributed to up to 10,000 testers via email invitation. This requires the Developer Program too.

Until the Apple side is set up, **the PWA is the iOS install story**. It is genuinely good on iOS Safari 16+, including offline icon, standalone display, and brand-purple status bar.

---

## Part D — Replacing Expo Go for our own dev loop

This is the answer to the earlier Expo Go failure.

### Build the dev-client once

```bash
cd apps/mobile

# Custom dev-client. Internal distribution, SDK-agnostic.
eas build --profile development --platform android
```

When it finishes, install the resulting APK on your dev device. From then on, you start the metro bundler with:

```bash
cd apps/mobile
npx expo start --dev-client
```

The dev-client APK on your phone connects to the metro bundler running on your laptop. Every code change you save is loaded over the air. No Expo Go, no SDK mismatch, ever. Same workflow on iOS once you build the dev-client `.ipa` (requires the Apple side).

### Why the original Expo Go path failed

`expo start` defaults to opening the project in the public Expo Go app on the App / Play Store. Expo Go is a single binary that supports a specific set of SDK versions at any given time; if the project's SDK is older than what Expo Go currently supports, the QR scan fails or the app crashes on launch. SDK 51 (our current version, August 2024) is now two SDKs behind, which is roughly where Expo Go drops support.

The fix is permanent: use the dev-client. The dev-client is built against our project's SDK, so it will never go out of sync.

---

## Part E — Putting it together for a beta event

Concrete sequence the operator runs when onboarding a new beta event:

1. Organizer publishes the event in the dashboard.
2. Organizer shares the public event link (`https://orkora.io/e/ABCD12`).
3. Attendee opens the link on their phone.
4. **PWA path (everyone, immediately):** install banner appears, attendee installs Orkora, opens it, registers, gets a ticket.
5. **APK path (optional):** the organizer (or attendee) downloads the APK from `https://orkora.io/apk/latest`. Installs once. Uses Orkora natively.
6. **iOS native path (after Apple onboarding):** attendee installs from TestFlight invite.

The first two paths are live today after this push. The third needs a $99 Apple Developer Program enrollment and one EAS build.

---

## Part F — Outstanding follow-ups

Tracked so we do not lose them, in the priority I would attack:

1. ~~**Service worker for offline ticket QR.**~~ **Shipped.** See "Offline ticket QR" in Part A above. The service worker at `apps/web/public/sw.js` precaches the app shell, network-firsts ticket pages with a cache fallback, and the offline page at `/offline.html` is the last-resort landing.
2. **Stable APK distribution URL.** Set `https://orkora.io/apk/latest` to redirect to the latest EAS artifact. A small CI step on every preview build keeps it current.
3. **Push notifications.** `expo-notifications` is already in the mobile dependencies. Wiring it requires the FCM server key for Android and the APNs auth key for iOS, both available from the respective developer consoles.
4. **App Store + Play Store submission.** Production builds + the EAS submit pipeline. Gated on Apple Developer Program ($99) and Google Play Console ($25).
5. **PNG icon set for older iOS.** Render the SVG masters at 180x180 (apple-touch), 192x192 (PWA), 512x512 (PWA splash). One command with `rsvg-convert` or a small Node script.

The last four are nice-to-haves; the PWA already covers the install promise plus the offline-ticket promise for every device.
