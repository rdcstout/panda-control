import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowsClockwise, CaretDown, CaretRight, Check, Fan, Fire, Gauge, Moon,
  MusicNotes, Oven, Palette, Pause, Plus, Power, Printer, SlidersHorizontal,
  Sparkle, Sun, Thermometer, ThermometerHot, Timer, Trash, Warning, WarningCircle, Waves, X,
} from '@phosphor-icons/react';
import { deviceApi } from './deviceApi';
import { deviceIdentityMatches, isKnownDevice, reconcileDevices } from './deviceRegistry';

const STORAGE_KEY = 'panda-control-devices-v1';
const REMOVED_STORAGE_KEY = 'panda-control-removed-devices-v1';
const APPEARANCE_KEY = 'panda-control-appearance-v1';

function readSavedDevices() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (_) { return []; }
}

function readRemovedDevices() {
  try { return new Set(JSON.parse(localStorage.getItem(REMOVED_STORAGE_KEY)) || []); } catch (_) { return new Set(); }
}

const rgbaToHex = value => /^#[0-9a-f]{8}$/i.test(value || '') ? value.slice(0, 7) : '#ffffff';
const hexToRgba = value => `${value.toUpperCase()}FF`;
const rgbToHex = value => `#${String(value || 'FFFFFF').replace('#', '').slice(0, 6)}`;
const hexToRgb = value => String(value || '#FFFFFF').replace('#', '').toUpperCase();
const rgbArrayToHex = value => `#${(Array.isArray(value) ? value : [255, 255, 255]).map(channel => Math.max(0, Math.min(255, Number(channel) || 0)).toString(16).padStart(2, '0')).join('')}`;
const hexToRgbArray = value => [1, 3, 5].map(index => parseInt(String(value).slice(index, index + 2), 16));
const EFFECT_NAMES = ['Static', 'Breathing', 'Strobing', 'Wave', 'Marquee', 'Color Cycle', 'Rainbow'];
const CONTROL_EFFECT_NAMES = ['Solid', 'Color Cycle', 'Rainbow', 'Breathe', 'Strobe', 'Wave', 'Marquee', 'Cylon Eye'];
const VENT_STATE_NAMES = ['Idle', 'Preparing', 'Printing', 'Paused', 'Finished', 'Error'];
const DESIGN_WIDTH = 1440;
const DESIGN_HEIGHT = 1440;

function useInterfaceScale(canvasRef) {
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const scale = Math.min(1, window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT);
        canvas.style.setProperty('--interface-scale', Math.max(0.3, scale).toFixed(4));
      });
    };
    const resizeObserver = new ResizeObserver(fit);
    const mutationObserver = new MutationObserver(fit);
    resizeObserver.observe(canvas);
    mutationObserver.observe(canvas, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', fit);
    fit();
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [canvasRef]);
}

function draftFromState(state) {
  if (!state) return null;
  if (state.product === 'status') {
    const mode = Number(state.mode);
    return {
      product: 'status',
      mode,
      brightness: state.modes[mode]?.brightness ?? 50,
      colors: (state.modes[1]?.colors || ['#FFFFFFFF', '#FFFFFFFF', '#FF0000FF']).map(rgbaToHex),
    };
  }
  if (state.product === 'vent') {
    return {
      product: 'vent',
      enabled: state.enabled,
      mode: state.mode,
      warningOverride: state.warningOverride,
      followPrinter: state.followPrinter,
      followVent: state.followVent,
      reverse: state.reverse,
      simple: state.simple,
      advanced: state.advanced,
      warning: state.warning,
    };
  }
  if (state.product === 'control-vent') {
    return { product: 'control-vent', policy: structuredClone(state.policy), lighting: structuredClone(state.lighting) };
  }
  return {
    product: 'breath',
    enabled: state.enabled,
    mode: state.mode,
    targetTemp: state.targetTemp,
    filterTemp: state.filterTemp,
    heaterTemp: state.heaterTemp,
    dryingTemp: state.dryingTemp,
    dryingHours: state.dryingHours,
  };
}

function Spinner({ size = 18 }) {
  return <ArrowsClockwise size={size} className="spin" aria-hidden="true" />;
}

function AppButton({ children, icon: Icon, className = '', ...props }) {
  return <button className={`app-button ${className}`} {...props}>{Icon && <Icon size={19} aria-hidden="true" />}<span>{children}</span></button>;
}

function NumberStepper({ value, min, max, suffix, onChange, disabled = false }) {
  return (
    <div className={`number-stepper ${disabled ? 'disabled' : ''}`}>
      <input type="number" value={value} min={min} max={max} disabled={disabled}
        onChange={event => onChange(Math.max(min, Math.min(max, Number(event.target.value))))} />
      <span>{suffix}</span>
    </div>
  );
}

function SettingRow({ icon: Icon, title, description, children }) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        {Icon && <span className="setting-icon"><Icon size={20} aria-hidden="true" /></span>}
        <div><strong>{title}</strong>{description && <p>{description}</p>}</div>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function SegmentedModes({ value, items, onChange }) {
  return (
    <div className="mode-group" role="radiogroup" aria-label="Work mode">
      {items.map(item => {
        const Icon = item.icon;
        const selected = value === item.value;
        return (
          <button key={item.value} type="button" className={`mode-choice ${selected ? 'selected' : ''}`}
            role="radio" aria-checked={selected} onClick={() => onChange(item.value)}>
            <Icon size={34} weight={selected ? 'duotone' : 'regular'} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatusPanel({ state, draft, setDraft, onReset }) {
  const modes = [{ value: 0, label: 'Music', icon: MusicNotes }, { value: 1, label: 'H2D', icon: Sparkle }];
  const colorLabels = ['Idle', 'Printing', 'Error'];
  const changeMode = mode => setDraft(current => ({ ...current, mode, brightness: state.modes[mode]?.brightness ?? current.brightness }));
  return (
    <>
      <section className="device-heading status-heading">
        <div><div className="title-line"><h1>Panda Status</h1><span className="online-label"><i />Online</span></div><p>Printer-aware status lighting</p></div>
        <div className="summary-surface compact-summary">
          <div><span>Light Effect</span><strong>{draft.mode === 0 ? 'Music' : 'H2D'}</strong></div>
          <div className="summary-divider" />
          <div><span>Brightness</span><strong>{draft.brightness}%</strong></div>
        </div>
      </section>
      <section className="section-block">
        <span className="eyebrow">Light Effect</span>
        <SegmentedModes value={draft.mode} items={modes} onChange={changeMode} />
        <p className="mode-help">{draft.mode === 0 ? 'Responds to nearby sound using the device microphone.' : 'Follows the printer state with independent Idle, Printing, and Error colors.'}</p>
      </section>
      <section className="section-block">
        <div className="section-title-row"><span className="eyebrow">Lighting Settings</span><button className="quiet-link" onClick={onReset}>Restore defaults</button></div>
        <div className="settings-panel">
          <SettingRow icon={Sun} title="Brightness" description={`Applies to the selected ${draft.mode === 0 ? 'Music' : 'H2D'} effect.`}>
            <div className="slider-control"><input type="range" min="0" max="100" step="5" value={draft.brightness}
              onChange={event => setDraft(current => ({ ...current, brightness: Number(event.target.value) }))} /><output>{draft.brightness}%</output></div>
          </SettingRow>
          {draft.mode === 1 && colorLabels.map((label, index) => (
            <SettingRow key={label} icon={index === 2 ? WarningCircle : index === 1 ? Gauge : Moon}
              title={`${label} color`} description={`Lighting shown while the printer is ${label.toLowerCase()}.`}>
              <label className="color-control"><input type="color" value={draft.colors[index]}
                onChange={event => setDraft(current => ({ ...current, colors: current.colors.map((color, colorIndex) => colorIndex === index ? event.target.value : color) }))} />
                <span>{draft.colors[index].toUpperCase()}</span></label>
            </SettingRow>
          ))}
        </div>
      </section>
    </>
  );
}

function BreathPanel({ state, draft, setDraft, onDryingToggle, busy }) {
  const modes = [
    { value: 1, label: 'Auto', icon: Waves },
    { value: 2, label: 'Power On', icon: Oven },
    { value: 3, label: 'Filament Drying', icon: ThermometerHot },
  ];
  const setPreset = (temp, hours) => setDraft(current => ({ ...current, mode: 3, dryingTemp: temp, dryingHours: hours }));
  return (
    <>
      <section className="device-heading">
        <div><div className="title-line"><h1>Panda Breath</h1><span className="online-label"><i />Online</span></div><p>Panda Environmental Controller</p></div>
        <div className="summary-surface">
          <div><span>Current Chamber</span><strong>{state.chamberTemp ?? '—'}<small>°C</small></strong></div>
          <div className="summary-divider" />
          <label className="switch-block"><span>Device Enabled</span><input type="checkbox" checked={draft.enabled}
            onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} /><i aria-hidden="true" /></label>
        </div>
      </section>
      <section className="section-block">
        <span className="eyebrow">Work Mode</span>
        <SegmentedModes value={draft.mode} items={modes} onChange={mode => setDraft(current => ({ ...current, mode }))} />
        <p className="mode-help">{draft.mode === 1 ? 'Automatically manages heating and filtration using the thresholds below.' : draft.mode === 2 ? 'Keeps the environmental system powered continuously.' : 'Runs a timed low-temperature filament drying cycle.'}</p>
      </section>
      {draft.mode !== 3 ? (
        <section className="section-block"><span className="eyebrow">Temperature Settings</span><div className="settings-panel">
          <SettingRow icon={Thermometer} title="Target Chamber Temperature" description="Maintains the chamber at or above this temperature."><NumberStepper value={draft.targetTemp} min={0} max={60} suffix="°C" onChange={value => setDraft(current => ({ ...current, targetTemp: value }))} /></SettingRow>
          <SettingRow icon={Fan} title="Filter Fan Activation Threshold" description="Starts filtration when the printer heatbed target reaches this threshold."><NumberStepper value={draft.filterTemp} min={0} max={120} suffix="°C" onChange={value => setDraft(current => ({ ...current, filterTemp: value }))} /></SettingRow>
          <SettingRow icon={Fire} title="Heater Activation Threshold" description="Enables chamber heating when the printer heatbed target reaches this threshold."><NumberStepper value={draft.heaterTemp} min={40} max={120} suffix="°C" onChange={value => setDraft(current => ({ ...current, heaterTemp: value }))} /></SettingRow>
        </div></section>
      ) : (
        <section className="section-block drying-section">
          <div className="section-title-row"><span className="eyebrow">Drying Cycle</span>{state.drying && <span className="running-badge"><i />Running</span>}</div>
          <div className="preset-bar" aria-label="Drying presets"><button onClick={() => setPreset(55, 12)}>PLA <span>55°C · 12h</span></button><button onClick={() => setPreset(60, 12)}>PETG / ABS <span>60°C · 12h</span></button><button className="selected">Custom</button></div>
          <div className="settings-panel drying-panel">
            <SettingRow icon={Thermometer} title="Drying Temperature" description="Safe adjustable range supported by Panda Breath."><NumberStepper value={draft.dryingTemp} min={40} max={60} suffix="°C" onChange={value => setDraft(current => ({ ...current, dryingTemp: value }))} /></SettingRow>
            <SettingRow icon={Timer} title="Duration" description={state.drying ? `${Math.max(0, Math.ceil(state.remainingSeconds / 60))} minutes remaining` : 'Cycle length before automatic stop.'}><NumberStepper value={draft.dryingHours} min={1} max={99} suffix="hours" onChange={value => setDraft(current => ({ ...current, dryingHours: value }))} disabled={state.drying} /></SettingRow>
            <div className="drying-action-row"><div><strong>{state.drying ? 'Drying is active' : 'Ready to dry'}</strong><p>{state.drying ? 'Stop returns the device to an idle drying state.' : 'Save your settings, then begin the timed cycle.'}</p></div>
              <button className={`drying-action ${state.drying ? 'stop' : ''}`} onClick={onDryingToggle} disabled={busy || !draft.enabled}>{busy ? <Spinner /> : state.drying ? <X size={18} /> : <Power size={18} />}{state.drying ? 'Stop Drying' : 'Start Drying'}</button></div>
          </div>
        </section>
      )}
    </>
  );
}

function MiniSwitch({ checked, onChange, label }) {
  return <label className="mini-switch"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} aria-label={label} /><i aria-hidden="true" /></label>;
}

function EffectPicker({ value, onChange, allowed = EFFECT_NAMES }) {
  return <div className="effect-picker">{allowed.map((label, index) => <button key={label} type="button" className={value === index ? 'selected' : ''} onClick={() => onChange(index)}>{label}</button>)}</div>;
}

function EffectControls({ effect, onChange, fixedColor }) {
  if (!effect) return null;
  return <div className="settings-panel effect-controls">
    <SettingRow icon={Sun} title="Brightness" description="Controls the intensity of this lighting effect."><div className="slider-control"><input type="range" min="0" max="100" step="5" value={effect.brightness} onChange={event => onChange({ brightness: Number(event.target.value) })} /><output>{effect.brightness}%</output></div></SettingRow>
    {effect.id !== 0 && <SettingRow icon={Timer} title="Animation Speed" description="Adjusts how quickly the lighting pattern moves."><div className="slider-control"><input type="range" min="0" max="100" step="5" value={effect.speed} onChange={event => onChange({ speed: Number(event.target.value) })} /><output>{effect.speed}%</output></div></SettingRow>}
    {!fixedColor && effect.id < 5 && <SettingRow icon={Palette} title="Color" description="Sets the base color for this effect."><label className="color-control"><input type="color" value={rgbToHex(effect.color)} onChange={event => onChange({ color: hexToRgb(event.target.value) })} /><span>{rgbToHex(effect.color).toUpperCase()}</span></label></SettingRow>}
    {fixedColor && <SettingRow icon={Palette} title="Status Color" description="The safety state uses a fixed, immediately recognizable color."><span className={`fixed-color ${fixedColor}`}><i />{fixedColor === 'safe' ? 'Safe Green' : 'Warning Red'}</span></SettingRow>}
  </div>;
}

function VentPanel({ draft, setDraft }) {
  const [advancedState, setAdvancedState] = useState(0);
  const [warningState, setWarningState] = useState('safe');
  const modes = [
    { value: 0, label: 'Simple', icon: Sparkle },
    { value: 1, label: 'Printer States', icon: Printer },
    { value: 2, label: 'Hot Warning', icon: ThermometerHot },
  ];
  const modeNames = ['Simple', 'Printer States', 'Hot Warning'];
  const setSource = source => setDraft(current => ({ ...current, followPrinter: source === 'printer', followVent: source === 'vent' }));
  const source = draft.followPrinter ? 'printer' : draft.followVent ? 'vent' : 'independent';
  const simpleEffect = draft.simple.effects.find(item => item.id === draft.simple.activeEffect);
  const currentAdvanced = draft.advanced.states.find(item => item.stateId === advancedState) || draft.advanced.states[0];
  const advancedEffect = currentAdvanced?.effects.find(item => item.id === currentAdvanced.activeEffect);
  const currentWarning = draft.warning[warningState];
  const warningEffect = currentWarning?.effects.find(item => item.id === currentWarning.activeEffect);
  const updateSimple = values => setDraft(current => ({ ...current, simple: { ...current.simple, effects: current.simple.effects.map(item => item.id === current.simple.activeEffect ? { ...item, ...values } : item) } }));
  const selectSimple = effectId => setDraft(current => ({ ...current, simple: { ...current.simple, activeEffect: effectId } }));
  const updateAdvanced = values => setDraft(current => ({ ...current, advanced: { states: current.advanced.states.map(item => item.stateId !== advancedState ? item : { ...item, effects: item.effects.map(effect => effect.id === item.activeEffect ? { ...effect, ...values } : effect) }) } }));
  const selectAdvanced = effectId => setDraft(current => ({ ...current, advanced: { states: current.advanced.states.map(item => item.stateId === advancedState ? { ...item, activeEffect: effectId } : item) } }));
  const updateWarning = values => setDraft(current => ({ ...current, warning: { ...current.warning, [warningState]: { ...current.warning[warningState], effects: current.warning[warningState].effects.map(item => item.id === current.warning[warningState].activeEffect ? { ...item, ...values } : item) } } }));
  const selectWarning = effectId => setDraft(current => ({ ...current, warning: { ...current.warning, [warningState]: { ...current.warning[warningState], activeEffect: effectId } } }));

  return <>
    <section className="device-heading">
      <div><div className="title-line"><h1>Panda Vent</h1><span className="online-label"><i />Online</span></div><p>Printer-aware ventilation lighting</p></div>
      <div className="summary-surface compact-summary"><div><span>Light Mode</span><strong>{modeNames[draft.mode]}</strong></div><div className="summary-divider" /><label className="switch-block"><span>Lighting Enabled</span><input type="checkbox" checked={draft.enabled} onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} /><i aria-hidden="true" /></label></div>
    </section>
    <section className="section-block"><span className="eyebrow">Light Mode</span><SegmentedModes value={draft.mode} items={modes} onChange={mode => setDraft(current => ({ ...current, mode }))} /><p className="mode-help">{draft.mode === 0 ? 'Use one lighting effect continuously.' : draft.mode === 1 ? 'Give each printer state its own effect, brightness, speed, and color.' : 'Show a clear safe or hot condition using dedicated warning effects.'}</p></section>
    <section className="section-block"><span className="eyebrow">Behavior</span><div className="settings-panel vent-behavior">
      <SettingRow icon={Printer} title="Light Source" description="Choose what the lighting follows during normal operation."><div className="source-selector">{[['independent', 'Independent'], ['printer', 'Printer'], ['vent', 'Vent']].map(([value, label]) => <button type="button" key={value} className={source === value ? 'selected' : ''} onClick={() => setSource(value)}>{label}</button>)}</div></SettingRow>
      <SettingRow icon={Warning} title="Warning Override" description="Allow hot-condition lighting to override the active effect."><MiniSwitch label="Warning Override" checked={draft.warningOverride} onChange={value => setDraft(current => ({ ...current, warningOverride: value }))} /></SettingRow>
      <SettingRow icon={ArrowsClockwise} title="Reverse Direction" description="Reverse the direction of animated lighting effects."><MiniSwitch label="Reverse Direction" checked={draft.reverse} onChange={value => setDraft(current => ({ ...current, reverse: value }))} /></SettingRow>
    </div></section>
    <section className="section-block"><span className="eyebrow">{draft.mode === 0 ? 'Simple Effect' : draft.mode === 1 ? 'Printer State Effects' : 'Temperature Warning Effects'}</span>
      {draft.mode === 0 && <><EffectPicker value={draft.simple.activeEffect} onChange={selectSimple} /><EffectControls effect={simpleEffect} onChange={updateSimple} /></>}
      {draft.mode === 1 && currentAdvanced && <><div className="state-tabs">{VENT_STATE_NAMES.map((label, index) => <button key={label} type="button" className={advancedState === index ? 'selected' : ''} onClick={() => setAdvancedState(index)}>{index === 2 ? <Printer size={18} /> : index === 3 ? <Pause size={18} /> : index === 5 ? <WarningCircle size={18} /> : <i />}{label}</button>)}</div><EffectPicker value={currentAdvanced.activeEffect} onChange={selectAdvanced} /><EffectControls effect={advancedEffect} onChange={updateAdvanced} /></>}
      {draft.mode === 2 && currentWarning && <><div className="warning-tabs"><button type="button" className={warningState === 'safe' ? 'selected safe' : ''} onClick={() => setWarningState('safe')}><i />Safe</button><button type="button" className={warningState === 'warn' ? 'selected warn' : ''} onClick={() => setWarningState('warn')}><i />Hot</button></div><EffectPicker value={currentWarning.activeEffect} onChange={selectWarning} allowed={['Static', 'Strobing']} /><EffectControls effect={warningEffect} onChange={updateWarning} fixedColor={warningState} /></>}
    </section>
  </>;
}

function ControlVentColor({ label, value, onChange, option }) {
  return <SettingRow icon={Palette} title={label}><div className="control-vent-color"><label className="color-control"><input type="color" value={rgbArrayToHex(value)} onChange={event => onChange(hexToRgbArray(event.target.value))} /><span>{rgbArrayToHex(value).toUpperCase()}</span></label>{option}</div></SettingRow>;
}

function ControlVentLighting({ draft, setDraft }) {
  const [zoneName, setZoneName] = useState('vent');
  const zone = draft.lighting[zoneName];
  const updateZone = values => setDraft(current => ({ ...current, lighting: { ...current.lighting, [zoneName]: { ...current.lighting[zoneName], ...values } } }));
  const printerMode = zone.mode === 1;
  const colors = printerMode
    ? [['Idle', 'idle'], ['Preparing', 'prep'], ['Printing', 'printing'], ['Paused', 'paused'], ['Completed', 'complete']]
    : [['Open', 'open'], ['Closed', 'closed']];
  return <section className="section-block control-vent-lighting">
    <div className="section-title-row"><span className="eyebrow">Lighting</span><label className="inline-check"><input type="checkbox" checked={draft.lighting.linked} onChange={event => { const linked = event.target.checked; if (linked) setZoneName('vent'); setDraft(current => ({ ...current, lighting: { ...current.lighting, linked } })); }} />Link chamber to vent lights</label></div>
    <div className="zone-tabs"><button type="button" className={zoneName === 'vent' ? 'selected' : ''} onClick={() => setZoneName('vent')}>Vent Lights</button><button type="button" disabled={draft.lighting.linked} className={zoneName === 'chamber' ? 'selected' : ''} onClick={() => setZoneName('chamber')}>Chamber Lights</button></div>
    <div className="settings-panel">
      <SettingRow icon={Power} title={`${zoneName === 'vent' ? 'Vent' : 'Chamber'} Lights`} description="Turn this lighting zone on or off."><MiniSwitch label={`${zoneName} lights`} checked={zone.enabled} onChange={enabled => updateZone({ enabled })} /></SettingRow>
      {zoneName === 'chamber' && <SettingRow icon={Printer} title="Follow Factory Chamber Light" description="Turns these chamber lights off when the printer's chamber light is off."><MiniSwitch label="Follow factory chamber light" checked={zone.followPrinterLight} onChange={followPrinterLight => updateZone({ followPrinterLight })} /></SettingRow>}
      <SettingRow icon={Sun} title="Brightness" description="Maximum brightness for this lighting zone."><div className="slider-control"><input type="range" min="0" max="255" value={zone.brightness} onChange={event => updateZone({ brightness: Number(event.target.value) })} /><output>{Math.round(zone.brightness / 2.55)}%</output></div></SettingRow>
      <SettingRow icon={SlidersHorizontal} title="Color Follows" description="Choose whether colors represent vent position or printer status."><div className="source-selector"><button type="button" className={!printerMode ? 'selected' : ''} onClick={() => updateZone({ mode: 0 })}>Vent State</button><button type="button" className={printerMode ? 'selected' : ''} onClick={() => updateZone({ mode: 1 })}>Printer Status</button></div></SettingRow>
      <SettingRow icon={Sparkle} title="Effect" description="Lighting animation for this zone."><select className="select-control" value={zone.effect} onChange={event => updateZone({ effect: Number(event.target.value) })}>{CONTROL_EFFECT_NAMES.map((name, index) => <option value={index} key={name}>{name}</option>)}</select></SettingRow>
      {zone.effect !== 0 && <SettingRow icon={Timer} title="Effect Speed" description="Adjusts the animation speed."><div className="slider-control"><input type="range" min="0" max="255" value={zone.speed} onChange={event => updateZone({ speed: Number(event.target.value) })} /><output>{Math.round(zone.speed / 2.55)}%</output></div></SettingRow>}
      <details className="control-color-details"><summary>Colors and behavior</summary><div>
        {colors.map(([label, key]) => <ControlVentColor key={key} label={`${label} Color`} value={zone[key]} onChange={value => updateZone({ [key]: value })} option={zoneName === 'chamber' && key === 'idle' ? <label className="inline-check"><input type="checkbox" checked={zone.dimIdle} onChange={event => updateZone({ dimIdle: event.target.checked })} />Dim to 20% while idle</label> : null} />)}
        <ControlVentColor label="Error Color" value={zone.error} onChange={error => updateZone({ error })} option={<label className="inline-check"><input type="checkbox" checked={zone.useError} onChange={event => updateZone({ useError: event.target.checked })} />Flash on error</label>} />
        <SettingRow icon={ArrowsClockwise} title="Animation Direction" description="Reverse animated effects independently on each side."><div className="direction-checks"><label className="inline-check"><input type="checkbox" checked={draft.lighting.reverse[0]} onChange={event => setDraft(current => ({ ...current, lighting: { ...current.lighting, reverse: [event.target.checked, current.lighting.reverse[1]] } }))} />Reverse left</label><label className="inline-check"><input type="checkbox" checked={draft.lighting.reverse[1]} onChange={event => setDraft(current => ({ ...current, lighting: { ...current.lighting, reverse: [current.lighting.reverse[0], event.target.checked] } }))} />Reverse right</label></div></SettingRow>
      </div></details>
    </div>
  </section>;
}

function ControlVentPanel({ state, draft, setDraft, onCommand, busy }) {
  const targetLabel = state.ventTarget === 'open' ? 'Open' : state.ventTarget === 'closed' ? 'Closed' : 'Unknown';
  return <>
    <section className="device-heading">
      <div><div className="title-line"><h1>Panda Control Vent</h1><span className="online-label"><i />Online</span></div><p>Printer-aware chamber ventilation</p></div>
      <div className="summary-surface compact-summary"><div><span>Vent Position</span><strong>{state.ventRunning ? 'Moving' : targetLabel}</strong></div><div className="summary-divider" /><div><span>Bed Temperature</span><strong>{state.bedTemperature ?? '—'}<small>°C</small></strong></div></div>
    </section>
    <section className="section-block"><span className="eyebrow">Vent Control</span><div className="settings-panel">
      <SettingRow icon={Fan} title="Operating Mode" description={state.mode === 'auto' ? 'Following the active printer and automatic vent policy.' : 'Manual vent control is active.'}>
        <div className="source-selector"><button type="button" className={state.mode === 'manual' && state.ventTarget === 'open' ? 'selected' : ''} disabled={busy} onClick={() => onCommand({ name: 'manual', target: 'open' })}>Open</button><button type="button" className={state.mode === 'manual' && state.ventTarget === 'closed' ? 'selected' : ''} disabled={busy} onClick={() => onCommand({ name: 'manual', target: 'closed' })}>Close</button><button type="button" className={state.mode === 'auto' ? 'selected' : ''} disabled={busy} onClick={() => onCommand({ name: 'auto' })}>Auto</button></div>
      </SettingRow>
      <SettingRow icon={Printer} title="Printer Connection" description={`Bambu printer is ${state.printerState || 'unknown'}.`}><span className={`inline-status ${state.printerConnected ? 'ok' : ''}`}><i />{state.printerConnected ? 'Connected' : 'Disconnected'}</span></SettingRow>
    </div></section>
    <section className="section-block"><span className="eyebrow">Automatic Policy</span><div className="settings-panel">
      <SettingRow icon={ThermometerHot} title="Keep Chamber Sealed" description="Bed targets at or above this temperature keep the vents closed."><NumberStepper value={draft.policy.bedSeal} min={0} max={120} suffix="°C" onChange={bedSeal => setDraft(current => ({ ...current, policy: { ...current.policy, bedSeal } }))} /></SettingRow>
      <SettingRow icon={Thermometer} title="Close After Cooldown" description="Closes the vents after a print when the bed reaches this temperature."><NumberStepper value={draft.policy.bedClose} min={0} max={120} suffix="°C" onChange={bedClose => setDraft(current => ({ ...current, policy: { ...current.policy, bedClose } }))} /></SettingRow>
    </div></section>
    <ControlVentLighting draft={draft} setDraft={setDraft} />
  </>;
}

function UnsupportedPanel({ device, onRemove }) {
  return <section className="unsupported-panel"><WarningCircle size={44} weight="duotone" /><h1>{device.name}</h1><p>Panda Control found this device, but it does not have a validated native control profile yet.</p><div className="unavailable-actions"><AppButton icon={SlidersHorizontal} onClick={() => deviceApi.openDevicePage(device.ip)}>Open Original Interface</AppButton><AppButton icon={Trash} className="remove-device-button" onClick={onRemove}>Remove Device</AppButton></div></section>;
}

function AddDeviceDialog({ onClose, onAdd, onAddDiscovered, knownDevices }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState([]);
  const [addingId, setAddingId] = useState(null);
  const search = useCallback(async () => {
    setSearching(true); setSearchError('');
    try { setResults(await deviceApi.scanDevices()); }
    catch (problem) { setSearchError(problem.message); }
    finally { setSearching(false); }
  }, []);
  useEffect(() => { search(); }, [search]);
  const submit = async event => { event.preventDefault(); setBusy(true); setError(''); try { await onAdd(value); onClose(); } catch (problem) { setError(problem.message); } finally { setBusy(false); } };
  const addFound = async device => {
    setAddingId(device.id);
    try { await onAddDiscovered(device); }
    finally { setAddingId(null); }
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="modal add-device-modal" role="dialog" aria-modal="true" aria-labelledby="add-device-title">
        <div className="modal-heading"><div><h2 id="add-device-title">Add a Panda device</h2><p>Devices that are already set up will appear here automatically.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <div className="discovery-heading"><div><strong>Devices on This Network</strong><span>{searching ? 'Searching local addresses…' : `${results.length} device${results.length === 1 ? '' : 's'} found`}</span></div><button type="button" className="search-again-button" onClick={search} disabled={searching}>{searching ? <Spinner size={17} /> : <ArrowsClockwise size={17} />}Search Again</button></div>
        <div className="discovery-results" aria-live="polite">
          {searching && !results.length ? <div className="discovery-empty"><Spinner size={24} /><strong>Searching your network</strong><span>Looking for supported Panda products…</span></div> : searchError ? <div className="discovery-empty error"><WarningCircle size={25} /><strong>Search unavailable</strong><span>{searchError}</span></div> : !results.length ? <div className="discovery-empty"><SlidersHorizontal size={25} /><strong>No Panda devices found</strong><span>Make sure the device is powered on and connected to this network.</span></div> : results.map(device => {
            const added = isKnownDevice(knownDevices, device);
            const supported = device.product !== 'unknown';
            return <div className="discovered-device" key={device.id}><span className="device-glyph"><SlidersHorizontal size={22} /></span><div className="discovered-identity"><strong>{device.name}</strong><span>{device.ip}</span></div><span className="discovered-online"><i />Online</span><button type="button" className={added ? 'device-added-button' : 'device-add-button'} disabled={added || !supported || addingId === device.id} onClick={() => addFound(device)}>{addingId === device.id ? <Spinner size={16} /> : added ? <Check size={16} /> : <Plus size={16} />}{!supported ? 'Unsupported' : added ? 'Added' : 'Add'}</button></div>;
          })}
        </div>
        <div className="manual-divider"><span>Or add by address</span></div>
        <form className="manual-add-form" onSubmit={submit}><label className="field-label" htmlFor="device-address">IP address or .local hostname</label><div className="manual-address-row"><input id="device-address" value={value} onChange={event => setValue(event.target.value)} placeholder="192.168.5.94" /><button type="submit" className="primary-button" disabled={busy || !value.trim()}>{busy && <Spinner />}Add Device</button></div>{error && <p className="form-error"><WarningCircle size={17} />{error}</p>}</form>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }) {
  return <div className="modal-backdrop" role="presentation"><div className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">{title}</h2><p>{body}</p><div className="modal-actions"><button className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" onClick={onConfirm}>{confirmLabel}</button></div></div></div>;
}

export function App() {
  const canvasRef = useRef(null);
  useInterfaceScale(canvasRef);
  const initialDevices = readSavedDevices();
  const [devices, setDevices] = useState(initialDevices);
  const [removedIds, setRemovedIds] = useState(readRemovedDevices);
  const [selectedId, setSelectedId] = useState(initialDevices[0]?.id || null);
  const [states, setStates] = useState({});
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [toast, setToast] = useState(null);
  const [appearance, setAppearance] = useState(() => localStorage.getItem(APPEARANCE_KEY) || 'dark');
  const selected = devices.find(device => device.id === selectedId) || devices[0] || null;
  const state = selected ? states[selected.id]?.data : null;
  const error = selected ? states[selected.id]?.error : null;
  const dirty = Boolean(draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline));
  const dirtyRef = useRef(dirty);

  useEffect(() => { document.documentElement.dataset.theme = appearance; localStorage.setItem(APPEARANCE_KEY, appearance); }, [appearance]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(devices)); if (!selectedId && devices[0]) setSelectedId(devices[0].id); }, [devices, selectedId]);
  useEffect(() => { localStorage.setItem(REMOVED_STORAGE_KEY, JSON.stringify([...removedIds])); }, [removedIds]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const mergeDevices = useCallback(incoming => {
    const allowed = incoming.filter(device => !removedIds.has(device.id) && !removedIds.has(device.hardwareId));
    setDevices(current => reconcileDevices(current, allowed).devices);
    if (!selectedId && allowed[0]) setSelectedId(allowed[0].id);
  }, [removedIds, selectedId]);

  const scan = useCallback(async () => {
    setScanning(true);
    try { const found = await deviceApi.scanDevices(); mergeDevices(found); setToast({ kind: 'success', message: found.length ? `${found.length} Panda device${found.length === 1 ? '' : 's'} found` : 'No Panda devices found' }); }
    catch (problem) { setToast({ kind: 'error', message: problem.message }); }
    finally { setScanning(false); }
  }, [mergeDevices]);

  const refresh = useCallback(async (device, updateDraft = false) => {
    if (!device || device.product === 'unknown') return;
    try {
      const next = await deviceApi.readDeviceState(device);
      setStates(current => ({ ...current, [device.id]: { data: next, error: null, updatedAt: Date.now() } }));
      if (updateDraft || !dirtyRef.current) { const nextDraft = draftFromState(next); setDraft(nextDraft); setBaseline(nextDraft); }
      return next;
    } catch (problem) { setStates(current => ({ ...current, [device.id]: { ...current[device.id], error: problem.message } })); throw problem; }
  }, []);

  useEffect(() => {
    if (!selected || selected.product === 'unknown') return;
    setDraft(null); setBaseline(null); refresh(selected, true).catch(() => {});
    const timer = setInterval(() => refresh(selected, false).catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3500); return () => clearTimeout(timer); }, [toast]);

  const buildCommands = useCallback(() => {
    if (!selected || !draft) return [];
    if (selected.product === 'status') {
      const commands = [{ settings: { rgb_info_mode: draft.mode } }, { settings: { rgb_info_brightness: String(draft.brightness) } }];
      if (draft.mode === 1) draft.colors.forEach((color, index) => commands.push({ settings: { rgb_info_mode: 1, rgb_rgba: hexToRgba(color), rgb_state_index: index } }));
      return commands;
    }
    if (selected.product === 'vent') {
      const commands = [];
      const addSwitch = (key, value, previous) => { if (value !== previous) commands.push({ rgb_switch: { [key]: Number(Boolean(value)) } }); };
      addSwitch('total_switch', draft.enabled, baseline?.enabled);
      addSwitch('warning_overide', draft.warningOverride, baseline?.warningOverride);
      addSwitch('follow_printer', draft.followPrinter, baseline?.followPrinter);
      addSwitch('follow_vent', draft.followVent, baseline?.followVent);
      addSwitch('reverse_light', draft.reverse, baseline?.reverse);
      if (draft.mode !== baseline?.mode) commands.push({ rgb_switch: { current_light_mode: draft.mode } });
      if (JSON.stringify(draft.simple) !== JSON.stringify(baseline?.simple)) {
        const effect = draft.simple.effects.find(item => item.id === draft.simple.activeEffect);
        commands.push({ rgb_mode: { simple_mode: { effect: draft.simple.activeEffect, bg: effect.brightness, speed: effect.speed, rgb: effect.color } } });
      }
      draft.advanced.states.forEach(deviceState => {
        const previous = baseline?.advanced.states.find(item => item.stateId === deviceState.stateId);
        if (JSON.stringify(deviceState) === JSON.stringify(previous)) return;
        const effect = deviceState.effects.find(item => item.id === deviceState.activeEffect);
        commands.push({ rgb_mode: { h2d_mode: { mode: deviceState.stateId, effect: deviceState.activeEffect, bg: effect.brightness, speed: effect.speed, rgb: effect.color } } });
      });
      ['safe', 'warn'].forEach(key => {
        if (JSON.stringify(draft.warning[key]) === JSON.stringify(baseline?.warning[key])) return;
        const item = draft.warning[key];
        const effect = item.effects.find(candidate => candidate.id === item.activeEffect);
        commands.push({ rgb_mode: { warning_hot_mode: { [key]: { effect: item.activeEffect, bg: effect.brightness, speed: effect.speed } } } });
      });
      return commands;
    }
    if (selected.product === 'control-vent') {
      const commands = [];
      if (JSON.stringify(draft.policy) !== JSON.stringify(baseline?.policy)) commands.push({ settings: draft.policy });
      if (JSON.stringify(draft.lighting) !== JSON.stringify(baseline?.lighting)) commands.push({ lighting: draft.lighting });
      return commands;
    }
    const commands = [{ settings: { work_on: draft.enabled } }, { settings: { work_mode: draft.mode } }, { settings: { set_temp: draft.targetTemp } }, { settings: { filtertemp: draft.filterTemp } }, { settings: { hotbedtemp: draft.heaterTemp } }];
    if (draft.mode === 3) commands.push({ settings: { filament_temp: draft.dryingTemp } }, { settings: { filament_timer: draft.dryingHours } }, { settings: { filament_drying_mode: 3 } });
    return commands;
  }, [baseline, draft, selected]);

  const save = useCallback(async (extraCommands = []) => {
    if (!selected || !draft) return;
    setSaving(true);
    try {
      const next = await deviceApi.applyDeviceCommands({ ip: selected.ip, product: selected.product, commands: [...buildCommands(), ...extraCommands] });
      setStates(current => ({ ...current, [selected.id]: { data: next, error: null, updatedAt: Date.now() } }));
      const nextDraft = draftFromState(next); setDraft(nextDraft); setBaseline(nextDraft); setToast({ kind: 'success', message: 'Changes applied to the device' }); return next;
    } catch (problem) { setToast({ kind: 'error', message: problem.message }); throw problem; }
    finally { setSaving(false); }
  }, [buildCommands, draft, selected]);

  const restoreDevice = device => {
    setRemovedIds(current => { const next = new Set(current); next.delete(device.id); if (device.hardwareId) next.delete(device.hardwareId); return next; });
    const existing = devices.find(item => deviceIdentityMatches(item, device));
    setDevices(current => reconcileDevices(current, [device]).devices);
    setSelectedId(existing?.id || device.id);
  };
  const addDevice = async value => { const device = await deviceApi.probeDevice(value); restoreDevice(device); setToast({ kind: 'success', message: `${device.name} added` }); };
  const addDiscoveredDevice = async device => { restoreDevice(device); setToast({ kind: 'success', message: `${device.name} added` }); };
  const removeDevice = () => {
    if (!selected) return;
    const removed = selected;
    const remaining = devices.filter(device => device.id !== removed.id);
    setRemovedIds(current => new Set([...current, removed.id, ...(removed.hardwareId ? [removed.hardwareId] : [])]));
    setDevices(remaining);
    setStates(current => { const next = { ...current }; delete next[removed.id]; return next; });
    setSelectedId(remaining[0]?.id || null); setDraft(null); setBaseline(null); setConfirmRemove(false);
    setToast({ kind: 'success', message: `${removed.name} removed` });
  };

  const resetStatus = async () => {
    setConfirmReset(false); setSaving(true);
    try { const next = await deviceApi.applyDeviceCommands({ ip: selected.ip, product: 'status', commands: [{ settings: { rgb_reset: 1 } }] }); setStates(current => ({ ...current, [selected.id]: { data: next, error: null } })); const nextDraft = draftFromState(next); setDraft(nextDraft); setBaseline(nextDraft); setToast({ kind: 'success', message: 'Lighting defaults restored' }); }
    catch (problem) { setToast({ kind: 'error', message: problem.message }); }
    finally { setSaving(false); }
  };

  const dryingToggle = async () => { try { await save([{ settings: { isrunning: state.drying ? 0 : 1 } }]); } catch (_) {} };
  const controlVentCommand = async command => {
    setSaving(true);
    try {
      const next = await deviceApi.applyDeviceCommands({ ip: selected.ip, product: 'control-vent', commands: [{ command }] });
      setStates(current => ({ ...current, [selected.id]: { data: next, error: null, updatedAt: Date.now() } }));
      const nextDraft = draftFromState(next); setDraft(nextDraft); setBaseline(nextDraft); setToast({ kind: 'success', message: 'Vent command applied' });
    } catch (problem) { setToast({ kind: 'error', message: problem.message }); }
    finally { setSaving(false); }
  };

  return (
    <div className="app-shell" ref={canvasRef}>
      <header className="topbar">
        <div className="brand-block"><strong>Panda Control</strong><span>An <button onClick={() => deviceApi.openWebsite()}>Extrusion Therapy</button> workshop tool</span></div>
        <nav className="device-tabs" aria-label="Panda devices">
          {devices.map(device => <button key={device.id} className={device.id === selected?.id ? 'selected' : ''} onClick={() => setSelectedId(device.id)}><i className={states[device.id]?.error ? 'offline' : ''} /><span>{device.name}</span></button>)}
          {!devices.length && <span className="empty-tabs">No devices yet</span>}
        </nav>
        <div className="toolbar-actions">
          {selected && <span className={`toolbar-status ${error ? 'offline' : ''}`}><i />{error ? 'Offline' : 'Online'}</span>}
          <AppButton icon={scanning ? Spinner : ArrowsClockwise} onClick={scan} disabled={scanning} aria-label={scanning ? 'Scanning for devices' : 'Scan for devices'}>{scanning ? 'Scanning' : 'Scan'}</AppButton>
          <AppButton icon={Plus} onClick={() => setAddOpen(true)} aria-label="Add a device">Add</AppButton>
          <button className="appearance-button" onClick={() => setAppearance(current => current === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`}>{appearance === 'dark' ? <Moon size={18} /> : <Sun size={18} />}<span>{appearance === 'dark' ? 'Dark' : 'Light'}</span><CaretDown size={13} /></button>
          <button className="save-button" onClick={() => save().catch(() => {})} disabled={!dirty || saving || !state}>{saving ? <Spinner /> : <Check size={17} weight="bold" />}Save</button>
        </div>
      </header>
      <main className="content">
        {!selected ? (
          <section className="empty-state"><SlidersHorizontal size={42} weight="duotone" /><h1>Find your Panda devices</h1><p>Scan this network or add the IP address of a device that is already set up.</p><div><AppButton icon={ArrowsClockwise} onClick={scan}>Scan Network</AppButton><AppButton icon={Plus} onClick={() => setAddOpen(true)}>Add IP</AppButton></div></section>
        ) : selected.product === 'unknown' ? <UnsupportedPanel device={selected} onRemove={() => setConfirmRemove(true)} /> : !state || !draft || state.product !== selected.product || draft.product !== selected.product ? (
          <section className="loading-state">{error ? <><WarningCircle size={34} /><h2>Device unavailable</h2><p>{error}</p><div className="unavailable-actions"><AppButton icon={ArrowsClockwise} onClick={() => refresh(selected, true)}>Try Again</AppButton><AppButton icon={Trash} className="remove-device-button" onClick={() => setConfirmRemove(true)}>Remove Device</AppButton></div></> : <><Spinner size={30} /><p>Reading {selected.name}…</p></>}</section>
        ) : <>
          {selected.product === 'status' ? <StatusPanel state={state} draft={draft} setDraft={setDraft} onReset={() => setConfirmReset(true)} /> : selected.product === 'breath' ? <BreathPanel state={state} draft={draft} setDraft={setDraft} onDryingToggle={dryingToggle} busy={saving} /> : selected.product === 'control-vent' ? <ControlVentPanel state={state} draft={draft} setDraft={setDraft} onCommand={controlVentCommand} busy={saving} /> : <VentPanel draft={draft} setDraft={setDraft} />}
          <section className={`device-info ${infoOpen ? 'open' : ''}`}><button onClick={() => setInfoOpen(current => !current)}>{infoOpen ? <CaretDown size={20} /> : <CaretRight size={20} />}<span>Device Information</span></button>
            {infoOpen && <div className="device-info-body"><div><span>IP Address</span><strong>{selected.ip}</strong></div><div><span>Firmware</span><strong>{state.firmware || 'Unknown'}</strong></div><div><span>Profile</span><strong>{selected.product === 'status' ? 'Panda Status' : selected.product === 'breath' ? 'Panda Breath' : selected.product === 'control-vent' ? 'Panda Control Vent' : 'Panda Vent'}</strong></div><AppButton icon={SlidersHorizontal} onClick={() => deviceApi.openDevicePage(selected.ip)}>Open Original Interface</AppButton><AppButton icon={Trash} className="remove-device-button" onClick={() => setConfirmRemove(true)}>Remove Device</AppButton></div>}
          </section>
        </>}
      </main>
      {addOpen && <AddDeviceDialog onClose={() => setAddOpen(false)} onAdd={addDevice} onAddDiscovered={addDiscoveredDevice} knownDevices={devices} />}
      {confirmReset && <ConfirmDialog title="Restore lighting defaults?" body="This resets Panda Status lighting modes, brightness, and colors. Network and printer setup are not affected." confirmLabel="Restore Defaults" onCancel={() => setConfirmReset(false)} onConfirm={resetStatus} />}
      {confirmRemove && <ConfirmDialog title={`Remove ${selected?.name || 'device'}?`} body="This removes the device from Panda Control only. It does not change the device, its network setup, or its printer connection." confirmLabel="Remove Device" onCancel={() => setConfirmRemove(false)} onConfirm={removeDevice} />}
      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.kind === 'success' ? <Check size={18} /> : <WarningCircle size={18} />}{toast.message}</div>}
    </div>
  );
}
