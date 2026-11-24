import { LitElement, html, css, nothing, unsafeCSS, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  M3LightsOverviewCardConfig,
  LightsOverviewPopupMode,
  HaActionConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_LIGHTS_OVERVIEW_RADIUS,
  DEFAULT_LIGHTS_OVERVIEW_ICON,
  LIGHTS_OVERVIEW_COLOR_ON,
  LIGHTS_OVERVIEW_FAN_COLOR,
  LIGHTS_OVERVIEW_COLOR_OFF,
  resolveCornerRadius,
  LIGHT_THROTTLE_MS,
} from "./const";
import { resolveThemeColor, buildCssVars, resolveCommonColors, tintOn, foregroundOn } from "./shared/color-config";
import { glassCardStyles, glassCardClass } from "./shared/glass-card";
import { renderCardHeader, cardHeaderStyles } from "./shared/card-header";
import { shouldAnimate } from "./shared/animation";
import { discoverLightRooms, overviewFanIds, type DiscoveredLightRoom } from "./shared/ha-registry";
import {
  buildStatePredicate,
  hasStateFilter,
  mergeEntityFilters,
  type EntityFilterConfig,
} from "./shared/entity-filter";
import { guessRoomIcon } from "./shared/room-icons";
import { TapHoldGesture } from "./shared/gestures";
import { runHaAction, navigateTo } from "./shared/actions";
import {
  syncPopupCardElement,
  syncDialogOpenState,
  renderPopupDialog,
  popupCardStyles,
  shouldCloseOnBackdropClick,
  type PopupCardHandle,
} from "./shared/popup-card";
import { DetailCardController } from "./shared/detail-card";
import type { CardTemplateTokens } from "./shared/card-template";
import { discoveryChangeMatters } from "./shared/should-update";
import { localize, type TranslationKey } from "./localize";
import { TemplatedCard } from "./shared/templated-card";
import { openEntityDetail } from "./shared/entity-detail";
import { DragThrottle } from "./shared/drag-throttle";
import { splitLightTurnOnTargets } from "./shared/light-brightness";
import { entityLevel, type EntityLevel } from "./shared/entity-level";
import { capturePointer, sliderPointer, SLIDER_TOUCH_ACTION } from "./shared/slider-intent";
import { binaryOverviewStyles } from "./shared/binary-overview-styles";
import { stopSwipe } from "./shared/swipe";

console.info(
  `%c M3-LIGHTS-OVERVIEW-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #f0c46e; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #f0c46e; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

type ActionKind = "tap" | "hold" | "double_tap";

interface LightsOverviewTile {
  key: string;
  name: string;
  icon: string;
  entities: string[];
  switchable: string[];
  onCount: number;
  total: number;
  unavailable: boolean;
  fanGroup?: boolean;
  areaId?: string;
  areaName?: string;
  /** Room name shown under an individual light, in the "entities" view. */
  secondary?: string;
}

// The 8-key subset every EntityFilterConfig consumer wants, pulled off the
// card config once — kept separate from the full config so the discovery
// dedup key (below) doesn't change on every unrelated edit (a color tweak,
// an action change), which would trigger a needless re-discovery.
function configFilter(config: M3LightsOverviewCardConfig): EntityFilterConfig {
  return {
    include_area: config.include_area,
    exclude_area: config.exclude_area,
    include_entities: config.include_entities,
    exclude_entities: config.exclude_entities,
    include_labels: config.include_labels,
    exclude_labels: config.exclude_labels,
    include_state: config.include_state,
    exclude_state: config.exclude_state,
  };
}

@customElement("m3-lights-overview-card")
export class M3LightsOverviewCard extends TemplatedCard(LitElement) implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3LightsOverviewCardConfig;
  @state() private _discovered: DiscoveredLightRoom[] = [];
  @state() private _popupTile?: LightsOverviewTile;
  @state() private _pressedKey?: string;
  @state() private _detailCardEl?: HTMLElement & PopupCardHandle;

  private _discoverInFlight = false;
  private _lastDiscoverKey?: string;
  private _gestures = new TapHoldGesture();
  private _popupOpenedAt = 0;
  private _popupCardEl?: HTMLElement & PopupCardHandle;
  private _popupCardKey?: string;
  private _detailCard = new DetailCardController();
  private _fanPopup = false;
  private readonly _levelDrags = new Map<string, { slider: HTMLElement; value: number; throttle: DragThrottle<number> }>();

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-lights-overview-card-editor");
    return document.createElement("m3-lights-overview-card-editor") as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): M3LightsOverviewCardConfig {
    return {
      type: "custom:m3-lights-overview-card",
      auto_discover: true,
      glass_background: true,
    };
  }

  public setConfig(config: M3LightsOverviewCardConfig): void {
    this._config = {
      glass_background: true,
      animation: "auto",
      auto_discover: config.rooms?.length ? false : true,
      sort: "name",
      show_count: true,
      show_fans: true,
      ...config,
    };
    this._lastDiscoverKey = undefined;
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
    for (const drag of this._levelDrags.values()) drag.throttle.clear();
    this._levelDrags.clear();
    this._closePopup();
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  /**
   * The toggle set's filter: the card's own display filter with the
   * `toggle_filter` override layered on, unless inheriting is switched off.
   * `exclude_toggle_entities` is a shorthand folded in here so both
   * spellings behave identically.
   */
  private _toggleFilter(): EntityFilterConfig {
    const cfg = this._config;
    if (!cfg) return {};
    const override: EntityFilterConfig = { ...(cfg.toggle_filter ?? {}) };
    if (cfg.exclude_toggle_entities?.length) {
      override.exclude_entities = [
        ...new Set([...(override.exclude_entities ?? []), ...cfg.exclude_toggle_entities]),
      ];
    }
    return mergeEntityFilters(configFilter(cfg), override, cfg.toggle_inherit_filters ?? true);
  }

  private _maybeDiscover(): void {
    const cfg = this._config;
    if (!this.hass || !cfg || cfg.rooms?.length || !(cfg.auto_discover ?? true) || this._discoverInFlight) {
      return;
    }
    const filter = configFilter(cfg);
    const toggleFilter = this._toggleFilter();
    const key = JSON.stringify({
      filter,
      toggleFilter,
      groupHandling: cfg.group_handling ?? "all",
      toggleGroupHandling: cfg.toggle_group_handling ?? cfg.group_handling ?? "all",
    });
    if (key === this._lastDiscoverKey) return;
    this._lastDiscoverKey = key;
    this._discoverInFlight = true;
    discoverLightRooms(this.hass, {
      domains: cfg.include_domains,
      filter,
      toggleFilter,
      groupHandling: cfg.group_handling,
      toggleGroupHandling: cfg.toggle_group_handling,
    })
      .then((rooms) => {
        this._discovered = rooms;
      })
      .catch((e) => console.error("m3-lights-overview-card: auto-discovery failed", e))
      .finally(() => {
        this._discoverInFlight = false;
      });
  }

  private _buildTiles(): LightsOverviewTile[] {
    if (!this.hass || !this._config) return [];
    const cfg = this._config;
    const hass = this.hass;
    const view = cfg.view ?? "rooms";
    const filter = configFilter(cfg);
    const toggleFilter = this._toggleFilter();
    // State changes far more often than area/label assignment, so unlike the
    // area filter this is re-evaluated live here rather than baked into
    // discovery — see discoverLightRooms' doc comment.
    const showState = buildStatePredicate(hass, filter);
    const toggleState = buildStatePredicate(hass, toggleFilter);
    const excludeToggleGlobal = new Set(cfg.exclude_toggle_entities ?? []);

    const isRoomEntity = (id: string) => this._fanPopup || !id.startsWith("fan.");
    const rooms = cfg.rooms?.length
      ? cfg.rooms.map((r, i) => {
          const exclude = new Set([...(r.exclude_toggle_entities ?? []), ...excludeToggleGlobal]);
          const toggleSource = r.toggle_entities ?? r.entities ?? [];
          return {
            key: `manual:${i}`,
            name: r.name,
            icon: r.icon,
            entities: (r.entities ?? []).filter(isRoomEntity).filter(showState),
            toggleEntities: toggleSource.filter(isRoomEntity).filter((id) => !exclude.has(id)).filter(toggleState),
            areaId: undefined as string | undefined,
          };
        })
      : this._discovered.map((r) => ({
          key: `area:${r.areaId}`,
          name: r.name,
          icon: r.icon,
          entities: r.entities.filter(showState),
          toggleEntities: r.toggleEntities.filter(toggleState),
          areaId: r.areaId as string | undefined,
        }));

    if (view === "entities") {
      const showArea = cfg.show_area !== false;
      return rooms.flatMap((room) => {
        const switchableSet = new Set(room.toggleEntities);
        return room.entities
          .filter((id) => !!hass.states[id])
          .map((id, index): LightsOverviewTile => {
            const st = hass.states[id];
            const on = st.state === "on";
            return {
              key: `${room.key}:entity:${id}:${index}`,
              name: (st.attributes.friendly_name as string | undefined) ?? id,
              icon: (st.attributes.icon as string | undefined) ?? (this._fanPopup
                ? (on ? "mdi:fan" : "mdi:fan-off")
                : (on ? "mdi:lightbulb" : "mdi:lightbulb-outline")),
              entities: [id],
              switchable: switchableSet.has(id) ? [id] : [],
              onCount: on ? 1 : 0,
              total: 1,
              unavailable: st.state === "unavailable" || st.state === "unknown",
              secondary: showArea ? room.name : undefined,
              areaName: room.name,
              areaId: room.areaId,
            };
          });
      });
    }

    // A room the display filter narrowed down to zero entities should
    // disappear even with hide_empty_rooms off — otherwise filtering by
    // e.g. include_state: ["on"] leaves a trail of empty tiles once every
    // light in a room turns off.
    const forceHideEmpty = hasStateFilter(filter);
    return rooms
      .map((room): LightsOverviewTile => {
        const entities = room.entities.filter((id) => !!hass.states[id]);
        const onCount = entities.filter((id) => hass.states[id]?.state === "on").length;
        return {
          key: room.key,
          name: room.name,
          icon: room.icon || guessRoomIcon(room.name),
          entities,
          switchable: room.toggleEntities.filter((id) => !!hass.states[id]),
          onCount,
          total: entities.length,
          unavailable: entities.length === 0,
          areaName: room.name,
          areaId: room.areaId,
        };
      })
      .filter((tile) => !((cfg.hide_empty_rooms || forceHideEmpty) && tile.total === 0));
  }

  private _fanIds(hass = this.hass): string[] {
    const cfg = this._config;
    return hass && cfg && cfg.show_fans !== false ? overviewFanIds(hass, cfg) : [];
  }

  private _fanTile(): LightsOverviewTile | undefined {
    const entities = this._fanIds();
    if (!entities.length) return undefined;
    const onCount = entities.filter((id) => this.hass?.states[id]?.state === "on").length;
    return {
      key: "fans",
      name: this._t("lights_overview_fans"),
      icon: onCount ? "mdi:fan" : "mdi:fan-off",
      entities,
      switchable: [],
      onCount,
      total: entities.length,
      unavailable: false,
      fanGroup: true,
    };
  }

  private _sortTiles(tiles: LightsOverviewTile[]): LightsOverviewTile[] {
    const sort = this._config?.sort ?? "name";
    if (sort === "on_first") {
      return [...tiles].sort(
        (a, b) => +(b.onCount > 0) - +(a.onCount > 0) || a.name.localeCompare(b.name, this._language),
      );
    }
    if (sort === "area") {
      return [...tiles].sort(
        (a, b) =>
          (a.areaName ?? "").localeCompare(b.areaName ?? "", this._language) ||
          a.name.localeCompare(b.name, this._language),
      );
    }
    return [...tiles].sort((a, b) => a.name.localeCompare(b.name, this._language));
  }

  // Any light on means the room reads as on, so a tap turns everything off —
  // a plain toggle would flip each lamp individually and leave a chequerboard.
  private _toggleRoom(tile: LightsOverviewTile): void {
    const hass = this.hass;
    if (!hass || tile.switchable.length === 0) return;
    if (tile.switchable.some((id) => hass.states[id]?.state === "on")) {
      hass.callService("homeassistant", "turn_off", {}, { entity_id: tile.switchable });
      return;
    }

    if (this._fanPopup) {
      hass.callService("homeassistant", "turn_on", {}, { entity_id: tile.switchable });
      return;
    }

    const { dimmable, remaining, brightness } = splitLightTurnOnTargets(
      tile.switchable,
      hass.states,
      this._config?.toggle_on_brightness,
    );
    if (dimmable.length) {
      hass.callService("light", "turn_on", { brightness_pct: brightness }, { entity_id: dimmable });
    }
    if (remaining.length) {
      hass.callService("homeassistant", "turn_on", {}, { entity_id: remaining });
    }
  }

  private _defaultAction(kind: ActionKind): HaActionConfig {
    if (kind === "tap") return { action: "toggle" };
    if (kind === "hold") return { action: (this._config?.view ?? "rooms") === "entities" ? "more-info" : "popup" };
    return { action: "none" };
  }

  private _resolveAction(kind: ActionKind): HaActionConfig {
    const cfg = this._config;
    const configured =
      kind === "tap" ? cfg?.tap_action : kind === "hold" ? cfg?.hold_action : cfg?.double_tap_action;
    return configured ?? this._defaultAction(kind);
  }

  private _runAction(tile: LightsOverviewTile, kind: ActionKind): void {
    if (!this.hass) return;
    if (tile.fanGroup) {
      if (kind !== "double_tap") this._openPopup(tile);
      return;
    }
    runHaAction(this.hass, this._resolveAction(kind), {
      source: this,
      entityId: tile.entities[0],
      toggle: () => this._toggleRoom(tile),
      openPopup: () => this._openPopup(tile),
      fireMoreInfo: (entityId) => openEntityDetail(this, entityId),
      navigate: (path) => navigateTo(this, path),
    });
  }

  private _closePopup(): void {
    this._popupTile = undefined;
    this._popupCardEl = undefined;
    this._popupCardKey = undefined;
    this._detailCardEl = undefined;
    this._detailCard.reset();
  }

  private _popupMode(): LightsOverviewPopupMode {
    return this._config?.popup?.mode ?? "default-grid";
  }

  private _openPopup(tile: LightsOverviewTile): void {
    // "default-detail" isn't a card popup at all — it's HA's own more-info
    // dialog for the tile's first entity, so the internal <dialog> never opens.
    if (!tile.fanGroup && this._popupMode() === "default-detail") {
      openEntityDetail(this, tile.entities[0]);
      return;
    }
    this._popupOpenedAt = Date.now();
    this._popupTile = tile;
  }

  /** Context handed to a configured `popup.card` skeleton's `[[token]]`
   * placeholders — see shared/card-template.ts. */
  private _tileTokens(tile: LightsOverviewTile): CardTemplateTokens {
    return {
      area_id: tile.areaId,
      entity_id: tile.switchable[0] ?? tile.entities[0],
      name: tile.name,
    };
  }

  // Drives the async `popup.card` build/reuse cycle — called from updated()
  // since createCardElement() is async and render() must stay synchronous.
  private _maybeSyncDetailCard(): void {
    const tile = this._popupTile;
    const skeleton = this._popupMode() === "custom" ? this._config?.popup?.card : undefined;
    if (!tile || tile.fanGroup || !this.hass || !skeleton) {
      this._detailCard.reset();
      return;
    }
    this._detailCard.sync({
      skeleton,
      tokens: this._tileTokens(tile),
      hass: this.hass,
      onChange: (el) => {
        this._detailCardEl = el;
      },
    });
  }

  /**
   * The popup is this same card again, scoped to what was pressed. A
   * discovered tile scopes by area; a manually configured room has no area,
   * so it scopes by its explicit entity list instead — same filter
   * vocabulary either way.
   */
  private _popupConfig(tile: LightsOverviewTile): M3LightsOverviewCardConfig | undefined {
    const cfg = this._config;
    if (!cfg) return undefined;
    if (tile.fanGroup) {
      return {
        ...cfg,
        name: tile.name,
        icon: "mdi:fan",
        rooms: [{ name: tile.name, entities: this._fanIds() }],
        auto_discover: false,
        view: "entities",
        show_fans: false,
        show_area: false,
        show_header: true,
        show_brightness_slider: true,
        include_state: undefined,
        exclude_state: undefined,
        exclude_toggle_entities: undefined,
        toggle_filter: undefined,
        tap_action: { action: "toggle" },
        hold_action: { action: "more-info" },
        double_tap_action: undefined,
        popup: undefined,
        glass_background: false,
      };
    }
    const popup = cfg.popup ?? {};
    const merged = mergeEntityFilters(configFilter(cfg), popup, popup.inherit_filters ?? true);
    // A tile from an area re-runs discovery scoped to that area, which also
    // picks up anything added to the room since. A tile from a manual `rooms`
    // entry cannot: discovery drops entities that have no area, and a manual
    // room is exactly where those live — the popup came up empty. It already
    // knows its own entities, so it hands them over as a room of one instead
    // of asking the registry a question it cannot answer.
    const scoped: Partial<M3LightsOverviewCardConfig> = tile.areaId
      ? { include_area: [tile.areaId], rooms: undefined, auto_discover: true }
      : {
          rooms: [
            { name: tile.name, entities: tile.entities, toggle_entities: tile.entities },
          ],
          auto_discover: false,
        };
    const view = popup.view ?? "entities";
    return {
      ...cfg,
      ...merged,
      ...scoped,
      exclude_toggle_entities: undefined,
      toggle_filter: undefined,
      toggle_inherit_filters: undefined,
      view,
      show_fans: false,
      sort: popup.sort ?? "name",
      group_handling: popup.group_handling ?? cfg.group_handling,
      toggle_group_handling: view === "entities" ? undefined : popup.toggle_group_handling,
      show_area: popup.show_area ?? false,
      show_brightness_slider: popup.show_brightness_slider ?? true,
      // The popup's header carries the room name, so it stays unless the
      // popup config says otherwise — inheriting a hidden header would leave
      // the dialog with nothing identifying it.
      show_header: popup.show_header ?? true,
      name: popup.title || tile.name,
      // A popup inside a popup would be a trap with no way out.
      tap_action: { action: "toggle" },
      hold_action: { action: "more-info" },
      double_tap_action: undefined,
      popup: undefined,
      glass_background: false,
      type: "custom:m3-lights-overview-card",
    };
  }

  private _syncScopedPopupCard(tile: LightsOverviewTile): HTMLElement | undefined {
    const { el, key } = syncPopupCardElement<M3LightsOverviewCardConfig>({
      tagName: "m3-lights-overview-card",
      config: this._popupConfig(tile),
      hass: this.hass,
      existingEl: this._popupCardEl,
      existingKey: this._popupCardKey,
    });
    if (el instanceof M3LightsOverviewCard) el._fanPopup = !!tile.fanGroup;
    this._popupCardEl = el;
    this._popupCardKey = key;
    return this._popupCardEl;
  }

  private _renderPopup() {
    const tile = this._popupTile;
    if (!tile) {
      this._popupCardEl = undefined;
      this._popupCardKey = undefined;
      return nothing;
    }
    const content = !tile.fanGroup && this._popupMode() === "custom"
      ? this._detailCardEl
      : this._syncScopedPopupCard(tile);

    return renderPopupDialog({
      content,
      onClose: () => this._closePopup(),
      onBackdropClick: (e) => {
        if (shouldCloseOnBackdropClick(e, this._popupOpenedAt)) this._closePopup();
      },
      closeLabel: this._t("dialog_close"),
    });
  }

  private _watchedEntities(): (string | undefined)[] {
    const cfg = this._config;
    if (!cfg) return [];
    if (cfg.rooms?.length) {
      return cfg.rooms.flatMap((r) => [...(r.entities ?? []), ...(r.toggle_entities ?? r.entities ?? [])]);
    }
    return this._discovered.flatMap((r) => [...r.entities, ...r.toggleEntities]);
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    const previous = changed.get("hass") as HomeAssistant | undefined;
    if (this._config?.show_fans !== false && previous && this.hass
      && (previous.entities !== this.hass.entities || previous.devices !== this.hass.devices)) return true;
    return discoveryChangeMatters(changed, this.hass, [
      ...this._watchedEntities(),
      ...this._fanIds(),
      ...(previous ? this._fanIds(previous) : []),
    ]);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    for (const [id, drag] of this._levelDrags) {
      if (drag.slider.isConnected) continue;
      drag.throttle.clear();
      this._levelDrags.delete(id);
    }
    this._maybeDiscover();
    if (this._popupCardEl && this.hass) this._popupCardEl.hass = this.hass;
    this._maybeSyncDetailCard();
    if (changed.has("_popupTile")) {
      const dialog = this.renderRoot?.querySelector("dialog") as HTMLDialogElement | null;
      syncDialogOpenState(dialog, !!this._popupTile);
    }
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;

    const view = this._config.view ?? "rooms";
    const tiles = this._sortTiles(this._buildTiles());
    const fans = this._fanTile();
    const onRooms = tiles.filter((t) => t.onCount > 0).length;
    const onLights = tiles.reduce((sum, t) => sum + t.onCount, 0);

    const name = this._config.name || this._t("lights_overview_default_name");
    const icon = this._config.icon || (view === "entities" ? "mdi:lightbulb-multiple" : DEFAULT_LIGHTS_OVERVIEW_ICON);
    const emptyKey: TranslationKey = view === "entities" ? "lights_overview_empty_entities" : "lights_overview_empty";
    const lightsSubtitle =
      tiles.length === 0 && !fans
        ? this._t(emptyKey)
        : view === "entities"
          ? this._t("lights_overview_subtitle_entities")
              .replace("{on}", String(onLights))
              .replace("{total}", String(tiles.length))
          : this._t("lights_overview_subtitle")
              .replace("{rooms}", String(onRooms))
              .replace("{lights}", String(onLights));

    const subtitle = fans
      ? `${lightsSubtitle} · ${this._t(fans.onCount === 1 ? "lights_overview_fan_on" : "lights_overview_fans_on")
          .replace("{count}", String(fans.onCount))}`
      : lightsSubtitle;

    const fanColor = this._config.fan_color ? resolveThemeColor(this._config.fan_color) : LIGHTS_OVERVIEW_FAN_COLOR;
    const lightColor = this._config.on_color ? resolveThemeColor(this._config.on_color) : LIGHTS_OVERVIEW_COLOR_ON;
    const onColor = this._fanPopup ? fanColor : lightColor;
    const offColor = this._config.off_color ? resolveThemeColor(this._config.off_color) : LIGHTS_OVERVIEW_COLOR_OFF;
    const accentColor = this._config.accent_color ? resolveThemeColor(this._config.accent_color) : onColor;

    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(this._config);
    const radius = resolveCornerRadius(this._config.radius ?? DEFAULT_LIGHTS_OVERVIEW_RADIUS, this._config.corners);
    const animClass = shouldAnimate(this._config.animation) ? "" : "no-animations";

    const iconWellCss = tintOn(this, accentColor, this._config.accent_opacity, 12);
    const cssVars = buildCssVars({
      "m3p-icon-color": foregroundOn(accentColor, iconWellCss),
      "m3p-icon-bg": iconWellCss,
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
    });

    return html`
      <ha-card style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)} ${animClass}"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          ${this._config.show_header === false ? nothing : renderCardHeader({ icon, name, subtitle })}

          ${tiles.length === 0 && !fans
            ? html`<div class="empty-state">${this._t(emptyKey)}</div>`
            : html`
                <div class="room-grid ${view === "entities" ? "entity-grid" : ""}">
                  ${fans ? this._renderTile(fans, fanColor, offColor) : nothing}
                  ${view === "entities" && this._config.show_brightness_slider
                    ? repeat(tiles, (tile) => tile.key, (tile) => this._renderTile(tile, onColor, offColor))
                    : tiles.map((tile) => this._renderTile(tile, onColor, offColor))}
                </div>
              `}
        </div>
        ${this._renderPopup()}
      </ha-card>
    `;
  }

  private _renderTile(tile: LightsOverviewTile, onColor: string, offColor: string) {
    const hasDoubleTap = !tile.fanGroup && (this._config?.double_tap_action?.action ?? "none") !== "none";
    const holdAction = this._resolveAction("hold");
    const listeners = this._gestures.listeners({
      onTap: () => this._runAction(tile, "tap"),
      onHold: tile.fanGroup || holdAction.action !== "none" ? () => this._runAction(tile, "hold") : undefined,
      onDoubleTap: hasDoubleTap ? () => this._runAction(tile, "double_tap") : undefined,
      onPressChange: (pressed) => {
        this._pressedKey = pressed ? tile.key : undefined;
      },
    });
    const on = tile.onCount > 0;
    const color = on ? onColor : offColor;
    const background = tintOn(this, color, this._config?.tile_tint_opacity, on ? 20 : 10);
    const stateIcon = tile.fanGroup || this._fanPopup
      ? (on ? "mdi:fan" : "mdi:fan-off")
      : (on ? "mdi:lightbulb-on" : "mdi:lightbulb-outline");
    const stateLabel = on ? this._t("lights_overview_on") : this._t("lights_overview_off");
    const ariaLabel = `${tile.name}: ${stateLabel}`;

    const body = html`
      <div
        class="room-tile ${tile.unavailable ? "unavailable" : ""} ${!tile.fanGroup && tile.switchable.length === 0
          ? "not-switchable"
          : ""} ${on ? "is-on" : ""} ${this._pressedKey === tile.key ? "pressed" : ""} ${this._config?.shape_by_state === true
          ? "shaped"
          : ""}"
        style=${`--tile-color: ${color}; background: ${background};`}
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
          <ha-icon icon=${tile.icon}></ha-icon>
          <span class="tile-name">${tile.name}</span>
        </div>
        <div class="tile-state">
          <ha-icon class="state-icon" icon=${stateIcon}></ha-icon>
          <span class="state-text">${stateLabel}</span>
          ${tile.secondary
            ? html`<span class="tile-secondary" title=${tile.secondary}>${tile.secondary}</span>`
            : this._config?.show_count !== false && (tile.fanGroup || tile.total > 1)
              ? html`<span class="tile-secondary">
                  ${this._t("lights_overview_count")
                    .replace("{on}", String(tile.onCount))
                    .replace("{total}", String(tile.total))}
                </span>`
              : nothing}
        </div>
      </div>
    `;
    const entity = !tile.fanGroup && this._config?.view === "entities" && this._config.show_brightness_slider
      ? this.hass?.states[tile.entities[0]]
      : undefined;
    const level = entity && entityLevel(entity);
    if (!entity || !level) return body;
    const offFan = level.domain === "fan" && !on;

    return html`
      <div class="tile-with-slider">
        ${body}
        ${this._renderLevelSlider(entity.entity_id, level, tile.name, tile.unavailable,
          offFan ? background : color, offFan ? background : undefined)}
      </div>
    `;
  }

  private _setLevel(entityId: string, level: EntityLevel, percent: number): void {
    const entity = this.hass?.states[entityId];
    if (!entity || entity.state === "unavailable" || entity.state === "unknown") return;
    this.hass?.callService(level.domain, level.service, { [level.field]: percent }, { entity_id: entityId });
  }

  private _renderLevelSlider(
    id: string, level: EntityLevel, name: string, unavailable: boolean, color: string,
    trackColor = "color-mix(in srgb, var(--slider-color) 20%, transparent)",
  ) {
    const percent = this._levelDrags.get(id)?.value ?? level.value;
    const percentAt = (e: PointerEvent): number => {
      const track = (e.currentTarget as HTMLElement).firstElementChild!;
      const rect = track.getBoundingClientRect();
      return level.snap(rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * 100 : 0);
    };
    const pointer = sliderPointer({
      down: (e) => {
        if (unavailable || this._levelDrags.has(id)) return;
        e.preventDefault();
        const slider = e.currentTarget as HTMLElement;
        slider.focus();
        capturePointer(slider, e);
        const value = percentAt(e);
        const throttle = new DragThrottle<number>((pct) => this._setLevel(id, level, pct), LIGHT_THROTTLE_MS);
        this._levelDrags.set(id, { slider, value, throttle });
        throttle.call(value);
        this.requestUpdate();
      },
      move: (e) => {
        const drag = this._levelDrags.get(id);
        if (!drag || drag.slider !== e.currentTarget) return;
        const value = percentAt(e);
        if (value === drag.value) return;
        drag.value = value;
        drag.throttle.call(value);
        this.requestUpdate();
      },
      up: (e) => {
        const drag = this._levelDrags.get(id);
        if (!drag || drag.slider !== e.currentTarget) return;
        this._levelDrags.delete(id);
        drag.throttle.flush(e.type === "pointerup" ? percentAt(e) : drag.value);
        this.requestUpdate();
      },
    });
    const onKey = (e: KeyboardEvent): void => {
      const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? level.step
        : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -level.step : 0;
      if (unavailable || step === 0) return;
      e.preventDefault();
      e.stopPropagation();
      this._setLevel(id, level, level.snap(percent + step));
    };

    return html`
      <div
        class="brightness-slider"
        role="slider"
        aria-label=${`${name}: ${this._t(level.label)}`}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${percent}
        aria-valuetext=${`${percent}%`}
        aria-disabled=${unavailable ? "true" : "false"}
        tabindex=${unavailable ? -1 : 0}
        style=${`--slider-color: ${color}; --slider-track-color: ${trackColor}; --brightness: ${percent}%;`}
        @pointerdown=${(e: PointerEvent) => {
          e.stopPropagation();
          if (e.isPrimary && e.button === 0 && !unavailable) pointer.down(e);
        }}
        @pointermove=${(e: PointerEvent) => {
          e.stopPropagation();
          pointer.move(e);
        }}
        @pointerup=${(e: PointerEvent) => {
          e.stopPropagation();
          pointer.up(e);
        }}
        @pointercancel=${(e: PointerEvent) => {
          e.stopPropagation();
          pointer.cancel(e);
        }}
        @lostpointercapture=${(e: PointerEvent) => {
          // Touch first captures the track implicitly. Its capture loss bubbles
          // here when we transfer capture to the slider to continue the drag.
          if (e.target === e.currentTarget) pointer.cancel(e);
        }}
        @click=${stopSwipe}
        @contextmenu=${stopSwipe}
        @touchstart=${stopSwipe}
        @touchmove=${stopSwipe}
        @touchend=${stopSwipe}
        @touchcancel=${stopSwipe}
        @mousedown=${stopSwipe}
        @mousemove=${stopSwipe}
        @mouseup=${stopSwipe}
        @keydown=${onKey}
      >
        <div class="brightness-track"></div>
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    cardHeaderStyles,
    popupCardStyles,
    binaryOverviewStyles,
    css`
      .tile-with-slider {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .tile-with-slider .room-tile {
        flex: 1;
      }

      .brightness-slider {
        display: flex;
        align-items: center;
        position: relative;
        margin-top: 2px;
        min-height: 36px;
        border-radius: 999px;
        cursor: ew-resize;
        touch-action: ${unsafeCSS(SLIDER_TOUCH_ACTION)};
      }

      .brightness-slider[aria-disabled="true"] {
        opacity: 0.4;
        cursor: default;
      }

      .brightness-slider:focus-visible {
        outline: 2px solid var(--slider-color);
      }

      .brightness-track {
        width: 100%;
        height: 32px;
        overflow: hidden;
        border-radius: inherit;
        background: var(--slider-track-color);
      }

      .brightness-track::before {
        content: "";
        display: block;
        width: var(--brightness);
        height: 100%;
        border-radius: inherit;
        background: var(--slider-color);
      }

    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-lights-overview-card": M3LightsOverviewCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-lights-overview-card",
  name: "M3 Lights Overview Card",
  description: "Eine Material-3-Übersicht aller Lichter, automatisch nach Bereich gruppiert.",
  // false: auto_discover would otherwise run full-house discovery in HA's
  // card picker preview — see m3-battery-card.ts for the full rationale.
  preview: false,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
