import type { TemplateResult } from "lit";
import { afterEach, expect, it, vi } from "vitest";
import type { HomeAssistant } from "./types";

afterEach(() => vi.unstubAllGlobals());

it.each([
  [1, 71, 73],
  [undefined, 71.5, 72.5],
  [0, 71.5, 72.5],
])("sends heat setpoints with temperature_step %s", async (override, lower, higher) => {
  vi.stubGlobal("window", new EventTarget());
  const { M3ClimateCardMini } = await import("./m3-climate-card-mini");
  class TestClimateMini extends M3ClimateCardMini {
    public render() {
      return super.render();
    }
  }
  const card = new TestClimateMini();
  const entity = "climate.test";
  const callService = vi.fn();
  const config = { type: "custom:m3-climate-card-mini", entity, temperature_step: override };
  card.setConfig(config);
  card.hass = {
    states: { [entity]: { entity_id: entity, state: "heat", attributes: {
      temperature: 72, target_temp_step: 0.5, min_temp: 45, max_temp: 92,
    } } },
    config: { unit_system: { temperature: "°F" } },
    callService,
  } as unknown as HomeAssistant;

  const stepper = (card.render() as TemplateResult).values.find(
    (value): value is TemplateResult =>
      typeof value === "object" && value !== null && "strings" in value &&
      (value as TemplateResult).strings[0].includes('class="stepper-row"'),
  );
  if (!stepper) throw new Error("Missing temperature stepper");
  for (const name of ["minus", "plus"]) {
    const index = stepper.strings.findIndex((fragment, i, strings) =>
      fragment.trimEnd().endsWith("@click=") && strings[i - 1]?.includes(`class="stepper-btn ${name}"`),
    );
    const click = stepper.values[index];
    if (typeof click !== "function") throw new Error(`Missing ${name} handler`);
    click();
  }
  expect(callService.mock.calls).toEqual([
    ["climate", "set_temperature", { entity_id: entity, temperature: lower }],
    ["climate", "set_temperature", { entity_id: entity, temperature: higher }],
  ]);
});
