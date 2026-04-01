import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const SERBIA_CENTER: [number, number] = [44.0165, 21.0059];

interface ZoneData {
  level: string;
  label: string;
  pm25: number;
  pm10: number;
  co2: number;
  no2: number;
  o3: number;
  humidity: number;
  temp: number;
}

const LEVEL_STYLES: Record<string, { fillColor: string; fillOpacity: number }> = {
  excellent: { fillColor: "hsl(152, 72%, 40%)", fillOpacity: 0.45 },
  good:      { fillColor: "hsl(130, 55%, 48%)", fillOpacity: 0.45 },
  moderate:  { fillColor: "hsl(42, 85%, 52%)",  fillOpacity: 0.5 },
  poor:      { fillColor: "hsl(18, 85%, 50%)",  fillOpacity: 0.5 },
  hazardous: { fillColor: "hsl(0, 75%, 45%)",   fillOpacity: 0.55 },
};

const LEVEL_LABELS: Record<string, string> = {
  excellent: "Excellent", good: "Good", moderate: "Moderate", poor: "Poor", hazardous: "Hazardous",
};

// Data points defined by their real-world lat/lng
const DATA_POINTS: (ZoneData & { lat: number; lng: number })[] = [
  // Belgrade cluster
  { lat: 44.787, lng: 20.449, level: "hazardous", label: "Belgrade Center", pm25: 68, pm10: 112, co2: 485, no2: 52, o3: 28, humidity: 62, temp: 18 },
  { lat: 44.815, lng: 20.520, level: "poor", label: "Belgrade North", pm25: 42, pm10: 76, co2: 420, no2: 36, o3: 33, humidity: 63, temp: 18 },
  { lat: 44.750, lng: 20.500, level: "poor", label: "Belgrade South", pm25: 44, pm10: 78, co2: 415, no2: 38, o3: 35, humidity: 61, temp: 17 },
  { lat: 44.800, lng: 20.600, level: "moderate", label: "Pančevo", pm25: 35, pm10: 65, co2: 400, no2: 32, o3: 38, humidity: 59, temp: 18 },
  { lat: 44.770, lng: 20.350, level: "moderate", label: "Belgrade West", pm25: 30, pm10: 58, co2: 390, no2: 28, o3: 40, humidity: 58, temp: 17 },
  { lat: 44.840, lng: 20.420, level: "poor", label: "Zemun", pm25: 40, pm10: 72, co2: 412, no2: 35, o3: 34, humidity: 60, temp: 18 },
  // Novi Sad
  { lat: 45.252, lng: 19.837, level: "moderate", label: "Novi Sad", pm25: 28, pm10: 52, co2: 380, no2: 25, o3: 42, humidity: 55, temp: 19 },
  { lat: 45.280, lng: 19.900, level: "good", label: "Novi Sad East", pm25: 18, pm10: 35, co2: 350, no2: 18, o3: 48, humidity: 53, temp: 19 },
  { lat: 45.220, lng: 19.810, level: "good", label: "Sremski Karlovci", pm25: 15, pm10: 30, co2: 340, no2: 15, o3: 50, humidity: 54, temp: 19 },
  // Niš
  { lat: 43.321, lng: 21.896, level: "poor", label: "Niš", pm25: 45, pm10: 80, co2: 425, no2: 38, o3: 30, humidity: 58, temp: 20 },
  { lat: 43.350, lng: 21.960, level: "moderate", label: "Niš East", pm25: 32, pm10: 60, co2: 395, no2: 28, o3: 36, humidity: 56, temp: 20 },
  { lat: 43.290, lng: 21.880, level: "moderate", label: "Niš South", pm25: 28, pm10: 55, co2: 385, no2: 24, o3: 40, humidity: 57, temp: 20 },
  // Bor
  { lat: 44.620, lng: 22.126, level: "hazardous", label: "Bor", pm25: 72, pm10: 125, co2: 510, no2: 58, o3: 22, humidity: 50, temp: 16 },
  { lat: 44.650, lng: 22.200, level: "hazardous", label: "Bor East", pm25: 65, pm10: 110, co2: 490, no2: 52, o3: 25, humidity: 48, temp: 16 },
  { lat: 44.590, lng: 22.100, level: "poor", label: "Bor South", pm25: 48, pm10: 88, co2: 440, no2: 42, o3: 30, humidity: 52, temp: 16 },
  // Kragujevac
  { lat: 44.013, lng: 20.911, level: "moderate", label: "Kragujevac", pm25: 26, pm10: 50, co2: 375, no2: 22, o3: 44, humidity: 56, temp: 19 },
  { lat: 44.040, lng: 20.980, level: "good", label: "Kragujevac East", pm25: 16, pm10: 32, co2: 345, no2: 14, o3: 52, humidity: 54, temp: 19 },
  // Subotica
  { lat: 46.100, lng: 19.665, level: "good", label: "Subotica", pm25: 14, pm10: 28, co2: 335, no2: 12, o3: 55, humidity: 52, temp: 20 },
  { lat: 46.070, lng: 19.730, level: "excellent", label: "Subotica East", pm25: 8, pm10: 18, co2: 310, no2: 8, o3: 60, humidity: 50, temp: 20 },
  // Others
  { lat: 43.585, lng: 21.334, level: "moderate", label: "Kruševac", pm25: 25, pm10: 48, co2: 370, no2: 20, o3: 45, humidity: 55, temp: 19 },
  { lat: 43.723, lng: 20.688, level: "good", label: "Čačak", pm25: 15, pm10: 30, co2: 340, no2: 14, o3: 52, humidity: 58, temp: 18 },
  { lat: 44.268, lng: 19.883, level: "excellent", label: "Valjevo", pm25: 8, pm10: 16, co2: 305, no2: 7, o3: 62, humidity: 60, temp: 17 },
  { lat: 44.300, lng: 19.950, level: "good", label: "Valjevo East", pm25: 12, pm10: 24, co2: 325, no2: 10, o3: 56, humidity: 58, temp: 17 },
  { lat: 44.372, lng: 19.186, level: "good", label: "Loznica", pm25: 14, pm10: 28, co2: 332, no2: 12, o3: 54, humidity: 62, temp: 18 },
  { lat: 43.137, lng: 20.512, level: "excellent", label: "Raška", pm25: 5, pm10: 12, co2: 295, no2: 5, o3: 65, humidity: 65, temp: 14 },
  { lat: 43.170, lng: 20.580, level: "excellent", label: "Kopaonik", pm25: 3, pm10: 8, co2: 280, no2: 3, o3: 70, humidity: 68, temp: 12 },
  { lat: 43.860, lng: 19.842, level: "good", label: "Užice", pm25: 16, pm10: 32, co2: 348, no2: 15, o3: 50, humidity: 60, temp: 16 },
  { lat: 44.663, lng: 20.927, level: "poor", label: "Smederevo", pm25: 50, pm10: 90, co2: 445, no2: 44, o3: 28, humidity: 57, temp: 18 },
  { lat: 44.690, lng: 21.000, level: "moderate", label: "Smederevo East", pm25: 30, pm10: 58, co2: 388, no2: 26, o3: 38, humidity: 55, temp: 18 },
  { lat: 45.380, lng: 20.390, level: "moderate", label: "Zrenjanin", pm25: 24, pm10: 46, co2: 365, no2: 20, o3: 44, humidity: 54, temp: 20 },
  { lat: 44.756, lng: 19.691, level: "good", label: "Šabac", pm25: 13, pm10: 26, co2: 330, no2: 11, o3: 55, humidity: 60, temp: 19 },
  { lat: 42.998, lng: 21.946, level: "moderate", label: "Leskovac", pm25: 27, pm10: 52, co2: 378, no2: 22, o3: 42, humidity: 56, temp: 20 },
  { lat: 42.553, lng: 21.900, level: "moderate", label: "Vranje", pm25: 24, pm10: 48, co2: 368, no2: 20, o3: 44, humidity: 55, temp: 21 },
  { lat: 43.153, lng: 22.586, level: "good", label: "Pirot", pm25: 14, pm10: 28, co2: 335, no2: 12, o3: 54, humidity: 52, temp: 19 },
  { lat: 43.905, lng: 22.285, level: "moderate", label: "Zaječar", pm25: 28, pm10: 54, co2: 382, no2: 24, o3: 40, humidity: 50, temp: 18 },
  { lat: 45.773, lng: 19.112, level: "excellent", label: "Sombor", pm25: 6, pm10: 14, co2: 300, no2: 6, o3: 62, humidity: 55, temp: 20 },
  { lat: 45.830, lng: 20.465, level: "good", label: "Kikinda", pm25: 12, pm10: 24, co2: 328, no2: 10, o3: 56, humidity: 53, temp: 20 },
  { lat: 44.980, lng: 19.610, level: "good", label: "Sremska Mitrovica", pm25: 15, pm10: 30, co2: 338, no2: 13, o3: 52, humidity: 57, temp: 19 },
  { lat: 44.430, lng: 21.350, level: "moderate", label: "Požarevac", pm25: 28, pm10: 52, co2: 378, no2: 23, o3: 42, humidity: 56, temp: 18 },
  { lat: 42.670, lng: 20.870, level: "excellent", label: "Prizren area", pm25: 7, pm10: 15, co2: 302, no2: 6, o3: 63, humidity: 62, temp: 15 },
  { lat: 43.450, lng: 20.450, level: "good", label: "Kraljevo", pm25: 18, pm10: 34, co2: 352, no2: 16, o3: 48, humidity: 59, temp: 18 },
];

function buildPopupContent(data: ZoneData): string {
  const levelColor = LEVEL_STYLES[data.level]?.fillColor || "#888";
  return `
    <div style="font-family: Inter, sans-serif; min-width: 200px; padding: 4px 0;">
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px;">${data.label}</div>
      <div style="display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; color: white; background: ${levelColor}; margin-bottom: 10px;">
        ${LEVEL_LABELS[data.level]}
      </div>
      <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
        <tr><td style="padding: 3px 0; color: #888;">PM2.5</td><td style="text-align: right; font-weight: 500;">${data.pm25} µg/m³</td></tr>
        <tr><td style="padding: 3px 0; color: #888;">PM10</td><td style="text-align: right; font-weight: 500;">${data.pm10} µg/m³</td></tr>
        <tr><td style="padding: 3px 0; color: #888;">CO₂</td><td style="text-align: right; font-weight: 500;">${data.co2} ppm</td></tr>
        <tr><td style="padding: 3px 0; color: #888;">NO₂</td><td style="text-align: right; font-weight: 500;">${data.no2} µg/m³</td></tr>
        <tr><td style="padding: 3px 0; color: #888;">O₃</td><td style="text-align: right; font-weight: 500;">${data.o3} µg/m³</td></tr>
        <tr style="border-top: 1px solid #eee;"><td style="padding: 3px 0; color: #888;">Humidity</td><td style="text-align: right; font-weight: 500;">${data.humidity}%</td></tr>
        <tr><td style="padding: 3px 0; color: #888;">Temp</td><td style="text-align: right; font-weight: 500;">${data.temp}°C</td></tr>
      </table>
    </div>
  `;
}

const TIME_PRESETS = [
  { label: "Live", value: "live" },
  { label: "Last 24h", value: "24h" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Custom", value: "custom" },
];

const PollutionMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [timePreset, setTimePreset] = useState("live");
  const [customDate, setCustomDate] = useState<Date>();

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: SERBIA_CENTER,
      zoom: 7,
      scrollWheelZoom: true,
      preferCanvas: true,
      renderer: L.canvas(),
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    // Force tile load after container is sized
    setTimeout(() => {
      map.invalidateSize();
      map.setView(SERBIA_CENTER, 7);
    }, 200);

    // Use projected coordinates at a reference zoom for perfect hex tessellation
    const refZoom = 18;

    // Calculate pixels per km at this latitude
    const p1 = map.project(L.latLng(44.0, 21.0), refZoom);
    const p2 = map.project(L.latLng(44.09, 21.0), refZoom); // ~10km north
    const pixelsPer10km = Math.abs(p2.y - p1.y);
    const hexR = pixelsPer10km; // 10km radius

    const DX = Math.sqrt(3) * hexR;
    const DY = 1.5 * hexR;

    // Extended bounding box covering wider Europe for full map hex coverage
    const sw = map.project(L.latLng(25, -15), refZoom);
    const ne = map.project(L.latLng(62, 45), refZoom);
    const minY = ne.y;
    const maxY = sw.y;
    const minX = sw.x;
    const maxX = ne.x;

    // Project all data points to pixel space for matching
    const dataPixels = DATA_POINTS.map((dp) => {
      const pt = map.project(L.latLng(dp.lat, dp.lng), refZoom);
      return { ...dp, px: pt.x, py: pt.y };
    });

    function hexVertices(cx: number, cy: number): L.LatLng[] {
      return Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        return map.unproject(L.point(cx + hexR * Math.cos(angle), cy + hexR * Math.sin(angle)), refZoom);
      });
    }

    const rowStart = Math.floor(minY / DY) - 1;
    const rowEnd = Math.ceil(maxY / DY) + 1;

    for (let row = rowStart; row <= rowEnd; row++) {
      const cy = row * DY;
      const xOffset = (row & 1) ? DX / 2 : 0;
      const colStart = Math.floor((minX - xOffset) / DX) - 1;
      const colEnd = Math.ceil((maxX - xOffset) / DX) + 1;

      for (let col = colStart; col <= colEnd; col++) {
        const cx = col * DX + xOffset;
        const verts = hexVertices(cx, cy);

        // Find if any data point falls in this hex cell
        let matchedData: ZoneData | null = null;
        for (const dp of dataPixels) {
          const dx = dp.px - cx;
          const dy = dp.py - cy;
          if (Math.sqrt(dx * dx + dy * dy) < hexR * 0.87) { // inscribed radius check
            matchedData = dp;
            break;
          }
        }

        if (matchedData) {
          const style = LEVEL_STYLES[matchedData.level];
          const poly = L.polygon(verts, {
            stroke: true,
            color: style.fillColor,
            weight: 1,
            opacity: 0.4,
            fillColor: style.fillColor,
            fillOpacity: style.fillOpacity,
            interactive: true,
            // @ts-ignore – prevents clipping on zoom
            noClip: true,
          });
          poly.bindPopup(buildPopupContent(matchedData), { maxWidth: 260 });
          poly.on("mouseover", function () { this.setStyle({ fillOpacity: style.fillOpacity + 0.15 }); });
          poly.on("mouseout", function () { this.setStyle({ fillOpacity: style.fillOpacity }); });
          poly.addTo(map);
        } else {
          L.polygon(verts, {
            color: "hsl(0, 0%, 65%)",
            fillColor: "transparent",
            fillOpacity: 0,
            weight: 0.8,
            opacity: 0.4,
            interactive: false,
            // @ts-ignore
            noClip: true,
          }).addTo(map);
        }
      }
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Time filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mr-1">
          <Clock className="w-4 h-4" />
          <span className="font-medium">Time Range:</span>
        </div>
        {TIME_PRESETS.map((preset) => (
          <Button
            key={preset.value}
            variant={timePreset === preset.value ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setTimePreset(preset.value)}
          >
            {preset.label}
            {preset.value === "live" && timePreset === "live" && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            )}
          </Button>
        ))}
        {timePreset === "custom" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("h-8 text-xs", !customDate && "text-muted-foreground")}
              >
                <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                {customDate ? format(customDate, "PPP") : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={customDate}
                onSelect={setCustomDate}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="rounded-xl overflow-hidden border border-border h-[400px] md:h-[560px]">
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} className="z-0" />
      </div>
      <div className="flex items-center justify-center gap-4 flex-wrap text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm rotate-45" style={{ background: "hsl(152, 72%, 40%)" }} /> Excellent</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm rotate-45" style={{ background: "hsl(130, 55%, 48%)" }} /> Good</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm rotate-45" style={{ background: "hsl(42, 85%, 52%)" }} /> Moderate</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm rotate-45" style={{ background: "hsl(18, 85%, 50%)" }} /> Poor</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm rotate-45" style={{ background: "hsl(0, 75%, 45%)" }} /> Hazardous</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm rotate-45 border border-muted-foreground/30" /> No Data</div>
      </div>
    </div>
  );
};

export default PollutionMap;
