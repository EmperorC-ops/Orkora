import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EngagementService } from './engagement.service';

/**
 * resolveTicketParticipant is the credential check that lets an attendee enter
 * the live room with the ticket they hold instead of a login. Only a live ticket
 * (issued or checked_in) admits; anything else is refused, and the resolved
 * identity is the ticket's registrant + event.
 */
function makeService(findUnique: jest.Mock) {
  const prisma = { ticket: { findUnique } };
  return new EngagementService(prisma as never);
}

describe('EngagementService.resolveTicketParticipant', () => {
  const ticket = (status: string) => ({
    status,
    registration: { userId: 'user-1', eventId: 'event-1' },
  });

  it('resolves an issued ticket to its registrant and event', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(ticket('issued')));
    await expect(svc.resolveTicketParticipant('TKT-1')).resolves.toEqual({
      userId: 'user-1',
      eventId: 'event-1',
    });
  });

  it('resolves a checked_in ticket too', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(ticket('checked_in')));
    await expect(svc.resolveTicketParticipant('TKT-1')).resolves.toEqual({
      userId: 'user-1',
      eventId: 'event-1',
    });
  });

  it('trims the code before lookup', async () => {
    const findUnique = jest.fn().mockResolvedValue(ticket('issued'));
    const svc = makeService(findUnique);
    await svc.resolveTicketParticipant('  TKT-1  ');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'TKT-1' } }),
    );
  });

  it.each(['pending', 'cancelled', 'void'])('refuses a %s ticket', async (status) => {
    const svc = makeService(jest.fn().mockResolvedValue(ticket(status)));
    await expect(svc.resolveTicketParticipant('TKT-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('404s an unknown code', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(null));
    await expect(svc.resolveTicketParticipant('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s an empty code without hitting the database', async () => {
    const findUnique = jest.fn();
    const svc = makeService(findUnique);
    await expect(svc.resolveTicketParticipant('   ')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});
