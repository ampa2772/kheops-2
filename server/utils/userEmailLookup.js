function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Recherche une adresse exacte sans tenir compte de la casse.
 *
 * Le modèle est injecté pour garder cette règle testable et réutilisable sans
 * ouvrir la porte aux opérateurs Mongo ou aux métacaractères d'une expression
 * régulière présents dans une adresse valide (notamment « + » et « . »).
 */
function findUserByEmailCaseInsensitive(UserModel, email) {
  const safe = escapeRegExp(String(email || '').trim());
  if (!safe) return Promise.resolve(null);
  return UserModel.findOne({ email: { $regex: `^${safe}$`, $options: 'i' } });
}

module.exports = {
  escapeRegExp,
  findUserByEmailCaseInsensitive,
};
