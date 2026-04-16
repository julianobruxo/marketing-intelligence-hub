type LogLevel = "info" | "warn" | "error";

export function logEvent(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };

  console[level](JSON.stringify(payload));
}
