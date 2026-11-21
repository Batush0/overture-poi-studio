class ToolbarController {
    constructor(
        icons,
        i18n,
        callbacks,
    ) {
        this._icons = icons;
        this._i18n = i18n;
        this._callbacks = callbacks;
        this._boundariesOn = true;
        this._elements = this._queryElements();
        this._initTheme();
        this._bindEvents();
    }

    syncLanguageSelect() {
        this._elements.langSelect.value = this._i18n.getLanguage();
    }

    switchTab(tabId) {
        this._elements.tabs.forEach((tab) => {
            tab.classList.toggle("active", tab.dataset.tab === tabId);
        });
        this._elements.panes.forEach((pane) => {
            pane.classList.toggle("active", pane.id === tabId);
        });
    }

    setAreaFilterActive(active) {
        this._elements.clearAreaBtn.style.display = active ? "inline-flex" : "none";
        this._elements.drawFilterBtn.classList.toggle("active", active);
    }

    showToast(
        message,
        loading = false,
    ) {
        const prefix = loading ? this._icons.spinner() : "";
        const progress = loading ? `<span class="toast-progress-bar"></span>` : "";
        this._elements.toast.classList.toggle("is-loading", loading);
        this._elements.toast.innerHTML = `${prefix}<span class="toast-text">${message}</span>${progress}`;
        this._elements.toast.classList.add("visible");
    }

    hideToast() {
        this._elements.toast.classList.remove("visible", "is-loading");
    }

    _queryElements() {
        return {
            inspector: document.getElementById("inspector"),
            toggleSidebar: document.getElementById("toggle-sidebar"),
            themeToggle: document.getElementById("theme-toggle"),
            langSelect: document.getElementById("lang-select"),
            tabs: document.querySelectorAll(".nav-tab"),
            panes: document.querySelectorAll(".tab-pane"),
            viewModeBtns: document.querySelectorAll(".view-mode-btn"),
            basemapBtns: document.querySelectorAll(".basemap-btn"),
            boundaryBtn: document.getElementById("toggle-boundaries"),
            drawFilterBtn: document.getElementById("draw-filter-btn"),
            clearAreaBtn: document.getElementById("clear-area-btn"),
            toast: document.getElementById("toast"),
        };
    }

    _initTheme() {
        const saved = localStorage.getItem("overture_poi_theme") || "light";
        this._applyTheme(saved);
    }

    _applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        this._elements.themeToggle.innerHTML = theme === "dark"
            ? this._icons.sun()
            : this._icons.moon();
        localStorage.setItem("overture_poi_theme", theme);
    }

    _bindEvents() {
        this._elements.toggleSidebar.addEventListener("click", () => {
            this._elements.inspector.classList.toggle("collapsed");
            this._callbacks.onResize();
        });
        this._elements.themeToggle.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme") || "light";
            const next = current === "dark" ? "light" : "dark";
            this._applyTheme(next);
            this._callbacks.onThemeChange(next);
        });
        this._elements.langSelect.addEventListener("change", () => {
            this._i18n.setLanguage(this._elements.langSelect.value);
        });
        this._elements.tabs.forEach((tab) => {
            tab.addEventListener("click", () => this.switchTab(tab.dataset.tab));
        });
        this._elements.viewModeBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                this._elements.viewModeBtns.forEach((b) => b.classList.toggle("active", b === btn));
                this._callbacks.onViewMode(btn.dataset.mode);
            });
        });
        this._elements.basemapBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                this._elements.basemapBtns.forEach((b) => b.classList.toggle("active", b === btn));
                this._callbacks.onBasemap(btn.dataset.basemap);
            });
        });
        this._elements.boundaryBtn.addEventListener("click", () => {
            this._boundariesOn = !this._boundariesOn;
            this._elements.boundaryBtn.classList.toggle("active", this._boundariesOn);
            this._callbacks.onToggleBoundaries(this._boundariesOn);
        });
        this._elements.drawFilterBtn.addEventListener("click", () => this._callbacks.onStartAreaFilter());
        this._elements.clearAreaBtn.addEventListener("click", () => this._callbacks.onClearAreaFilter());
    }
}
