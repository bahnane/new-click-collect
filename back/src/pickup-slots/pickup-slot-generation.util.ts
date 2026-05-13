import { Weekday } from '@prisma/client';

export type PickupHourWindow = {
  dayOfWeek: Weekday;
  startHour: number;
  endHour: number;
};

export type PickupSlotRow = {
  merchantId: string;
  startsAt: Date;
  endsAt: Date;
};

export type GeneratePickupSlotsInput = {
  merchantId: string;
  pickupHours: PickupHourWindow[];
  daysAhead: number;
  now?: Date;
  slotDurationHours?: number;
};

export function generatePickupSlotsForWindow(
  input: GeneratePickupSlotsInput,
): PickupSlotRow[] {
  const now = input.now ?? new Date();
  const slotDurationHours = input.slotDurationHours ?? 2;

  if (input.daysAhead <= 0 || slotDurationHours <= 0) {
    return [];
  }

  const schedule = new Map<Weekday, { startHour: number; endHour: number }>();
  for (const row of input.pickupHours) {
    schedule.set(row.dayOfWeek, {
      startHour: row.startHour,
      endHour: row.endHour,
    });
  }

  if (schedule.size === 0) {
    return [];
  }

  const windowStart = startOfDay(now);
  const rowsToCreate: PickupSlotRow[] = [];

  for (let offset = 0; offset < input.daysAhead; offset += 1) {
    const dayDate = addDays(windowStart, offset);
    const dayKey = getWeekdayEnum(dayDate);
    const daySchedule = schedule.get(dayKey);

    if (!daySchedule) {
      continue;
    }

    const dayStart = withHour(dayDate, daySchedule.startHour);
    const dayEnd = withHour(dayDate, daySchedule.endHour);

    for (
      let startsAt = new Date(dayStart);
      startsAt < dayEnd;
      startsAt = addHours(startsAt, slotDurationHours)
    ) {
      const endsAt = addHours(startsAt, slotDurationHours);
      if (endsAt > dayEnd || startsAt <= now) {
        continue;
      }

      rowsToCreate.push({
        merchantId: input.merchantId,
        startsAt,
        endsAt,
      });
    }
  }

  return rowsToCreate;
}

export function startOfDay(input: Date): Date {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDays(input: Date, days: number): Date {
  const date = new Date(input);
  date.setDate(date.getDate() + days);
  return date;
}

function withHour(day: Date, hour: number): Date {
  const date = new Date(day);
  date.setHours(0, 0, 0, 0);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function addHours(input: Date, hours: number): Date {
  return new Date(input.getTime() + hours * 60 * 60 * 1000);
}

function getWeekdayEnum(date: Date): Weekday {
  const map: Weekday[] = [
    Weekday.SUNDAY,
    Weekday.MONDAY,
    Weekday.TUESDAY,
    Weekday.WEDNESDAY,
    Weekday.THURSDAY,
    Weekday.FRIDAY,
    Weekday.SATURDAY,
  ];

  return map[date.getDay()];
}
