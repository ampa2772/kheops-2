const DEFAULT_FLAGS = Object.freeze({
  aiAssistant: true,
  responsiveEditor: true,
  relationGraph: true,
  documentSyncV2: true,
  officeEngine: true,
});

function envName(name) {
  return `KHEOPS_FEATURE_${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`;
}

function enabled(name, env = process.env) {
  const value = env[envName(name)];
  if (value === undefined) return DEFAULT_FLAGS[name] === true;
  return !['0', 'false', 'off', 'disabled'].includes(String(value).trim().toLowerCase());
}

function all(env = process.env) {
  return Object.fromEntries(Object.keys(DEFAULT_FLAGS).map((name) => [name, enabled(name, env)]));
}

function requireFeature(name) {
  return function featureGate(_req, res, next) {
    if (enabled(name)) return next();
    return res.status(404).json({
      error: 'FEATURE_DISABLED',
      feature: name,
      message: 'Cette fonctionnalité est temporairement désactivée.',
    });
  };
}

module.exports = { DEFAULT_FLAGS, all, enabled, envName, requireFeature };
