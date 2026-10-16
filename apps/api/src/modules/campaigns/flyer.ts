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
  if (!/^campaign_flyers\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.(png|jpe?g|webp)$/i.test(rest)) {
    return null;
  }
  return url.toString();
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
