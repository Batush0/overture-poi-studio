class PopupBuilder {
    constructor(
        icons,
        i18n,
    ) {
        this._icons = icons;
        this._i18n = i18n;
    }

    buildHtml(poi) {
        const category = poi.primaryCategory || poi.basicCategory || poi.topCategory || "uncategorized";
        const typeTag = poi.isBranded
            ? `<span class="tag tag-brand">${this._escape(poi.brand || this._i18n.t("ownershipBranded"))}</span>`
            : `<span class="tag tag-indie">${this._escape(this._i18n.t("ownershipIndependent"))}</span>`;
        const rows = [
            this._buildDetailRow(this._icons.pin(), this._escape(poi.address)),
            poi.phone
                ? this._buildDetailRow(
                    this._icons.phone(),
                    `<a href="tel:${this._escape(poi.phone)}">${this._escape(poi.phone)}</a>`
                )
                : "",
            poi.website
                ? this._buildDetailRow(
                    this._icons.globe(),
                    `<a href="${this._safeUrl(poi.website)}" target="_blank" rel="noopener">${this._escape(poi.website)}</a>`
                )
                : "",
        ].filter(Boolean).join("");
        const detailBlock = rows ? `<div class="poi-detail-list">${rows}</div>` : "";
        return `
            <div class="poi-card">
                <div class="poi-card-tags">
                    <span class="tag tag-area">${this._escape(poi.district)}</span>
                    ${typeTag}
                    <span class="tag-score">${poi.confidence.toFixed(2)}</span>
                </div>
                <div class="poi-card-title">${this._escape(poi.name)}</div>
                <div class="poi-card-cat">${this._escape(poi.topCategory)} / ${this._escape(category)}</div>
                ${detailBlock}
                <div class="poi-card-actions">
                    <a class="poi-link-btn primary" href="https://www.google.com/maps?q=${poi.lat},${poi.lon}" target="_blank" rel="noopener">
                        ${this._icons.externalLink()}<span>Google Maps</span>
                    </a>
                    <a class="poi-link-btn" href="https://www.openstreetmap.org/?mlat=${poi.lat}&mlon=${poi.lon}#map=18/${poi.lat}/${poi.lon}" target="_blank" rel="noopener">
                        ${this._icons.externalLink()}<span>OSM</span>
                    </a>
                </div>
            </div>
        `;
    }

    _buildDetailRow(
        iconSvg,
        htmlValue,
    ) {
        if (!htmlValue) {
            return "";
        }
        return `<div class="poi-detail-row">${iconSvg}<span>${htmlValue}</span></div>`;
    }

    _safeUrl(url) {
        const trimmed = String(url || "").trim();
        return /^https?:\/\//i.test(trimmed)
            ? this._escape(trimmed)
            : this._escape(`https://${trimmed}`);
    }

    _escape(text) {
        return String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
}
