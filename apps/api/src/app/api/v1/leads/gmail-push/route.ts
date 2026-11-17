import { jsonError, jsonSuccess } from '../../../../../core/http';
import {
  getGmailPushCapabilities,
  getGmailLeadSyncConfig,
  syncLeadsFromGmail,
} from '../../../../../modules/01-leads/gmail-sync.service';

/**
 * Webhook endpoint cho Google Cloud Pub/Sub Gmail Push (`users.watch`).
 * Khi chưa có HTTPS công khai / GMAIL_PUBSUB_TOPIC, hệ thống dùng Poller backend kèm đối soát.
 */
export async function POST(req: Request) {
  const configuredToken = process.env.GMAIL_PUSH_VERIFICATION_TOKEN?.trim();
  const url = new URL(req.url);
  const tokenParam = url.searchParams.get('token') || req.headers.get('x-gmail-push-token') || '';
  if (configuredToken && tokenParam !== configuredToken) {
    return jsonError('UNAUTHORIZED_GMAIL_PUSH', 'Invalid Gmail Push verification token.', 401);
  }

  const config = await getGmailLeadSyncConfig();
  const pushCap = getGmailPushCapabilities(config.pollIntervalSec);

  if (!config.enabled) {
    return jsonSuccess({
      accepted: false,
      reason: 'GMAIL_AUTO_SYNC_PAUSED',
      syncMode: pushCap.syncMode,
    });
  }

  const result = await syncLeadsFromGmail();
  return jsonSuccess({
    accepted: true,
    syncMode: pushCap.syncMode,
    summary: result.summary,
  });
}

