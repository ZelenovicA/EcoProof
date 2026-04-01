import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Crosshair, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LocationPickerProps {
  lat: string;
  lng: string;
  onLatChange: (v: string) => void;
  onLngChange: (v: string) => void;
}

const LocationPicker = ({ lat, lng, onLatChange, onLngChange }: LocationPickerProps) => {
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const updateMarker = useCallback((latNum: number, lngNum: number) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([latNum, lngNum]);
    } else {
      const icon = L.divIcon({
        html: `<div style="width:20px;height:20px;border-radius:50%;background:hsl(142,71%,35%);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        className: "",
      });
      markerRef.current = L.marker([latNum, lngNum], { icon, draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLatLng();
        onLatChange(pos.lat.toFixed(6));
        onLngChange(pos.lng.toFixed(6));
      });
    }
    map.setView([latNum, lngNum], 14);
  }, [onLatChange, onLngChange]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [44.0165, 21.0059],
      zoom: 7,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);

    // Click to set location
    map.on("click", (e: L.LeafletMouseEvent) => {
      onLatChange(e.latlng.lat.toFixed(6));
      onLngChange(e.latlng.lng.toFixed(6));
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update marker when lat/lng change
  useEffect(() => {
    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      if (!isNaN(latNum) && !isNaN(lngNum)) {
        updateMarker(latNum, lngNum);
      }
    }
  }, [lat, lng, updateMarker]);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }
    setIsLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onLatChange(position.coords.latitude.toFixed(6));
        onLngChange(position.coords.longitude.toFixed(6));
        setIsLocating(false);
      },
      (err) => {
        setError("Unable to get location. Please allow location access or click on the map.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleGetLocation}
          disabled={isLocating}
          className="flex-1"
        >
          {isLocating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Getting location...</>
          ) : (
            <><Crosshair className="w-4 h-4 mr-2" /> Use My Current Location</>
          )}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="rounded-lg overflow-hidden border border-border h-[280px] md:h-[240px]">
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} className="z-0" />
      </div>
      <p className="text-xs text-muted-foreground">Click on the map or drag the pin to set exact location</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Latitude</label>
          <Input
            value={lat}
            onChange={(e) => onLatChange(e.target.value)}
            placeholder="e.g. 44.7866"
            type="number"
            step="any"
            className="bg-background text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Longitude</label>
          <Input
            value={lng}
            onChange={(e) => onLngChange(e.target.value)}
            placeholder="e.g. 20.4489"
            type="number"
            step="any"
            className="bg-background text-sm"
          />
        </div>
      </div>
    </div>
  );
};

export default LocationPicker;
