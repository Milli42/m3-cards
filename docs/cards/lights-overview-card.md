---
title: M3 Lights Overview Card
type: m3-lights-overview-card
category: light
display: Lights Overview
summary: Every light grouped by area, with separate display and toggle filters
table_order: 4
section_order: 36
---

A room-by-room light overview, on the same pattern as Climate Overview above
(the two are meant to sit stacked on a dashboard): one tile per room with its
on/off state and count, or a flat list of every light. A tap toggles the
room's lights; hold opens a popup.

<img src="docs/images/lights-overview-card.png" alt="Lights Overview Card" width="440">
<img src="docs/images/lights-overview-card-popup.png" alt="Lights Overview Card, popup" width="440">

<details>
<summary>Configuration, examples & options</summary>

```yaml
type: custom:m3-lights-overview-card
auto_discover: true
```

### Entity source and room grouping

- **`auto_discover: true`** (default): finds every `light` entity assigned to
  a Home Assistant **area** and groups it into that area's tile. Unlike
  Climate Overview, a light with no area is dropped rather than becoming its
  own tile — a room-by-room overview has nothing useful to show for a light
  it can't group. Filter with `include_area` / `exclude_entities` /
  `include_labels` / `exclude_labels` / `include_state` / `exclude_state`.
- **`rooms`**: a manual list (`name`, `icon`, `entities`, `toggle_entities`)
  instead of auto-discovery.
- **`view`**: `rooms` (default, one tile per room) or `entities` (one tile
  per light, with the room name as a caption).
- **`group_handling`**: when a `light.group` and its members would otherwise
  both count as separate lights in the same room, drop one side —
  `prefer_groups` counts only the group, `prefer_members` only the members.
  Default `all` counts both.

### Fans

When fans are available, the first tile shows how many are on. Fans are
discovered across the whole home, including entities without an area.
`exclude_entities` and `exclude_labels` apply to fans independently of the
room filters. Set `fans` to an explicit list of entity IDs to replace fan
discovery, or set `show_fans: false` to hide the tile. The header shows the
number of fans on alongside the room and light counts.

Tap or hold the Fans tile to open its fan controls. Tap an individual fan
to toggle it. Fans with adjustable speed get a pill slider that follows
their reported speed steps. Dragging the slider turns an off fan on at the
selected speed. `fan_color` sets the active color of the Fans tile and
individual fan tiles, and colors the speed sliders. `toggle_on_brightness`
applies only to lights.

### What's shown vs. what a tap switches

A tile's on/off state and count reflect every light the display filter above
lets through. What a **tap** actually switches can be narrower: set
`toggle_filter` (same vocabulary as the display filter) to switch only a
subset, or `exclude_toggle_entities` as a shorthand for "show it, but don't
switch it" on specific entities — useful for a light on a schedule or a
scene-only fixture that should be visible but not part of the room-wide
toggle. `toggle_inherit_filters: false` makes `toggle_filter` stand alone
instead of narrowing the display filter. A manual room's `toggle_entities`
defaults to its `entities`.

Every visible light in the default grid popup's entity view can be toggled
individually, even if a global or manual room exclusion, `toggle_filter`, or
`toggle_entities` keeps it out of the main room toggle.

### Tap, hold and the popup

Same action system as Climate Overview: `tap_action` (default `toggle`) /
`hold_action` (default `popup`, or `more-info` in `entities` view) /
`double_tap_action`, with `popup.mode` choosing what hold opens —
**`default-grid`** (this same card again, scoped to the tapped room),
**`default-detail`** (HA's more-info dialog), or **`custom`** (an arbitrary
Lovelace card built from `popup.card`, with `[[area_id]]`, `[[entity_id]]`,
`[[name]]` placeholders resolved against the tapped room).

The default grid popup shows a brightness pill beneath each dimmable light.
Drag the slider or use the arrow keys in 5% steps. Adjusting an off light turns
it on at the selected brightness. Tap the light tile to toggle it, or tap the
room tile on the main card to toggle the room. Both taps turn dimmable lights
on at 100% by default. Set `toggle_on_brightness` to a percentage from 1 to
100, or use `0` or `false` to keep Home Assistant's last brightness. Set
`popup.show_brightness_slider: false` to hide the popup sliders. To show
sliders on a standalone card in `entities` view, set
`show_brightness_slider: true`.

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `auto_discover` | boolean | `true` | Automatic discovery of lights by area |
| `include_domains` | list | `["light"]` | Which domains auto-discovery sweeps. A lamp on a smart plug is a `switch`, and nothing in Home Assistant says which switches are lighting — add `switch` and narrow the result with the include/exclude filters, or list the entities per room under `rooms` instead |
| `include_area` / `exclude_area` | list\<string\> | – | Filter for auto-discovery |
| `include_entities` / `exclude_entities` | list\<string\> | – | Entity filter for auto-discovery |
| `include_labels` / `exclude_labels` | list\<string\> | – | Label filter for auto-discovery |
| `include_state` / `exclude_state` | list\<string\> | – | State filter (`on`/`off`/`unavailable`/`unknown`, or a custom value) |
| `group_handling` | `all` \| `prefer_groups` \| `prefer_members` | `all` | How a `light.group` and its members are counted |
| `rooms` | list (`name`, `icon`, `entities`, `toggle_entities`) | – | Manual room list instead of auto-discovery |
| `name` / `icon` | string | "Lights" / `mdi:lightbulb-group` | Header |
| `view` | `rooms` \| `entities` | `rooms` | Tile per room, or a flat per-light list |
| `sort` | `name` \| `area` \| `on_first` | `name` | Tile order |
| `show_header` | boolean | `true` | Card header |
| `show_count` | boolean | `true` | "N/total" next to the state on a multi-light or Fans tile |
| `show_fans` | boolean | `true` | Show the Fans tile before the light tiles when fans are available |
| `fans` | list\<string\> | auto-discovered | Explicit fan entity IDs. An empty list disables fan discovery |
| `shape_by_state` | boolean | `false` | A tile whose lights are all off rounds out; one with a light on keeps its corners |
| `show_brightness_slider` | boolean | `false` | Show brightness sliders for dimmable lights in `entities` view |
| `show_area` | boolean | `true` | Room name caption in `entities` view |
| `hide_empty_rooms` | boolean | `false` | Drop rooms with no matching lights |
| `toggle_filter` | object (same fields as the display filter) | – | Narrower filter for what a tap actually switches |
| `exclude_toggle_entities` | list\<string\> | – | Show these entities and exclude them from the main card's toggle |
| `toggle_on_brightness` | number or `false` | `100` | Brightness percentage for dimmable lights turned on by a room or entity tile. Use `0` or `false` to keep the last brightness |
| `toggle_inherit_filters` | boolean | `true` | Whether `toggle_filter` narrows the display filter or stands alone |
| `toggle_group_handling` | `all` \| `prefer_groups` \| `prefer_members` | `group_handling` | `group_handling`, applied to the toggle set instead |
| `tap_action` / `hold_action` / `double_tap_action` | action config | toggle / popup / none | Tap/hold/double-tap actions; adds a `popup` action kind |
| `popup` | object (`mode`, `title`, `view`, `sort`, `show_area`, `show_header`, `show_brightness_slider`, `card`, filter fields) | – | Popup shown by the `popup` action — see above |
| `popup.show_brightness_slider` | boolean | `true` | Show brightness sliders in the default grid popup’s entity view |
| `on_color` / `off_color` | string | theme default | Tile color by state |
| `fan_color` | string | `#00BCD4` | Theme color name or CSS color for active fan tiles and fan speed sliders |
| `accent_color` / `accent_opacity` | string / number | theme default / `12` | Header icon accent |
| `tile_tint_opacity` | number | – | Tile background tint strength |
| `text_color` / `secondary_text_color` | string | theme default | Room names/values vs. secondary text |
| `card_background` | string | glass/solid background | Card background |
| `animation` | `auto` \| `on` \| `off` | `auto` | Respects `prefers-reduced-motion` |
| `glass_background` | boolean | `true` | Frosted glass background |
| `radius` / `corners` | number / object | `28` | Corner radius, optional per corner |

</details>
