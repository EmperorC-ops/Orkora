/**
 * Feature-flag registry for the flagship release (D0 §Feature flag strategy).
 *
 * Not a LaunchDarkly-style system - a single-file registry is enough for
 * Release 1. Three flags, one per feature. Resolution order for each flag:
 *
 *   1. Per-org allowlist (NEXT_PUBLIC_FLAG_ORGS) - if a flag lists org slugs,
 *      it is ON only for those orgs (the launch-partners-first rollout).
 *   2. Global env override (NEXT_PUBLIC_FLAGS) - force a flag on/off everywhere.
 *   3. Static default below.
 *
 * All three flags default ON because Release 1 has shipped. To stage a future
 * change, flip a default to false or set the env overrides on the web deploy.
 *
 * Env formats (comma-separated):
 *   NEXT_PUBLIC_FLAGS="story_mode=off,brand_home=on"
 *   NEXT_PUBLIC_FLAG_ORGS="story_mode=aurora,volt;shareable_cards=aurora"
 */

export type FeatureFlag = 'brand_home' | 'story_mode' | 'shareable_cards';

const DEFAULTS: Record<FeatureFlag, boolean> = {
  brand_home: true,
  story_mode: true,
  shareable_cards: true,
};

const KNOWN: FeatureFlag[] = ['brand_home', 'story_mode', 'shareable_cards'];

function normalizeFlag(raw: string): FeatureFlag | null {
  // Accept both "feat.story_mode" and "story_mode".
  const key = raw.trim().replace(/^feat\./, '') as FeatureFlag;
  return KNOWN.includes(key) ? key : null;
}

function parseGlobalOverrides(): Partial<Record<FeatureFlag, boolean>> {
  const raw = process.env.NEXT_PUBLIC_FLAGS;
  if (!raw) return {};
  const out: Partial<Record<FeatureFlag, boolean>> = {};
  for (const pair of raw.split(',')) {
    const [name, value] = pair.split('=').map((s) => s.trim());
    const flag = name ? normalizeFlag(name) : null;
    if (flag) out[flag] = !/^(off|false|0|no)$/i.test(value ?? '');
  }
  return out;
}

function parseOrgAllowlists(): Partial<Record<FeatureFlag, Set<string>>> {
  const raw = process.env.NEXT_PUBLIC_FLAG_ORGS;
  if (!raw) return {};
  const out: Partial<Record<FeatureFlag, Set<string>>> = {};
  // Entries are separated by ";" so slugs can be comma-listed per flag.
  for (const entry of raw.split(';')) {
    const [name, slugs] = entry.split('=').map((s) => s.trim());
    const flag = name ? normalizeFlag(name) : null;
    if (!flag) continue;
    const set = new Set(
      (slugs ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    if (set.size > 0) out[flag] = set;
  }
  return out;
}

const GLOBAL = parseGlobalOverrides();
const ORG_ALLOW = parseOrgAllowlists();

/**
 * Whether a feature is enabled. Pass the org slug to honour a launch-partner
 * allowlist; omit it to get the global answer (allowlisted flags then resolve
 * to off unless a global override turns them on).
 */
export function isFeatureEnabled(flag: FeatureFlag, orgSlug?: string): boolean {
  const allow = ORG_ALLOW[flag];
  if (allow) return orgSlug ? allow.has(orgSlug.toLowerCase()) : false;
  if (flag in GLOBAL) return GLOBAL[flag] as boolean;
  return DEFAULTS[flag];
}

/** All flags resolved for a given org, handy for passing to a client boundary. */
export function resolveFlags(orgSlug?: string): Record<FeatureFlag, boolean> {
  return {
    brand_home: isFeatureEnabled('brand_home', orgSlug),
    story_mode: isFeatureEnabled('story_mode', orgSlug),
    shareable_cards: isFeatureEnabled('shareable_cards', orgSlug),
  };
}
