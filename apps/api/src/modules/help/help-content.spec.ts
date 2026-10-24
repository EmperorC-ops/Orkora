import { HELP_SECTIONS, helpSectionsForRole } from './help-content';

describe('helpSectionsForRole', () => {
  const ids = (role: string | null) => helpSectionsForRole(role).map((s) => s.id);

  it('gives staff only the door and attendee sections', () => {
    expect(ids('staff')).toEqual(['check-in', 'attendees', 'analytics']);
  });

  it('adds event management for organizers but not team, money or campaigns', () => {
    const got = ids('organizer');
    expect(got).toEqual(expect.arrayContaining(['events', 'tickets', 'story', 'live', 'extras']));
    expect(got).not.toEqual(expect.arrayContaining(['team']));
    expect(got).not.toContain('payments');
    expect(got).not.toContain('campaigns');
  });

  it('gives admins and owners everything', () => {
    expect(ids('admin')).toHaveLength(HELP_SECTIONS.length);
    expect(ids('owner')).toHaveLength(HELP_SECTIONS.length);
  });

  it('gives nothing to a vendor or an unknown role', () => {
    expect(ids('vendor')).toEqual([]);
    expect(ids(null)).toEqual([]);
  });

  it('keeps section ids unique', () => {
    const all = HELP_SECTIONS.map((s) => s.id);
    expect(new Set(all).size).toBe(all.length);
  });
});
