const jwt = require("jsonwebtoken");
const User = require("../models/App_Users/User"); // Importez le modèle User

module.exports = async (req, res, next) => {
  const token = req.header("Authorization");

  if (!token || !token.startsWith("Bearer ")) {
    return res.status(401).json({ msg: "Aucun token, autorisation refusée" });
  }

  try {
    const decoded = jwt.verify(token.substring(7), process.env.JWT_SECRET);
    const user = await User.findById(decoded.id); // Trouvez l'utilisateur avec l'ID décodé
    if (!user) {
      return res.status(404).json({ msg: "Utilisateur non trouvé" });
    }
    req.user = user; // Attribuez l'objet utilisateur complet à req.user
    next();
  } catch (err) {
    res.status(401).json({ msg: "Token non valide" });
  }
};

