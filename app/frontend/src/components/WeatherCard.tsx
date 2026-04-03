/**
 * WeatherCard — rich weather display component.
 *
 * Props are populated by the synthesiser node via with_structured_output(WeatherProps).
 * All fields except city, condition, temp_c, feels_like_c, and summary are optional
 * because the underlying research results may not always include them.
 *
 * Design: single-column card with a large temperature display, condition label,
 * and a grid of secondary metrics. Matches the dark/light theme of the rest of the UI.
 */

interface WeatherCardProps {
  city: string;
  condition: string;
  temp_c: number;
  feels_like_c: number;
  humidity?: number;
  wind_speed_kmh?: number;
  wind_direction?: string;
  aqi?: number | null;
  aqi_label?: string | null;
  visibility_km?: number | null;
  summary: string;
}

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500 dark:text-neutral-500 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
        {value}
      </span>
    </div>
  );
}

function tempF(c: number): number {
  return Math.round(c * 9 / 5 + 32);
}

export function WeatherCard({
  city,
  condition,
  temp_c,
  feels_like_c,
  humidity,
  wind_speed_kmh,
  wind_direction,
  aqi,
  aqi_label,
  visibility_km,
  summary,
}: WeatherCardProps) {
  const stats: StatProps[] = [];

  if (feels_like_c !== undefined) {
    stats.push({
      label: "Feels like",
      value: `${Math.round(feels_like_c)}°C (${tempF(feels_like_c)}°F)`,
    });
  }
  if (humidity !== undefined) {
    stats.push({ label: "Humidity", value: `${humidity}%` });
  }
  if (wind_speed_kmh !== undefined) {
    const dir = wind_direction ? `${wind_direction} ` : "";
    stats.push({ label: "Wind", value: `${dir}${wind_speed_kmh} km/h` });
  }
  if (aqi !== null && aqi !== undefined) {
    const label = aqi_label ? ` — ${aqi_label}` : "";
    stats.push({ label: "Air Quality", value: `AQI ${aqi}${label}` });
  }
  if (visibility_km !== null && visibility_km !== undefined) {
    stats.push({ label: "Visibility", value: `${visibility_km} km` });
  }

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      {/* Header */}
      <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-4">
        Weather
      </h2>

      {/* City + condition */}
      <div className="mb-1">
        <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {city}
        </span>
      </div>
      <div className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
        {condition}
      </div>

      {/* Temperature — large display */}
      <div className="flex items-end gap-3 mb-5">
        <span className="text-5xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100 leading-none">
          {Math.round(temp_c)}°C
        </span>
        <span className="text-xl text-neutral-400 dark:text-neutral-500 mb-1">
          {tempF(temp_c)}°F
        </span>
      </div>

      {/* Secondary stats grid */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-neutral-100 dark:border-neutral-800 pt-4 mb-4">
          {stats.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      )}

      {/* Summary prose */}
      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
        {summary}
      </p>
    </div>
  );
}
