class PolygonDrawController {
    constructor(
        map,
        i18n,
    ) {
        this._map = map;
        this._i18n = i18n;
        this._points = [];
        this._vertexMarkers = [];
        this._polygonLayer = null;
        this._centerMarker = null;
        this._onFetch = null;
        this._active = false;
        this._clickHandler = (e) => this._handleMapClick(e);
    }

    start(onFetch) {
        this.clear();
        this._onFetch = onFetch;
        this._active = true;
        this._map.getContainer().classList.add("draw-cursor");
        this._map.on("click", this._clickHandler);
    }

    clear() {
        this._active = false;
        this._map.getContainer().classList.remove("draw-cursor");
        this._map.off("click", this._clickHandler);
        this._points = [];
        this._clearLayers();
    }

    _handleMapClick(event) {
        if (!this._active) {
            return;
        }
        const newPoint = [event.latlng.lat, event.latlng.lng];
        if (this._points.length < 3) {
            this._points.push(newPoint);
        } else {
            const insertIndex = this._findClosestEdgeInsertIndex(event.latlng);
            this._points.splice(insertIndex, 0, newPoint);
        }
        this._redraw();
    }

    _findClosestEdgeInsertIndex(latlng) {
        const clickPt = this._map.latLngToLayerPoint(latlng);
        let bestIndex = this._points.length;
        let minDistance = Infinity;
        for (let i = 0; i < this._points.length; i += 1) {
            const nextIndex = (i + 1) % this._points.length;
            const p1 = this._map.latLngToLayerPoint(this._points[i]);
            const p2 = this._map.latLngToLayerPoint(this._points[nextIndex]);
            const dist = L.LineUtil.pointToSegmentDistance(clickPt, p1, p2);
            if (dist < minDistance) {
                minDistance = dist;
                bestIndex = i + 1;
            }
        }
        return bestIndex;
    }

    _clearLayers() {
        for (const marker of this._vertexMarkers) {
            this._map.removeLayer(marker);
        }
        this._vertexMarkers = [];
        if (this._polygonLayer) {
            this._map.removeLayer(this._polygonLayer);
            this._polygonLayer = null;
        }
        if (this._centerMarker) {
            this._map.removeLayer(this._centerMarker);
            this._centerMarker = null;
        }
    }

    _redraw() {
        this._clearLayers();
        if (!this._points.length) {
            return;
        }
        this._polygonLayer = L.polygon(this._points, {
            color: "#0d9488",
            weight: 2.2,
            fillColor: "#0d9488",
            fillOpacity: 0.16,
        }).addTo(this._map);

        this._points.forEach((pt, index) => {
            const marker = this._createVertexMarker(pt, index);
            marker.addTo(this._map);
            this._vertexMarkers.push(marker);
        });

        if (this._points.length >= 3) {
            this._renderCenterAction();
        }
    }

    _createVertexMarker(
        point,
        index,
    ) {
        const hint = this._i18n ? this._i18n.t("polygonVertexHint") : "";
        const icon = L.divIcon({
            className: "polygon-vertex-wrap",
            html: `<span class="polygon-vertex-dot" title="${hint}"></span>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
        });
        const marker = L.marker(point, {
            icon,
            draggable: true,
        });
        let dragged = false;
        marker.on("dragstart", () => {
            dragged = true;
        });
        marker.on("drag", (e) => {
            const pos = e.target.getLatLng();
            this._points[index] = [pos.lat, pos.lng];
            if (this._polygonLayer) {
                this._polygonLayer.setLatLngs(this._points);
            }
            this._updateCenterPosition();
        });
        marker.on("dragend", () => {
            setTimeout(() => {
                dragged = false;
            }, 50);
        });
        marker.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            if (dragged) {
                return;
            }
            this._points.splice(index, 1);
            this._redraw();
        });
        return marker;
    }

    _renderCenterAction() {
        const center = this._computeCentroid();
        const fetchLabel = this._i18n ? this._i18n.t("polygonFetchBtn", "Fetch") : "Fetch";
        const cancelTitle = this._i18n ? this._i18n.t("polygonCancelTitle", "Cancel") : "Cancel";
        const icon = L.divIcon({
            className: "polygon-action-wrap",
            html: `
                <div class="polygon-action-group">
                    <button type="button" class="polygon-fetch-btn">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>${fetchLabel}</span>
                    </button>
                    <button type="button" class="polygon-cancel-btn" title="${cancelTitle}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            `,
            iconSize: [120, 34],
            iconAnchor: [60, 17],
        });
        this._centerMarker = L.marker(center, {
            icon,
            interactive: true,
            zIndexOffset: 1000,
        }).addTo(this._map);

        const el = this._centerMarker.getElement();
        if (!el) {
            return;
        }
        L.DomEvent.disableClickPropagation(el);
        const fetchBtn = el.querySelector(".polygon-fetch-btn");
        const cancelBtn = el.querySelector(".polygon-cancel-btn");
        if (fetchBtn) {
            fetchBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (this._onFetch && this._points.length >= 3) {
                    const coords = this._points.map((p) => [p[1], p[0]]);
                    this._onFetch(coords);
                }
            });
        }
        if (cancelBtn) {
            cancelBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.clear();
            });
        }
    }

    _updateCenterPosition() {
        if (this._centerMarker && this._points.length >= 3) {
            this._centerMarker.setLatLng(this._computeCentroid());
        }
    }

    _computeCentroid() {
        const sum = this._points.reduce(
            (acc, pt) => [acc[0] + pt[0], acc[1] + pt[1]],
            [0, 0]
        );
        return [sum[0] / this._points.length, sum[1] / this._points.length];
    }
}
