import { LitElement, html, css, unsafeCSS, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import type {
  HomeAssistant,
  M3TopConsumersCardConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  TopConsumerEntityConfig,
  TopConsumersPeriod,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_TOP_CONSUMERS_RADIUS,
  DEFAULT_TOP_CONSUMERS_ICON,
  DEFAULT_TOP_CONSUMERS_ACCENT,
  DEFAULT_TOP_CONSUMERS_COUNT,
  DEFAULT_TOP_CONSUMERS_NAME_STRIP,
  DEFAULT_TOP_CONSUMERS_PALETTE,
  DEFAULT_COST_CURRENCY,
  TOP_CONSUMERS_ROW_HEIGHT,
  TOP_CONSUMERS_ROW_RADIUS,
  TOP_CONSUMERS_ROW_RADIUS_ACTIVE,
  TOP_CONSUMERS_ICON_SIZE,
  TOP_CONSUMERS_ICON_RADIUS,
  TOP_CONSUMERS_ROW_GAP,
  TOP_CONSUMERS_REST_ROW_HEIGHT,
  TOP_CONSUMERS_REST_ROW_RADIUS,
  TOP_CONSUMERS_REST_ROW_RADIUS_OPEN,
  TOP_CONSUMERS_COMPACT_ROW_HEIGHT,
  TOP_CONSUMERS_COMPACT_ROW_RADIUS,
  TOP_CONSUMERS_FLIP_DURATION_MS,
  TOP_CONSUMERS_REFRESH_MS,
  resolveCornerRadius,
  NEW_CARD_ACCENT,
} from "./const";
import { resolveThemeColor, buildCssVars, resolveCommonColors, tintOn, tintInk, foregroundOn, foregroundVars, fillColor} from "./shared/color-config";
import { glassCardStyles, glassCardClass } from "./shared/glass-card";
import { renderCardHeader, cardHeaderStyles } from "./shared/card-header";
import { shouldAnimate, STANDARD_EASING } from "./shared/animation";
import { captureRowRects, flipRows } from "./shared/list-row";
import { activateOnKey } from "./shared/a11y";
import { getEnergyDeviceEntities } from "./shared/ha-energy";
import { fetchPeriodChangeByEntity } from "./shared/ha-statistics";
import { resolveEffectivePrice, formatCurrency } from "./shared/pricing";
import { localize, type TranslationKey } from "./localize";
import { formatNumber } from "./shared/formatting";
import { discoveryChangeMatters } from "./shared/should-update";
import { TemplatedCard } from "./shared/templated-card";
import { openEntityDetail } from "./shared/entity-detail";
import { liveConsumers } from "./shared/live-consumers";
import { displayUnit } from "./shared/energy-flow-units";
import { cssValue } from "./shared/css-safe";

console.info(
  `%c M3-TOP-CONSUMERS-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #85b7eb; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #85b7eb; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

const EASING = unsafeCSS(STANDARD_EASING);

interface ConsumerRow {
  key: string;
  entity: string;
  name: string;
  icon: string;
  color: string;
  value: number;
  cost?: number;
}

interface HistoricalConsumption {
  key: string;
  consumption: Map<string, number>;
  noDeviceSection?: boolean;
  price?: number;
}

function periodWindow(period: Exclude<TopConsumersPeriod, "live">): { start: Date; end: Date; granularity: "hour" | "day" } {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  if (period === "yesterday") {
    const start = new Date(midnight);
    start.setDate(start.getDate() - 1);
    return { start, end: midnight, granularity: "hour" };
  }
  if (period === "week") {
    const start = new Date(midnight);
    start.setDate(start.getDate() - 6);
    return { start, end: now, granularity: "day" };
  }
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now, granularity: "day" };
  }
  return { start: midnight, end: now, granularity: "hour" };
}

function cleanName(raw: string, patterns: string[]): string {
  let result = raw;
  for (const pattern of patterns) {
    try {
      result = result.replace(new RegExp(pattern), "");
    } catch {
      result = result.split(pattern).join("");
    }
  }
  return result.trim() || raw;
}

@customElement("m3-top-consumers-card")
export class M3TopConsumersCard extends TemplatedCard(LitElement) implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3TopConsumersCardConfig;
  @state() private _expanded = false;
  @state() private _history?: HistoricalConsumption;

  // The row wash. Shared by render() (which publishes it as a variable) and by
  // the row builders, which need the resolved value to measure their ink.
  private _rowSurface(): string {
    return tintOn(this, "var(--primary-text-color)", undefined, 6);
  }

  private _refreshTimer?: number;
  private _lastFetchKey?: string;
  private _fetchInFlight = false;
  private _rowRects = new Map<string, DOMRect>();

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-top-consumers-card-editor");
    return document.createElement(
      "m3-top-consumers-card-editor",
    ) as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): M3TopConsumersCardConfig {
    return {
      type: "custom:m3-top-consumers-card",
      source: "energy",
      glass_background: true,
      accent_color: NEW_CARD_ACCENT,
    };
  }

  public setConfig(config: M3TopConsumersCardConfig): void {
    this._config = {
      glass_background: true,
      animation: "auto",
      source: "energy",
      period: "today",
      top_count: DEFAULT_TOP_CONSUMERS_COUNT,
      rest_mode: "collapse",
      ...config,
    };
  }

  public getCardSize(): number {
    return 5;
  }

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: "full",
      rows: "auto",
      min_rows: 5,
    };
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _formatKwh(value: number): string {
    return formatNumber(this._language, value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private _formatValue(value: number, costMode = false, currency = DEFAULT_COST_CURRENCY): string {
    if (costMode) return formatCurrency(value, currency, this._language);
    if (this._config?.period !== "live") return this._formatKwh(value);
    const { label, divisor } = displayUnit("power", value);
    return `${formatNumber(this._language, value / divisor, { maximumFractionDigits: 2 })} ${label}`;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._refreshTimer = window.setInterval(() => {
      this._lastFetchKey = undefined;
      this._maybeFetch();
    }, TOP_CONSUMERS_REFRESH_MS);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._refreshTimer !== undefined) {
      window.clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (changed.has("hass") || changed.has("_config")) {
      this._maybeFetch();
    }
    this._rowRects = captureRowRects(this.renderRoot);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (shouldAnimate(this._config?.animation)) {
      flipRows(this.renderRoot, this._rowRects, TOP_CONSUMERS_FLIP_DURATION_MS);
    }
  }

  private _historyKey(config = this._config, start?: Date): string | undefined {
    if (!config || config.period === "live") return undefined;
    return JSON.stringify({
      source: config.source,
      entities: config.entities?.map((e) => e.entity),
      period: config.period,
      start: (start ?? periodWindow(config.period ?? "today").start).getTime(),
      unitMode: config.unit_mode,
      priceSource: config.price_source,
      priceEntity: config.price_entity,
      price: config.price,
      priceUnit: config.price_unit,
    });
  }

  private get _currentHistory(): HistoricalConsumption | undefined {
    return this._history?.key === this._historyKey() ? this._history : undefined;
  }

  private _maybeFetch(): void {
    const config = this._config;
    if (!this.hass || !config || config.period === "live" || this._fetchInFlight) return;
    const range = periodWindow(config.period ?? "today");
    const key = this._historyKey(config, range.start);
    if (key === undefined || key === this._lastFetchKey) return;
    this._lastFetchKey = key;
    void this._fetchData(this.hass, config, range, key);
  }

  private async _fetchData(
    hass: HomeAssistant,
    config: M3TopConsumersCardConfig,
    { start, end, granularity }: ReturnType<typeof periodWindow>,
    key: string,
  ): Promise<void> {
    this._fetchInFlight = true;
    try {
      let entityIds: string[];
      if (config.source === "entities") {
        entityIds = (config.entities ?? []).map((e) => e.entity);
      } else {
        const devices = await getEnergyDeviceEntities(hass);
        if (!devices) {
          if (this._historyKey() === key) this._history = { key, consumption: new Map(), noDeviceSection: true };
          return;
        }
        entityIds = devices;
      }
      if (this._historyKey() !== key) return;
      const consumption = await fetchPeriodChangeByEntity(hass, entityIds, start, end, granularity);
      if (this._historyKey() !== key) return;
      const price = config.unit_mode === "cost"
        ? await resolveEffectivePrice(hass, config, start, end, () => this._historyKey() === key)
        : undefined;
      if (price === null) {
        this._lastFetchKey = undefined;
        return;
      }
      if (this._historyKey() === key) this._history = { key, consumption, price };
    } catch (e) {
      console.error("m3-top-consumers-card: failed to load consumption data", e);
    } finally {
      this._fetchInFlight = false;
      if (this._historyKey() !== key && this._lastFetchKey === key) this._lastFetchKey = undefined;
      // Retry if the editor changed the requested period during the fetch.
      this._maybeFetch();
    }
  }

  private _sourceEntities(): TopConsumerEntityConfig[] {
    if (this._config?.period === "live") return this._config.power_entities ?? [];
    if (this._config?.source === "entities") return this._config.entities ?? [];
    return Array.from(this._currentHistory?.consumption.keys() ?? []).map((entity) => ({ entity }));
  }

  private _buildRows(live?: ReturnType<typeof liveConsumers>): ConsumerRow[] {
    if (!this.hass || !this._config) return [];
    const nameStrip = this._config.name_strip ?? DEFAULT_TOP_CONSUMERS_NAME_STRIP;
    const palette = this._config.palette?.length ? this._config.palette : DEFAULT_TOP_CONSUMERS_PALETTE;

    const history = live ? undefined : this._currentHistory;
    const price = this._config.unit_mode === "cost" ? history?.price : undefined;
    const readings = live?.devices ?? history?.consumption;
    const seen = new Set<string>();

    const rows = this._sourceEntities()
      .map((entry, index): ConsumerRow | undefined => {
        const value = readings?.get(entry.entity) ?? 0;
        if (value <= 0 || (live && seen.has(entry.entity))) return undefined;
        if (live) seen.add(entry.entity);
        const state = this.hass!.states[entry.entity];
        const rawName = entry.name || state?.attributes.friendly_name || entry.entity;
        const name = entry.name ? rawName : cleanName(rawName, nameStrip);
        const color = (entry.color ? resolveThemeColor(entry.color) : undefined)
          ?? cssValue(palette[index % palette.length])
          ?? DEFAULT_TOP_CONSUMERS_PALETTE[index % DEFAULT_TOP_CONSUMERS_PALETTE.length];
        return {
          key: entry.entity,
          entity: entry.entity,
          name,
          icon: entry.icon || state?.attributes.icon || "mdi:power-plug",
          color,
          value,
          cost: price !== undefined ? value * price : undefined,
        };
      })
      .filter((r): r is ConsumerRow => !!r);

    rows.sort((a, b) => (price !== undefined ? (b.cost ?? 0) - (a.cost ?? 0) : b.value - a.value));
    return rows;
  }

  private _moreInfo(entityId: string): () => void {
    return () => openEntityDetail(this, entityId);
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    // In "energy" mode the rows come from fetched statistics rather than from
    // states, so the historical snapshot provides the actual amounts; _sourceEntities
    // covers both that and the configured list.
    return discoveryChangeMatters(
      changed,
      this.hass,
      [
        ...this._sourceEntities().map((e) => e.entity),
        this._config?.period === "live" ? this._config.power_entity : undefined,
      ],
    );
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;

    const accentColor = this._config.accent_color
      ? resolveThemeColor(this._config.accent_color)
      : DEFAULT_TOP_CONSUMERS_ACCENT;
    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(
      this._config,
    );

    const radius = resolveCornerRadius(
      this._config.radius ?? DEFAULT_TOP_CONSUMERS_RADIUS,
      this._config.corners,
    );

    const name = this._config.name || this._t("top_consumers_default_name");
    const icon = this._config.icon || DEFAULT_TOP_CONSUMERS_ICON;
    const periodLabel = this._t(`top_consumers_period_${this._config.period ?? "today"}` as TranslationKey);
    const live = this._config.period === "live"
      ? liveConsumers(this.hass.states, this._sourceEntities().map((e) => e.entity), this._config.power_entity)
      : undefined;
    const costMode = !live && this._config.unit_mode === "cost";
    const currency = this._config.currency || DEFAULT_COST_CURRENCY;

    // The glyph sits on this well, not on the card, so its contrast has to be
    // measured against the well.
    const iconWellCss = tintOn(this, accentColor, this._config.accent_opacity, 18);
    const rowSurfaceCss = this._rowSurface();
    const cssVars = buildCssVars({
      "tc-row-bg": rowSurfaceCss,
      "m3p-icon-color": foregroundOn(accentColor, iconWellCss),
      "m3p-icon-bg": iconWellCss,
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
      "tc-accent": accentColor,
      // Fills keep the accent; these twins carry it where it is text.
      ...foregroundVars(this, {
        "tc-accent": accentColor,
      }),
    });

    const history = live ? undefined : this._currentHistory;
    if (history?.noDeviceSection) {
      return html`
        <ha-card style=${`${cssVars} border-radius: ${radius};`}>
          <div
            class="card-inner ${glassCardClass(this._config.glass_background)}"
            style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
          >
            ${renderCardHeader({ icon, name, subtitle: periodLabel })}
            <div class="empty-state">
              ${this._t("top_consumers_no_device_section")}
              <a href="/config/energy">${this._t("top_consumers_open_energy_settings")}</a>
            </div>
          </div>
        </ha-card>
      `;
    }

    if (costMode && history && history.price === undefined) {
      return html`
        <ha-card style=${`${cssVars} border-radius: ${radius};`}>
          <div
            class="card-inner ${glassCardClass(this._config.glass_background)}"
            style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
          >
            ${renderCardHeader({ icon, name, subtitle: periodLabel })}
            <div class="empty-state">
              ${this._t("cost_no_price_configured")}
              ${this._config.price_source === "energy_dashboard" || !this._config.price_source
                ? html`<a href="/config/energy">${this._t("top_consumers_open_energy_settings")}</a>`
                : nothing}
            </div>
          </div>
        </ha-card>
      `;
    }

    const allRows = this._buildRows(live);
    const topCount = this._config.top_count ?? DEFAULT_TOP_CONSUMERS_COUNT;
    const restMode = this._config.rest_mode ?? "collapse";

    const visibleRows = restMode === "show_all" ? allRows : allRows.slice(0, topCount);
    const restRows = restMode === "show_all" ? [] : allRows.slice(topCount);

    const total = allRows.reduce((sum, r) => sum + (costMode ? (r.cost ?? 0) : r.value), 0);
    const maxValue = Math.max(...visibleRows.map((r) => (costMode ? (r.cost ?? 0) : r.value)), costMode ? 0.01 : 1);
    const restSum = restRows.reduce((sum, r) => sum + (costMode ? (r.cost ?? 0) : r.value), 0);

    const trackedOnly = !!live && (live.total === undefined || live.exceedsTotal);
    const liveTotal = live?.total ?? live?.tracked;
    const subtitle =
      this._config.subtitle ||
      `${periodLabel} · ${this._t("top_consumers_device_count").replace("{n}", String(allRows.length))}`;

    return html`
      <ha-card style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)} ${shouldAnimate(this._config?.animation) ? "" : "no-animations"}"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          ${renderCardHeader({
            icon,
            name,
            subtitle,
            right: live
              ? html`<div class="total-value">
                  <div class="total-number">${liveTotal === undefined ? "—" : this._formatValue(liveTotal)}</div>
                  <div class="total-unit">${this._t(live.total === undefined ? "top_consumers_tracked_power" : "top_consumers_home_power")}</div>
                </div>`
              : costMode
              ? html`
                  <div class="total-value">
                    <div class="total-number">${formatCurrency(total, currency, this._language)}</div>
                  </div>
                `
              : html`
                  <div class="total-value">
                    <div class="total-number">${this._formatKwh(total)}</div>
                    <div class="total-unit">${this._t("top_consumers_total_suffix")}</div>
                  </div>
                `,
          })}

          ${live ? this._renderLiveGauge(live, allRows) : nothing}

          ${allRows.length === 0
            ? html`<div class="empty-state">${live ? this._t("top_consumers_live_empty") : this._t("top_consumers_empty").replace("{period}", periodLabel)}</div>`
            : html`
                <div class="row-list">
                  ${repeat(
                    visibleRows,
                    (r) => r.key,
                    (r) => this._renderRow(r, live?.denominator ?? maxValue, live?.denominator ?? total, costMode, currency, trackedOnly),
                  )}
                </div>

                ${restMode === "collapse" && restRows.length > 0
                  ? html`
                      <button
                        class="rest-toggle ${this._expanded ? "open" : ""}"
                        @click=${() => (this._expanded = !this._expanded)}
                      >
                        <ha-icon icon="mdi:dots-horizontal"></ha-icon>
                        <span class="rest-label"
                          >${this._t("top_consumers_more_devices").replace("{n}", String(restRows.length))}</span
                        >
                        <span class="rest-sum"
                          >${costMode
                            ? formatCurrency(restSum, currency, this._language)
                            : live ? this._formatValue(restSum) : `${this._formatKwh(restSum)} kWh`}</span
                        >
                        <ha-icon class="chevron" icon="mdi:chevron-down"></ha-icon>
                      </button>
                      ${this._expanded
                        ? html`
                            <div class="row-list compact-list">
                              ${repeat(
                                restRows,
                                (r) => r.key,
                                (r) => this._renderCompactRow(r, costMode, currency),
                              )}
                            </div>
                          `
                        : nothing}
                    `
                  : nothing}
              `}
        </div>
      </ha-card>
    `;
  }

  private _renderLiveGauge(live: ReturnType<typeof liveConsumers>, rows: ConsumerRow[]) {
    const note = live.untracked > 0
      ? this._t("top_consumers_untracked_power").replace("{power}", this._formatValue(live.untracked))
      : live.exceedsTotal
        ? this._t("top_consumers_power_mismatch")
        : this._config?.power_entity && live.total === undefined
          ? this._t("top_consumers_home_unavailable")
          : "";
    return html`
      <div class="live-gauge">
        <div class="live-track" aria-hidden="true">
          ${repeat(rows, (r) => r.key, (r) => html`
            <span class="live-segment" title=${`${r.name}: ${this._formatValue(r.value)}`}
              style=${`width:${(r.value / live.denominator) * 100}%;background-color:${cssValue(fillColor(this, r.color)) ?? "var(--tc-accent)"};`}></span>
          `)}
        </div>
        ${note ? html`<div class="live-note">${note}</div>` : nothing}
      </div>
    `;
  }

  private _renderRow(
    row: ConsumerRow,
    maxValue: number,
    total: number,
    costMode: boolean,
    currency: string,
    trackedOnly: boolean,
  ) {
    const rowValue = costMode ? (row.cost ?? 0) : row.value;
    const barPct = Math.max(0, Math.min(100, (rowValue / maxValue) * 100));
    const pctOfTotal = total > 0 ? Math.round((rowValue / total) * 100) : 0;
    const subtitle = costMode
      ? `${this._formatKwh(row.value)} kWh · ${pctOfTotal} % ${this._t("top_consumers_of_total_cost")}`
      : `${pctOfTotal} % ${this._t(trackedOnly ? "top_consumers_of_tracked_power" : "top_consumers_of_total")}`;
    return html`
      <div
        class="row"
        data-row-key=${row.key}
        role="button"
        tabindex="0"
        aria-label=${row.name}
        @click=${this._moreInfo(row.entity)}
        @keydown=${activateOnKey(this._moreInfo(row.entity))}
        title=${row.name}
      >
        <div class="bar-fill" style=${`width: ${barPct}%; background: ${tintOn(this, row.color, undefined, 22)};`}></div>
        <div class="icon-squircle" style=${`background: ${tintOn(this, row.color, undefined, 20)}; color: ${tintInk(this, row.color, undefined, 20, 3)};`}>
          <ha-icon icon=${row.icon}></ha-icon>
        </div>
        <div class="row-text">
          <div class="row-name">${row.name}</div>
          <div class="row-percent">${subtitle}</div>
        </div>
        <div class="row-value" style=${`color: ${foregroundOn(row.color, this._rowSurface(), 4.5)};`}>
          ${this._formatValue(rowValue, costMode, currency)}
        </div>
      </div>
    `;
  }

  private _renderCompactRow(row: ConsumerRow, costMode: boolean, currency: string) {
    const rowValue = costMode ? (row.cost ?? 0) : row.value;
    return html`
      <div
        class="row compact"
        data-row-key=${row.key}
        role="button"
        tabindex="0"
        aria-label=${row.name}
        @click=${this._moreInfo(row.entity)}
        @keydown=${activateOnKey(this._moreInfo(row.entity))}
        title=${row.name}
      >
        <div class="icon-squircle small" style=${`background: ${tintOn(this, row.color, undefined, 20)}; color: ${tintInk(this, row.color, undefined, 20, 3)};`}>
          <ha-icon icon=${row.icon}></ha-icon>
        </div>
        <div class="row-name">${row.name}</div>
        <div class="row-value" style=${`color: ${foregroundOn(row.color, this._rowSurface(), 4.5)};`}>
          ${this._formatValue(rowValue, costMode, currency)}
        </div>
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    cardHeaderStyles,
    css`
      .total-value {
        flex-shrink: 0;
        text-align: right;
      }

      .total-number {
        font-size: 20px;
        font-weight: 700;
        line-height: 1.1;
        color: var(--tc-accent-fg, var(--tc-accent));
      }

      .total-unit {
        font-size: 11px;
        opacity: 0.6;
        color: var(--m3p-secondary-text);
      }

      .live-gauge {
        display: grid;
        gap: 5px;
      }

      .live-track {
        display: flex;
        height: 10px;
        overflow: hidden;
        border-radius: 999px;
        background: var(--divider-color, var(--tc-row-bg));
      }

      .live-segment {
        flex: 0 0 auto;
      }

      .live-note {
        color: var(--m3p-secondary-text);
        font-size: 11px;
        text-align: end;
      }

      .row-list {
        display: flex;
        flex-direction: column;
        gap: ${TOP_CONSUMERS_ROW_GAP}px;
      }

      .row {
        position: relative;
        height: ${TOP_CONSUMERS_ROW_HEIGHT}px;
        border-radius: ${TOP_CONSUMERS_ROW_RADIUS}px;
        background: var(--tc-row-bg);
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 12px;
        overflow: hidden;
        cursor: pointer;
        box-sizing: border-box;
        transition: border-radius 350ms ${EASING};
      }

      .row:active {
        border-radius: ${TOP_CONSUMERS_ROW_RADIUS_ACTIVE}px;
      }

      .row:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }

      .row.compact {
        height: ${TOP_CONSUMERS_COMPACT_ROW_HEIGHT}px;
        border-radius: ${TOP_CONSUMERS_COMPACT_ROW_RADIUS}px;
        opacity: 0.65;
      }

      .bar-fill {
        position: absolute;
        inset: 0 auto 0 0;
        border-radius: inherit;
        pointer-events: none;
      }

      .icon-squircle {
        position: relative;
        flex-shrink: 0;
        width: ${TOP_CONSUMERS_ICON_SIZE}px;
        height: ${TOP_CONSUMERS_ICON_SIZE}px;
        border-radius: ${TOP_CONSUMERS_ICON_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .icon-squircle.small {
        width: 22px;
        height: 22px;
        border-radius: 8px;
      }

      .icon-squircle ha-icon {
        --mdc-icon-size: 17px;
      }

      .icon-squircle.small ha-icon {
        --mdc-icon-size: 13px;
      }

      .row-text {
        position: relative;
        flex: 1;
        min-width: 0;
      }

      .row-name {
        position: relative;
        font-size: 13px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--m3p-text);
      }

      .row.compact .row-name {
        flex: 1;
        min-width: 0;
      }

      .row-percent {
        font-size: 10px;
        opacity: 0.5;
        color: var(--m3p-secondary-text);
      }

      .row-value {
        position: relative;
        flex-shrink: 0;
        font-size: 14px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .rest-toggle {
        width: 100%;
        height: ${TOP_CONSUMERS_REST_ROW_HEIGHT}px;
        border-radius: ${TOP_CONSUMERS_REST_ROW_RADIUS}px;
        border: none;
        background: color-mix(in srgb, var(--primary-text-color) 5%, var(--ha-card-background, var(--card-background-color)));
        color: var(--m3p-text);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 14px;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        transition: border-radius 350ms ${EASING};
      }

      .rest-toggle.open {
        border-radius: ${TOP_CONSUMERS_REST_ROW_RADIUS_OPEN}px;
      }

      .rest-toggle ha-icon {
        --mdc-icon-size: 18px;
      }

      .rest-label {
        flex: 1;
        text-align: left;
      }

      .rest-sum {
        font-weight: 700;
      }

      .chevron {
        transition: transform 250ms ${EASING};
      }

      .rest-toggle.open .chevron {
        transform: rotate(180deg);
      }

      .card-inner.no-animations .rest-toggle,
      .card-inner.no-animations .chevron,
      .card-inner.no-animations .row {
        transition: none;
      }

      .empty-state {
        text-align: center;
        font-size: 13px;
        opacity: 0.6;
        padding: 16px 0;
        color: var(--m3p-secondary-text);
      }

      .empty-state a {
        display: block;
        margin-top: 6px;
        color: var(--tc-accent-fg, var(--tc-accent));
      }

      /* Safari gained color-mix() in 16.2, and an iPod touch 7 or an iPad Air 2
         stops at iOS 15. A plain declaration before each mix cannot serve as the
         fallback: every one of them contains var(), which defers the check until
         after substitution, where failure yields unset rather than the previous
         declaration — the tint did not fade, the fill disappeared entirely. This
         block is the one those browsers alone can see; the tint is what it gives
         up. Backticks are not allowed in here: this is a css template literal. */
      @supports not (color: color-mix(in srgb, red 50%, blue)) {
        .rest-toggle {
          background: var(--ha-card-background, var(--card-background-color));
        }
      }
      `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-top-consumers-card": M3TopConsumersCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-top-consumers-card",
  name: "M3 Top Consumers Card",
  description:
    "Ein Material-3-Ranking der größten Einzelverbraucher aus dem Energie-Dashboard.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
