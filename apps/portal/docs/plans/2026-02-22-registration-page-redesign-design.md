# Registration Page Redesign

## Goal

Update the user-facing event detail/registration page (`/user/events/[id]`) to match the new design reference, adding visual polish and better information hierarchy.

## Changes

### 1. Private Event Badge

- Show a colored pill badge above the event title when `event.visibility === 'private'`
- Pink/red background with a lock icon and "Private Event" text

### 2. Calendar Date Block

- Replace the small `Calendar` lucide icon with a styled date block
- Block shows abbreviated month (e.g. "FEB") on top, day number (e.g. "23") below in large bold text
- Full date string + time range displayed beside the block

### 3. Larger Location Icon

- Increase `MapPin` icon size for visual weight
- For private events before registration: show "Register to See Address" placeholder

### 4. Registration Container

A bordered, rounded container wrapping the registration flow:

- **Header**: "Registration" label at the top of the box
- **Approval notice** (conditional): If `requireApproval` is true, show "Approval Required" with subtitle "Your registration is subject to host approval."
- **Welcome text**: "Welcome! To join the event, please register below."
- **User info row**: Logged-in user's avatar, name, and email displayed inline
- **Action button**: The existing `EventRegistrationButton` rendered inside the container

### 5. Button Text Update

- For approval-based events: "One-Click Apply" instead of "Request Access"
- FCFS events: keep "RSVP" / "Join Waitlist" as-is

## Files Modified

1. `app/(user)/user/events/[id]/page.tsx` — layout, badge, date block, registration container, pass user data
2. `components/user/event-registration-button.tsx` — accept user prop, update button label for approval events

## Out of Scope

- Header/navigation changes
- Left sidebar "Hosted By" section (not part of current layout)
- "Manage" admin access button (admin features stay on admin pages)
