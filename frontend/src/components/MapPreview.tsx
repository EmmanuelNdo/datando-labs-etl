import { useEffect, useRef } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const SOURCE_ID = "preview-source";
const FILL_LAYER_ID = "preview-fill";
const LINE_LAYER_ID = "preview-line";
const POINT_LAYER_ID = "preview-point";

interface Props {
  geojson: GeoJSON.FeatureCollection | null;
}

export default function MapPreview({ geojson }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "&copy; OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [2.35, 46.6],
      zoom: 4.5,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: { "line-color": "#1d4ed8", "line-width": 2 },
      });
      map.addLayer({
        id: POINT_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 5, "circle-color": "#dc2626", "circle-stroke-color": "#fff", "circle-stroke-width": 1 },
      });
      renderData(map, geojson);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      renderData(map, geojson);
    } else {
      map.once("load", () => renderData(map, geojson));
    }
  }, [geojson]);

  return <div ref={containerRef} className="map-preview" />;
}

function renderData(map: MapLibreMap, geojson: GeoJSON.FeatureCollection | null) {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  const data = geojson ?? { type: "FeatureCollection" as const, features: [] };
  source.setData(data);

  if (data.features.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  let hasBounds = false;
  for (const feature of data.features) {
    const geom = feature.geometry;
    if (!geom) continue;
    extendBoundsWithGeometry(bounds, geom);
    hasBounds = true;
  }
  if (hasBounds) {
    map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 300 });
  }
}

function extendBoundsWithGeometry(bounds: maplibregl.LngLatBounds, geom: GeoJSON.Geometry) {
  const extendCoord = (c: number[]) => bounds.extend([c[0], c[1]] as [number, number]);
  const walk = (coords: unknown): void => {
    const arr = coords as unknown[];
    if (typeof arr[0] === "number") {
      extendCoord(arr as number[]);
    } else {
      arr.forEach(walk);
    }
  };
  if ("coordinates" in geom) walk(geom.coordinates as unknown);
  else if (geom.type === "GeometryCollection") geom.geometries.forEach((g) => extendBoundsWithGeometry(bounds, g));
}
