import { LitElement, css, html, nothing, unsafeCSS, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { CARD_VERSION, DEFAULT_TOP_CONSUMERS_PALETTE, DEFAULT_TOP_CONSUMERS_RADIUS } from "./const";
import { localize } from "./localize";
import { cardHeaderStyles, renderCardHeader } from "./shared/card-header";
import { buildCssVars, foregroundOn, resolveThemeColor, tintOn } from "./shared/color-config";
import { formatNumber } from "./shared/formatting";
import { glassCardClass, glassCardStyles } from "./shared/glass-card";
import { formatCurrency } from "./shared/pricing";
import { hassChangeMatters } from "./shared/should-update";
import type { HassEntity, HomeAssistant, LovelaceCard, LovelaceCardEditor, LovelaceGridOptions, M3EnergyCostCardConfig } from "./types";

console.info(
  `%c M3-ENERGY-COST-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #85b7eb; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #85b7eb; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

const entityFields = ["today_cost", "today_energy", "month_cost", "month_energy"] as const;

function numericState(entity: HassEntity | undefined): number | undefined {
  const text = entity?.state.trim();
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

@customElement("m3-energy-cost-card")
export class M3EnergyCostCard extends LitElement implements LovelaceCard<M3EnergyCostCardConfig> {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: M3EnergyCostCardConfig;

  public static async getConfigElement(): Promise<LovelaceCardEditor<M3EnergyCostCardConfig>> {
    await import("./m3-energy-cost-card-editor");
    return document.createElement("m3-energy-cost-card-editor");
  }

  public static getStubConfig(): M3EnergyCostCardConfig {
    return {
      type: "custom:m3-energy-cost-card",
      rows: [
        { name: "Home electricity", icon: "mdi:home-lightning-bolt" },
        { name: "Truck charging", icon: "mdi:ev-station" },
      ],
    };
  }

  public setConfig(config: M3EnergyCostCardConfig): void {
    if (!Array.isArray(config.rows) || !config.rows.length || config.rows.some((row) =>
      !row || typeof row !== "object" || Array.isArray(row) ||
      (row.name !== undefined && typeof row.name !== "string") ||
      entityFields.some((field) => row[field] !== undefined && typeof row[field] !== "string"),
    )) {
      throw new Error("Configure at least one row and use entity IDs for any sensors you select.");
    }
    if (config.currency !== undefined && !/^[a-z]{3}$/i.test(config.currency)) {
      throw new Error("Currency must be a three-letter code such as USD.");
    }
    this._config = config;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: "auto" };
  }

  public getCardSize(): number {
    return (this._config?.rows.length ?? 2) + 2;
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return hassChangeMatters(changed, this.hass, this._config?.rows.flatMap((row) => entityFields.map((field) => row[field])) ?? []);
  }

  private _reading(label: string, cost: HassEntity | undefined, energy: HassEntity | undefined, currency: string, language: string) {
    const amount = numericState(cost);
    const usage = numericState(energy);
    const unit = energy?.attributes.unit_of_measurement || "kWh";
    return html`
      <div class="reading">
        <span class="period-label">${label}</span>
        <strong class="cost">${amount === undefined ? "—" : formatCurrency(amount, currency, language)}</strong>
        <span class="energy">${usage === undefined ? "—" : `${formatNumber(language, usage, { maximumFractionDigits: 2 })}\u00a0${unit}`}</span>
      </div>
    `;
  }

  protected render() {
    const config = this._config;
    if (!config || !this.hass) return nothing;
    const { states, language } = this.hass;
    const currency = config.currency ?? "USD";
    const today = localize("usage_today", language);
    const month = localize("usage_month", language);
    const sensor = (id?: string) => id ? states[id] : undefined;
    const well = (color: string) => {
      const bg = tintOn(this, color, undefined, 18);
      return buildCssVars({ "m3p-icon-bg": bg, "m3p-icon-color": foregroundOn(color, bg) });
    };
    return html`
      <ha-card>
        <div class="card-inner ${glassCardClass(config.glass_background)}" style=${well(DEFAULT_TOP_CONSUMERS_PALETTE[0])}>
          ${renderCardHeader({ icon: "mdi:cash-lightning", name: config.name || localize("energy_cost_title", language), subtitle: "", wrapName: true })}
          <div class="rows">
            <div class="comparison column-headings" aria-hidden="true"><span></span><span>${today}</span><span>${month}</span></div>
            ${config.rows.map((row, index) => html`
              <div class="comparison meter">
                <div class="meter-name">
                  <span class="meter-icon" style=${well(row.color ? resolveThemeColor(row.color) : DEFAULT_TOP_CONSUMERS_PALETTE[index % DEFAULT_TOP_CONSUMERS_PALETTE.length])}>
                    <ha-icon aria-hidden="true" icon=${row.icon || "mdi:lightning-bolt"}></ha-icon>
                  </span>
                  <span>${row.name?.trim() || localize("energy_cost_row", language).replace("{n}", String(index + 1))}</span>
                </div>
                ${this._reading(today, sensor(row.today_cost), sensor(row.today_energy), currency, language)}
                ${this._reading(month, sensor(row.month_cost), sensor(row.month_energy), currency, language)}
              </div>
            `)}
          </div>
        </div>
      </ha-card>
    `;
  }

  static styles = [glassCardStyles, cardHeaderStyles, css`
    ha-card, .card-inner { border-radius: ${unsafeCSS(DEFAULT_TOP_CONSUMERS_RADIUS)}px; }
    .card-inner {
      container-type: inline-size;
      --m3p-text: var(--primary-text-color);
      color: var(--primary-text-color);
    }
    .m3-header { cursor: default; }
    .m3-name { font-size: 17px; }
    .m3-subtitle:empty { display: none; }
    .rows { display: grid; gap: 6px; }
    .comparison {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) repeat(2, minmax(0, 1fr));
      align-items: center;
      column-gap: 12px;
      padding-inline: 12px;
    }
    .column-headings, .period-label {
      color: var(--secondary-text-color, var(--primary-text-color));
      font-size: 11px;
      font-weight: 600;
      line-height: 1.25;
    }
    .column-headings { text-align: end; }
    .meter {
      min-height: 56px;
      padding-block: 8px;
      box-sizing: border-box;
      background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
      border-radius: 16px;
    }
    .meter-name {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-size: 13px;
      font-weight: 650;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .meter-icon {
      display: grid;
      place-items: center;
      flex: 0 0 34px;
      height: 34px;
      border-radius: 12px;
      background: var(--m3p-icon-bg);
      color: var(--m3p-icon-color);
      --mdc-icon-size: 19px;
    }
    .reading { display: grid; gap: 3px; text-align: end; overflow-wrap: anywhere; }
    .cost { font-size: 20px; line-height: 1.12; font-variant-numeric: tabular-nums; }
    .energy { color: var(--secondary-text-color, var(--primary-text-color)); font-size: 12px; line-height: 1.25; }
    .period-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    @container (max-width: 375px) {
      .column-headings { display: none; }
      .meter { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 10px 12px 12px; }
      .meter-name { grid-column: 1 / -1; }
      .reading { text-align: start; }
      .period-label { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }
    }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-energy-cost-card": M3EnergyCostCard;
  }
}

const windowWithCards = window as unknown as { customCards: Array<Record<string, unknown>> };
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-energy-cost-card",
  name: "M3 Energy & Cost Card",
  description: "Today’s and monthly spending and usage from your existing sensors.",
  preview: true,
  documentationURL: "https://github.com/Milli42/m3-cards#m3-energy-cost-card",
});
