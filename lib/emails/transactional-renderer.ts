import { sanitize } from '@/lib/sanitize';
import type {
  AdminReplyPayload,
  EventCancelledPayload,
  EventChangedPayload,
  EventReminderPayload,
  EventSummary,
  LotteryNotSelectedPayload,
  LotterySelectedPayload,
  PayloadByTemplate,
  PhotosAvailablePayload,
  PlusOneAcceptedPayload,
  PlusOneCancelledPayload,
  PlusOneDeclinedPayload,
  PlusOneInviteReceivedPayload,
  RegistrationApprovedPayload,
  RegistrationReceivedPayload,
  RegistrationRejectedPayload,
  TransactionalTemplate,
  WaitlistJoinedPayload,
  WaitlistPromotedPayload,
} from '@/lib/emails/templates';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(name: string | null | undefined): string | null {
  return name?.split(' ')[0] ?? null;
}

function greeting(name: string | null | undefined): string {
  const first = firstName(name);
  return first ? `Hi ${escapeHtml(first)},` : 'Hi,';
}

function p(html: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#44403c;">${html}</p>`;
}

function small(html: string): string {
  return `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#78716c;">${html}</p>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:22px 0 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;border-radius:8px;padding:11px 16px;font-weight:600;font-size:14px;">${escapeHtml(label)}</a></p>`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function eventCard(event: EventSummary): string {
  return `<div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:16px;margin:18px 0;">
    <p style="margin:0;font-size:16px;font-weight:700;color:#1c1917;">${escapeHtml(event.name)}</p>
    <p style="margin:6px 0 0;font-size:14px;color:#57534e;">${escapeHtml(formatDate(event.date))}</p>
    ${event.location ? `<p style="margin:6px 0 0;font-size:14px;color:#57534e;">${escapeHtml(event.location)}</p>` : ''}
  </div>`;
}

function layout(preview: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(preview)}</title>
</head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:24px 32px;background:#b45309;color:#ffffff;font-size:18px;font-weight:700;">Latte Lab</td>
          </tr>
          <tr>
            <td style="padding:32px;">${bodyHtml}</td>
          </tr>
          <tr>
            <td style="border-top:1px solid #e7e5e4;padding:22px 32px;font-size:12px;line-height:1.5;color:#78716c;">
              Latte Lab - MIT<br />
              Reply directly to this email to reach the exec team.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const FIELD_LABELS: Record<string, string> = {
  date: 'Start time',
  endDate: 'End time',
  location: 'Location',
  visibility: 'Visibility',
};

export function getSubject(template: TransactionalTemplate, payload: PayloadByTemplate[TransactionalTemplate]): string {
  switch (template) {
    case 'registration_received': {
      const p = payload as RegistrationReceivedPayload;
      return p.requiresApproval ? `Application received: ${p.event.name}` : `You're confirmed for ${p.event.name}`;
    }
    case 'waitlist_joined':
      return `You're on the waitlist for ${(payload as WaitlistJoinedPayload).event.name}`;
    case 'registration_approved':
      return `You're confirmed for ${(payload as RegistrationApprovedPayload).event.name}`;
    case 'registration_rejected':
      return `Update on your ${(payload as RegistrationRejectedPayload).event.name} application`;
    case 'lottery_selected':
      return `You got into ${(payload as LotterySelectedPayload).event.name}`;
    case 'lottery_not_selected':
      return `Update on the ${(payload as LotteryNotSelectedPayload).event.name} lottery`;
    case 'waitlist_promoted':
      return `A spot opened up: ${(payload as WaitlistPromotedPayload).event.name}`;
    case 'plus_one_invite_received': {
      const p = payload as PlusOneInviteReceivedPayload;
      return `${p.inviterName ?? 'Someone'} invited you as a +1 to ${p.event.name}`;
    }
    case 'plus_one_accepted':
      return `${(payload as PlusOneAcceptedPayload).inviteeName ?? 'Your invitee'} accepted your +1 invite`;
    case 'plus_one_declined':
      return `${(payload as PlusOneDeclinedPayload).inviteeName ?? 'Your invitee'} declined your +1 invite`;
    case 'plus_one_cancelled': {
      const p = payload as PlusOneCancelledPayload;
      return `${p.inviterName ?? 'Your inviter'} cancelled their +1 invite to ${p.event.name}`;
    }
    case 'event_changed': {
      const p = payload as EventChangedPayload;
      const fields = p.changes.map((c) => FIELD_LABELS[c.field] ?? c.field).join(', ');
      return `Update for ${p.event.name}${fields ? `: ${fields} changed` : ''}`;
    }
    case 'event_cancelled':
      return `${(payload as EventCancelledPayload).event.name} has been cancelled`;
    case 'event_reminder': {
      const p = payload as EventReminderPayload;
      return `Reminder: ${p.event.name} ${p.humanOffsetLabel}`;
    }
    case 'photos_available':
      return `Photos from ${(payload as PhotosAvailablePayload).event.name} are up`;
    case 'admin_reply':
      return 'Latte Lab reply';
  }
}

function renderBody(template: TransactionalTemplate, payload: PayloadByTemplate[TransactionalTemplate]): string {
  switch (template) {
    case 'registration_received': {
      const pld = payload as RegistrationReceivedPayload;
      return [
        p(greeting(pld.userName)),
        pld.requiresApproval
          ? p(`Thanks for applying. We've received your registration for the event below and will let you know once the host has reviewed it.`)
          : p(`You're confirmed. We'll see you there.`),
        eventCard(pld.event),
        button(pld.event.url, 'View event'),
      ].join('');
    }
    case 'waitlist_joined': {
      const pld = payload as WaitlistJoinedPayload;
      const position = pld.position !== null ? ` at position #${pld.position}` : '';
      return [p(greeting(pld.userName)), p(`You're on the waitlist for the event below${position}. We'll email you the moment a spot opens up.`), eventCard(pld.event), button(pld.event.url, 'View event')].join('');
    }
    case 'registration_approved': {
      const pld = payload as RegistrationApprovedPayload;
      return [p(greeting(pld.userName)), p(`Good news - your registration has been approved. You're confirmed for:`), eventCard(pld.event), button(pld.event.url, 'View event')].join('');
    }
    case 'registration_rejected': {
      const pld = payload as RegistrationRejectedPayload;
      return [p(greeting(pld.userName)), p(`Thanks for applying to <strong>${escapeHtml(pld.event.name)}</strong>. Unfortunately we weren't able to confirm a spot for you this time.`), p(`Keep an eye out for upcoming events - we'd love to see you at the next one.`)].join('');
    }
    case 'lottery_selected': {
      const pld = payload as LotterySelectedPayload;
      return [p(greeting(pld.userName)), p(`You won the lottery - you're confirmed for:`), eventCard(pld.event), button(pld.event.url, 'View event'), small('If you can no longer attend, please cancel from the event page so someone on the waitlist can take your spot.')].join('');
    }
    case 'lottery_not_selected': {
      const pld = payload as LotteryNotSelectedPayload;
      return [p(greeting(pld.userName)), p(`Thanks for entering the lottery for <strong>${escapeHtml(pld.event.name)}</strong>. You weren't selected in this round, but you remain in the pool - if anyone declines or there's a re-roll, you may still be picked. We'll let you know if anything changes.`)].join('');
    }
    case 'waitlist_promoted': {
      const pld = payload as WaitlistPromotedPayload;
      return [p(greeting(pld.userName)), p(`You've been moved off the waitlist - you're confirmed for:`), eventCard(pld.event), button(pld.event.url, 'View event')].join('');
    }
    case 'plus_one_invite_received': {
      const pld = payload as PlusOneInviteReceivedPayload;
      return [p(greeting(pld.inviteeName)), p(`<strong>${escapeHtml(pld.inviterName ?? 'A member')}</strong> invited you to be their +1 for the event below. Accept or decline from the event page.`), eventCard(pld.event), button(pld.event.url, 'Respond to invite')].join('');
    }
    case 'plus_one_accepted': {
      const pld = payload as PlusOneAcceptedPayload;
      return [p(greeting(pld.inviterName)), p(`<strong>${escapeHtml(pld.inviteeName ?? 'Your invitee')}</strong> accepted your +1 invite. You're both going.`), eventCard(pld.event)].join('');
    }
    case 'plus_one_declined': {
      const pld = payload as PlusOneDeclinedPayload;
      return [p(greeting(pld.inviterName)), p(`<strong>${escapeHtml(pld.inviteeName ?? 'Your invitee')}</strong> declined your +1 invite for <strong>${escapeHtml(pld.event.name)}</strong>. You can invite someone else from the event page.`)].join('');
    }
    case 'plus_one_cancelled': {
      const pld = payload as PlusOneCancelledPayload;
      return [p(greeting(pld.inviteeName)), p(`<strong>${escapeHtml(pld.inviterName ?? 'A member')}</strong> cancelled the +1 invite they sent you for <strong>${escapeHtml(pld.event.name)}</strong>. Your own registration, if any, is unchanged.`)].join('');
    }
    case 'event_changed': {
      const pld = payload as EventChangedPayload;
      const changes = pld.changes.map((c) => `<p style="margin:0 0 6px;font-size:14px;color:#44403c;"><strong>${escapeHtml(FIELD_LABELS[c.field] ?? c.field)}:</strong> <span style="color:#78716c;text-decoration:line-through;">${escapeHtml(c.oldValue ?? '-')}</span> <span style="color:#1c1917;">-&gt; ${escapeHtml(c.newValue ?? '-')}</span></p>`).join('');
      return [p(greeting(pld.userName)), p(`Heads up - details for an event you're registered for have changed:`), eventCard(pld.event), `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin:18px 0;">${changes}</div>`, button(pld.event.url, 'View updated details')].join('');
    }
    case 'event_cancelled': {
      const pld = payload as EventCancelledPayload;
      return [p(greeting(pld.userName)), p(`We're sorry to let you know that the event below has been cancelled.`), eventCard(pld.event), pld.reason ? p(`<strong>Reason:</strong> ${escapeHtml(pld.reason)}`) : '', small('If you have questions, reply directly to this email.')].join('');
    }
    case 'event_reminder': {
      const pld = payload as EventReminderPayload;
      return [p(greeting(pld.userName)), p(`Quick reminder - <strong>${escapeHtml(pld.event.name)}</strong> is ${escapeHtml(pld.humanOffsetLabel)}.`), eventCard(pld.event), button(pld.event.url, 'View event')].join('');
    }
    case 'photos_available': {
      const pld = payload as PhotosAvailablePayload;
      const count = pld.photoCount ? ` (${pld.photoCount} photo${pld.photoCount === 1 ? '' : 's'})` : '';
      return [p(greeting(pld.userName)), p(`Photos from <strong>${escapeHtml(pld.event.name)}</strong> are now available${count}. Take a look and relive the moment.`), eventCard(pld.event), button(pld.event.url, 'View album')].join('');
    }
    case 'admin_reply': {
      const pld = payload as AdminReplyPayload;
      return `${sanitize(pld.bodyHtml)}${pld.senderName ? small(`- ${escapeHtml(pld.senderName)}, Latte Lab Exec`) : ''}`;
    }
  }
}

export function renderTransactionalEmail(
  template: TransactionalTemplate,
  payload: PayloadByTemplate[TransactionalTemplate],
): { subject: string; html: string } {
  const subject = getSubject(template, payload);
  return {
    subject,
    html: layout(subject, renderBody(template, payload)),
  };
}
