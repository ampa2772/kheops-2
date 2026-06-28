const express = require('express');
const router = express.Router();
const Profession = require('../../models/Folder/Profession');
const auth = require('../../middlewares/middleware-auth');

// GET /api/folder/professions — Retourne toutes les professions ou filtrees
// SECURITE rc37 (H-13) : `auth` ajoute pour eviter les requetes anonymes.
router.get('/professions', auth, async (req, res) => {
  try {
    const query = req.query.nom_profession || '';
    let filter = {};

    if (query.trim()) {
      filter = { name: { $regex: `^${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } };
    }

    const professions = await Profession.find(filter).sort({ name: 1 }).lean();
    res.json(professions);
  } catch (err) {
    console.error('Erreur lors de la recuperation des professions:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/folder/profession — Cree une nouvelle profession
// SECURITE rc37 (H-13) : `auth` ajoute — sans cela un attaquant non-authentifie
// pouvait polluer la collection Profession via upsert anonyme.
router.post('/profession', auth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Le nom de la profession est requis' });
    }

    const trimmedName = name.trim();

    const profession = await Profession.findOneAndUpdate(
      { name: { $regex: `^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      { $setOnInsert: { name: trimmedName } },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(201).json(profession);
  } catch (err) {
    console.error('Erreur lors de la creation de la profession:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
