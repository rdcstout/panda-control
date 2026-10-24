export const CONTROL_VENT_CONTRACT = Object.freeze({
  source: Object.freeze({ product: 'Panda Control Vent', firmware: '0.1.2', commit: '532ab59' }),
  automation: Object.freeze({
    eyebrow: 'Automatic vent policy',
    title: 'Vent automation',
    description: 'Follows the printer’s commanded bed temperature. No filament identification is required.',
    advancedLabel: 'Advanced',
    advancedHelp: 'Material rules and cooldown tuning',
    sealLabel: 'Keep vents closed at',
    sealHelp: 'Below this target, vents open while printing. At or above it, the chamber stays sealed.',
    sealRange: Object.freeze([40, 120]),
    cooldownEyebrow: 'Cooldown behavior',
    cooldownTitle: 'Idle temperature thresholds',
    cooldownHelp: 'After a print, vent residual heat until the bed cools below the lower threshold.',
    openLabel: 'Open at',
    openRange: Object.freeze([20, 120]),
    closeLabel: 'Close below',
    closeRange: Object.freeze([0, 110]),
    materialEyebrow: 'Material behavior',
    materialTitle: 'Filament rules',
    materialHelp: 'Use material reported by an AMS or Klipper printer when available. Unknown material falls back to the bed-temperature threshold above.',
    addMaterial: 'Add material',
  }),
  lighting: Object.freeze({
    eyebrow: 'Two-zone lighting',
    title: 'Vent and chamber lights',
    description: 'LED indices 0–10 control the vent lights. Indices 11–15 control the relocated front LEDs used as chamber lighting.',
    linkLabel: 'Link both zones',
    linkHelp: 'Chamber follows vent lighting',
    effects: Object.freeze(['Solid', 'Color cycle', 'Rainbow', 'Breathe', 'Strobe', 'Wave', 'Marquee', 'Cylon eye']),
  }),
});

export function controlVentDecision(state, policy, filamentRules = []) {
  const position = state.ventTarget === 'open'
    ? 'Vents open'
    : state.ventTarget === 'closed'
      ? 'Chamber sealed'
      : 'Vent position unavailable';
  if (state.mode !== 'auto') return [position, 'Manual vent control is active.'];
  if (!state.printerConnected) return [position, 'Automatic control is waiting for printer data.'];

  const target = Number(state.bedTarget || 0);
  const material = String(state.material || '').trim().toUpperCase();
  const materialRule = policy.automationMode === 'advanced' && material
    ? filamentRules.find(rule => String(rule?.name || '').trim().toUpperCase() === material)
    : null;
  if (target > 0) {
    if (materialRule) {
      return [position, `${material} rule: ${materialRule.seal ? 'keep the chamber sealed' : 'open the vents'} while printing.`];
    }
    return [position, `Commanded bed target: ${target.toFixed(0)}°C · seal threshold: ${policy.bedSeal}°C.`];
  }

  const bedTemperature = Number(state.bedTemperature);
  const temperature = Number.isFinite(bedTemperature) ? `${bedTemperature.toFixed(0)}°C` : 'unavailable';
  return [position, `Cooldown bed temperature: ${temperature} · opens at ${policy.bedOpen}°C and closes below ${policy.bedClose}°C.`];
}

export function controlVentPolicySummary(policy) {
  return [
    policy.automationMode === 'advanced'
      ? `Printing: applies material rules; unknown materials use the ${policy.bedSeal} °C bed-target threshold.`
      : `Printing: bed targets below ${policy.bedSeal} °C open the vents; targets at or above it keep them sealed.`,
    `Cooldown: closes the vents when the bed reaches ${policy.bedClose} °C.`,
  ];
}
