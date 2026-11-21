class ApiClient {
    async getCountries() {
        return this._getJson("/api/countries");
    }

    async getRegions(
        countryCode,
        refresh = false,
    ) {
        const suffix = refresh ? "?refresh=true" : "";
        return this._getJson(`/api/countries/${encodeURIComponent(countryCode)}/regions${suffix}`);
    }

    async getDistricts(
        countryCode,
        regionCode,
        refresh = false,
    ) {
        const suffix = refresh ? "?refresh=true" : "";
        return this._getJson(
            `/api/countries/${encodeURIComponent(countryCode)}/regions/${encodeURIComponent(regionCode)}/districts${suffix}`
        );
    }

    async getInitialDataset() {
        return this._getJson("/api/pois/initial");
    }

    async getCacheEntries() {
        return this._getJson("/api/cache");
    }

    async loadCachedDataset(cacheKey) {
        return this._getJson(`/api/cache/${encodeURIComponent(cacheKey)}`);
    }

    async fetchPois(
        payload,
        onProgress = null,
    ) {
        const response = await fetch("/api/pois/fetch-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            return this._parseResponse(response);
        }
        return this._readNdjsonStream(response, onProgress);
    }

    async _readNdjsonStream(
        response,
        onProgress,
    ) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalPayload = null;
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (!line.trim()) {
                    continue;
                }
                const event = JSON.parse(line);
                if (event.type === "progress" && onProgress) {
                    onProgress(event.count);
                } else if (event.type === "error") {
                    throw new Error(event.detail || "İstek başarısız oldu.");
                } else if (event.type === "result") {
                    finalPayload = event.payload;
                }
            }
        }
        if (!finalPayload) {
            throw new Error("Veri akışı tamamlanamadı.");
        }
        return finalPayload;
    }

    async exportPois(
        items,
        format,
    ) {
        const response = await fetch("/api/pois/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ format, items }),
        });
        if (!response.ok) {
            throw new Error("Dışa aktarma başarısız oldu.");
        }
        const blob = await response.blob();
        this._triggerDownload(blob, `overture_poi_export.${format}`);
    }

    async _getJson(url) {
        const response = await fetch(url);
        return this._parseResponse(response);
    }

    async _parseResponse(response) {
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "İstek başarısız oldu.");
        }
        return data;
    }

    _triggerDownload(
        blob,
        filename,
    ) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}
