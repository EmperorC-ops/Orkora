import { Instagram, Twitter, MessageCircle, Music2 } from 'lucide-react';

/**
 * Brand Home SocialsBar (D0): the brand's channels in the header. Renders only
 * the known channels that have a URL set. External links, so plain anchors.
 */
const ICONS = {
  instagram: Instagram,
  x: Twitter,
  whatsapp: MessageCircle,
  tiktok: Music2,
} as const;

const LABELS: Record<keyof typeof ICONS, string> = {
  instagram: 'Instagram',
  x: 'X',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
};

export default function SocialsBar({ socials }: { socials: Record<string, string> }) {
  const entries = (Object.keys(ICONS) as (keyof typeof ICONS)[])
    .filter((k) => typeof socials?.[k] === 'string' && socials[k])
    .map((k) => [k, socials[k]] as const);

  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5">
      {entries.map(([key, url]) => {
        const Icon = ICONS[key];
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={LABELS[key]}
            className="rounded-full p-2 text-ink-secondary transition hover:bg-white/5 hover:text-ink-primary"
          >
            <Icon className="h-4 w-4" />
          </a>
        );
      })}
    </div>
  );
}
