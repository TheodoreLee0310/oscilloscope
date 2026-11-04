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
function validateState(state) {
  if (!object(state) || state.version !== 1 || !object(state.parameters)) throw new Error('实验数据版本或格式不正确');
  const keys = Object.keys(state.parameters);
  if (keys.length !== Object.keys(rules).length || !keys.every(k => Object.hasOwn(rules, k) && rules[k](state.parameters[k]))) {
    throw new Error('实验参数缺失或超出允许范围');
  }
  return JSON.parse(JSON.stringify({ version: 1, parameters: state.parameters }));
}
function captureState(vm) {
  return validateState({ version: 1, parameters: Object.fromEntries(Object.keys(rules).map(k => [k, vm[k]])) });
}
module.exports = { validateState, captureState };
