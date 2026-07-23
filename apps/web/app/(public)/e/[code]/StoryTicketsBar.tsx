'use client';

import { useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';

/**
 * Floating "Get tickets" affordance for Story Mode pages. Appears once the
 * reader scrolls past the hero and hides while the Tickets block itself is on
 * screen (so it never overlaps the real picker). Tapping scrolls to #tickets.
 *
 * Per D2: "the Tickets block is always present, always accessible." This is the
 * always-accessible half; the block is the always-present half.
 */
export default function StoryTicketsBar({ color, label = 'Get tickets' }: { color: string; label?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.querySelector('[data-story-hero]');
    const tickets = document.getElementById('tickets');

    let pastHero = false;
    let ticketsOnScreen = false;
    const update = () => setVisible(pastHero && !ticketsOnScreen);

    const observers: IntersectionObserver[] = [];
    if (hero) {
      const o = new IntersectionObserver(
        ([e]) => {
          pastHero = !e.isIntersecting;
          update();
        },
        { rootMargin: '-40% 0px 0px 0px' },
      );
      o.observe(hero);
      observers.push(o);
    } else {
      pastHero = true;
    }
    if (tickets) {
      const o = new IntersectionObserver(([e]) => {
        ticketsOnScreen = e.isIntersecting;
        update();
      });
      o.observe(tickets);
      observers.push(o);
    }
    update();
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  function goToTickets() {
    document.getElementById('tickets')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <button
      type="button"
      onClick={goToTickets}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
      style={{ backgroundColor: color }}
    >
      <Ticket className="h-4 w-4" />
      {label}
    </button>
  );
}
