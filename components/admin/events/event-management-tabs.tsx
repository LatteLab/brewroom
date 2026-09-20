"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventOverview } from "@/components/admin/events/event-overview";
import { GuestList } from "@/components/admin/events/guest-list";
import { EventSettings } from "@/components/admin/events/event-settings";
import { EventPhotoAlbumManager } from "@/components/admin/events/event-photo-album-manager";
import type { Event, EventPhoto, EventPlusOneInvite } from "@/lib/db/schema";
import type { Registration } from "@/lib/types/event";

export function EventManagementTabs({
  event,
  registrations,
  pairings = [],
  photos = [],
}: {
  event: Event;
  registrations: Registration[];
  pairings?: EventPlusOneInvite[];
  photos?: EventPhoto[];
}) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      {/* Horizontal-scroll wrapper prevents clipping at <380px viewports - the tab labels
          ("Guests (47)", "Photos (12)") otherwise overflow the parent container. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList className="inline-flex w-max min-w-full sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="guests">
            Guests ({registrations.length})
          </TabsTrigger>
          <TabsTrigger value="photos">
            Photos ({photos.length})
          </TabsTrigger>
          <TabsTrigger value="more">More</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-6">
        <EventOverview
          event={event}
          registrations={registrations}
          onSwitchToGuests={() => setActiveTab("guests")}
        />
      </TabsContent>

      <TabsContent value="guests" className="mt-6">
        <GuestList event={event} registrations={registrations} pairings={pairings} />
      </TabsContent>

      <TabsContent value="photos" className="mt-6">
        <EventPhotoAlbumManager event={event} photos={photos} />
      </TabsContent>

      <TabsContent value="more" className="mt-6">
        <EventSettings event={event} />
      </TabsContent>
    </Tabs>
  );
}
