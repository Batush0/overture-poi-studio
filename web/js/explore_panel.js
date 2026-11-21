class ExplorePanel {
    constructor(
        icons,
        i18n,
        onFilterChange,
        onSelectPoi,
        onSavePreset,
        onApplyPreset,
        onDeletePreset,
    ) {
        this._icons = icons;
        this._i18n = i18n;
        this._onFilterChange = onFilterChange;
        this._onSelectPoi = onSelectPoi;
        this._onSavePreset = onSavePreset;
        this._onApplyPreset = onApplyPreset;
        this._onDeletePreset = onDeletePreset;
        this._ownership = "all";
        this._activeTopCategory = "";
        this._debounceTimer = null;
        this._elements = this._queryElements();
        this._bindEvents();
    }

    populateOptions(
        topCategories,
        districts,
        detailCategories,
        colorResolver,
    ) {
        this._renderTopPills(topCategories, colorResolver);
        this._fillSelect(this._elements.districtSelect, this._i18n.t("allRegions"), districts);
        this._fillSelect(this._elements.categorySelect, this._i18n.t("allCategories"), detailCategories);
    }

    renderPresets(presets) {
        const container = this._elements.presetList;
        container.innerHTML = "";
        if (!presets.length) {
            container.innerHTML = `<span class="empty-hint">${this._i18n.t("noPresets")}</span>`;
            return;
        }
        for (const preset of presets) {
            const chip = document.createElement("span");
            chip.className = "pill";
            const label = document.createElement("span");
            label.textContent = preset.name;
            label.addEventListener("click", () => this._onApplyPreset(preset.criteria));
            const removeBtn = document.createElement("span");
            removeBtn.innerHTML = this._icons.close();
            removeBtn.title = this._i18n.t("deleteTitle");
            removeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this._onDeletePreset(preset.name);
            });
            chip.appendChild(label);
            chip.appendChild(removeBtn);
            container.appendChild(chip);
        }
    }

    renderResults(pois) {
        this._elements.visibleBadge.textContent = this._i18n.formatNumber(pois.length);
        const container = this._elements.previewList;
        container.innerHTML = "";
        if (!pois.length) {
            container.innerHTML = `<div class="empty-hint">${this._i18n.t("noResults")}</div>`;
            return;
        }
        const fragment = document.createDocumentFragment();
        const limit = Math.min(pois.length, 60);
        for (let i = 0; i < limit; i += 1) {
            fragment.appendChild(this._createResultItem(pois[i]));
        }
        container.appendChild(fragment);
    }

    setTopCategory(category) {
        this._activeTopCategory = category;
        this._elements.dynamicPills.querySelectorAll(".pill").forEach((pill) => {
            pill.classList.toggle("active", pill.dataset.category === category);
        });
        this._onFilterChange(this.getCriteria());
    }

    applyCriteria(criteria) {
        this._elements.searchInput.value = criteria.query || "";
        this._elements.districtSelect.value = criteria.district || "";
        this._elements.categorySelect.value = criteria.detailCategory || "";
        this._elements.confidenceSlider.value = String(criteria.minConfidence || 0);
        this._elements.confidenceValue.textContent = Number(criteria.minConfidence || 0).toFixed(2);
        this._elements.onlyPhone.checked = Boolean(criteria.onlyPhone);
        this._elements.onlyWebsite.checked = Boolean(criteria.onlyWebsite);
        this._ownership = criteria.ownership || "all";
        this._activeTopCategory = criteria.topCategory || "";
        this._syncButtons();
        this._onFilterChange(this.getCriteria());
    }

    getCriteria() {
        return {
            query: this._elements.searchInput.value,
            ownership: this._ownership,
            topCategory: this._activeTopCategory,
            district: this._elements.districtSelect.value,
            detailCategory: this._elements.categorySelect.value,
            minConfidence: Number(this._elements.confidenceSlider.value),
            onlyPhone: this._elements.onlyPhone.checked,
            onlyWebsite: this._elements.onlyWebsite.checked,
        };
    }

    reset() {
        this.applyCriteria({
            query: "",
            ownership: "all",
            topCategory: "",
            district: "",
            detailCategory: "",
            minConfidence: 0,
            onlyPhone: false,
            onlyWebsite: false,
        });
    }

    _queryElements() {
        return {
            searchInput: document.getElementById("search-input"),
            ownershipButtons: document.querySelectorAll("#ownership-control .seg-btn"),
            dynamicPills: document.getElementById("dynamic-category-pills"),
            districtSelect: document.getElementById("district-select"),
            categorySelect: document.getElementById("category-select"),
            confidenceSlider: document.getElementById("confidence-slider"),
            confidenceValue: document.getElementById("confidence-value"),
            onlyPhone: document.getElementById("only-phone"),
            onlyWebsite: document.getElementById("only-website"),
            resetButton: document.getElementById("reset-filters"),
            savePresetButton: document.getElementById("save-preset-btn"),
            presetList: document.getElementById("preset-list"),
            visibleBadge: document.getElementById("visible-badge"),
            previewList: document.getElementById("preview-list"),
        };
    }

    _bindEvents() {
        this._elements.searchInput.addEventListener("input", () => {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => this._onFilterChange(this.getCriteria()), 180);
        });
        this._elements.ownershipButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                this._ownership = btn.dataset.ownership;
                this._syncButtons();
                this._onFilterChange(this.getCriteria());
            });
        });
        this._elements.districtSelect.addEventListener("change", () => this._onFilterChange(this.getCriteria()));
        this._elements.categorySelect.addEventListener("change", () => this._onFilterChange(this.getCriteria()));
        this._elements.onlyPhone.addEventListener("change", () => this._onFilterChange(this.getCriteria()));
        this._elements.onlyWebsite.addEventListener("change", () => this._onFilterChange(this.getCriteria()));
        this._elements.confidenceSlider.addEventListener("input", () => {
            this._elements.confidenceValue.textContent = Number(this._elements.confidenceSlider.value).toFixed(2);
            this._onFilterChange(this.getCriteria());
        });
        this._elements.resetButton.addEventListener("click", () => this.reset());
        this._elements.savePresetButton.addEventListener("click", () => {
            const name = window.prompt(this._i18n.t("presetPrompt"));
            if (name && name.trim()) {
                this._onSavePreset(name.trim(), this.getCriteria());
            }
        });
    }

    _renderTopPills(
        topCategories,
        colorResolver,
    ) {
        const container = this._elements.dynamicPills;
        container.innerHTML = "";
        container.appendChild(this._buildCategoryPill("", this._i18n.t("ownershipAll"), null, null));
        for (const [category, count] of topCategories) {
            container.appendChild(
                this._buildCategoryPill(category, this._humanize(category), count, colorResolver(category))
            );
        }
    }

    _buildCategoryPill(
        value,
        label,
        count,
        color,
    ) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `pill${this._activeTopCategory === value ? " active" : ""}`;
        button.dataset.category = value;
        if (color) {
            const dot = document.createElement("span");
            dot.className = "pill-dot";
            dot.style.backgroundColor = color;
            button.appendChild(dot);
        }
        const text = document.createElement("span");
        text.textContent = label;
        button.appendChild(text);
        if (count !== null) {
            const badge = document.createElement("span");
            badge.className = "pill-count";
            badge.textContent = this._i18n.formatNumber(count);
            button.appendChild(badge);
        }
        button.addEventListener("click", () => this.setTopCategory(value));
        return button;
    }

    _createResultItem(poi) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "list-item";
        const main = document.createElement("div");
        main.className = "list-main";
        const title = document.createElement("span");
        title.className = "list-title";
        title.textContent = poi.name;
        const sub = document.createElement("span");
        sub.className = "list-sub";
        sub.textContent = `${poi.district} · ${this._humanize(poi.primaryCategory || poi.topCategory)}`;
        main.appendChild(title);
        main.appendChild(sub);
        const score = document.createElement("span");
        score.className = "list-badge";
        score.textContent = poi.confidence.toFixed(2);
        button.appendChild(main);
        button.appendChild(score);
        button.addEventListener("click", () => this._onSelectPoi(poi));
        return button;
    }

    _fillSelect(
        select,
        defaultLabel,
        entries,
    ) {
        const prev = select.value;
        select.innerHTML = "";
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = defaultLabel;
        select.appendChild(opt);
        for (const [name, count] of entries) {
            const item = document.createElement("option");
            item.value = name;
            item.textContent = `${this._humanize(name)} (${this._i18n.formatNumber(count)})`;
            item.selected = name === prev;
            select.appendChild(item);
        }
    }

    _syncButtons() {
        this._elements.ownershipButtons.forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.ownership === this._ownership);
        });
        this._elements.dynamicPills.querySelectorAll(".pill").forEach((pill) => {
            pill.classList.toggle("active", pill.dataset.category === this._activeTopCategory);
        });
    }

    _humanize(slug) {
        return String(slug || "").replace(/_/g, " ");
    }
}
