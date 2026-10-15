"use client";

import { useState, useMemo } from "react";
import { format, setHours, setMinutes, getHours, getMinutes } from "date-fns";
import { CalendarIcon, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function generateTimeOptions() {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      const period = h >= 12 ? "PM" : "AM";
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = `${displayHour.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} ${period}`;
      options.push({ value, label });
    }
  }
  return options;
}

const timeOptions = generateTimeOptions();

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "New York", abbr: "ET" },
  { value: "America/Chicago", label: "Chicago", abbr: "CT" },
  { value: "America/Denver", label: "Denver", abbr: "MT" },
  { value: "America/Los_Angeles", label: "Los Angeles", abbr: "PT" },
  { value: "America/Anchorage", label: "Anchorage", abbr: "AKT" },
  { value: "Pacific/Honolulu", label: "Honolulu", abbr: "HT" },
  { value: "Europe/London", label: "London", abbr: "GMT" },
  { value: "Europe/Paris", label: "Paris", abbr: "CET" },
  { value: "Europe/Berlin", label: "Berlin", abbr: "CET" },
  { value: "Asia/Tokyo", label: "Tokyo", abbr: "JST" },
  { value: "Asia/Shanghai", label: "Shanghai", abbr: "CST" },
  { value: "Asia/Kolkata", label: "Kolkata", abbr: "IST" },
  { value: "Australia/Sydney", label: "Sydney", abbr: "AEST" },
];

function getTimezoneOffset(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    return offsetPart?.value ?? "";
  } catch {
    return "";
  }
}

interface DateTimePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  label: string;
}

function DateTimePicker({ value, onChange, label }: DateTimePickerProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const currentTimeValue = value
    ? `${getHours(value).toString().padStart(2, "0")}:${getMinutes(value).toString().padStart(2, "0")}`
    : undefined;

  function handleDateSelect(selectedDate: Date | undefined) {
    if (!selectedDate) {
      onChange(undefined);
      return;
    }

    if (value) {
      const withTime = setMinutes(
        setHours(selectedDate, getHours(value)),
        getMinutes(value)
      );
      onChange(withTime);
    } else {
      onChange(selectedDate);
    }

    setCalendarOpen(false);
  }

  function handleTimeSelect(timeValue: string) {
    const [hours, minutes] = timeValue.split(":").map(Number);
    const base = value ?? new Date();
    const updated = setMinutes(setHours(base, hours), minutes);
    onChange(updated);
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
      {label && (
        <span className="text-xs font-medium text-muted-foreground min-w-[36px]">
          {label}
        </span>
      )}

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted min-w-[130px]",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-3 w-3" />
            {value ? format(value, "EEE, MMM d") : "Pick a date"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleDateSelect}
          />
        </PopoverContent>
      </Popover>

      <Select value={currentTimeValue} onValueChange={handleTimeSelect}>
        <SelectTrigger className="rounded-md border bg-background w-[110px] h-8 text-sm">
          <SelectValue placeholder="Time" />
        </SelectTrigger>
        <SelectContent>
          {timeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface TimezonePickerProps {
  value: string;
  onChange: (tz: string) => void;
}

function TimezonePicker({ value, onChange }: TimezonePickerProps) {
  const [open, setOpen] = useState(false);
  const offset = useMemo(() => getTimezoneOffset(value), [value]);
  const city = useMemo(() => {
    const match = TIMEZONE_OPTIONS.find((tz) => tz.value === value);
    return match?.label ?? value.split("/").pop()?.replace(/_/g, " ") ?? value;
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex flex-col items-center justify-center border rounded-xl px-3 py-2 text-xs text-muted-foreground min-w-[90px] hover:bg-muted transition-colors cursor-pointer"
        >
          <Globe className="h-4 w-4 mb-1" />
          <span>{offset}</span>
          <span>{city}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1" align="end">
        <div className="max-h-[240px] overflow-y-auto">
          {TIMEZONE_OPTIONS.map((tz) => (
            <button
              key={tz.value}
              type="button"
              onClick={() => { onChange(tz.value); setOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors",
                value === tz.value && "bg-muted font-medium"
              )}
            >
              <span>{tz.label}</span>
              <span className="text-xs text-muted-foreground">
                {getTimezoneOffset(tz.value)}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DateTimePicker, TimezonePicker, TIMEZONE_OPTIONS };
