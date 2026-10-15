import { sanitize } from '@/lib/sanitize';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wraps admin-authored HTML content in a branded Latte Lab email layout.
 * Returns a complete HTML email string ready to send via Resend.
 */
export function renderBlastEmail(content: string): string {
  const sanitized = sanitize(content);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Latte Lab</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;background-color:#18181b;color:#ffffff;font-size:18px;font-weight:600;">
              Latte Lab
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.6;color:#27272a;">
              ${sanitized}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center;">
              Latte Lab &middot; MIT
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Resolves merge fields in email HTML content.
 * Supported: {{firstName}}, {{lastName}}, {{eventName}}
 * Unknown merge fields are stripped silently.
 */
export function resolveMergeFields(
  html: string,
  data: { firstName?: string; lastName?: string; eventName?: string },
): string {
  return html
    .replace(/\{\{firstName\}\}/g, escapeHtml(data.firstName || 'Member'))
    .replace(/\{\{lastName\}\}/g, escapeHtml(data.lastName || ''))
    .replace(/\{\{eventName\}\}/g, escapeHtml(data.eventName || ''))
    .replace(/\{\{[^}]+\}\}/g, ''); // Strip unknown merge fields
}
