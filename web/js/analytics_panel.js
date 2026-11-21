class AnalyticsPanel {
    constructor(
        i18n,
        onExport,
        onSelectCategory,
    ) {
        this._i18n = i18n;
        this._onExport = onExport;
        this._onSelectCategory = onSelectCategory;
        this._elements = this._queryElements();
        this._bindEvents();
    }

    render(
        visiblePois,
        totalCount,
        meta,
        metrics,
        categoryBreakdown,
        districtBreakdown,
    ) {
        this._elements.datasetTitle.textContent = meta.title || this._i18n.t("datasetReady");
        this._elements.kpiVisible.textContent = this._i18n.formatNumber(visiblePois.length);
        this._elements.kpiTotal.textContent = this._i18n.formatNumber(totalCount);
        this._elements.kpiDedup.textContent = this._i18n.formatNumber(meta.removedDuplicates || 0);
        this._elements.kpiIndependent.textContent = `${metrics.independentRate}%`;
        this._elements.kpiContact.textContent = `${metrics.contactRate}%`;
        const countStr = this._i18n.formatNumber(visiblePois.length);
        this._elements.exportBadge.textContent = `${countStr} ${this._i18n.t("recordsSuffix")}`;
        this._renderBars(this._elements.categoryChart, categoryBreakdown, true);
        this._renderBars(this._elements.districtChart, districtBreakdown, false);
    }

    _queryElements() {
        return {
            datasetTitle: document.getElementById("dataset-title"),
            kpiVisible: document.getElementById("kpi-visible"),
            kpiTotal: document.getElementById("kpi-total"),
            kpiDedup: document.getElementById("kpi-dedup"),
            kpiIndependent: document.getElementById("kpi-independent"),
            kpiContact: document.getElementById("kpi-contact"),
            exportBadge: document.getElementById("export-count-badge"),
            categoryChart: document.getElementById("category-chart"),
            districtChart: document.getElementById("district-chart"),
            exportCsv: document.getElementById("export-csv"),
            exportXlsx: document.getElementById("export-xlsx"),
            exportGeojson: document.getElementById("export-geojson"),
        };
    }

    _bindEvents() {
        this._elements.exportCsv.addEventListener("click", () => this._onExport("csv"));
        this._elements.exportXlsx.addEventListener("click", () => this._onExport("xlsx"));
        this._elements.exportGeojson.addEventListener("click", () => this._onExport("geojson"));
    }

    _renderBars(
        container,
        entries,
        clickable,
    ) {
        container.innerHTML = "";
        if (!entries.length) {
            container.innerHTML = `<div class="empty-hint">${this._i18n.t("noData")}</div>`;
            return;
        }
        const max = entries[0][1] || 1;
        for (const [label, count] of entries) {
            const row = document.createElement("div");
            row.className = "bar-row";
            const meta = document.createElement("div");
            meta.className = "bar-meta";
            const nameSpan = document.createElement("span");
            nameSpan.textContent = label.replace(/_/g, " ");
            const countStrong = document.createElement("strong");
            countStrong.textContent = this._i18n.formatNumber(count);
            meta.appendChild(nameSpan);
            meta.appendChild(countStrong);
            const track = document.createElement("div");
            track.className = "bar-track";
            const fill = document.createElement("div");
            fill.className = "bar-fill";
            fill.style.width = `${Math.max(4, Math.round((count / max) * 100))}%`;
            track.appendChild(fill);
            row.appendChild(meta);
            row.appendChild(track);
            if (clickable) {
                row.addEventListener("click", () => this._onSelectCategory(label));
            }
            container.appendChild(row);
        }
    }
}
