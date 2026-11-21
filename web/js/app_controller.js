class AppController {
    constructor() {
        this._icons = new SvgIcons();
        this._i18n = new I18nService();
        this._api = new ApiClient();
        this._repository = new PoiRepository();
        this._presetStore = new PresetStore("overture_poi_presets_v1");
        this._map = new MapController(
            "map",
            new PopupBuilder(this._icons, this._i18n),
            (category) => this._repository.getColorForCategory(category),
            this._i18n
        );
        this._filteredPois = [];
        this._areaBounds = null;
        this._toolbar = new ToolbarController(this._icons, this._i18n, {
            onResize: () => this._map.resize(),
            onThemeChange: (theme) => this._map.setBasemap(theme === "dark" ? "dark" : "street"),
            onViewMode: (mode) => this._map.setViewMode(mode),
            onBasemap: (name) => this._map.setBasemap(name),
            onToggleBoundaries: (visible) => this._map.setBoundariesVisible(visible),
            onStartAreaFilter: () => this._startAreaFilter(),
            onClearAreaFilter: () => this._clearAreaFilter(),
        });
        this._explorePanel = new ExplorePanel(
            this._icons,
            this._i18n,
            (criteria) => this._applyFilters(criteria),
            (poi) => this._map.focusPoi(poi),
            (name, criteria) => this._savePreset(name, criteria),
            (criteria) => this._explorePanel.applyCriteria(criteria),
            (name) => this._deletePreset(name)
        );
        this._queryPanel = new QueryPanel(
            this._i18n,
            (country) => this._loadRegions(country),
            (country, region) => this._loadDistricts(country, region),
            (options) => this._fetchRegionPois(options),
            () => this._startDrawFetch(),
            () => this._fetchViewportPois(),
            (key) => this._loadCached(key)
        );
        this._analyticsPanel = new AnalyticsPanel(
            this._i18n,
            (fmt) => this._exportData(fmt),
            (category) => {
                this._toolbar.switchTab("explore-pane");
                this._explorePanel.setTopCategory(category);
            }
        );
        this._i18n.onChange(() => this._handleLanguageChange());
    }

    async start() {
        await this._i18n.load();
        this._toolbar.syncLanguageSelect();
        this._toolbar.showToast(this._i18n.t("toastWorkspaceLoading"), true);
        this._explorePanel.renderPresets(this._presetStore.list());
        try {
            const [countriesRes, initialRes, cacheRes] = await Promise.all([
                this._api.getCountries(),
                this._api.getInitialDataset(),
                this._api.getCacheEntries(),
            ]);
            this._queryPanel.renderCountries(countriesRes.countries, "TR");
            this._queryPanel.renderCacheEntries(cacheRes.entries || []);
            this._applyDataset(initialRes, true);
            await this._loadRegions("TR", "TR-20");
            this._toolbar.hideToast();
        } catch (error) {
            this._toolbar.showToast(`${this._i18n.t("toastStartError")}: ${error.message}`);
        }
    }

    _handleLanguageChange() {
        this._explorePanel.renderPresets(this._presetStore.list());
        this._explorePanel.populateOptions(
            this._repository.getTopCategories(10),
            this._repository.getDistricts(),
            this._repository.getDetailCategories(),
            (cat) => this._repository.getColorForCategory(cat)
        );
        this._queryPanel.refreshTranslations();
        this._applyFilters(this._explorePanel.getCriteria());
    }

    async _loadRegions(
        countryCode,
        defaultRegion = "",
    ) {
        this._queryPanel.setRegionsLoading();
        this._queryPanel.setBusy(true);
        this._toolbar.showToast(this._i18n.t("toastRegionsLoading"), true);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        try {
            const res = await this._api.getRegions(countryCode);
            const regions = res.regions || [];
            const selected = defaultRegion || (regions[0] ? regions[0].code : "");
            this._queryPanel.renderRegions(regions, selected);
            if (selected) {
                await this._loadDistricts(countryCode, selected);
            } else {
                this._queryPanel.renderDistricts([], []);
                this._toolbar.hideToast();
            }
        } catch (error) {
            this._queryPanel.renderRegions([], "");
            this._queryPanel.renderDistricts([], []);
            this._toolbar.showToast(`${this._i18n.t("toastRegionsError")}: ${error.message}`);
        } finally {
            this._queryPanel.setBusy(false);
        }
    }

    async _loadDistricts(
        countryCode,
        regionCode,
    ) {
        this._queryPanel.setDistrictsLoading();
        this._queryPanel.setBusy(true);
        this._toolbar.showToast(this._i18n.t("toastDistrictsLoading"), true);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        try {
            const res = await this._api.getDistricts(countryCode, regionCode);
            this._queryPanel.renderDistricts(res.districts || [], []);
            this._toolbar.hideToast();
        } catch (error) {
            this._queryPanel.renderDistricts([], []);
            this._toolbar.showToast(`${this._i18n.t("toastDistrictsError")}: ${error.message}`);
        } finally {
            this._queryPanel.setBusy(false);
        }
    }

    async _fetchRegionPois(options) {
        this._queryPanel.setBusy(true);
        const baseMsg = this._i18n.t("toastFetchingRegion");
        this._toolbar.showToast(baseMsg, true);
        try {
            const payload = await this._api.fetchPois(options, (count) => {
                const formatted = this._i18n.formatNumber(count);
                this._toolbar.showToast(`${baseMsg} (${formatted} ${this._i18n.t("recordsSuffix")})`, true);
            });
            this._applyDataset(payload, true);
            await this._refreshCache();
            this._toolbar.switchTab("explore-pane");
            this._toolbar.hideToast();
        } catch (error) {
            this._toolbar.showToast(`${this._i18n.t("toastFetchError")}: ${error.message}`);
        } finally {
            this._queryPanel.setBusy(false);
        }
    }

    _startDrawFetch() {
        this._toolbar.showToast(this._i18n.t("toastDrawPolygonHint"));
        this._map.startPolygonDraw(async (polygonCoords) => {
            await this._fetchPolygon(polygonCoords);
        });
    }

    async _fetchViewportPois() {
        await this._fetchBbox(this._map.getViewportBounds());
    }

    async _fetchPolygon(polygonCoords) {
        this._queryPanel.setBusy(true);
        const baseMsg = this._i18n.t("toastFetchingPolygon");
        this._toolbar.showToast(baseMsg, true);
        try {
            const opts = this._queryPanel.getOptions();
            const payload = await this._api.fetchPois(
                {
                    polygon: polygonCoords,
                    deduplicate: opts.deduplicate,
                    force_refresh: true,
                },
                (count) => {
                    const formatted = this._i18n.formatNumber(count);
                    this._toolbar.showToast(`${baseMsg} (${formatted} ${this._i18n.t("recordsSuffix")})`, true);
                }
            );
            this._map.clearPolygonDraw();
            this._applyDataset(payload, true);
            await this._refreshCache();
            this._toolbar.switchTab("explore-pane");
            this._toolbar.hideToast();
        } catch (error) {
            this._toolbar.showToast(`${this._i18n.t("toastFetchError")}: ${error.message}`);
        } finally {
            this._queryPanel.setBusy(false);
        }
    }

    async _fetchBbox(bounds) {
        this._queryPanel.setBusy(true);
        const baseMsg = this._i18n.t("toastFetchingArea");
        this._toolbar.showToast(baseMsg, true);
        try {
            const opts = this._queryPanel.getOptions();
            const payload = await this._api.fetchPois(
                {
                    bbox: bounds,
                    deduplicate: opts.deduplicate,
                    force_refresh: true,
                },
                (count) => {
                    const formatted = this._i18n.formatNumber(count);
                    this._toolbar.showToast(`${baseMsg} (${formatted} ${this._i18n.t("recordsSuffix")})`, true);
                }
            );
            this._map.clearSelectionRect();
            this._applyDataset(payload, true);
            await this._refreshCache();
            this._toolbar.switchTab("explore-pane");
            this._toolbar.hideToast();
        } catch (error) {
            this._toolbar.showToast(`${this._i18n.t("toastFetchError")}: ${error.message}`);
        } finally {
            this._queryPanel.setBusy(false);
        }
    }

    async _loadCached(cacheKey) {
        this._toolbar.showToast(this._i18n.t("toastLoadingCache"), true);
        try {
            const payload = await this._api.loadCachedDataset(cacheKey);
            this._applyDataset(payload, true);
            this._toolbar.switchTab("explore-pane");
            this._toolbar.hideToast();
        } catch (error) {
            this._toolbar.showToast(`${this._i18n.t("toastCacheError")}: ${error.message}`);
        }
    }

    async _refreshCache() {
        const res = await this._api.getCacheEntries();
        this._queryPanel.renderCacheEntries(res.entries || []);
    }

    _applyDataset(
        payload,
        fitView,
    ) {
        this._areaBounds = null;
        this._toolbar.setAreaFilterActive(false);
        this._map.clearSelectionRect();
        this._repository.loadPayload(payload);
        this._explorePanel.populateOptions(
            this._repository.getTopCategories(10),
            this._repository.getDistricts(),
            this._repository.getDetailCategories(),
            (cat) => this._repository.getColorForCategory(cat)
        );
        this._map.renderBoundaries(payload.boundaries, fitView);
        this._applyFilters(this._explorePanel.getCriteria());
        if (fitView && (!payload.boundaries || !payload.boundaries.features.length)) {
            this._map.fitToPois(this._repository.getAll());
        }
    }

    _applyFilters(criteria) {
        this._filteredPois = this._repository.filter({ ...criteria, bounds: this._areaBounds });
        this._map.renderPois(this._filteredPois);
        this._explorePanel.renderResults(this._filteredPois);
        this._analyticsPanel.render(
            this._filteredPois,
            this._repository.getAll().length,
            this._repository.getMeta(),
            this._repository.computeMetrics(this._filteredPois),
            this._repository.getBreakdown(this._filteredPois, (p) => p.topCategory, 10),
            this._repository.getBreakdown(this._filteredPois, (p) => p.district, 8)
        );
    }

    _startAreaFilter() {
        this._toolbar.showToast(this._i18n.t("toastDrawFilterHint"));
        this._map.startRectangleSelect((bounds) => {
            this._areaBounds = bounds;
            this._toolbar.setAreaFilterActive(true);
            this._applyFilters(this._explorePanel.getCriteria());
            this._toolbar.hideToast();
        });
    }

    _clearAreaFilter() {
        this._areaBounds = null;
        this._toolbar.setAreaFilterActive(false);
        this._map.clearSelectionRect();
        this._applyFilters(this._explorePanel.getCriteria());
    }

    _savePreset(
        name,
        criteria,
    ) {
        this._explorePanel.renderPresets(this._presetStore.save(name, criteria));
    }

    _deletePreset(name) {
        this._explorePanel.renderPresets(this._presetStore.remove(name));
    }

    async _exportData(format) {
        this._toolbar.showToast(this._i18n.t("toastExporting"), true);
        try {
            await this._api.exportPois(this._filteredPois, format);
            this._toolbar.hideToast();
        } catch (error) {
            this._toolbar.showToast(`${this._i18n.t("toastExportError")}: ${error.message}`);
        }
    }
}
