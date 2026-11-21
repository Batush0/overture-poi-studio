class PresetStore {
    constructor(storageKey = "atlas_poi_presets_v1") {
        this._storageKey = storageKey;
    }

    list() {
        try {
            const raw = localStorage.getItem(this._storageKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    save(
        name,
        criteria,
    ) {
        const presets = this.list().filter((item) => item.name !== name);
        presets.unshift({
            name,
            criteria,
        });
        this._persist(presets.slice(0, 12));
        return presets;
    }

    remove(name) {
        const presets = this.list().filter((item) => item.name !== name);
        this._persist(presets);
        return presets;
    }

    _persist(presets) {
        try {
            localStorage.setItem(this._storageKey, JSON.stringify(presets));
        } catch {
        }
    }
}
