/**
 * Simple cron expression parser and matcher
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 * Also supports 6-field with seconds (not used here)
 */

export interface ParsedCron {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

/**
 * Parse a cron field (e.g., "*\/5", "1,2,3", "1-5", "*")
 */
function parseCronField(field: string, min: number, max: number): number[] {
  const result: number[] = [];
  
  if (field === "*") {
    for (let i = min; i <= max; i++) result.push(i);
    return result;
  }
  
  const parts = field.split(",");
  for (const part of parts) {
    if (part.includes("/")) {
      const [range, step] = part.split("/");
      const stepNum = parseInt(step, 10);
      let start = min;
      let end = max;
      
      if (range !== "*") {
        if (range.includes("-")) {
          const [s, e] = range.split("-").map(Number);
          start = s;
          end = e;
        } else {
          start = end = parseInt(range, 10);
        }
      }
      
      for (let i = start; i <= end; i += stepNum) {
        if (i >= min && i <= max) result.push(i);
      }
    } else if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);
      for (let i = start; i <= end; i++) {
        if (i >= min && i <= max) result.push(i);
      }
    } else {
      const val = parseInt(part, 10);
      if (!Number.isNaN(val) && val >= min && val <= max) result.push(val);
    }
  }
  
  return [...new Set(result)].sort((a, b) => a - b);
}

/**
 * Parse a cron expression into structured parts
 * Format: minute hour dayOfMonth month dayOfWeek
 */
export function parseCron(cron: string): ParsedCron {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cron} (expected 5 fields)`);
  }
  
  return {
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    dayOfMonth: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6), // 0 = Sunday
  };
}

/**
 * Check if a given date matches a cron schedule
 */
export function matchesCron(cron: string, date: Date, timezone?: string): boolean {
  try {
    const parsed = parseCron(cron);
    
    // Use UTC or specified timezone
    let checkDate = date;
    if (timezone) {
      // Simple timezone offset handling
      const tzOffset = getTimezoneOffset(timezone, date);
      checkDate = new Date(date.getTime() + tzOffset * 60000);
    }
    
    const minute = checkDate.getUTCMinutes();
    const hour = checkDate.getUTCHours();
    const dayOfMonth = checkDate.getUTCDate();
    const month = checkDate.getUTCMonth() + 1; // 1-12
    const dayOfWeek = checkDate.getUTCDay(); // 0 = Sunday
    
    return (
      parsed.minute.includes(minute) &&
      parsed.hour.includes(hour) &&
      parsed.dayOfMonth.includes(dayOfMonth) &&
      parsed.month.includes(month) &&
      parsed.dayOfWeek.includes(dayOfWeek)
    );
  } catch {
    return false;
  }
}

/**
 * Get timezone offset in minutes for a given timezone at a specific date
 * This is a simplified implementation
 */
function getTimezoneOffset(timezone: string, date: Date): number {
  try {
    // Use Intl.DateTimeFormat to get offset
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    
    const parts = fmt.formatToParts(date);
    const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
    
    // Get UTC time for comparison
    const utcHour = date.getUTCHours();
    const utcMinute = date.getUTCMinutes();
    
    // Calculate offset in minutes
    const localTotal = hour * 60 + minute;
    const utcTotal = utcHour * 60 + utcMinute;
    return localTotal - utcTotal;
  } catch {
    return 0;
  }
}

/**
 * Get the next execution time for a cron expression after a given date
 */
export function nextCronExecution(cron: string, after: Date, timezone?: string): Date | null {
  const maxIterations = 366 * 24 * 60; // Max 1 year of minutes
  
  let current = new Date(after.getTime() + 60000); // Start from next minute
  
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(cron, current, timezone)) {
      return current;
    }
    current = new Date(current.getTime() + 60000);
  }
  
  return null;
}