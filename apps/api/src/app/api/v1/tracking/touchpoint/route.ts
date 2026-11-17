import { TrackingTouchpointSchema } from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../../core/http';
import { recordTrackingTouchpoint } from '../../../../../modules/02-tracking-sync/service';

export async function POST(req: Request) {
  try {
    const configuredSecret = process.env.WEBHOOK_SECRET?.trim();
    const providedSecret = req.headers.get('x-webhook-secret')?.trim();
    if (configuredSecret && providedSecret !== configuredSecret) {
      return jsonError(
        'TOUCHPOINT_UNAUTHORIZED',
        'Chữ ký hoặc mã bí mật Webhook (x-webhook-secret) không hợp lệ.',
        401,
      );
    }

    const raw = await req.json();
    const parsed = TrackingTouchpointSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        'TOUCHPOINT_SCHEMA_INVALID',
        parsed.error.issues[0]?.message || 'Dữ liệu điểm chạm không hợp lệ.',
        400,
      );
    }

    const res = await recordTrackingTouchpoint(parsed.data);
    return jsonSuccess(res, res.deduplicated ? 200 : 201);
  } catch (err) {
    return jsonError(
      'TOUCHPOINT_RECORD_FAILED',
      err instanceof Error ? err.message : 'Không thể ghi nhận điểm chạm.',
      500,
    );
  }
}

