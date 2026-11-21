class QueryPanel {
    constructor(
        i18n,
        onCountryChange,
        onRegionChange,
        onFetchDistricts,
        onDrawFetch,
        onViewportFetch,
        onSelectCache,
    ) {
        this._i18n = i18n;
        this._onCountryChange = onCountryChange;
        this._onRegionChange = onRegionChange;
        this._onFetchDistricts = onFetchDistricts;
        this._onDrawFetch = onDrawFetch;
        this._onViewportFetch = onViewportFetch;
        this._onSelectCache = onSelectCache;
        this._countries = [];
        this._districts = [];
        this._cacheEntries = [];
        this._selectedDistricts = new Set();
        this._elements = this._queryElements();
        this._bindEvents();
    }

    renderCountries(
        countries,
        defaultCode = "TR",
    ) {
        this._countries = countries;
        const select = this._elements.countrySelect;
        const currentVal = select.value || defaultCode;
        select.innerHTML = "";
        for (const item of countries) {
            const option = document.createElement("option");
            option.value = item.code;
            const localized = this._i18n.formatCountryName(item.code, item.name);
            option.textContent = `${localized} (${item.code})`;
            option.selected = item.code === currentVal;
            select.appendChild(option);
        }
    }

    renderRegions(
        regions,
        defaultCode = "",
    ) {
        if (this._elements.regionSpinner) {
            this._elements.regionSpinner.style.display = "none";
        }
        const select = this._elements.regionSelect;
        select.innerHTML = "";
        if (!regions.length) {
            const emptyOpt = document.createElement("option");
            emptyOpt.value = "";
            emptyOpt.textContent = this._i18n.t("noData");
            select.appendChild(emptyOpt);
            return;
        }
        for (const item of regions) {
            const option = document.createElement("option");
            option.value = item.code;
            option.textContent = `${item.name} (${item.code})`;
            option.selected = item.code === defaultCode;
            select.appendChild(option);
        }
        select.value = defaultCode || regions[0].code;
    }

    setRegionsLoading() {
        const select = this._elements.regionSelect;
        while (select.firstChild) {
            select.removeChild(select.firstChild);
        }
        const loadingOpt = document.createElement("option");
        loadingOpt.value = "";
        loadingOpt.textContent = this._i18n.t("toastRegionsLoading");
        loadingOpt.selected = true;
        select.appendChild(loadingOpt);
        select.selectedIndex = 0;
        if (this._elements.regionSpinner) {
            this._elements.regionSpinner.style.display = "inline-block";
        }
        this.setDistrictsLoading();
    }

    setDistrictsLoading() {
        this._districts = [];
        this._selectedDistricts.clear();
        this._elements.districtSearch.value = "";
        this._elements.districtBox.innerHTML = `
            <div class="empty-hint loading-hint">
                <span class="inline-spinner"></span>
                <span>${this._i18n.t("toastDistrictsLoading")}</span>
            </div>
        `;
    }

    renderDistricts(
        districts,
        preselected = [],
    ) {
        this._districts = districts;
        this._selectedDistricts = new Set(preselected);
        this._elements.districtSearch.value = "";
        this._drawDistrictCheckboxes("");
    }

    renderCacheEntries(entries) {
        this._cacheEntries = entries;
        const container = this._elements.cacheList;
        container.innerHTML = "";
        if (!entries.length) {
            container.innerHTML = `<div class="empty-hint">${this._i18n.t("noCachedDatasets")}</div>`;
            return;
        }
        for (const entry of entries) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "list-item";
            const main = document.createElement("div");
            main.className = "list-main";
            const title = document.createElement("span");
            title.className = "list-title";
            title.textContent = entry.title;
            const sub = document.createElement("span");
            sub.className = "list-sub";
            const removed = this._i18n.formatNumber(entry.removedDuplicates || 0);
            sub.textContent = `-${removed} ${this._i18n.t("duplicatesRemoved")}`;
            main.appendChild(title);
            main.appendChild(sub);
            const badge = document.createElement("span");
            badge.className = "list-badge";
            badge.textContent = this._i18n.formatNumber(entry.count || 0);
            button.appendChild(main);
            button.appendChild(badge);
            button.addEventListener("click", () => this._onSelectCache(entry.key));
            container.appendChild(button);
        }
    }

    refreshTranslations() {
        if (this._countries.length) {
            this.renderCountries(this._countries, this._elements.countrySelect.value);
        }
        this._drawDistrictCheckboxes(this._elements.districtSearch.value);
        this.renderCacheEntries(this._cacheEntries);
    }

    setBusy(busy) {
        this._elements.countrySelect.disabled = busy;
        this._elements.regionSelect.disabled = busy;
        this._elements.fetchButton.disabled = busy;
        this._elements.drawFetchButton.disabled = busy;
        this._elements.viewportFetchButton.disabled = busy;
    }

    getOptions() {
        return {
            country_code: this._elements.countrySelect.value,
            region_code: this._elements.regionSelect.value,
            districts: Array.from(this._selectedDistricts),
            deduplicate: this._elements.deduplicateToggle.checked,
            force_refresh: this._elements.forceRefreshToggle.checked,
        };
    }

    _queryElements() {
        return {
            countrySelect: document.getElementById("country-select"),
            regionSelect: document.getElementById("region-select"),
            regionSpinner: document.getElementById("region-spinner"),
            districtSearch: document.getElementById("district-search"),
            selectAllButton: document.getElementById("select-all-districts"),
            clearButton: document.getElementById("clear-districts"),
            districtBox: document.getElementById("district-checkboxes"),
            deduplicateToggle: document.getElementById("deduplicate-toggle"),
            forceRefreshToggle: document.getElementById("force-refresh-toggle"),
            fetchButton: document.getElementById("fetch-districts-btn"),
            drawFetchButton: document.getElementById("draw-fetch-btn"),
            viewportFetchButton: document.getElementById("viewport-fetch-btn"),
            cacheList: document.getElementById("cache-list"),
        };
    }

    _bindEvents() {
        this._elements.countrySelect.addEventListener("change", () => {
            this._onCountryChange(this._elements.countrySelect.value);
        });
        this._elements.regionSelect.addEventListener("change", () => {
            this._onRegionChange(
                this._elements.countrySelect.value,
                this._elements.regionSelect.value
            );
        });
        this._elements.districtSearch.addEventListener("input", () => {
            this._drawDistrictCheckboxes(this._elements.districtSearch.value);
        });
        this._elements.selectAllButton.addEventListener("click", () => {
            this._districts.forEach((d) => this._selectedDistricts.add(d.name));
            this._drawDistrictCheckboxes(this._elements.districtSearch.value);
        });
        this._elements.clearButton.addEventListener("click", () => {
            this._selectedDistricts.clear();
            this._drawDistrictCheckboxes(this._elements.districtSearch.value);
        });
        this._elements.fetchButton.addEventListener("click", () => {
            this._onFetchDistricts(this.getOptions());
        });
        this._elements.drawFetchButton.addEventListener("click", () => this._onDrawFetch());
        this._elements.viewportFetchButton.addEventListener("click", () => this._onViewportFetch());
    }

    _drawDistrictCheckboxes(query) {
        const container = this._elements.districtBox;
        container.innerHTML = "";
        const normalized = String(query || "").toLowerCase().trim();
        const visible = this._districts.filter((item) =>
            !normalized || item.name.toLowerCase().includes(normalized)
        );
        if (!visible.length) {
            container.innerHTML = `<div class="empty-hint">${this._i18n.t("noDistricts")}</div>`;
            return;
        }
        for (const item of visible) {
            const label = document.createElement("label");
            label.className = "district-opt";
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = this._selectedDistricts.has(item.name);
            input.addEventListener("change", () => {
                if (input.checked) {
                    this._selectedDistricts.add(item.name);
                } else {
                    this._selectedDistricts.delete(item.name);
                }
            });
            const text = document.createElement("span");
            text.textContent = item.name;
            label.appendChild(input);
            label.appendChild(text);
            container.appendChild(label);
        }
    }
}
