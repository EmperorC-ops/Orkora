'use client';

import CampaignComposer from '../CampaignComposer';

/**
 * New campaign. The composer creates the draft on its first save, test send,
 * or send, then keeps updating that same draft (see CampaignComposer).
 */
export default function NewCampaignPage() {
  return <CampaignComposer />;
}
