/**
 * StagingBanner
 *
 * Renders a thin, persistent strip at the top of every page when
 * NEXT_PUBLIC_APP_ENV === 'staging'. The point is to make it impossible to
 * mistake the staging deploy for production at a glance: identical UI, same
 * routes, same flows, but one obvious bar of colour says "this is not real".
 *
 * Design choices:
 *   - It is a server component (no client JS), so it appears on the first
 *     server-rendered paint and cannot be skipped by a misconfigured client.
 *   - It is inert: no links, no dismiss button. A dismiss button would defeat
 *     the purpose; the bar exists because operators forget which tab is
 *     which. If we want a dismiss later, the right shape is "remember for 1
 *     hour" stored in localStorage, not "remember forever".
 *   - It uses inline styles instead of Tailwind classes so it cannot be
 *     accidentally overridden by globals.css or hidden by an ad-blocker
 *     element-list rule that targets .bg-yellow-* utility classes.
 *   - It renders nothing in any other environment, including local dev. We
 *     do not want the banner to be familiar; we want it to feel out of place.
 */
export default function StagingBanner() {
  const env = process.env.NEXT_PUBLIC_APP_ENV;
  if (env !== 'staging') return null;

  return (
    <div
      role="status"
      aria-label="Staging environment notice"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        width: '100%',
        backgroundColor: '#FBBF24',
        color: '#1F2937',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        textAlign: 'center',
        padding: '6px 12px',
        boxShadow: '0 1px 0 rgba(0,0,0,0.08)',
      }}
    >
      Staging environment. Data may be reset at any time. Do not enter real payment details.
    </div>
  );
}
