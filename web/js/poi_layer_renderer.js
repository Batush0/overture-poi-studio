class PoiLayerRenderer {
    static VIEWPORT_CLUSTER_THRESHOLD = 1500;
    static CLUSTER_CELL_PX = 54;
    static DOT_DEDUP_PX = 3;

    constructor(
        map,
        popupBuilder,
        colorResolver,
    ) {
        this._map = map;
        this._popupBuilder = popupBuilder;
        this._colorResolver = colorResolver;
        this._canvasRenderer = L.canvas({ padding: 0.15 });
        this._poiLayer = L.layerGroup().addTo(this._map);
        this._heatLayer = null;
        this._allPois = [];
        this._viewMode = "cluster";
        this._renderFrame = null;
        this._map.on("moveend", () => this._scheduleRender());
    }

    setPois(pois) {
        this._allPois = pois;
        this._scheduleRender();
    }

    setViewMode(mode) {
        this._viewMode = mode;
        this._scheduleRender();
    }

    focusPoi(poi) {
        this._map.setView([poi.lat, poi.lon], Math.max(this._map.getZoom(), 17));
        this._openPopup(poi);
    }

    _openPopup(poi) {
        L.popup({ maxWidth: 320 })
            .setLatLng([poi.lat, poi.lon])
            .setContent(this._popupBuilder.buildHtml(poi))
            .openOn(this._map);
    }

    _scheduleRender() {
        if (this._renderFrame !== null) {
            cancelAnimationFrame(this._renderFrame);
        }
        this._renderFrame = requestAnimationFrame(() => {
            this._renderFrame = null;
            this._renderViewport();
        });
    }

    _renderViewport() {
        this._clearLayers();
        const visible = this._filterVisibleInViewport();
        if (!visible.length) {
            return;
        }
        if (this._viewMode === "heat") {
            this._renderHeat(visible);
            return;
        }
        if (
            this._viewMode === "dots" ||
            visible.length <= PoiLayerRenderer.VIEWPORT_CLUSTER_THRESHOLD
        ) {
            this._renderCanvasDots(visible);
            return;
        }
        this._renderGridClusters(visible);
    }

    _clearLayers() {
        this._poiLayer.clearLayers();
        if (this._heatLayer) {
            this._map.removeLayer(this._heatLayer);
            this._heatLayer = null;
        }
    }

    _filterVisibleInViewport() {
        const bounds = this._map.getBounds().pad(0.12);
        const south = bounds.getSouth();
        const north = bounds.getNorth();
        const west = bounds.getWest();
        const east = bounds.getEast();
        const result = [];
        for (let i = 0; i < this._allPois.length; i += 1) {
            const p = this._allPois[i];
            if (
                p.lat && p.lon &&
                p.lat >= south && p.lat <= north &&
                p.lon >= west && p.lon <= east
            ) {
                result.push(p);
            }
        }
        return result;
    }

    _renderCanvasDots(pois) {
        const occupied = pois.length > PoiLayerRenderer.VIEWPORT_CLUSTER_THRESHOLD
            ? new Set()
            : null;
        const step = PoiLayerRenderer.DOT_DEDUP_PX;
        for (let i = 0; i < pois.length; i += 1) {
            const poi = pois[i];
            if (occupied) {
                const pt = this._map.latLngToContainerPoint([poi.lat, poi.lon]);
                const key = `${Math.floor(pt.x / step)}_${Math.floor(pt.y / step)}`;
                if (occupied.has(key)) {
                    continue;
                }
                occupied.add(key);
            }
            this._addSingleCanvasDot(poi);
        }
    }

    _renderGridClusters(pois) {
        const cellSize = PoiLayerRenderer.CLUSTER_CELL_PX;
        const buckets = new Map();
        for (let i = 0; i < pois.length; i += 1) {
            const poi = pois[i];
            const pt = this._map.latLngToContainerPoint([poi.lat, poi.lon]);
            const key = `${Math.floor(pt.x / cellSize)}_${Math.floor(pt.y / cellSize)}`;
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = {
                    count: 0,
                    sumLat: 0,
                    sumLon: 0,
                    minLat: poi.lat,
                    maxLat: poi.lat,
                    minLon: poi.lon,
                    maxLon: poi.lon,
                    sample: poi,
                };
                buckets.set(key, bucket);
            }
            bucket.count += 1;
            bucket.sumLat += poi.lat;
            bucket.sumLon += poi.lon;
            if (poi.lat < bucket.minLat) bucket.minLat = poi.lat;
            if (poi.lat > bucket.maxLat) bucket.maxLat = poi.lat;
            if (poi.lon < bucket.minLon) bucket.minLon = poi.lon;
            if (poi.lon > bucket.maxLon) bucket.maxLon = poi.lon;
        }
        buckets.forEach((bucket) => {
            if (bucket.count === 1) {
                this._addSingleCanvasDot(bucket.sample);
                return;
            }
            this._addClusterBubble(bucket);
        });
    }

    _addSingleCanvasDot(poi) {
        const dot = L.circleMarker([poi.lat, poi.lon], {
            renderer: this._canvasRenderer,
            radius: poi.isBranded ? 6 : 5,
            fillColor: this._colorResolver(poi.topCategory),
            color: "#ffffff",
            weight: 1.6,
            fillOpacity: 0.92,
        });
        dot.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            this._openPopup(poi);
        });
        dot.addTo(this._poiLayer);
    }

    _addClusterBubble(bucket) {
        const lat = bucket.sumLat / bucket.count;
        const lon = bucket.sumLon / bucket.count;
        const size = bucket.count >= 500 ? 42 : bucket.count >= 100 ? 36 : 30;
        const icon = L.divIcon({
            className: "fast-cluster-wrap",
            html: `<div class="fast-cluster-bubble" style="width:${size}px;height:${size}px;">${bucket.count}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
        });
        const marker = L.marker([lat, lon], { icon });
        marker.on("click", () => {
            const bounds = L.latLngBounds(
                [bucket.minLat, bucket.minLon],
                [bucket.maxLat, bucket.maxLon]
            );
            this._map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
        });
        marker.addTo(this._poiLayer);
    }

    _renderHeat(pois) {
        const points = pois.map((p) => [p.lat, p.lon, 0.7]);
        this._heatLayer = L.heatLayer(points, { radius: 22, blur: 16, maxZoom: 16 }).addTo(this._map);
    }
}
