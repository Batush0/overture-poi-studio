class PoiRepository {
    constructor() {
        this._pois = [];
        this._meta = {};
        this._palette = [
            "#2563eb", "#0d9488", "#d97706", "#e11d48", "#7c3aed",
            "#0284c7", "#16a34a", "#ea580c", "#db2777", "#4f46e5",
        ];
        this._colorMap = new Map();
    }

    loadPayload(payload) {
        this._meta = payload.meta || {};
        this._pois = this._unpackRows(payload.data);
        this._assignColors();
    }

    getAll() {
        return this._pois;
    }

    getMeta() {
        return this._meta;
    }

    getColorForCategory(category) {
        return this._colorMap.get(category) || "#2563eb";
    }

    getTopCategories(limit = 10) {
        return this._countBy(this._pois, (poi) => poi.topCategory || "uncategorized").slice(0, limit);
    }

    getDistricts() {
        return this._countBy(this._pois, (poi) => poi.district);
    }

    getDetailCategories() {
        return this._countBy(
            this._pois,
            (poi) => poi.basicCategory || poi.primaryCategory || "uncategorized"
        );
    }

    getBreakdown(
        pois,
        selector,
        limit = 10,
    ) {
        return this._countBy(pois, selector).slice(0, limit);
    }

    computeMetrics(pois) {
        const total = pois.length;
        if (!total) {
            return { independentRate: 0, contactRate: 0 };
        }
        let independent = 0;
        let withContact = 0;
        for (const poi of pois) {
            if (!poi.isBranded) {
                independent += 1;
            }
            if (poi.phone || poi.website) {
                withContact += 1;
            }
        }
        return {
            independentRate: Math.round((independent / total) * 100),
            contactRate: Math.round((withContact / total) * 100),
        };
    }

    filter(criteria) {
        const query = this._normalize(criteria.query || "");
        return this._pois.filter((poi) => {
            if (criteria.ownership === "independent" && poi.isBranded) {
                return false;
            }
            if (criteria.ownership === "branded" && !poi.isBranded) {
                return false;
            }
            if (criteria.onlyPhone && !poi.phone) {
                return false;
            }
            if (criteria.onlyWebsite && !poi.website) {
                return false;
            }
            if (criteria.topCategory && poi.topCategory !== criteria.topCategory) {
                return false;
            }
            if (criteria.district && poi.district !== criteria.district) {
                return false;
            }
            if (criteria.detailCategory) {
                const detail = poi.basicCategory || poi.primaryCategory || "uncategorized";
                if (detail !== criteria.detailCategory) {
                    return false;
                }
            }
            if (poi.confidence < criteria.minConfidence) {
                return false;
            }
            if (criteria.bounds && !this._inBounds(poi, criteria.bounds)) {
                return false;
            }
            if (query && !poi.searchText.includes(query)) {
                return false;
            }
            return true;
        });
    }

    _unpackRows(rawData) {
        if (!rawData || !Array.isArray(rawData.items)) {
            return [];
        }
        const { districts, categories, basicCategories, topCategories, items } = rawData;
        return items.map((row, index) => {
            const name = row[0] || "İsimsiz Kayıt";
            const primaryCategory = categories[row[2]] || "";
            const basicCategory = basicCategories[row[3]] || "";
            const topCategory = topCategories[row[4]] || "uncategorized";
            const brand = row[6] || "";
            const address = row[7] || "";
            const phone = row[8] || "";
            return {
                index,
                name,
                district: districts[row[1]] || "Bilinmiyor",
                primaryCategory,
                basicCategory,
                topCategory,
                isBranded: Boolean(row[5]),
                brand,
                address,
                phone,
                website: row[9] || "",
                lat: row[10],
                lon: row[11],
                confidence: row[12],
                searchText: this._normalize(
                    `${name} ${brand} ${address} ${phone} ${primaryCategory} ${basicCategory} ${topCategory}`
                ),
            };
        });
    }

    _assignColors() {
        this._colorMap.clear();
        const top = this.getTopCategories(20);
        top.forEach(([category], idx) => {
            this._colorMap.set(category, this._palette[idx % this._palette.length]);
        });
    }

    _countBy(
        pois,
        selector,
    ) {
        const counts = new Map();
        for (const poi of pois) {
            const key = selector(poi) || "uncategorized";
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    }

    _inBounds(
        poi,
        bounds,
    ) {
        return (
            poi.lat >= bounds.min_lat &&
            poi.lat <= bounds.max_lat &&
            poi.lon >= bounds.min_lon &&
            poi.lon <= bounds.max_lon
        );
    }

    _normalize(text) {
        return String(text || "")
            .replace(/İ/g, "i")
            .replace(/I/g, "ı")
            .toLowerCase()
            .trim();
    }
}
