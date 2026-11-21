class MapController {
    constructor(
        containerId,
        popupBuilder,
        colorResolver,
        i18n,
    ) {
        this._basemaps = this._createBasemaps();
        this._activeBasemap = this._basemaps.street;
        this._map = this._initMap(containerId);
        this._boundaryLayer = L.geoJSON(null, {
            interactive: false,
            style: { color: "#2563eb", weight: 2, fillOpacity: 0.04, dashArray: "5 4" },
        }).addTo(this._map);
        this._selectionRect = null;
        this._polygonDraw = new PolygonDrawController(this._map, i18n);
        this._poiRenderer = new PoiLayerRenderer(this._map, popupBuilder, colorResolver);
    }

    renderPois(pois) {
        this._poiRenderer.setPois(pois);
    }

    setViewMode(mode) {
        this._poiRenderer.setViewMode(mode);
    }

    setBasemap(name) {
        const nextLayer = this._basemaps[name];
        if (!nextLayer || nextLayer === this._activeBasemap) {
            return;
        }
        this._map.removeLayer(this._activeBasemap);
        nextLayer.addTo(this._map);
        this._activeBasemap = nextLayer;
    }

    renderBoundaries(
        geojson,
        fitBounds = true,
    ) {
        this._boundaryLayer.clearLayers();
        if (geojson && geojson.features && geojson.features.length > 0) {
            this._boundaryLayer.addData(geojson);
            if (fitBounds) {
                this._map.fitBounds(this._boundaryLayer.getBounds(), { padding: [32, 32] });
            }
        }
    }

    setBoundariesVisible(visible) {
        if (visible) {
            this._map.addLayer(this._boundaryLayer);
        } else {
            this._map.removeLayer(this._boundaryLayer);
        }
    }

    fitToPois(pois) {
        const coords = pois.filter((p) => p.lat && p.lon).map((p) => [p.lat, p.lon]);
        if (coords.length) {
            this._map.fitBounds(L.latLngBounds(coords), { padding: [32, 32] });
        }
    }

    focusPoi(poi) {
        this._poiRenderer.focusPoi(poi);
    }

    getViewportBounds() {
        const b = this._map.getBounds();
        return {
            min_lat: Number(b.getSouth().toFixed(6)),
            max_lat: Number(b.getNorth().toFixed(6)),
            min_lon: Number(b.getWest().toFixed(6)),
            max_lon: Number(b.getEast().toFixed(6)),
        };
    }

    startPolygonDraw(onFetch) {
        this.clearSelectionRect();
        this._polygonDraw.start(onFetch);
    }

    clearPolygonDraw() {
        this._polygonDraw.clear();
    }

    startRectangleSelect(onComplete) {
        this._polygonDraw.clear();
        const container = this._map.getContainer();
        container.classList.add("draw-cursor");
        this._map.dragging.disable();
        let start = null;
        const onDown = (e) => {
            start = e.latlng;
            this.clearSelectionRect();
            this._selectionRect = L.rectangle([start, start], {
                color: "#0d9488",
                weight: 2,
                fillOpacity: 0.14,
            }).addTo(this._map);
        };
        const onMove = (e) => {
            if (start && this._selectionRect) {
                this._selectionRect.setBounds(L.latLngBounds(start, e.latlng));
            }
        };
        const cleanup = () => {
            container.classList.remove("draw-cursor");
            this._map.dragging.enable();
            this._map.off("mousedown", onDown);
            this._map.off("mousemove", onMove);
            this._map.off("mouseup", onUp);
        };
        const onUp = (e) => {
            cleanup();
            if (!start) {
                return;
            }
            const b = L.latLngBounds(start, e.latlng);
            onComplete({
                min_lat: Number(b.getSouth().toFixed(6)),
                max_lat: Number(b.getNorth().toFixed(6)),
                min_lon: Number(b.getWest().toFixed(6)),
                max_lon: Number(b.getEast().toFixed(6)),
            });
        };
        this._map.on("mousedown", onDown);
        this._map.on("mousemove", onMove);
        this._map.on("mouseup", onUp);
    }

    clearSelectionRect() {
        if (this._selectionRect) {
            this._map.removeLayer(this._selectionRect);
            this._selectionRect = null;
        }
    }

    resize() {
        setTimeout(() => this._map.invalidateSize(), 280);
    }

    _createBasemaps() {
        return {
            street: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "&copy; Esri" }),
            light: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "&copy; Esri" }),
            dark: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "&copy; Esri" }),
            satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "&copy; Esri" }),
        };
    }

    _initMap(containerId) {
        const map = L.map(containerId, {
            center: [37.7765, 29.0864],
            zoom: 12,
            zoomControl: false,
            layers: [this._activeBasemap],
        });
        L.control.zoom({ position: "bottomright" }).addTo(map);
        return map;
    }
}
