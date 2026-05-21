import { apiFetch } from './api';

function extractKeys(sub: PushSubscription): { p256dh: string; auth: string } {
  const json = sub.toJSON();
  return { p256dh: json.keys!.p256dh, auth: json.keys!.auth };
}

export async function subscribePush(sub: PushSubscription, token: string): Promise<void> {
  const { p256dh, auth } = extractKeys(sub);
  await apiFetch('/push/subscribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint: sub.endpoint, p256dh, auth }),
  });
}

export async function unsubscribePush(sub: PushSubscription, token: string): Promise<void> {
  const { p256dh, auth } = extractKeys(sub);
  await apiFetch('/push/subscribe', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint: sub.endpoint, p256dh, auth }),
  });
}
