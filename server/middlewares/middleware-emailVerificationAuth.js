// middleware-emailVerificationAuth.js
const EmailVerificationToken = require("../models/App_Users/EmailVerificationToken");
const jwt = require("jsonwebtoken");

// Parse strict d'un header Authorization: format attendu = "Bearer <token>".
// Tolerant a la casse de "Bearer" et aux espaces multiples. Retourne null si
// le format est invalide (au lieu de undefined silencieux qui fait passer
// jwt.verify(undefined) -> exception generique trompeuse).
function parseBearer(authHeader) {
  if (typeof authHeader !== 'string') return null;
  const m = authHeader.trim().match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

const emailVerificationAuth = async (req, res, next) => {
  const authHeader = req.header('Authorization');

  if (!authHeader) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  const split = parseBearer(authHeader);
  if (!split) {
    return res.status(401).json({ msg: 'Authorization header malformed (expected: Bearer <token>)' });
  }

  try {
    const decoded = jwt.verify(split, process.env.JWT_SECRET);
    req.user = decoded.id;

    // Recherche du token en base. On NE log PAS le token (fuite secret) ni
    // le document Mongo entier qui le contient en clair.
    const emailVerificationToken = await EmailVerificationToken.findOne({ token: split });

    if (!emailVerificationToken) {
      return res.status(401).json({ msg: 'Token is not valid' });
    }

    next();
  } catch (err) {
    console.error("[emailVerificationAuth] JWT verify failed:", err && err.name);
    return res.status(401).json({ msg: 'Token is not valid' });
  }
};

module.exports = emailVerificationAuth;

