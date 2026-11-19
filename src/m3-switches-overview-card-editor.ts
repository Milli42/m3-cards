import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCardEditor,
  M3SwitchesOverviewCardConfig,
  SwitchesOverviewManualRoomConfig,
} from "./types";
import { DEFAULT_SWITCHES_OVERVIEW_RADIUS } from "./const";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, colorRow, opacityRow, editorStyles, type SchemaEntry } from "./shared/editor-helpers";
import { SWITCH_OVERVIEW_DOMAINS } from "./shared/switches-overview";
import { radiusLabelMap } from "./shared/radius-editor";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

type SwitchesOverviewColorField =
  | "on_color"
  | "off_color"
  | "accent_color"
  | "text_color"
  | "secondary_text_color"
  | "card_background";

@customElement("m3-switches-overview-card-editor")
export class M3SwitchesOverviewCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3SwitchesOverviewCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };

  public setConfig(config: M3SwitchesOverviewCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_SWITCHES_OVERVIEW_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  // Free text as well as the four common states, so exotic states stay reachable.
  private _stateSelector() {
    return {
      select: {
        multiple: true,
        custom_value: true,
        options: [
          { value: "on", label: this._t("editor_lights_state_on") },
          { value: "off", label: this._t("editor_lights_state_off") },
          { value: "unavailable", label: this._t("editor_lights_state_unavailable") },
          { value: "unknown", label: this._t("editor_lights_state_unknown") },
        ],
      },
    };
  }

  private _discoverySchema(): SchemaEntry[] {
    return [
      { name: "auto_discover", selector: { boolean: {} } },
      { name: "include_media_players", selector: { boolean: {} } },
      { name: "include_area", selector: { area: { multiple: true } } },
      { name: "exclude_area", selector: { area: { multiple: true } } },
      { name: "include_labels", selector: { label: { multiple: true } } },
      { name: "exclude_labels", selector: { label: { multiple: true } } },
      { name: "include_entities", selector: { entity: { domain: [...SWITCH_OVERVIEW_DOMAINS], multiple: true } } },
      { name: "exclude_entities", selector: { entity: { domain: [...SWITCH_OVERVIEW_DOMAINS], multiple: true } } },
      { name: "include_state", selector: this._stateSelector() },
      { name: "exclude_state", selector: this._stateSelector() },
    ];
  }

  private _roomSchema(): SchemaEntry[] {
    return [
      { name: "name", required: true, selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "entities", selector: { entity: { domain: [...SWITCH_OVERVIEW_DOMAINS], multiple: true } } },
    ];
  }

  private _displaySchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      {
        name: "view",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "rooms", label: this._t("editor_lights_view_rooms") },
              { value: "entities", label: this._t("editor_switches_view_entities") },
            ],
          },
        },
      },
      {
        name: "sort",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "name", label: this._t("editor_lights_sort_name") },
              { value: "area", label: this._t("editor_lights_sort_area") },
              { value: "on_first", label: this._t("editor_lights_sort_on_first") },
            ],
          },
        },
      },
      { name: "show_header", selector: { boolean: {} } },
      { name: "show_count", selector: { boolean: {} } },
      { name: "shape_by_state", selector: { boolean: {} } },
      { name: "show_area", selector: { boolean: {} } },
      { name: "hide_empty_rooms", selector: { boolean: {} } },
    ];
  }

  private _animationSchema(): SchemaEntry[] {
    return [
      {
        name: "animation",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: this._t("editor_progress_animation_auto") },
              { value: "on", label: this._t("editor_progress_animation_on") },
              { value: "off", label: this._t("editor_progress_animation_off") },
            ],
          },
        },
      },
    ];
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      shape_by_state: "editor_shape_by_state",
      auto_discover: "editor_lights_auto_discover",
      include_media_players: "editor_switches_include_media_players",
      include_area: "editor_lights_include_area",
      exclude_area: "editor_lights_exclude_area",
      include_labels: "editor_lights_include_labels",
      exclude_labels: "editor_lights_exclude_labels",
      include_entities: "editor_lights_include_entities",
      exclude_entities: "editor_lights_exclude_entities",
      include_state: "editor_lights_include_state",
      exclude_state: "editor_lights_exclude_state",
      name: "editor_name",
      icon: "editor_icon",
      entities: "editor_switches_room_entities",
      view: "editor_lights_view",
      sort: "editor_lights_sort",
      show_header: "editor_show_header",
      show_count: "editor_lights_show_count",
      show_area: "editor_lights_show_area",
      hide_empty_rooms: "editor_lights_hide_empty_rooms",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, ...ev.detail.value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _colorChanged(field: SwitchesOverviewColorField, value: string): void {
    if (!this._config) return;
    if (value) {
      this._config = { ...this._config, [field]: value };
    } else {
      const { [field]: _removed, ...rest } = this._config;
      this._config = rest;
    }
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _opacityChanged(field: "tile_tint_opacity" | "accent_opacity", value: number): void {
    if (!this._config) return;
    this._config = { ...this._config, [field]: value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _roomChanged(index: number, ev: CustomEvent): void {
    if (!this._config) return;
    const rooms = [...(this._config.rooms ?? [])];
    const value = ev.detail.value as SwitchesOverviewManualRoomConfig;
    rooms[index] = {
      name: value.name ?? "",
      icon: value.icon || undefined,
      entities: value.entities?.length ? value.entities : undefined,
    };
    this._config = { ...this._config, rooms };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _addRoom(): void {
    if (!this._config) return;
    const rooms = [...(this._config.rooms ?? []), { name: "" }];
    this._config = { ...this._config, rooms };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _removeRoom(index: number): void {
    if (!this._config) return;
    const rooms = [...(this._config.rooms ?? [])];
    rooms.splice(index, 1);
    this._config = { ...this._config, rooms };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _radiusPresetChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = radiusPresetPatch(ev.detail.value.radius_preset as string);
    this._appearance = { ...this._appearance, showCustomRadius: patch.showCustomRadius };
    if (patch.radius !== undefined) {
      this._config = { ...this._config, radius: patch.radius };
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornersToggleChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const showCorners = ev.detail.value.use_corners as boolean;
    this._appearance = { ...this._appearance, showCorners };
    if (!showCorners) {
      const { corners: _corners, ...rest } = this._config;
      this._config = rest;
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornerPresetChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const patch = cornerPresetPatch(ev.detail.value[key] as string);
    this._appearance = {
      ...this._appearance,
      cornerCustom: { ...this._appearance.cornerCustom, [key]: patch.custom },
    };
    if (patch.px !== undefined) {
      this._config = { ...this._config, corners: { ...(this._config.corners ?? {}), [key]: patch.px } };
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornerValueChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const px = ev.detail.value[key] as number;
    this._config = { ...this._config, corners: { ...(this._config.corners ?? {}), [key]: px } };
    fireEvent(this, "config-changed", { config: this._config });
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;
    const cfg = this._config;
    const rooms = cfg.rooms ?? [];

    const discoveryData = {
      auto_discover: cfg.auto_discover ?? !rooms.length,
      include_media_players: cfg.include_media_players ?? false,
      include_area: cfg.include_area ?? [],
      exclude_area: cfg.exclude_area ?? [],
      include_labels: cfg.include_labels ?? [],
      exclude_labels: cfg.exclude_labels ?? [],
      include_entities: cfg.include_entities ?? [],
      exclude_entities: cfg.exclude_entities ?? [],
      include_state: cfg.include_state ?? [],
      exclude_state: cfg.exclude_state ?? [],
    };

    const displayData = {
      name: cfg.name,
      icon: cfg.icon,
      view: cfg.view ?? "rooms",
      sort: cfg.sort ?? "name",
      show_header: cfg.show_header ?? true,
      show_count: cfg.show_count ?? true,
      shape_by_state: cfg.shape_by_state ?? false,
      show_area: cfg.show_area ?? true,
      hide_empty_rooms: cfg.hide_empty_rooms ?? false,
    };

    const animationData = { animation: cfg.animation ?? "auto" };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_content")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:text-short"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${displayData}
              .schema=${this._displaySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_entities")}>
          <ha-icon slot="leading-icon" icon="mdi:home-search-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${discoveryData}
              .schema=${this._discoverySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            ${rooms.map(
              (r, i) => html`
                <div class="override-row">
                  <div class="override-form">
                    <ha-form
                      .hass=${this.hass}
                      .data=${{
                        name: r.name,
                        icon: r.icon ?? "",
                        entities: r.entities ?? [],
                      }}
                      .schema=${this._roomSchema()}
                      .computeLabel=${this._computeLabel}
                      @value-changed=${(ev: CustomEvent) => this._roomChanged(i, ev)}
                    ></ha-form>
                  </div>
                  <button class="remove-btn" @click=${() => this._removeRoom(i)}>
                    <ha-icon icon="mdi:close"></ha-icon>
                  </button>
                </div>
              `,
            )}
            <button class="add-btn" @click=${() => this._addRoom()}>
              <ha-icon icon="mdi:plus"></ha-icon>
              ${this._t("editor_lights_add_room")}
            </button>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_lights_on_color"), cfg.on_color, (v) => this._colorChanged("on_color", v))}
            ${colorRow(this._t("editor_lights_off_color"), cfg.off_color, (v) => this._colorChanged("off_color", v))}
            ${opacityRow(this._t("editor_lights_tile_tint_opacity"), cfg.tile_tint_opacity, 12, (v) =>
              this._opacityChanged("tile_tint_opacity", v),
            )}
            ${colorRow(
              this._t("editor_lights_accent_color"),
              cfg.accent_color,
              (v) => this._colorChanged("accent_color", v),
              {
                label: this._t("editor_lights_accent_opacity"),
                value: cfg.accent_opacity,
                defaultValue: 12,
                onChange: (v) => this._opacityChanged("accent_opacity", v),
              },
            )}
            ${colorRow(this._t("editor_progress_text_color"), cfg.text_color, (v) => this._colorChanged("text_color", v))}
            ${colorRow(
              this._t("editor_progress_secondary_text_color"),
              cfg.secondary_text_color,
              (v) => this._colorChanged("secondary_text_color", v),
            )}
            ${colorRow(
              this._t("editor_progress_card_background"),
              cfg.card_background,
              (v) => this._colorChanged("card_background", v),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_animation")}>
          <ha-icon slot="leading-icon" icon="mdi:wave"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${animationData}
              .schema=${this._animationSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_progress_animation_reduced_motion_hint")}</div>
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: cfg,
          defaultRadius: DEFAULT_SWITCHES_OVERVIEW_RADIUS,
          state: this._appearance,
          computeLabel: this._computeLabel,
          onValueChanged: this._valueChanged.bind(this),
          onRadiusPresetChanged: this._radiusPresetChanged.bind(this),
          onCornersToggleChanged: this._cornersToggleChanged.bind(this),
          onCornerPresetChanged: this._cornerPresetChanged.bind(this),
          onCornerValueChanged: this._cornerValueChanged.bind(this),
        })}
      </div>
    `;
  }

  static styles = [
    editorStyles,
    css`
      .override-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      .override-form {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .remove-btn {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 8px;
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--primary-text-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .add-btn {
        width: 100%;
        height: 40px;
        border: none;
        border-radius: 8px;
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--primary-text-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 14px;
        font-family: inherit;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-switches-overview-card-editor": M3SwitchesOverviewCardEditor;
  }
}
