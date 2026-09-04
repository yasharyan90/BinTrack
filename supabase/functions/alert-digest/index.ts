// alert-digest — daily summary of active alerts to admins who opted in
// (`profiles.preferences.email_digest = true`). Scheduled via Supabase cron.
// Silently no-ops when RESEND_API_KEY is unset so local dev never fails.
import { serviceClient } from '../_shared/client.ts'
import { ok, preflight } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('ALERT_DIGEST_FROM') ?? 'BinTrack <alerts@example.com>'

type Alert = {
  id: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  first_seen_at: string
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  const admin = serviceClient()

  const { data: alerts } = await admin
    .from('alerts')
    .select('id, type, severity, title, message, first_seen_at')
    .in('status', ['active', 'acknowledged'])
    .order('severity', { ascending: false })
    .order('first_seen_at', { ascending: true })
    .limit(200)

  const { data: recipients } = await admin
    .from('profiles')
    .select('email, full_name, preferences')
    .eq('role', 'inventory_admin')
    .eq('is_active', true)

  const opted = (recipients ?? []).filter(
    (r) => r.email && (r.preferences as Record<string, unknown> | null)?.email_digest === true,
  )

  const list = (alerts ?? []) as Alert[]
  const counts = {
    critical: list.filter((a) => a.severity === 'critical').length,
    warning: list.filter((a) => a.severity === 'warning').length,
    info: list.filter((a) => a.severity === 'info').length,
  }

  if (!RESEND_API_KEY || opted.length === 0 || list.length === 0) {
    return ok({
      sent: 0,
      alerts: list.length,
      recipients: opted.length,
      skipped: !RESEND_API_KEY ? 'RESEND_API_KEY not set' : 'nothing to send',
      counts,
    })
  }

  const html = renderDigest(list, counts)
  let sent = 0
  const failures: string[] = []

  for (const r of opted) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [r.email],
        subject: `BinTrack: ${counts.critical} critical, ${counts.warning} warnings`,
        html,
      }),
    })
    if (res.ok) sent++
    else failures.push(`${r.email}: ${res.status} ${await res.text()}`)
  }

  return ok({ sent, alerts: list.length, recipients: opted.length, counts, failures })
})

function renderDigest(alerts: Alert[], counts: Record<string, number>): string {
  const colour: Record<string, string> = {
    critical: '#c62828',
    warning: '#b26a00',
    info: '#1d4ed8',
  }
  const rows = alerts
    .slice(0, 50)
    .map(
      (a) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;color:${colour[a.severity]};
                   font:600 12px system-ui;text-transform:uppercase">${a.severity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;font:14px system-ui">
          <strong>${escapeHtml(a.title)}</strong><br>
          <span style="color:#666">${escapeHtml(a.message)}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;font:12px system-ui;color:#666;white-space:nowrap">
          ${new Date(a.first_seen_at).toISOString().slice(0, 10)}
        </td>
      </tr>`,
    )
    .join('')

  return `<!doctype html><html><body style="margin:0;background:#fafafa;padding:24px">
    <div style="max-width:680px;margin:auto;background:#fff;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden">
      <div style="padding:20px 24px;border-bottom:1px solid #e5e5e5">
        <h1 style="margin:0;font:600 20px system-ui">BinTrack daily alert digest</h1>
        <p style="margin:6px 0 0;font:14px system-ui;color:#666">
          ${counts.critical} critical · ${counts.warning} warning · ${counts.info} info
        </p>
      </div>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      ${
        alerts.length > 50
          ? `<p style="padding:12px 24px;font:13px system-ui;color:#666">…and ${alerts.length - 50} more.</p>`
          : ''
      }
    </div></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}
