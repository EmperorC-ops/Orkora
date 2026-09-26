'use client';

import { useParams } from 'next/navigation';
import VipRegisterView from '../VipRegisterView';

/**
 * Compact VIP link: `/e/<code>/vip/<token>`. The token is the last path
 * segment; a custom-word link looks like `/e/WMXKED/vip/goldclass-7kd9qs`.
 */
export default function VipRegisterTokenPage() {
  const params = useParams<{ code: string; token: string }>();
  const code = params?.code ?? '';
  const token = params?.token ? decodeURIComponent(params.token) : '';
  return <VipRegisterView code={code} token={token} />;
}
