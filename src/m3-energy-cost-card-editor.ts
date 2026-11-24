import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { localize, type TranslationKey } from "./localize";
import { editorStyles, fireEvent, type SchemaEntry } from "./shared/editor-helpers";
import type { EnergyCostRowConfig, HomeAssistant, LovelaceCardEditor, M3EnergyCostCardConfig } from "./types";

const sensorSelector = { entity: { domain: "sensor" } };
const rowLabels = {
  name: "editor_name",
  icon: "editor_icon",
  today_cost: "energy_cost_today_cost",
  today_energy: "energy_cost_today_energy",
  month_cost: "energy_cost_month_cost",
  month_energy: "energy_cost_month_energy",
} as const satisfies Partial<Record<keyof EnergyCostRowConfig, TranslationKey>>;
const rowFields = Object.keys(rowLabels) as Array<keyof typeof rowLabels>;
const rowSchema: SchemaEntry[] = rowFields.map((name) => ({
  name,
  selector: name === "name" ? { text: {} } : name === "icon" ? { icon: {} } : sensorSelector,
}));

@customElement("m3-energy-cost-card-editor")
export class M3EnergyCostCardEditor extends LitElement implements LovelaceCardEditor<M3EnergyCostCardConfig> {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: M3EnergyCostCardConfig;

  public setConfig(config: M3EnergyCostCardConfig): void {
    this._config = config;
  }

  private _t(key: TranslationKey): string {
    return localize(key, this.hass?.locale?.language ?? this.hass?.language ?? "en");
  }

  private _computeLabel = ({ name }: SchemaEntry): string => this._t(rowLabels[name as keyof typeof rowLabels]);

  private _setRows(rows: EnergyCostRowConfig[]): void {
    if (!this._config) return;
    this._config = { ...this._config, rows };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _rowChanged(event: CustomEvent<{ value: EnergyCostRowConfig }>, index: number): void {
    event.stopPropagation();
    const rows = this._config?.rows;
    if (!rows?.[index]) return;
    const row = { ...rows[index] };
    for (const field of rowFields) {
      const value = event.detail.value[field];
      if (value) row[field] = value;
      else delete row[field];
    }
    this._setRows(rows.map((entry, i) => i === index ? row : entry));
  }

  private async _addRow(): Promise<void> {
    if (!this._config) return;
    this._setRows([...this._config.rows, {}]);
    await this.updateComplete;
    const row = this.renderRoot.querySelector<HTMLDetailsElement>("details:last-of-type");
    if (row) {
      row.open = true;
      row.querySelector("summary")?.focus();
    }
  }

  protected render() {
    const rows = this._config?.rows;
    if (!rows || !this.hass) return nothing;
    return html`
      <div class="editor">
        ${rows.map((row, index) => html`
          <details ?open=${index === 0}>
            <summary>${row.name?.trim() || this._t("energy_cost_row").replace("{n}", String(index + 1))}</summary>
            <div class="fields">
              <ha-form
                .hass=${this.hass}
                .data=${row}
                .schema=${rowSchema}
                .computeLabel=${this._computeLabel}
                @value-changed=${(event: CustomEvent<{ value: EnergyCostRowConfig }>) => this._rowChanged(event, index)}
              ></ha-form>
              ${rows.length > 1 ? html`
                <button type="button" @click=${() => this._setRows(rows.filter((_, i) => i !== index))}>${this._t("editor_energy_cost_remove_row")}</button>
              ` : nothing}
            </div>
          </details>
        `)}
        <button type="button" @click=${this._addRow}>${this._t("editor_energy_cost_add_row")}</button>
      </div>
    `;
  }

  static styles = [editorStyles, css`
    details { border: 1px solid var(--divider-color); border-radius: 12px; min-width: 0; }
    summary { padding: 12px; font-weight: 600; cursor: pointer; overflow-wrap: anywhere; }
    .fields { display: grid; gap: 12px; padding: 0 12px 12px; min-width: 0; }
    button {
      justify-self: start;
      align-self: flex-start;
      min-height: 44px;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      padding: 0 12px;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
    }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-energy-cost-card-editor": M3EnergyCostCardEditor;
  }
}
