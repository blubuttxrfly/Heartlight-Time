import { useMemo, useState } from "react";
import * as Astronomy from "astronomy-engine";
import {
  ZODIAC_HUES,
  ZODIAC_RAY_NAMES,
  ZODIAC_RAY_ESSENCE,
} from "../lib/extendedChart";
import { computeZenith, computeLiveAlignments } from "../lib/gaiaSolAlignments";

/* ───────────────────────────────────────────────────────────
   Astro Gaia Ray Dial
   A Polaris-anchored Ray Dial with 8 planetary bodies
   traveling along their own dedicated ecliptic orbit rings.
   Polaris is the computational orientation axis — the zodiac
   wheel turns beneath the fixed north star.
   ─────────────────────────────────────────────────────────── */

const DEG2RAD = Math.PI / 180;

/* ── Polaris constants ──────────────────────────────────────
   Polaris (Alpha Ursae Minoris):
     RA  = 2h 31m 49s = 2.5303 hours = 37.954 degrees
     Dec = +89° 15′ 50″ = +89.264 degrees
   In ecliptic coordinates, the north celestial pole projects
   to approximately ecliptic longitude 90° at very high
   ecliptic latitude. For the 2D dial, Polaris anchors the
   "north" position (top) as the fixed pivot point. */
const POLARIS_RA_HOURS = 2.5303;
const POLARIS_DEC_DEG = 89.264;

/* ── Geocentric ecliptic longitude (astrologically correct) ──
   Uses GeoVector + Ecliptic to get the planet's position as seen
   from Earth, matching standard astrological placements.
   (Astronomy.EclipticLongitude is heliocentric and would give
   wrong sign placements for astrology.) */
function getGeoEclipticLongitude(body: Astronomy.Body, date: Date): number {
  const time = Astronomy.MakeTime(date);
  const gv = Astronomy.GeoVector(body, time, true);
  const ecl = Astronomy.Ecliptic(gv);
  return normalizeLon(ecl.elon);
}

/* ── Ecliptic mapping ───────────────────────────────────────
   Same convention as LGS dial: Mabon (180° ecliptic) at top.
   planetAngle maps ecliptic longitude to screen angle. */
const MABON_ECLIPTIC = 180;
const BASE_OFFSET = -(MABON_ECLIPTIC * DEG2RAD);

function normalizeLon(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function planetAngle(eclipticDeg: number): number {
  return -Math.PI / 2 + eclipticDeg * DEG2RAD + BASE_OFFSET;
}

/* ── Planet data: 8 bodies ordered from Gaia ────────────────
   Aphrodite (Venus) is closest, Hades (Pluto) is furthest.
   Each gets a dedicated orbit ring radius in SVG viewBox units.
   Radii spread between RING_INNER+4 and RING_OUTER-2 to avoid
   overlap and fill the ring space evenly. */
type AstroBody = {
  body: Astronomy.Body;
  name: string;        // Greek deity display name
  key: string;         // image filename key
  orbitRadius: number;
  imageRadius: number; // visual size of planet image
  orbitColor: string;
};

const RING_OUTER = 62;
const RING_INNER = 22;

const ASTRO_BODIES: AstroBody[] = [
  { body: Astronomy.Body.Pluto,   name: "Hades",     key: "Pluto",   orbitRadius: 58, imageRadius: 2.2, orbitColor: "rgba(205,180,255,0.10)" },
  { body: Astronomy.Body.Neptune, name: "Poseidon",  key: "Neptune", orbitRadius: 53, imageRadius: 3.0, orbitColor: "rgba(122,162,255,0.10)" },
  { body: Astronomy.Body.Saturn,  name: "Chronos",   key: "Saturn",  orbitRadius: 48, imageRadius: 3.5, orbitColor: "rgba(220,202,166,0.10)" },
  { body: Astronomy.Body.Uranus,  name: "Uranus",    key: "Uranus",  orbitRadius: 43, imageRadius: 3.2, orbitColor: "rgba(125,211,252,0.10)" },
  { body: Astronomy.Body.Jupiter, name: "Zeus",      key: "Jupiter", orbitRadius: 38, imageRadius: 4.0, orbitColor: "rgba(242,192,120,0.10)" },
  { body: Astronomy.Body.Mars,    name: "Ares",      key: "Mars",    orbitRadius: 33, imageRadius: 2.8, orbitColor: "rgba(255,106,61,0.12)" },
  { body: Astronomy.Body.Venus,   name: "Aphrodite", key: "Venus",   orbitRadius: 28, imageRadius: 3.0, orbitColor: "rgba(224,192,128,0.12)" },
  { body: Astronomy.Body.Mercury, name: "Hermes",    key: "Mercury", orbitRadius: 24, imageRadius: 2.5, orbitColor: "rgba(168,168,168,0.10)" },
];

/* ── Ray + zodiac data (copied from index.tsx) ────────────── */
const GAIA_RAY_WINDOWS = [
  { name: "Red", color: "#ef4444", sign: "Aries", symbol: "\u2648\uFE0E" },
  { name: "Orange", color: "#f97316", sign: "Taurus", symbol: "\u2649\uFE0E" },
  { name: "Yellow", color: "#facc15", labelColor: "#f8fafc", sign: "Gemini", symbol: "\u264A\uFE0E" },
  { name: "Green", color: "#22c55e", sign: "Cancer", symbol: "\u264B\uFE0E" },
  { name: "Turquoise", color: "#2dd4bf", sign: "Leo", symbol: "\u264C\uFE0E" },
  { name: "Blue", color: "#3b82f6", sign: "Virgo", symbol: "\u264D\uFE0E" },
  { name: "Indigo", color: "#6366f1", sign: "Libra", symbol: "\u264E\uFE0E" },
  { name: "Violet", color: "#8b5cf6", sign: "Scorpio", symbol: "\u264F\uFE0E" },
  { name: "Magenta", color: "#d946ef", sign: "Sagittarius", symbol: "\u2650\uFE0E" },
  { name: "Omni", color: "#fafafa", labelColor: "#f8fafc", sign: "Capricorn", symbol: "\u2651\uFE0E" },
  { name: "Elemental", color: "#a5f3fc", labelColor: "#f8fafc", sign: "Aquarius", symbol: "\u2652\uFE0E" },
  { name: "ALL", color: "#7dd3fc", labelColor: "#f8fafc", sign: "Pisces", symbol: "\u2653\uFE0E" },
];

const GAIA_TOP_INDEX = GAIA_RAY_WINDOWS.findIndex((r) => r.name === "Indigo");
const SEGMENT_ANGLE = (2 * Math.PI) / GAIA_RAY_WINDOWS.length;

const RING_VIEWBOX_PADDING = 36;
const RING_VIEWBOX_MIN = -RING_OUTER - RING_VIEWBOX_PADDING;
const RING_VIEWBOX_SIZE = (RING_OUTER + RING_VIEWBOX_PADDING) * 2;

/* ── Helpers (copied from GaiaRayDial + Sol Ray Dial) ─────── */
function polarToCartesian(r: number, angle: number) {
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

function describeThinWedge(
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(outerRadius, startAngle);
  const outerEnd = polarToCartesian(outerRadius, endAngle);
  const innerEnd = polarToCartesian(innerRadius, endAngle);
  const innerStart = polarToCartesian(innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";
  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

function lerpColor(a: string, b: string, t: number): string {
  const ca = parseInt(a.replace("#", ""), 16);
  const cb = parseInt(b.replace("#", ""), 16);
  const ar = (ca >> 16) & 255, ag = (ca >> 8) & 255, ab = ca & 255;
  const br = (cb >> 16) & 255, bg = (cb >> 8) & 255, bb = cb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

function colorForRayAngle(
  angle: number,
  windows: { color: string }[],
  topIndex: number
): string {
  const ordered = Array.from({ length: windows.length }, (_, i) =>
    windows[(topIndex + i) % windows.length]
  );
  const angleFromTop = (angle + Math.PI / 2) % (2 * Math.PI);
  if (angleFromTop < 0) return ordered[0].color;
  const t = (angleFromTop / (2 * Math.PI)) * windows.length;
  const idx = Math.floor(t) % windows.length;
  const nextIdx = (idx + 1) % windows.length;
  return lerpColor(ordered[idx].color, ordered[nextIdx].color, t - idx);
}

/* ── Polaris anchor computation ─────────────────────────────
   Polaris is at the north celestial pole. In the dial's 2D
   projection, it sits at the "north" position (top, -PI/2).
   The dial rotation in Zenith mode is anchored to how far the
   current zenith has rotated from Polaris's meridian, making
   Polaris the true orientation axis.

   The hour angle of Polaris tells us how far the sky has rotated
   from the pole star. We use this to drive the dial rotation. */
function polarisHourAngle(date: Date, lonDeg: number): number {
  // LST in degrees
  const time = Astronomy.MakeTime(date);
  const d = time.tt;
  const gmst = ((280.46061837 + 360.98564736629 * d) % 360 + 360) % 360;
  const lst = ((gmst + lonDeg) % 360 + 360) % 360;
  // Polaris RA in degrees
  const polarisRADeg = POLARIS_RA_HOURS * 15; // 37.954°
  // Hour angle = LST - RA (in degrees), then convert to [0, 360)
  const ha = ((lst - polarisRADeg) % 360 + 360) % 360;
  return ha;
}

/* ── Types ────────────────────────────────────────────────── */
type Props = {
  lat: number;
  lon: number;
  date: Date;
  sunriseDate?: Date;
  sunsetDate?: Date;
  rayReadings: Record<string, { title: string; core: string; gifts: string; ideal: string; affirmation: string }>;
  dialSizeClass?: string;
};

/* ── Component ────────────────────────────────────────────── */
export function AstroGaiaRayDial({ lat, lon, date, sunriseDate, sunsetDate, rayReadings, dialSizeClass }: Props) {
  const [orientation, setOrientation] = useState<"zenith" | "heartlight">("zenith");

  /* ── Zenith computation ── */
  const zenith = useMemo(() => computeZenith(date, lat, lon), [date, lat, lon]);
  const gaiaRayIndex = zenith.signIndex;
  const gaiaRay = GAIA_RAY_WINDOWS[gaiaRayIndex];
  const rayProgress = (zenith.longitude % 30) / 30;

  /* ── Live Local Astro Ray Alignments ── */
  const liveChart = useMemo(() => computeLiveAlignments(lat, lon, date), [lat, lon, date]);

  /* ── Dawn & Dusk zenith alignments ── */
  const dawnFacing = useMemo(
    () => (sunriseDate ? computeZenith(sunriseDate, lat, lon) : null),
    [sunriseDate, lat, lon]
  );
  const duskFacing = useMemo(
    () => (sunsetDate ? computeZenith(sunsetDate, lat, lon) : null),
    [sunsetDate, lat, lon]
  );

  /* ── Polaris anchor: dial rotation driven by Polaris hour angle ──
     In Zenith mode, the dial rotates so the current zenith sign
     aligns to the top, but the rotation is computed relative to
     Polaris's hour angle, making Polaris the computational axis.
     The hour angle of Polaris tells us how far the sky has turned
     from the pole star. We convert this to a rotation angle. */
  const polarisHA = useMemo(() => polarisHourAngle(date, lon), [date, lon]);

  /* Zenith screen angle: where the zenith sign sits on the unrotated dial */
  const activeSegment = useMemo(() => {
    const startAngle =
      -Math.PI / 2 + ((gaiaRayIndex + GAIA_TOP_INDEX) % GAIA_RAY_WINDOWS.length) * SEGMENT_ANGLE;
    return { startAngle, midAngle: startAngle + SEGMENT_ANGLE / 2 };
  }, [gaiaRayIndex]);

  const pointerAngle = activeSegment.startAngle + rayProgress * SEGMENT_ANGLE;

  /* Polaris-anchored rotation: in zenith mode, rotate so the pointer
     (zenith position) aligns to the top. The rotation is equivalent
     to the negative of the pointer angle offset, but we express it
     through the Polaris hour angle to establish the computational
     relationship. The HA of Polaris measures the same daily rotation
     as the zenith's movement through signs. */
  const polarisRotationDeg = useMemo(() => {
    // The dial rotation that brings the zenith to the top
    // is the same rotation that brings Polaris's meridian to 0°.
    // We use -(pointerAngle + PI/2) converted to degrees, which
    // equals the negative hour angle of Polaris projected onto
    // the ecliptic dial.
    const dialRotation = -(pointerAngle * 180) / Math.PI - 90;
    return dialRotation;
  }, [pointerAngle]);

  /* ── Dial segments ── */
  const dialSegments = useMemo(() => {
    return Array.from({ length: GAIA_RAY_WINDOWS.length }, (_, i) => {
      const startAngle =
        -Math.PI / 2 + ((i + GAIA_TOP_INDEX) % GAIA_RAY_WINDOWS.length) * SEGMENT_ANGLE;
      const endAngle = startAngle + SEGMENT_ANGLE;
      const midAngle = startAngle + SEGMENT_ANGLE / 2;
      const symbolRadius = RING_OUTER + 5;
      const symbolPosition = polarToCartesian(symbolRadius, midAngle);
      const labelRadius = RING_OUTER + 14;
      const labelPosition = polarToCartesian(labelRadius, midAngle);
      return {
        index: i,
        ray: GAIA_RAY_WINDOWS[i],
        startAngle,
        endAngle,
        midAngle,
        symbolX: symbolPosition.x,
        symbolY: symbolPosition.y,
        labelX: labelPosition.x,
        labelY: labelPosition.y,
      };
    });
  }, []);

  /* ── Conic gradient wedges ── */
  const conicWedges = useMemo(() => {
    const slices = 360;
    const step = (2 * Math.PI) / slices;
    return Array.from({ length: slices }, (_, i) => {
      const startAngle = -Math.PI / 2 + i * step;
      const endAngle = startAngle + step;
      return {
        d: describeThinWedge(RING_OUTER, RING_INNER, startAngle, endAngle),
        color: colorForRayAngle(startAngle + step / 2, GAIA_RAY_WINDOWS, GAIA_TOP_INDEX),
      };
    });
  }, []);

  /* ── Planet ecliptic positions ── */
  const planetPositions = useMemo(() => {
    return ASTRO_BODIES.map((body) => {
      let lonDeg = 0;
      try {
        lonDeg = getGeoEclipticLongitude(body.body, date);
      } catch {
        lonDeg = 0;
      }
      const angle = planetAngle(normalizeLon(lonDeg));
      const x = body.orbitRadius * Math.cos(angle);
      const y = body.orbitRadius * Math.sin(angle);
      return {
        ...body,
        eclipticLon: lonDeg,
        screenAngle: angle,
        x,
        y,
      };
    });
  }, [date]);

  /* ── Colatitude: angular distance from Polaris to Zenith ──
     Polaris is at Dec +89.264°, effectively at the celestial pole.
     The angular distance from Polaris to the observer's zenith is:
       cos(d) = sin(dec_polaris) * sin(lat) + cos(dec_polaris) * cos(lat) * cos(HA)
     Since Polaris is very close to the pole (Dec ~89.26°), this
     simplifies to approximately (90° - lat), the colatitude.
     We compute the exact value for precision. */
  const colatitudeDeg = useMemo(() => {
    const polarisDecRad = POLARIS_DEC_DEG * DEG2RAD;
    const latRad = lat * DEG2RAD;
    const haRad = polarisHA * DEG2RAD;
    const cosD =
      Math.sin(polarisDecRad) * Math.sin(latRad) +
      Math.cos(polarisDecRad) * Math.cos(latRad) * Math.cos(haRad);
    const d = Math.acos(Math.max(-1, Math.min(1, cosD))) / DEG2RAD;
    return d;
  }, [lat, polarisHA]);
  const polarisPosition = polarToCartesian(RING_OUTER + 18, -Math.PI / 2);

  return (
    <div className="mx-auto w-full space-y-4">
      {/* Header + compass toggle */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 pt-1">
        <div />
        <div className="text-center space-y-1 min-w-0">
          <div className="text-xs uppercase tracking-wide text-zinc-400">
            Astro Gaia Ray Dial
          </div>
          <div className="text-[10px] text-zinc-400">
            Polaris-anchored ecliptic wheel · 8 planetary deities travel the sacred Ray frequencies
          </div>
          <div className="text-lg font-semibold" style={{ color: gaiaRay.color }}>
            {gaiaRay.sign} {gaiaRay.symbol} {gaiaRay.name} Ray
          </div>
        </div>
        <div className="flex items-center justify-end self-end pb-1">
          <button
            type="button"
            onClick={() =>
              setOrientation(orientation === "heartlight" ? "zenith" : "heartlight")
            }
            className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900/60 p-2 transition hover:bg-zinc-800"
            title={
              orientation === "heartlight"
                ? "Switch to Polaris Zenith Mode (live present-moment tracking)"
                : "Switch to Heartlight Alignment (Blue/Indigo cusp fixed at North)"
            }
          >
            <img
              src="/ray-dial-compass-toggle.png"
              alt={
                orientation === "heartlight"
                  ? "Heartlight mode compass"
                  : "Polaris Zenith mode compass"
              }
              className={`h-8 w-8 object-contain transition-transform duration-300 ${
                orientation === "zenith" ? "rotate-0" : "rotate-45"
              }`}
            />
          </button>
        </div>
      </div>

      {/* SVG Astro Gaia dial */}
      <div className="flex justify-center">
        <div className={`relative aspect-square w-full ${dialSizeClass ?? ""}`}>
          <svg
            viewBox={`${RING_VIEWBOX_MIN} ${RING_VIEWBOX_MIN} ${RING_VIEWBOX_SIZE} ${RING_VIEWBOX_SIZE}`}
            className="block h-auto w-full text-zinc-100 drop-shadow-[0_10px_26px_rgba(15,23,42,0.55)]"
            style={{ overflow: "visible" }}
          >
            <defs>
              <radialGradient
                id="astroGaiaSpotlight"
                cx="0"
                cy="0"
                r="1"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.28" />
                <stop offset="55%" stopColor="#f8fafc" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
              </radialGradient>
              {/* Polaris glow */}
              <radialGradient
                id="polarisGlow"
                cx="0"
                cy="0"
                r="1"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.9" />
                <stop offset="40%" stopColor="#a5f3fc" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Background disc */}
            <circle
              cx="0"
              cy="0"
              r={RING_OUTER + 9}
              fill="#0f172a"
              fillOpacity="0.45"
              stroke="#1e293b"
              strokeWidth="0.8"
            />

            {/* ── Polaris anchor marker (fixed, outside rotating group) ── */}
            <g>
              {/* Polaris glow circle */}
              <circle
                cx={polarisPosition.x.toFixed(3)}
                cy={polarisPosition.y.toFixed(3)}
                r="8"
                fill="url(#polarisGlow)"
              />
              {/* Polaris star symbol — 4-pointed star */}
              <g transform={`translate(${polarisPosition.x.toFixed(3)}, ${polarisPosition.y.toFixed(3)})`}>
                <path
                  d="M 0 -5 L 1.2 -1.2 L 5 0 L 1.2 1.2 L 0 5 L -1.2 1.2 L -5 0 L -1.2 -1.2 Z"
                  fill="#f8fafc"
                  opacity="0.95"
                />
                <circle r="1.5" fill="#a5f3fc" opacity="0.8" />
              </g>
              {/* Polaris label */}
              <text
                x={polarisPosition.x.toFixed(3)}
                y={(polarisPosition.y - 7).toFixed(3)}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="3.6"
                fill="#e2e8f0"
                opacity="0.8"
                style={{ textShadow: "0 0 4px rgba(165,243,252,0.6)" }}
              >
                Polaris
              </text>
              {/* Faint anchor line from Polaris to center */}
              <line
                x1={polarisPosition.x.toFixed(3)}
                y1={polarisPosition.y.toFixed(3)}
                x2="0"
                y2={(-RING_INNER + 4).toFixed(3)}
                stroke="rgba(165,243,252,0.15)"
                strokeWidth="0.3"
                strokeDasharray="1.5 2"
              />
            </g>

            {/* ── Rotating zodiac group ── */}
            <g
              transform={
                orientation === "zenith"
                  ? `rotate(${polarisRotationDeg.toFixed(2)})`
                  : undefined
              }
            >
              {/* Conic gradient ring */}
              <g>
                {conicWedges.map((wedge, i) => (
                  <path key={i} d={wedge.d} fill={wedge.color} stroke="none" />
                ))}
              </g>

              {/* Active-segment spotlight */}
              {activeSegment && (
                <path
                  d={(() => {
                    const mid = activeSegment.midAngle;
                    const half = SEGMENT_ANGLE * 1.05;
                    const inner = polarToCartesian(RING_INNER - 10, mid - half);
                    const outerL = polarToCartesian(RING_OUTER + 8, mid - half);
                    const outerR = polarToCartesian(RING_OUTER + 8, mid + half);
                    const innerR = polarToCartesian(RING_INNER - 10, mid + half);
                    return [
                      "M 0 0",
                      `L ${inner.x.toFixed(3)} ${inner.y.toFixed(3)}`,
                      `L ${outerL.x.toFixed(3)} ${outerL.y.toFixed(3)}`,
                      `A ${RING_OUTER + 8} ${RING_OUTER + 8} 0 0 1 ${outerR.x.toFixed(3)} ${outerR.y.toFixed(3)}`,
                      `L ${innerR.x.toFixed(3)} ${innerR.y.toFixed(3)}`,
                      "Z",
                    ].join(" ");
                  })()}
                  fill="url(#astroGaiaSpotlight)"
                  stroke="none"
                />
              )}

              {/* Zodiac symbols in darker ring + Ray names on outer edge */}
              {dialSegments.map((segment) => {
                const labelRotDeg = (segment.midAngle * 180) / Math.PI + 90;
                return (
                  <g key={`label-${segment.index}`}>
                    {/* Zodiac symbol + sign name in darker ring */}
                    <text
                      x={segment.symbolX.toFixed(3)}
                      y={segment.symbolY.toFixed(3)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="3.2"
                      fill={segment.ray.labelColor ?? "#e2e8f0"}
                      style={{ textShadow: "0 1px 2px rgba(15,23,42,0.8)" }}
                      transform={`rotate(${labelRotDeg}, ${segment.symbolX.toFixed(3)}, ${segment.symbolY.toFixed(3)})`}
                    >
                      {segment.ray.sign} {segment.ray.symbol}
                    </text>
                    {/* Ray name on outer edge */}
                    <text
                      x={segment.labelX.toFixed(3)}
                      y={segment.labelY.toFixed(3)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="4.0"
                      fill="#e2e8f0"
                      style={{ textShadow: "0 1px 2px rgba(15,23,42,0.8)" }}
                      transform={`rotate(${labelRotDeg}, ${segment.labelX.toFixed(3)}, ${segment.labelY.toFixed(3)})`}
                    >
                      {segment.ray.name}
                    </text>
                  </g>
                );
              })}

              {/* ── Planet orbit rings + planet markers ── */}
              {planetPositions.map((planet) => {
                const labelOffset = planet.imageRadius + 3.5;
                // Position label radially outward from center through planet
                const planetDist = Math.sqrt(planet.x * planet.x + planet.y * planet.y);
                const dirX = planetDist > 0 ? planet.x / planetDist : 0;
                const dirY = planetDist > 0 ? planet.y / planetDist : 0;
                const labelX = planet.x + dirX * labelOffset;
                const labelY = planet.y + dirY * labelOffset;
                return (
                  <g key={`planet-${planet.key}`}>
                    {/* Orbit ring */}
                    <circle
                      r={planet.orbitRadius}
                      fill="none"
                      stroke={planet.orbitColor}
                      strokeWidth="0.4"
                    />
                    {/* Planet image */}
                    <image
                      href={`/hsm-planets/${planet.key}.png`}
                      x={planet.x - planet.imageRadius}
                      y={planet.y - planet.imageRadius}
                      width={planet.imageRadius * 2}
                      height={planet.imageRadius * 2}
                      preserveAspectRatio="xMidYMid slice"
                      opacity={0.92}
                    />
                    {/* Deity name label — ferris wheel (always upright) */}
                    <text
                      x={labelX.toFixed(3)}
                      y={labelY.toFixed(3)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="2.6"
                      fill="#f8fafc"
                      opacity="0.9"
                      style={{ textShadow: "0 1px 3px rgba(15,23,42,0.95)" }}
                      transform={
                        orientation === "zenith"
                          ? `rotate(${(-polarisRotationDeg).toFixed(2)}, ${labelX.toFixed(3)}, ${labelY.toFixed(3)})`
                          : undefined
                      }
                    >
                      {planet.name}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* ── Fixed upright Ray Key at center ── */}
            <g
              transform={
                orientation === "zenith"
                  ? "rotate(0) scale(0.035)"
                  : `rotate(${(pointerAngle * 180) / Math.PI + 90}) scale(0.035)`
              }
            >
              <image
                href="/ray-key.png"
                x="-744.7"
                y="-1766"
                width="1414"
                height="2000"
                opacity="0.92"
              />
            </g>
          </svg>
        </div>
      </div>

      {/* ── Polaris Anchor + Ray Zenith ── */}
      <div className="rounded-xl border border-sky-500/20 bg-slate-900/50 p-4">
        <div className="text-xs uppercase tracking-wide text-sky-300/70">
          Polaris Anchor ☤ Ray Zenith
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-3xl">{zenith.signSymbol}</span>
          <div>
            <div className="text-lg font-semibold text-sky-100">
              {zenith.signName} {zenith.degrees}°{zenith.minutes}' ({zenith.longitude.toFixed(0)}°)
            </div>
            <div
              className="text-sm font-medium"
              style={{ color: ZODIAC_HUES[zenith.signIndex] }}
            >
              {ZODIAC_RAY_NAMES[zenith.signIndex]}
            </div>
          </div>
        </div>
        <div className="mt-2 space-y-1 text-sm text-zinc-200">
          <div>
            <span className="font-semibold text-zinc-100">Polaris Hour Angle: </span>
            {polarisHA.toFixed(1)}°
          </div>
          <div>
            <span className="font-semibold text-zinc-100">Colatitude (Polaris→Zenith arc): </span>
            {colatitudeDeg.toFixed(2)}°
          </div>
          <div>
            <span className="font-semibold text-zinc-100">Core: </span>
            {rayReadings[GAIA_RAY_WINDOWS[zenith.signIndex].name]?.core ?? "—"}
          </div>
          <div>
            <span className="font-semibold text-zinc-100">Gifts: </span>
            {rayReadings[GAIA_RAY_WINDOWS[zenith.signIndex].name]?.gifts ?? "—"}
          </div>
          <div>
            <span className="font-semibold text-zinc-100">Ideal: </span>
            {rayReadings[GAIA_RAY_WINDOWS[zenith.signIndex].name]?.ideal ?? "—"}
          </div>
          <div>
            <span className="font-semibold text-zinc-100">Affirmation: </span>
            {rayReadings[GAIA_RAY_WINDOWS[zenith.signIndex].name]?.affirmation ?? "—"}
          </div>
        </div>

        {/* ── Planetary deities most prevalent with current zenith ── */}
        <div className="mt-3 border-t border-sky-500/15 pt-3">
          <div className="text-[0.65rem] uppercase tracking-wide text-sky-300/60">
            Deities Resonant with Current Zenith
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {planetPositions
              .map((p) => {
                const signIdx = Math.floor(normalizeLon(p.eclipticLon) / 30) % 12;
                const angDist = Math.abs(normalizeLon(p.eclipticLon) - zenith.longitude);
                const closeness = Math.min(angDist, 360 - angDist); // degrees from zenith
                return { ...p, signIdx, closeness };
              })
              .sort((a, b) => a.closeness - b.closeness)
              .slice(0, 3)
              .map((p) => (
                <div
                  key={p.key}
                  className="flex items-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-950/30 px-2 py-1"
                >
                  <img
                    src={`/hsm-planets/${p.key}.png`}
                    alt={p.name}
                    className="h-4 w-4 rounded-full object-cover"
                  />
                  <span className="text-[0.65rem] font-semibold text-zinc-200">{p.name}</span>
                  <span
                    className="text-[0.6rem]"
                    style={{ color: ZODIAC_HUES[p.signIdx] }}
                  >
                    {ZODIAC_RAY_NAMES[p.signIdx]}
                  </span>
                  <span className="text-[0.55rem] text-sky-300/60">
                    {p.closeness.toFixed(0)}° from zenith
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* ── Live Local Astro Ray Alignments ── */}
      <div className="space-y-2 pt-3">
        <div className="text-xs uppercase tracking-wide text-zinc-400">
          Live Local Astro Ray Alignments
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              label: "Ascendant (Rising)",
              data: liveChart.ascendant,
              meaning: "Ascendant: The zodiac sign rising on the eastern horizon right now. Your outward-facing frequency.",
            },
            {
              label: "Descendant (Setting)",
              data: liveChart.descendant,
              meaning: "Descendant: The zodiac sign setting on the western horizon right now. Your mirror frequency.",
            },
            {
              label: "Midheaven (MC)",
              data: liveChart.midheaven,
              meaning: "Midheaven: Where the ecliptic crosses your meridian, the astrological crown of your chart. Your life's crowning frequency.",
            },
            {
              label: "IC (Nadir)",
              data: liveChart.ic,
              meaning: "IC: The zodiac sign beneath your feet, lowest in the sky right now. Your root frequency.",
            },
          ].map((c) => {
            const hue = ZODIAC_HUES[c.data.signIndex] ?? "#e2e8f0";
            const isIC = c.label.startsWith("IC");
            return (
              <div
                key={c.label}
                className={`rounded-lg border p-2.5 ${
                  isIC
                    ? "border-emerald-500/30 bg-emerald-950/20"
                    : "border-sky-500/10 bg-slate-900/40"
                }`}
              >
                <div className="text-[0.65rem] uppercase tracking-wide text-white">
                  {c.label}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-lg">{c.data.signSymbol}</span>
                  <span className="text-sm font-semibold text-sky-100">
                    {c.data.signName} {c.data.degrees}°{c.data.minutes}'
                  </span>
                </div>
                <div className="mt-0.5 text-xs font-medium" style={{ color: hue }}>
                  {ZODIAC_RAY_NAMES[c.data.signIndex]}
                </div>
                <div className="mt-0.5 text-[0.65rem] leading-tight text-white">
                  {ZODIAC_RAY_ESSENCE[c.data.signIndex]}
                </div>
                <div className="mt-1 text-[0.6rem] italic text-white">
                  {c.meaning}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Dawn & Dusk Alignments ── */}
      {dawnFacing && duskFacing && (
      <div className="space-y-2 pt-4">
        <div className="text-xs uppercase tracking-wide text-zinc-400">
          Dawn & Dusk Alignments
        </div>
        {sunriseDate && (
        <div className="text-[10px] text-white">
          Date: {(() => { const m = (sunriseDate.getMonth() + 1).toString().padStart(2, "0"); const d = sunriseDate.getDate().toString().padStart(2, "0"); return `${m}/${d}/${sunriseDate.getFullYear()}`; })()}.
        </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {/* Dawn */}
          <div className="rounded-lg border border-amber-500/20 bg-slate-900/40 p-3">
            <div className="text-[0.65rem] uppercase tracking-wide text-amber-300/70">
              Dawn Alignment
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xl">{dawnFacing.signSymbol}</span>
              <div>
                <div className="text-base font-semibold text-sky-100">
                  {dawnFacing.signName} {dawnFacing.degrees}°{dawnFacing.minutes}'
                </div>
                <div
                  className="text-xs font-medium"
                  style={{ color: ZODIAC_HUES[dawnFacing.signIndex] }}
                >
                  {ZODIAC_RAY_NAMES[dawnFacing.signIndex]}
                </div>
              </div>
            </div>
            <div className="mt-1 text-[0.65rem] text-white">
              {ZODIAC_RAY_ESSENCE[dawnFacing.signIndex]}
            </div>
            <div className="mt-1 text-[0.65rem] italic text-white">
              Zenith at dawn: The ecliptic point directly overhead as day begins.
            </div>
          </div>

          {/* Dusk */}
          <div className="rounded-lg border border-indigo-500/20 bg-slate-900/40 p-3">
            <div className="text-[0.65rem] uppercase tracking-wide text-indigo-300/70">
              Dusk Alignment
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xl">{duskFacing.signSymbol}</span>
              <div>
                <div className="text-base font-semibold text-sky-100">
                  {duskFacing.signName} {duskFacing.degrees}°{duskFacing.minutes}'
                </div>
                <div
                  className="text-xs font-medium"
                  style={{ color: ZODIAC_HUES[duskFacing.signIndex] }}
                >
                  {ZODIAC_RAY_NAMES[duskFacing.signIndex]}
                </div>
              </div>
            </div>
            <div className="mt-1 text-[0.65rem] text-white">
              {ZODIAC_RAY_ESSENCE[duskFacing.signIndex]}
            </div>
            <div className="mt-1 text-[0.65rem] italic text-white">
              Zenith at dusk: The ecliptic point directly overhead as day completes.
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ── Planetary Deity Alignments ── */}
      <div className="space-y-2 pt-3">
        <div className="text-xs uppercase tracking-wide text-zinc-400">
          Planetary Deity Alignments
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {planetPositions.map((planet) => {
            const signIdx = Math.floor(normalizeLon(planet.eclipticLon) / 30) % 12;
            const hue = ZODIAC_HUES[signIdx];
            return (
              <div
                key={planet.key}
                className="rounded-lg border border-zinc-700/40 bg-zinc-900/40 p-2.5"
              >
                <div className="flex items-center gap-1.5">
                  <img
                    src={`/hsm-planets/${planet.key}.png`}
                    alt={planet.name}
                    className="h-5 w-5 rounded-full object-cover"
                  />
                  <span className="text-[0.65rem] font-semibold text-zinc-200">{planet.name}</span>
                </div>
                <div className="mt-1 text-xs font-medium" style={{ color: hue }}>
                  {ZODIAC_RAY_NAMES[signIdx]}
                </div>
                <div className="mt-0.5 text-[0.6rem] text-zinc-400">
                  {planet.eclipticLon.toFixed(1)}° ecliptic
                </div>
                <div className="mt-0.5 text-[0.6rem] leading-tight text-zinc-300">
                  {ZODIAC_RAY_ESSENCE[signIdx]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
