'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import VipRegisterView from './VipRegisterView';

/**
 * Legacy / query-form VIP link: `/e/<code>/vip?t=<token>`. Kept so links shared
 * before the compact path form still work. Reads the token from the query and
 * hands it to the shared view. The compact form lives at `/e/<code>/vip/<token>`.
 */
export default function VipRegisterQueryPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const code = params?.code ?? '';
  const token = search?.get('t') ?? '';
  return <VipRegisterView code={code} token={token} />;
}
