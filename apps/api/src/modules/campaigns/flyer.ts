/**
 * Campaign flyer: one optional image shown inline at the top of a campaign
 * email, plus a "Download flyer" button linking to the same full-resolution
 * image. Never sent as an attachment (see migration 0026 for why).
 *
 * Safety: the flyer URL must live on OUR public media host under the
 * campaign_flyers/ prefix that the upload flow writes to. That keeps third
 * party tracking pixels, spam-hosted images and arbitrary links out of bulk
 * mail sent from Orkora's domain.
 */

/**
 * Returns the normalised flyer URL if it is an https URL on the configured
 * media base and under campaign_flyers/, otherwise null.
 */
export function acceptFlyerUrl(
  raw: string | null | undefined,
  publicBaseUrl: string | null | undefined,
): string | null {
  return acceptOwnMediaUrl(raw, publicBaseUrl, 'campaign_flyers', /\.(png|jpe?g|webp)$/i);
}

/**
 * Organization logo for the campaign email header. Same rule as flyers but for
 * the logos/ upload folder; GIF is allowed (a still logo may be a GIF). SVG is
 * never accepted because Gmail and Outlook do not render it.
 */
export function acceptLogoUrl(
  raw: string | null | undefined,
  publicBaseUrl: string | null | undefined,
): string | null {
  return acceptOwnMediaUrl(raw, publicBaseUrl, 'logos', /\.(png|jpe?g|webp|gif)$/i);
}

/**
 * Shared "our media only" check: https, on the configured public media host,
 * no credentials, query or fragment, and exactly <folder>/<uploader>/<file>.
 */
export function acceptOwnMediaUrl(
  raw: string | null | undefined,
  publicBaseUrl: string | null | undefined,
  folder: string,
  extension: RegExp,
): string | null {
  if (!raw || !publicBaseUrl) return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 500) return null;

  let url: URL;
  let base: URL;
  try {
    url = new URL(value);
    base = new URL(publicBaseUrl.replace(/\/$/, '') + '/');
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (url.host.toLowerCase() !== base.host.toLowerCase()) return null;

  // Path must sit under the base path, then campaign_flyers/<user>/<file>.
  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  if (!url.pathname.startsWith(basePath)) return null;
  const rest = url.pathname.slice(basePath.length);
  const prefix = `${folder}/`;
  if (!rest.startsWith(prefix)) return null;
  const tail = rest.slice(prefix.length);
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.[A-Za-z0-9]+$/.test(tail) || !extension.test(tail)) {
    return null;
  }
  return url.toString();
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The campaign email header row. Recipients signed up for the organizer's
 * event, so the header carries the organizer, not the platform:
 *   - with an uploaded logo: logo on white, organization name beneath it;
 *   - without one: the organization name on the purple band.
 * Orkora stays identified in the statutory footer line. An organization with
 * no name at all (should not happen) falls back to "Orkora".
 */
export function renderBrandHeader(org: { name?: string | null; logoUrl?: string | null }): string {
  const rawName = (org.name ?? '').trim() || 'Orkora';
  const name = escapeText(rawName);
  if (org.logoUrl) {
    const src = escapeAttr(org.logoUrl);
    return `<tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:24px 24px 18px 24px;border-bottom:1px solid #E2E8F0;">
  <img src="${src}" alt="${escapeAttr(rawName)}" height="64" style="display:block;height:64px;width:auto;max-width:200px;border:0;margin:0 auto 10px auto;">
  <span style="display:inline-block;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;line-height:24px;font-weight:600;color:#0F172A;">${name}</span>
</td></tr>`;
  }
  return `<tr><td align="center" bgcolor="#5B21B6" style="background-color:#5B21B6;background:linear-gradient(180deg,#6D28D9 0%,#4C1D95 100%);padding:24px;">
  <span style="display:inline-block;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;line-height:30px;font-weight:600;letter-spacing:-0.3px;color:#ffffff;">${name}</span>
</td></tr>`;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The HTML block placed above the campaign body. Width matches the email's
 * content column (560 table minus 28px padding each side = 504px) and scales
 * down on narrow screens. The button keeps the flyer reachable in clients that
 * block remote images by default.
 */
export function renderFlyerBlock(flyerUrl: string): string {
  const src = escapeAttr(flyerUrl);
  return `<div style="margin:0 0 24px 0;text-align:center;">
<img src="${src}" alt="Event flyer" width="504" style="display:block;width:100%;max-width:504px;height:auto;border:0;border-radius:12px;margin:0 auto;">
<a href="${src}" style="display:inline-block;margin-top:14px;background:#6D28D9;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:600;font-size:14px;">Download flyer</a>
</div>`;
}
