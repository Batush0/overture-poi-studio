class I18nService {
    constructor() {
        this._dictionaries = {};
        this._lang = localStorage.getItem("overture_poi_lang") || "en";
        this._listeners = [];
    }

    async load() {
        try {
            const response = await fetch("i18n/translations.json");
            this._dictionaries = await response.json();
        } catch {
            this._dictionaries = {};
        }
        if (!this._dictionaries[this._lang]) {
            this._lang = "en";
        }
        this.applyToDom();
    }

    getLanguage() {
        return this._lang;
    }

    setLanguage(lang) {
        if (!this._dictionaries[lang]) {
            return;
        }
        this._lang = lang;
        localStorage.setItem("overture_poi_lang", lang);
        this.applyToDom();
        for (const listener of this._listeners) {
            listener(lang);
        }
    }

    onChange(callback) {
        this._listeners.push(callback);
    }

    t(
        key,
        fallback = "",
    ) {
        const current = this._dictionaries[this._lang] || {};
        const english = this._dictionaries.en || {};
        return current[key] || english[key] || fallback || key;
    }

    formatNumber(value) {
        const localeMap = {
            en: "en-US",
            tr: "tr-TR",
            zh: "zh-CN",
            de: "de-DE",
            ru: "ru-RU",
            ar: "ar-EG",
        };
        return Number(value || 0).toLocaleString(localeMap[this._lang] || "en-US");
    }

    formatCountryName(
        code,
        fallbackName,
    ) {
        try {
            const display = new Intl.DisplayNames([this._lang], { type: "region" });
            return display.of(code) || fallbackName;
        } catch {
            return fallbackName;
        }
    }

    applyToDom() {
        document.documentElement.lang = this._lang;
        document.documentElement.dir = this._lang === "ar" ? "rtl" : "ltr";
        document.title = `${this.t("appTitle", "Overture POI Studio")} · Geospatial Explorer`;
        document.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            if (key) {
                el.textContent = this.t(key, el.textContent);
            }
        });
        document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
            const key = el.getAttribute("data-i18n-placeholder");
            if (key) {
                el.setAttribute("placeholder", this.t(key, el.getAttribute("placeholder") || ""));
            }
        });
        document.querySelectorAll("[data-i18n-title]").forEach((el) => {
            const key = el.getAttribute("data-i18n-title");
            if (key) {
                el.setAttribute("title", this.t(key, el.getAttribute("title") || ""));
            }
        });
    }
}
