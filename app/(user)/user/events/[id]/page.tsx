import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getEventById, getUserRegistration, getEventRegistrations, getRegistrationCount, hasEventAccess, getOutgoingInvite, getIncomingInvite, getWaitlistPosition, getEventPhotos } from '@/lib/db/event-queries';
import { EventRegistrationButton } from '@/components/user/event-registration-button';
import { PastEventStatusCard } from '@/components/user/past-event-status-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GuestListSection } from '@/components/user/guest-list-section';
import { EventPhotoAlbum } from '@/components/user/event-photo-album';
import { PlusOneSection } from '@/components/user/plus-one-section';
import { Calendar, MapPin, Users, Lock, ShieldCheck } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { isGradient, parseGradient, gradientConfigToCSS } from '@/lib/gradients';
import { CoverImageLightbox } from '@/components/user/cover-image-lightbox';
import { sanitize } from '@/lib/sanitize';
import { FormattedTime } from '@/components/ui/formatted-time';

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  const registration = await getUserRegistration(session.user.id, id);

  // Access check for private events (admins bypass)
  if (event.visibility === 'private' && !session.user.isAdmin) {
    const access = await hasEventAccess(session.user.id, id);
    if (!access && !registration) notFound();
  }

  const [registrations, confirmedCount] = await Promise.all([
    getEventRegistrations(id),
    getRegistrationCount(id, ['registered', 'selected', 'checked_in']),
  ]);

  const waitlistPosition = registration?.status === 'waitlisted'
    ? await getWaitlistPosition(session.user.id, id)
    : null;

  // Fetch +1 pairing data if feature is enabled and user is registered
  const [outgoingInvite, incomingInvite] = registration && event.plusOneEnabled
    ? await Promise.all([
        getOutgoingInvite(registration.id),
        getIncomingInvite(registration.id),
      ])
    : [null, null];

  // Resolve partner user info for display
  let partnerUser: { id: string; name: string | null; image: string | null } | null = null;
  if (outgoingInvite || incomingInvite) {
    const invite = outgoingInvite || incomingInvite;
    if (invite && registration) {
      // Partner registration ID is the one that isn't ours
      const partnerRegId = invite.inviterRegistrationId === registration.id
        ? invite.inviteeRegistrationId
        : invite.inviterRegistrationId;
      const partnerReg = registrations.find(r => r.registration.id === partnerRegId);
      if (partnerReg) {
        partnerUser = { id: partnerReg.user.id, name: partnerReg.user.name, image: partnerReg.user.image };
      }
    }
  }

  // For the cancel button: expose partner info if in an accepted pairing
  const acceptedInvite = outgoingInvite?.status === 'accepted' ? outgoingInvite
    : incomingInvite?.status === 'accepted' ? incomingInvite
    : null;
  const partnerInfoForButton = acceptedInvite && partnerUser
    ? { name: partnerUser.name }
    : null;

  const spotsRemaining = Math.max(0, event.capacity - confirmedCount);
  const capacityPercent = Math.min(100, Math.round((confirmedCount / event.capacity) * 100));
  const isPastEvent = new Date(event.endDate ?? event.date) < new Date()
    || event.status === 'completed' || event.status === 'cancelled';
  const photos = isPastEvent ? await getEventPhotos(id) : [];

  // Get confirmed attendees for guest list
  const attendees = registrations.filter(r =>
    ['registered', 'selected', 'checked_in'].includes(r.registration.status)
  );

  const isConfirmedAttendee = registration
    ? ['registered', 'selected', 'checked_in'].includes(registration.status)
    : false;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-8">
          <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
            {/* Left: Cover image */}
            <div>
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
                {event.coverImage && isGradient(event.coverImage) ? (
                  <div
                    className="h-full w-full"
                    style={{ background: gradientConfigToCSS(parseGradient(event.coverImage)!) }}
                  />
                ) : event.coverImage ? (
                  <>
                    <img
                      src={event.coverImage}
                      alt={event.name}
                      className="h-full w-full object-cover"
                    />
                    <CoverImageLightbox src={event.coverImage} alt={event.name} />
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                    <Calendar className="h-20 w-20 text-primary/30" />
                  </div>
                )}
              </div>
            </div>

            {/* Right: Event info */}
            <div className="space-y-6">
              {event.visibility === 'private' && (
                <div className="flex items-center gap-1.5 text-sm font-medium text-pink-600">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Private Event</span>
                </div>
              )}

              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                {event.name}
              </h1>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border bg-muted/50">
                    <FormattedTime
                      date={event.date}
                      format="month-short"
                      className="text-[10px] font-semibold uppercase leading-none text-muted-foreground"
                    />
                    <FormattedTime
                      date={event.date}
                      format="day"
                      className="text-lg font-bold leading-tight text-foreground"
                    />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      <FormattedTime date={event.date} format="date" />
                    </p>
                    <p className="text-sm">
                      <FormattedTime date={event.date} format="time" />
                      {event.endDate && (
                        <>
                          {' - '}
                          <FormattedTime date={event.endDate} format="time" />
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="font-medium text-foreground">
                    {event.location
                      ? event.location
                      : event.visibility === 'private'
                        ? 'Register to See Address'
                        : 'No location specified'}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-muted-foreground">
                  <Users className="h-5 w-5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {confirmedCount} / {event.capacity} spots
                    </p>
                    <Progress value={capacityPercent} className="mt-1 h-2" />
                  </div>
                </div>
              </div>

              {/* Registration container - hidden on mobile when sticky CTA is shown */}
              {isPastEvent ? (
                <PastEventStatusCard
                  registrationStatus={registration?.status ?? null}
                  userName={session.user.name || ''}
                  userImage={session.user.image || null}
                  isCancelled={event.status === 'cancelled'}
                />
              ) : (
                <div className="hidden md:block rounded-xl border p-5 space-y-4">
                  <p className="text-sm font-medium text-muted-foreground">Registration</p>

                  {event.requireApproval && (
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold">Approval Required</p>
                        <p className="text-xs text-muted-foreground">Your registration is subject to host approval.</p>
                      </div>
                    </div>
                  )}

                  <p className="text-sm text-muted-foreground">
                    Welcome! To join the event, please register below.
                  </p>

                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={session.user.image || undefined} />
                      <AvatarFallback className="text-xs">
                        {session.user.name?.split(' ').map((n: string) => n[0]).join('') || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-sm">
                      <span className="font-medium">{session.user.name}</span>{' '}
                      <span className="text-muted-foreground">{session.user.email}</span>
                    </div>
                  </div>

                  <EventRegistrationButton
                    event={event}
                    registration={registration}
                    spotsRemaining={spotsRemaining}
                    partnerInfo={partnerInfoForButton}
                  />
                  {waitlistPosition !== null && (
                    <p className="text-xs text-muted-foreground text-center">
                      You&apos;re <span className="font-semibold text-foreground">#{waitlistPosition}</span> on the waitlist
                    </p>
                  )}
                  <PlusOneSection
                    event={event}
                    registration={registration}
                    outgoingInvite={outgoingInvite}
                    incomingInvite={incomingInvite}
                    partnerUser={partnerUser}
                  />
                </div>
              )}

              {/* Description */}
              {event.description && (
                <div
                  className="event-description prose prose-lg dark:prose-invert max-w-none pt-6 border-t"
                  dangerouslySetInnerHTML={{ __html: sanitize(event.description) }}
                />
              )}

              {isPastEvent && photos.length > 0 && (
                <EventPhotoAlbum photos={photos} />
              )}

              {/* Guest list - hidden from non-confirmed users when admin disables the toggle */}
              {(isConfirmedAttendee || event.showAttendeesPreRegistration) && (
                <GuestListSection
                  attendees={isConfirmedAttendee
                    ? attendees
                    : attendees.map(a => ({ user: { id: a.user.id, name: null, email: null, image: a.user.image } }))
                  }
                  canViewNames={isConfirmedAttendee}
                />
              )}
            </div>
          </div>
        </div>

        {/* Mobile CTA lives in normal flow and uses sticky positioning, so variable +1/waitlist
            states reserve their own height instead of covering the bottom of the page. */}
        {!isPastEvent && (
          <div
            className="sticky bottom-0 z-40 mx-auto max-w-4xl border-t bg-background/90 px-4 pt-4 backdrop-blur-lg md:hidden space-y-2 shadow-[0_-12px_28px_-20px_rgba(0,0,0,0.45)]"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <EventRegistrationButton
              event={event}
              registration={registration}
              spotsRemaining={spotsRemaining}
              partnerInfo={partnerInfoForButton}
            />
            {waitlistPosition !== null && (
              <p className="text-xs text-muted-foreground text-center">
                You&apos;re <span className="font-semibold text-foreground">#{waitlistPosition}</span> on the waitlist
              </p>
            )}
            <PlusOneSection
              event={event}
              registration={registration}
              outgoingInvite={outgoingInvite}
              incomingInvite={incomingInvite}
              partnerUser={partnerUser}
            />
          </div>
        )}
    </div>
  );
}
