import { LitElement, html, nothing, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  M3SwitchesOverviewCardConfig,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_SWITCHES_OVERVIEW_RADIUS,
  LIGHTS_OVERVIEW_COLOR_OFF,
  SWITCHES_OVERVIEW_COLOR_ON,
  resolveCornerRadius,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { shouldAnimate } from "./shared/animation";
import { binaryOverviewStyles } from "./shared/binary-overview-styles";
import { renderCardHeader, cardHeaderStyles } from "./shared/card-header";
import { resolveThemeColor, buildCssVars, resolveCommonColors, tintOn, foregroundOn } from "./shared/color-config";
import { buildStatePredicate, hasStateFilter } from "./shared/entity-filter";
import { glassCardStyles, glassCardClass } from "./shared/glass-card";
import { TapHoldGesture } from "./shared/gestures";
import { discoverLightRooms, type DiscoveredLightRoom } from "./shared/ha-registry";
import {
  syncDialogOpenState,
  renderPopupDialog,
  popupCardStyles,
  shouldCloseOnBackdropClick,
} from "./shared/popup-card";
import { discoveryChangeMatters } from "./shared/should-update";
import { SWITCH_OVERVIEW_DOMAINS, isOverviewSwitch, switchOverviewTap } from "./shared/switches-overview";
import { TemplatedCard } from "./shared/templated-card";

console.info(
  `%c M3-SWITCHES-OVERVIEW-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #4caf50; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #4caf50; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

interface SwitchRoom {
  key: string;
  name: string;
  icon?: string;
  entities: string[];
}

interface SwitchTile extends SwitchRoom {
  onCount: number;
  unavailable: boolean;
  areaName?: string;
}

const SWITCH_ON_ICON = "mdi:toggle-switch";
const SWITCH_OFF_ICON = "mdi:toggle-switch-off-outline";

type Registries = Pick<HomeAssistant, "entities" | "devices" | "areas">;

function sameRegistries(a: Registries, b: Registries): boolean {
  return a.entities === b.entities && a.devices === b.devices && a.areas === b.areas;
}

@customElement("m3-switches-overview-card")
export class M3SwitchesOverviewCard extends TemplatedCard(LitElement) implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3SwitchesOverviewCardConfig;
  @state() private _discovered: DiscoveredLightRoom[] = [];
  @state() private _popup?: Pick<SwitchTile, "key" | "name">;
  @state() private _pressedKey?: string;

  private _discovery?: { key: string; registries: Registries };
  private _gestures = new TapHoldGesture();
  private _popupOpenedAt = 0;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-switches-overview-card-editor");
    return document.createElement("m3-switches-overview-card-editor");
  }

  public static getStubConfig(): M3SwitchesOverviewCardConfig {
    return { type: "custom:m3-switches-overview-card", auto_discover: true, glass_background: true };
  }

  public setConfig(config: M3SwitchesOverviewCardConfig): void {
    this._config = { glass_background: true, animation: "auto", ...config };
    this._discovery = undefined;
    this._discovered = [];
    this._closePopup();
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto", min_rows: 3 };
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._gestures.cancel();
    this._pressedKey = undefined;
    this._closePopup();
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _maybeDiscover(): void {
    const hass = this.hass;
    const cfg = this._config;
    if (!hass || !cfg || cfg.rooms?.length || cfg.auto_discover === false) {
      if (this._discovery) {
        this._discovery = undefined;
        this._discovered = [];
      }
      return;
    }

    const filter = {
      include_area: cfg.include_area,
      exclude_area: cfg.exclude_area,
      include_labels: cfg.include_labels,
      exclude_labels: cfg.exclude_labels,
      include_entities: cfg.include_entities,
      exclude_entities: cfg.exclude_entities,
    };
    const ids = Object.keys(hass.states).filter(isOverviewSwitch);
    const key = JSON.stringify([filter, ids]);
    if (key === this._discovery?.key && sameRegistries(hass, this._discovery.registries)) return;
    const { entities, devices, areas } = hass;
    const discovery = { key, registries: { entities, devices, areas } };
    this._discovery = discovery;

    discoverLightRooms(hass, { domains: [...SWITCH_OVERVIEW_DOMAINS], filter })
      .then((rooms) => {
        if (this._discovery === discovery) this._discovered = rooms;
      })
      .catch((error) => {
        if (this._discovery !== discovery) return;
        this._discovery = undefined;
        console.error("m3-switches-overview-card: auto-discovery failed", error);
      });
  }

  private _rooms(hass: HomeAssistant, cfg: M3SwitchesOverviewCardConfig): SwitchTile[] {
    const include = new Set(cfg.include_entities);
    const exclude = new Set(cfg.exclude_entities);
    const showState = buildStatePredicate(hass, cfg);
    const rooms: SwitchRoom[] = cfg.rooms?.length
      ? cfg.rooms.map((room, index) => ({
          ...room,
          key: `manual:${index}`,
          entities: [...new Set(room.entities)].filter(
            (id) => isOverviewSwitch(id) && !exclude.has(id) && (!include.size || include.has(id)),
          ),
        }))
      : this._discovered.map((room) => ({ ...room, key: `area:${room.areaId}` }));

    return rooms.map((room) => {
      const entities = room.entities.filter((id) => hass.states[id] && showState(id));
      return {
        ...room,
        entities,
        onCount: entities.filter((id) => hass.states[id].state === "on").length,
        unavailable: entities.length === 0,
      };
    });
  }

  private _entityTiles(hass: HomeAssistant, room: SwitchTile): SwitchTile[] {
    return room.entities.map((id) => {
      const { attributes, state } = hass.states[id];
      return {
        key: `${room.key}:${id}`,
        name: (attributes.friendly_name as string | undefined) ?? id,
        icon: attributes.icon as string | undefined,
        areaName: room.name,
        entities: [id],
        onCount: state === "on" ? 1 : 0,
        unavailable: state === "unavailable" || state === "unknown",
      };
    });
  }

  private _sortTiles(tiles: SwitchTile[]): SwitchTile[] {
    const byName = (a: SwitchTile, b: SwitchTile) => a.name.localeCompare(b.name, this._language);
    switch (this._config?.sort) {
      case "on_first":
        return tiles.sort((a, b) => Number(b.onCount > 0) - Number(a.onCount > 0) || byName(a, b));
      case "area":
        return tiles.sort((a, b) => (a.areaName ?? a.name).localeCompare(b.areaName ?? b.name, this._language) || byName(a, b));
      default:
        return tiles.sort(byName);
    }
  }

  private _tap(tile: SwitchTile): void {
    const tap = switchOverviewTap(tile.entities);
    if (tap.action === "popup") this._openPopup(tile);
    if (tap.action === "toggle") {
      const state = this.hass?.states[tap.entityId]?.state;
      if (state === "on" || state === "off") {
        this.hass?.callService("homeassistant", "toggle", {}, { entity_id: tap.entityId });
      }
    }
  }

  private _openPopup(tile: SwitchTile): void {
    this._popupOpenedAt = Date.now();
    this._popup = { key: tile.key, name: tile.name };
  }

  private _closePopup(): void {
    this._popup = undefined;
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    const previous = changed.get("hass") as HomeAssistant | undefined;
    if (previous && this.hass && !sameRegistries(previous, this.hass)) return true;
    const entities = this._config?.rooms?.length
      ? this._config.rooms.flatMap((room) => room.entities ?? [])
      : this._discovered.flatMap((room) => room.entities);
    return discoveryChangeMatters(changed, this.hass, entities);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (!changed.size || changed.has("hass") || changed.has("_config")) this._maybeDiscover();
    if (changed.has("_popup")) syncDialogOpenState(this.renderRoot.querySelector("dialog"), !!this._popup);
  }

  protected render() {
    const cfg = this._config;
    const hass = this.hass;
    if (!cfg || !hass) return nothing;

    const rooms = this._rooms(hass, cfg);
    const entityView = cfg.view === "entities";
    const entityTiles = entityView ? rooms.flatMap((room) => this._entityTiles(hass, room)) : [];
    const hideEmpty = cfg.hide_empty_rooms || hasStateFilter(cfg);
    const tiles = this._sortTiles(entityView ? entityTiles : rooms.filter((room) => !hideEmpty || room.entities.length));
    const onRooms = rooms.filter((room) => room.onCount > 0).length;
    const onSwitches = rooms.reduce((sum, room) => sum + room.onCount, 0);
    const roomCount = this._t(onRooms === 1 ? "switches_overview_room" : "switches_overview_rooms");
    const switchCount = this._t(onSwitches === 1 ? "switches_overview_switch_on" : "switches_overview_switches_on");
    const subtitle = tiles.length
      ? entityView
        ? this._t("lights_overview_subtitle_entities").replace("{on}", String(onSwitches)).replace("{total}", String(tiles.length))
        : `${roomCount.replace("{count}", String(onRooms))} · ${switchCount.replace("{count}", String(onSwitches))}`
      : this._t("switches_overview_empty");

    const onColor = cfg.on_color ? resolveThemeColor(cfg.on_color) : SWITCHES_OVERVIEW_COLOR_ON;
    const offColor = cfg.off_color ? resolveThemeColor(cfg.off_color) : LIGHTS_OVERVIEW_COLOR_OFF;
    const accentColor = cfg.accent_color ? resolveThemeColor(cfg.accent_color) : onColor;
    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(cfg);
    const radius = resolveCornerRadius(cfg.radius ?? DEFAULT_SWITCHES_OVERVIEW_RADIUS, cfg.corners);
    const animClass = shouldAnimate(cfg.animation) ? "" : "no-animations";
    const iconWellCss = tintOn(this, accentColor, cfg.accent_opacity, 12);
    const cssVars = buildCssVars({
      "m3p-icon-color": foregroundOn(accentColor, iconWellCss),
      "m3p-icon-bg": iconWellCss,
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
    });

    const popup = this._popup;
    const popupRoom = popup && rooms.find((room) => room.key === popup.key);
    const popupEntity = popup && entityTiles.find((tile) => tile.key === popup.key);
    const popupTiles = this._sortTiles(popupRoom ? this._entityTiles(hass, popupRoom) : popupEntity ? [popupEntity] : []);
    return html`
      <ha-card class=${animClass} style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(cfg.glass_background)}"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          ${cfg.show_header === false ? nothing : renderCardHeader({
            icon: cfg.icon || (onSwitches ? SWITCH_ON_ICON : SWITCH_OFF_ICON),
            name: cfg.name || this._t("switches_overview_default_name"),
            subtitle,
          })}
          ${this._renderGrid(tiles, onColor, offColor, entityView, false)}
        </div>
        ${popup ? renderPopupDialog({
          title: popup.name,
          content: this._renderGrid(popupTiles, onColor, offColor, true, true),
          onClose: () => this._closePopup(),
          onBackdropClick: (event) => {
            if (shouldCloseOnBackdropClick(event, this._popupOpenedAt)) this._closePopup();
          },
          closeLabel: this._t("dialog_close"),
        }) : nothing}
      </ha-card>
    `;
  }

  private _renderGrid(tiles: SwitchTile[], onColor: string, offColor: string, entityView: boolean, inPopup: boolean) {
    return tiles.length
      ? html`<div class="room-grid ${entityView ? "entity-grid" : ""}">
          ${repeat(tiles, (tile) => tile.key, (tile) => this._renderTile(tile, tile.onCount ? onColor : offColor, inPopup))}
        </div>`
      : html`<div class="empty-state">${this._t("switches_overview_empty")}</div>`;
  }

  private _renderTile(tile: SwitchTile, color: string, inPopup: boolean) {
    const cfg = this._config;
    const on = tile.onCount > 0;
    const stateIcon = on ? SWITCH_ON_ICON : SWITCH_OFF_ICON;
    const stateLabel = this._t(on ? "lights_overview_on" : "lights_overview_off");
    const ariaLabel = `${tile.name}: ${stateLabel}`;
    const listeners = this._gestures.listeners({
      onTap: () => this._tap(tile),
      onHold: inPopup ? undefined : () => this._openPopup(tile),
      onPressChange: (pressed) => {
        this._pressedKey = pressed ? tile.key : undefined;
      },
    });
    const caption = tile.areaName
      ? !inPopup && cfg?.show_area !== false ? tile.areaName : undefined
      : cfg?.show_count !== false
        ? this._t("lights_overview_count").replace("{on}", String(tile.onCount)).replace("{total}", String(tile.entities.length))
        : undefined;

    return html`
      <div
        class="room-tile ${tile.unavailable ? "unavailable" : ""} ${on ? "is-on" : ""}
          ${this._pressedKey === tile.key ? "pressed" : ""} ${cfg?.shape_by_state ? "shaped" : ""}"
        style=${`--tile-color: ${color}; background: ${tintOn(this, color, cfg?.tile_tint_opacity, on ? 20 : 10)};`}
        role="button"
        tabindex="0"
        aria-label=${ariaLabel}
        title=${ariaLabel}
        @pointerdown=${listeners["@pointerdown"]}
        @pointermove=${listeners["@pointermove"]}
        @pointerup=${listeners["@pointerup"]}
        @pointercancel=${listeners["@pointercancel"]}
        @contextmenu=${listeners["@contextmenu"]}
        @keydown=${listeners["@keydown"]}
      >
        <div class="tile-header">
          <ha-icon icon=${tile.icon || stateIcon}></ha-icon>
          <span class="tile-name">${tile.name}</span>
        </div>
        <div class="tile-state">
          <ha-icon class="state-icon" icon=${stateIcon}></ha-icon>
          <span class="state-text">${stateLabel}</span>
          ${caption ? html`<span class="tile-secondary" title=${caption}>${caption}</span>` : nothing}
        </div>
      </div>
    `;
  }

  static styles = [glassCardStyles, cardHeaderStyles, popupCardStyles, binaryOverviewStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-switches-overview-card": M3SwitchesOverviewCard;
  }
}

const windowWithCards = window as unknown as { customCards: Array<Record<string, unknown>> };
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-switches-overview-card",
  name: "M3 Switches Overview Card",
  description: "A Material 3 overview of switches and input booleans grouped by area.",
  preview: false,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
