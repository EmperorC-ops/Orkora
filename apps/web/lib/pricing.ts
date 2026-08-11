/**
 * Pricing module.
 *
 * Single source of truth for Orkora's public rate card, derived from the 2026
 * go-to-market tiers. The pricing page and any future in-product upgrade
 * surfaces read from here so the numbers live in exactly one place.
 *
 * Model: free events are always free. The per-ticket fee applies to paid
 * tickets only and is taken from the organizer's settlement, never added on top
 * of the attendee's price. Payment processing fees (Stripe, Paystack,
 * Flutterwave) are charged separately by the provider at their published rates.
 */

export type PricingTierId = 'standard' | 'pro' | 'enterprise';

export interface PricingTier {
  id: PricingTierId;
  name: string;
  tagline: string;
  /** Optional recurring base, e.g. "$99 / month". */
  basePrice?: string;
  /** Headline rate, e.g. "3% + $0.99" or "Custom". */
  rate: string;
  /** Unit the rate is charged against, e.g. "per paid ticket". */
  rateUnit: string;
  highlighted?: boolean;
  badge?: string;
  features: string[];
  cta: { label: string; href: string };
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'standard',
    name: 'Standard',
    tagline: 'For one-off summits and standout events.',
    rate: '3% + $0.99',
    rateUnit: 'per paid ticket',
    features: [
      'Unlimited free events, always free',
      'Registration, tickets, and checkout',
      'USD, NGN, GHS, and KES at first-class rates',
      'Refunds, receipts, and QR check-in',
      'Live chat, questions, and polls',
      'Real-time organizer dashboard',
      'Data export at any time',
    ],
    cta: { label: 'Start free', href: '/signup' },
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For event brands running a recurring series.',
    basePrice: '$99 / month',
    rate: '+ 2%',
    rateUnit: 'per paid ticket',
    highlighted: true,
    badge: 'Most popular',
    features: [
      'Everything in Standard',
      'Brand Home, your own event homepage',
      'Story Mode editorial event pages',
      'Custom domains',
      'Shareable cards for every event',
      'Campaigns to your subscribers',
      'A lower per-ticket rate as you grow',
    ],
    cta: { label: 'Start Pro', href: '/signup' },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For high-volume and multi-entity organizers.',
    rate: 'Custom',
    rateUnit: 'tailored to your volume',
    features: [
      'Everything in Pro',
      'Multi-currency reconciliation at scale',
      'Volume per-ticket rates',
      'Enterprise authentication (SSO)',
      'Dedicated support',
      'Custom contracts and invoicing',
    ],
    cta: { label: 'Talk to sales', href: '/contact' },
  },
];

/** Shown under the plan grid and in the billing surface. Provider-agnostic. */
export const PRICING_FOOTNOTE =
  'Free events are always free. Payment processing fees are charged separately by your payment provider, not by Orkora.';
