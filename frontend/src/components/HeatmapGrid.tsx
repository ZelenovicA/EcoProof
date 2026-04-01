import { motion } from "framer-motion";

const GRID_SIZE = 12;
const MOCK_DATA = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
  const x = i % GRID_SIZE;
  const y = Math.floor(i / GRID_SIZE);
  const cx = GRID_SIZE / 2;
  const cy = GRID_SIZE / 2;
  const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  const base = Math.max(0, 1 - dist / (GRID_SIZE * 0.6));
  return Math.min(1, base + (Math.random() * 0.3 - 0.15));
});

const getColor = (value: number) => {
  if (value < 0.2) return "bg-eco-green/20";
  if (value < 0.4) return "bg-eco-green/40";
  if (value < 0.6) return "bg-eco-warm/50";
  if (value < 0.8) return "bg-orange-400/60";
  return "bg-destructive/50";
};

const getLabel = (value: number) => {
  if (value < 0.2) return "Excellent";
  if (value < 0.4) return "Good";
  if (value < 0.6) return "Moderate";
  if (value < 0.8) return "Poor";
  return "Hazardous";
};

const HeatmapGrid = () => {
  return (
    <div className="space-y-6">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
        {MOCK_DATA.map((value, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.5 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.005, duration: 0.3 }}
            viewport={{ once: true }}
            className={`aspect-square rounded-sm ${getColor(value)} transition-all hover:scale-110 cursor-pointer`}
            title={`AQI: ${getLabel(value)}`}
          />
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-eco-green/20" /> Excellent</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-eco-green/40" /> Good</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-eco-warm/50" /> Moderate</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-orange-400/60" /> Poor</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-destructive/50" /> Hazardous</div>
      </div>
    </div>
  );
};

export default HeatmapGrid;
