import { EngagementGateway } from './engagement.gateway';

/**
 * Presence accounting. The bug this pins: handleDisconnect maps to socket.io's
 * `disconnect` event, where the socket has ALREADY left its rooms, so iterating
 * client.rooms re-broadcast presence for nothing and the count never dropped.
 * The gateway now tracks joined event rooms on the socket and re-broadcasts for
 * those on disconnect, after the adapter has removed the socket.
 */
function makeGateway(engagement?: Partial<Record<string, unknown>>) {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  const rooms = new Map<string, Set<string>>();
  const gw = new EngagementGateway(
    (engagement ?? {}) as never,
    {} as never,
    {} as never,
  );
  (gw as unknown as { server: unknown }).server = {
    to,
    sockets: { adapter: { rooms } },
  };
  return { gw, to, emit, rooms };
}

describe('EngagementGateway presence on disconnect', () => {
  it('re-broadcasts presence for tracked event rooms with the decremented count', () => {
    const { gw, to, emit, rooms } = makeGateway();
    // After the socket left, one other socket remains in event:e1.
    rooms.set('event:e1', new Set(['sockB']));
    const client = { data: { userId: 'u1', eventRooms: new Set(['e1']) } };

    gw.handleDisconnect(client as never);

    expect(to).toHaveBeenCalledWith('event:e1');
    expect(emit).toHaveBeenCalledWith('presence', { eventId: 'e1', count: 1 });
  });

  it('emits count 0 for a room the last socket just left', () => {
    const { gw, emit, rooms } = makeGateway();
    // The room is gone from the adapter once the last socket leaves.
    const client = { data: { userId: 'u1', eventRooms: new Set(['e9']) } };

    gw.handleDisconnect(client as never);

    expect(emit).toHaveBeenCalledWith('presence', { eventId: 'e9', count: 0 });
    void rooms;
  });

  it('no-ops for a socket that never joined an event room', () => {
    const { gw, to } = makeGateway();
    gw.handleDisconnect({ data: { userId: 'u1' } } as never);
    expect(to).not.toHaveBeenCalled();
  });
});

describe('EngagementGateway chat:join room tracking', () => {
  it('records the joined event id on the socket so disconnect can decrement it', async () => {
    const engagement = {
      getOrCreateEventChat: jest.fn().mockResolvedValue({ id: 'c1' }),
      listMessages: jest.fn().mockResolvedValue([]),
    };
    const { gw } = makeGateway(engagement);
    const client = {
      data: {} as { userId?: string; eventRooms?: Set<string> },
      join: jest.fn().mockResolvedValue(undefined),
    };

    const res = await gw.onJoin(client as never, { eventId: 'e1' });

    expect(client.join).toHaveBeenCalledWith('event:e1');
    expect(client.data.eventRooms?.has('e1')).toBe(true);
    expect(res).toEqual(expect.objectContaining({ ok: true, channelId: 'c1' }));
  });
});
