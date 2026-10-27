"use client";

import DatePicker from "react-datepicker";
import { deadlineFromApiValue, deadlineToApiValue } from "@/lib/rfq-deadline";

type DeadlinePickerProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

const inputClassName =
  "mt-2 h-11 w-full rounded-[5px] border border-[#777777] bg-transparent px-4 text-sm text-[#ededed] placeholder:text-[#a8a8a8] focus:border-[#e0e0e0] focus:ring-2 focus:ring-[#d8d8d8]/25 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function DeadlinePicker({
  id,
  value,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
}: DeadlinePickerProps) {
  return (
    <DatePicker
      aria-describedby={describedBy}
      aria-invalid={invalid ? "true" : undefined}
      aria-label="Quotation deadline"
      calendarClassName="rfq-deadline-calendar"
      className={inputClassName}
      dateFormat="dd-MM-yyyy h:mm aa"
      disabled={disabled}
      id={id}
      isClearable
      minDate={new Date()}
      onChange={(deadline: Date | null) => onChange(deadlineToApiValue(deadline))}
      placeholderText="Select date and time"
      popperClassName="rfq-deadline-popper"
      required
      selected={deadlineFromApiValue(value)}
      showPopperArrow={false}
      showTimeSelect
      timeCaption="Time"
      timeIntervals={15}
    />
  );
}
