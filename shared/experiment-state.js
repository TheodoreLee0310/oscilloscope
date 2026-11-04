// Shared allowlist: never restore arbitrary Vue fields, code, URLs or canvas objects.
const number = (min, max) => v => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const choice = (...values) => v => values.includes(v);
const bool = v => typeof v === 'boolean';
const pair = rule => v => object(v) && Object.keys(v).length === 2 && rule(v[1]) && rule(v[2]);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const factors = v => object(v) && Object.keys(v).length === 2 && number(0.01, 10)(v.time) && pair(number(0.01, 10))(v.volts);
const rules = {
  expStep: choice('calibration', 'normal', 'lissajous', 'vrwave', 'imagewave'),
  currentMode: choice('wave', 'lissajous'),
  signalType: choice('sine', 'square', 'triangle', 'sawtooth', 'noise', 'pulse'),
  displayMode: choice('independent', 'overlay', 'vertical'),
  inputActive: pair(bool), timeDiv: number(0.000001, 10000), voltsDiv: pair(number(0.000001, 10000)),
  frequencies: pair(number(0.000001, 1000000)), peakValues: pair(number(0, 10000)),
  freqX: number(0.000001, 1000000), freqY: number(0.000001, 1000000), phaseDiff: number(-360, 360),
  calibrationFactor: number(0.01, 10), displayAdjustFactors: factors,
  savedCalibrationSettings: v => object(v) && Object.keys(v).length === 2 && number(0.01, 10)(v.calibrationFactor) && factors(v.displayAdjustFactors),
  horizontalPosition: number(-10000, 10000), verticalPosition: pair(number(-10000, 10000)),
  triggerActive: bool, triggerSource: choice(1, 2), triggerSlope: choice('rising', 'falling'),
  triggerMode: choice('auto', 'normal', 'single'), triggerLevel: number(-10000, 10000)
};
const channel = v => object(v) && Object.keys(v).length === 7 && bool(v.enabled) &&
  choice('sine', 'square', 'triangle', 'sawtooth', 'pulse', 'noise')(v.waveType) &&
  number(1, 1000)(v.frequency) && number(0.1, 5)(v.amplitude) && number(0.1, 10)(v.voltsDiv) &&
  number(-3, 3)(v.offsetDiv) && number(0, 360)(v.phaseDeg);
const nativeRules = {
  displayMode: choice('dual', 'overlay', 'lissajous'), timeDiv: number(0.001, 0.5),
  triggerEnabled: bool, triggerLevel: number(-5, 5), triggerRising: bool, runTimeSec: choice(0),
  ch1: v => channel(v) && v.phaseDeg === 0, ch2: channel
};
function validateState(state) {
  if (!object(state) || ![1, 2].includes(state.version) || !object(state.parameters)) throw new Error('实验数据版本或格式不正确');
  const selectedRules = state.version === 2 ? nativeRules : rules;
  const keys = Object.keys(state.parameters);
  if (keys.length !== Object.keys(selectedRules).length || !keys.every(k => Object.hasOwn(selectedRules, k) && selectedRules[k](state.parameters[k]))) {
    throw new Error('实验参数缺失或超出允许范围');
  }
  return JSON.parse(JSON.stringify({ version: state.version, parameters: state.parameters }));
}
function captureState(vm) {
  return validateState({ version: 1, parameters: Object.fromEntries(Object.keys(rules).map(k => [k, vm[k]])) });
}
module.exports = { validateState, captureState };
