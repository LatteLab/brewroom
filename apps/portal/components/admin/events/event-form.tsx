"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MapPin,
  FileText,
  Users,
  Eye,
  ListChecks,
  ShieldCheck,
  ClipboardList,
  UserPlus,
  X,
  Plus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { createEventAction, updateEventAction } from "@/app/actions/events";
import { CoverImagePicker } from "@/components/admin/events/cover-image-picker";
import { TiptapEditor } from "@/components/admin/events/tiptap-editor";
import {
  DateTimePicker,
  TimezonePicker,
} from "@/components/admin/events/date-time-picker";
import type { Event } from "@/lib/db/schema";
import type { EventQuestion } from "@/lib/types/event";

/**
 * Convert a Date whose hours/minutes represent wall-clock time in the browser
 * to a UTC ISO string as if those hours/minutes were in `timezone`.
 */
function wallClockToUTC(date: Date, tz: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  };
  const targetParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz })
      .formatToParts(date).map(p => [p.type, p.value])
  );
  const browserParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', opts)
      .formatToParts(date).map(p => [p.type, p.value])
  );

  const targetMs = Date.UTC(
    +targetParts.year, +targetParts.month - 1, +targetParts.day,
    +targetParts.hour, +targetParts.minute, +targetParts.second,
  );
  const browserMs = Date.UTC(
    +browserParts.year, +browserParts.month - 1, +browserParts.day,
    +browserParts.hour, +browserParts.minute, +browserParts.second,
  );

  const offsetDiff = browserMs - targetMs;
  return new Date(date.getTime() + offsetDiff).toISOString();
}

/**
 * Convert a UTC Date to a local Date whose hours/minutes match the wall-clock
 * time in `timezone`. Used when loading an event for editing.
 */
function utcToWallClock(utcDate: Date, tz: string): Date {
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz })
      .formatToParts(utcDate).map(p => [p.type, p.value])
  );
  return new Date(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour, +parts.minute, +parts.second,
  );
}

const STANDARD_IDS = ["std_photo_consent", "std_allergies", "std_dietary"];

const STANDARD_PRESETS: Record<string, EventQuestion> = {
  std_photo_consent: {
    id: "std_photo_consent",
    type: "consent",
    label: "I consent to photos being taken at this event for use in Latte Lab promotional materials.",
    required: true,
  },
  std_allergies: {
    id: "std_allergies",
    type: "text",
    label: "Allergies",
    required: false,
  },
  std_dietary: {
    id: "std_dietary",
    type: "text",
    label: "Dietary restrictions",
    required: false,
  },
};

export function EventForm({
  event,
  compact,
}: {
  event?: Event;
  compact?: boolean;
}) {
  const [coverImage, setCoverImage] = useState<string>(event?.coverImage || "");
  const [name, setName] = useState(event?.name || "");
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    if (!event?.date) return undefined;
    return utcToWallClock(new Date(event.date), event.timezone ?? 'America/New_York');
  });
  const [endDate, setEndDate] = useState<Date | undefined>(() => {
    if (!event?.endDate) return undefined;
    return utcToWallClock(new Date(event.endDate), event.timezone ?? 'America/New_York');
  });
  const [location, setLocation] = useState(event?.location || "");
  const [description, setDescription] = useState(event?.description || "");
  const [visibility, setVisibility] = useState<"private" | "public">(
    event?.visibility || "private"
  );
  const [capacity, setCapacity] = useState<string>(
    event?.capacity ? String(event.capacity) : ""
  );
  const [waitlistEnabled, setWaitlistEnabled] = useState(
    event?.waitlistEnabled ?? false
  );
  const [plusOneEnabled, setPlusOneEnabled] = useState(
    event?.plusOneEnabled ?? false
  );
  const [requireApproval, setRequireApproval] = useState(
    event?.requireApproval ?? false
  );
  const [timezone, setTimezone] = useState(
    () => event?.timezone ?? 'America/New_York'
  );

  // Registration Questions
  const existingQuestions = (event?.questions as EventQuestion[] | null) ?? [];
  const [photoConsentOn, setPhotoConsentOn] = useState(
    () => existingQuestions.some((q) => q.id === "std_photo_consent")
  );
  const [allergiesOn, setAllergiesOn] = useState(
    () => existingQuestions.some((q) => q.id === "std_allergies")
  );
  const [dietaryOn, setDietaryOn] = useState(
    () => existingQuestions.some((q) => q.id === "std_dietary")
  );
  const [customQuestions, setCustomQuestions] = useState<EventQuestion[]>(
    () => existingQuestions.filter((q) => !STANDARD_IDS.includes(q.id))
  );

  // Add custom question form state
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<"text" | "consent">("text");
  const [newRequired, setNewRequired] = useState(false);

  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isEditing = !!event;

  function addCustomQuestion() {
    if (!newLabel.trim()) return;
    setCustomQuestions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: newType,
        label: newLabel.trim(),
        required: newRequired,
      },
    ]);
    setNewLabel("");
    setNewType("text");
    setNewRequired(false);
  }

  function removeCustomQuestion(id: string) {
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function buildQuestionsArray(): EventQuestion[] {
    const questions: EventQuestion[] = [];
    if (photoConsentOn) questions.push(STANDARD_PRESETS.std_photo_consent);
    if (allergiesOn) questions.push(STANDARD_PRESETS.std_allergies);
    if (dietaryOn) questions.push(STANDARD_PRESETS.std_dietary);
    questions.push(...customQuestions);
    return questions;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Event name is required");
      return;
    }
    if (!startDate) {
      toast.error("Start date is required");
      return;
    }
    if (!timezone) {
      toast.error("Timezone is required");
      return;
    }
    if (!capacity || Number(capacity) < 1) {
      toast.error("Capacity must be at least 1");
      return;
    }
    if (!isEditing && startDate && startDate < new Date()) {
      toast.error("Start date must be in the future");
      return;
    }
    if (endDate && startDate && endDate <= startDate) {
      toast.error("End date must be after start date");
      return;
    }

    const questions = buildQuestionsArray();

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("coverImage", coverImage);
    formData.set("description", description);
    formData.set("location", location);
    formData.set("capacity", capacity);
    formData.set("visibility", visibility);
    formData.set("waitlistEnabled", String(waitlistEnabled));
    formData.set("plusOneEnabled", String(plusOneEnabled));
    if (!isEditing) {
      formData.set("requireApproval", String(requireApproval));
    }
    formData.set("questions", questions.length > 0 ? JSON.stringify(questions) : "");
    formData.set("timezone", timezone);
    if (startDate) formData.set("date", wallClockToUTC(startDate, timezone));
    if (endDate) formData.set("endDate", wallClockToUTC(endDate, timezone));

    startTransition(async () => {
      try {
        if (event) {
          await updateEventAction(event.id, formData);
          toast.success("Event updated");
        } else {
          const created = await createEventAction(formData);
          toast.success("Event created");
          router.push(`/admin/events/${created.id}`);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save event"
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div
        className={
          compact
            ? "space-y-6"
            : "grid gap-6 md:gap-8 md:grid-cols-[minmax(280px,420px)_1fr]"
        }
      >
        {/* Cover Image */}
        <CoverImagePicker
          value={coverImage || null}
          onChange={setCoverImage}
          compact={compact}
        />

        {/* Right: Form Fields */}
        <div className="space-y-3">
          {/* Event Name */}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Event Name"
            className="border-0 text-3xl md:text-4xl font-bold placeholder:text-muted-foreground/30 focus-visible:ring-0 p-0 h-auto tracking-tight leading-tight"
            required
          />

          {/* Date/Time Section */}
          <div className="rounded-xl border bg-muted/30 px-2.5 py-2 sm:px-3 sm:py-2.5">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="flex-1 space-y-1.5">
                <DateTimePicker
                  label="Start"
                  value={startDate}
                  onChange={setStartDate}
                />
                <DateTimePicker
                  label="End"
                  value={endDate}
                  onChange={setEndDate}
                />
              </div>
              <div className="self-center sm:self-auto">
                <TimezonePicker value={timezone} onChange={setTimezone} />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2.5 sm:px-4 sm:py-3">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add Event Location"
              className="border-0 bg-transparent p-0 h-auto text-sm focus-visible:ring-0 placeholder:text-muted-foreground"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Description</span>
            </div>
            <TiptapEditor
              content={description}
              onChange={setDescription}
              placeholder="Add Description"
            />
          </div>

          {/* Event Options */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Event Options</h3>
            <div className="rounded-xl border divide-y">
              {/* Visibility */}
              <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                <div className="flex items-center gap-2.5">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">Visibility</span>
                </div>
                <Select
                  value={visibility}
                  onValueChange={(v) =>
                    setVisibility(v as "private" | "public")
                  }
                >
                  <SelectTrigger className="w-[110px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Capacity */}
              <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                <div className="flex items-center gap-2.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">Capacity</span>
                </div>
                <Input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-[110px] h-7 text-xs text-right"
                  required
                />
              </div>

              {/* Waitlist */}
              {capacity && (
                <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">Enable Waitlist</span>
                  </div>
                  <Switch
                    checked={waitlistEnabled}
                    onCheckedChange={setWaitlistEnabled}
                  />
                </div>
              )}

              {/* Allow +1 guests */}
              <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                <div className="flex items-center gap-2.5">
                  <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <span className="text-sm">Allow +1 Guests</span>
                    <p className="text-[11px] text-muted-foreground">
                      Members can invite another member as a +1
                    </p>
                  </div>
                </div>
                <Switch
                  checked={plusOneEnabled}
                  onCheckedChange={setPlusOneEnabled}
                />
              </div>

              {/* Require Approval */}
              <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <span className="text-sm">Require Approval</span>
                    <p className="text-[11px] text-muted-foreground">
                      Includes manual selection & lottery-based
                    </p>
                  </div>
                </div>
                {isEditing ? (
                  <span className="text-xs text-muted-foreground">
                    {requireApproval ? "On" : "Off"}
                  </span>
                ) : (
                  <Switch
                    checked={requireApproval}
                    onCheckedChange={setRequireApproval}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Registration Questions */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Registration Questions</h3>
            </div>

            {/* Standard presets */}
            <div className="rounded-xl border divide-y">
              <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                <div>
                  <span className="text-sm">Photo consent</span>
                  <p className="text-[11px] text-muted-foreground">Ask attendees to consent to photos</p>
                </div>
                <Switch checked={photoConsentOn} onCheckedChange={setPhotoConsentOn} />
              </div>
              <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                <div>
                  <span className="text-sm">Allergies</span>
                  <p className="text-[11px] text-muted-foreground">Ask attendees to list any allergies</p>
                </div>
                <Switch checked={allergiesOn} onCheckedChange={setAllergiesOn} />
              </div>
              <div className="flex items-center justify-between px-3 sm:px-4 py-2">
                <div>
                  <span className="text-sm">Dietary restrictions</span>
                  <p className="text-[11px] text-muted-foreground">Ask attendees about dietary needs</p>
                </div>
                <Switch checked={dietaryOn} onCheckedChange={setDietaryOn} />
              </div>
            </div>

            {/* Custom questions list */}
            {customQuestions.length > 0 && (
              <div className="rounded-xl border divide-y">
                {customQuestions.map((q) => (
                  <div key={q.id} className="flex items-start justify-between px-3 sm:px-4 py-2.5 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug truncate">{q.label}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {q.type === "consent" ? "Yes/No" : "Text"}
                        </Badge>
                        {q.required && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCustomQuestion(q.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive mt-0.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add custom question form */}
            <div className="rounded-xl border px-3 sm:px-4 py-3 space-y-2.5 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground">Add custom question</p>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. What's your T-shirt size?"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomQuestion();
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <Select
                  value={newType}
                  onValueChange={(v) => setNewType(v as "text" | "consent")}
                >
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text answer</SelectItem>
                    <SelectItem value="consent">Yes / No</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch
                    id="new-required"
                    checked={newRequired}
                    onCheckedChange={setNewRequired}
                    className="scale-75"
                  />
                  <Label htmlFor="new-required" className="text-xs cursor-pointer">
                    Required
                  </Label>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 shrink-0"
                  onClick={addCustomQuestion}
                  disabled={!newLabel.trim()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            size="lg"
            className="w-full rounded-xl"
            disabled={isPending}
          >
            {isPending ? "Saving..." : event ? "Update Event" : "Create Event"}
          </Button>
        </div>
      </div>
    </form>
  );
}
