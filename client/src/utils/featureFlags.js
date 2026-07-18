const DEFAULT_FLAGS = Object.freeze({
  aiAssistant: true,
  responsiveEditor: true,
  relationGraph: true,
  documentSyncV2: true,
  officeEngine: true,
});

function runtimeFlags() {
  try {
    const value = typeof window !== 'undefined' && window.__KHEOPS_CONFIG__?.features;
    return value && typeof value === 'object' ? value : {};
  } catch (_error) {
    return {};
  }
}

function envFlag(name) {
  const value = process.env[`REACT_APP_FEATURE_${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`];
  if (value === undefined) return undefined;
  return !['0', 'false', 'off', 'disabled'].includes(String(value).trim().toLowerCase());
}

export function isFeatureEnabled(name) {
  const runtime = runtimeFlags();
  if (Object.prototype.hasOwnProperty.call(runtime, name)) return runtime[name] !== false;
  const fromEnv = envFlag(name);
  if (fromEnv !== undefined) return fromEnv;
  return DEFAULT_FLAGS[name] === true;
}

export function getFeatureFlags() {
  return Object.fromEntries(Object.keys(DEFAULT_FLAGS).map((name) => [name, isFeatureEnabled(name)]));
}

export { DEFAULT_FLAGS };
