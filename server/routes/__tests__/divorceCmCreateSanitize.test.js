// Tests de non-régression — fix 2026-07-04 (bugs bloquants trouvés au test
// fonctionnel prod sur POST /api/divorce-cm) :
//  1. Le wizard client envoie des ObjectId VIDES ('' — ex. epoux2.avocat.contactId
//     quand « mon cabinet est aussi l'avocat » est coché ou que l'avocat adverse
//     est saisi à la main) => CastError Mongoose => 400 « Validation des données
//     échouée » alors que Dossier + UserDossier étaient DÉJÀ créés => dossiers
//     fantômes (5 constatés en prod).
//  2. L'ordre d'écriture créait le Dossier AVANT de valider la fiche divorce.
//     Le fix valide la fiche d'abord : plus aucune écriture si elle est invalide.
//
// DivorceCMData est le VRAI modèle (validation Mongoose réelle) avec save()
// espionné ; Dossier/UserDossier sont simulés. Handler extrait du routeur
// (même approche que deleteDossierGuard.test.js).

const mongoose = require('mongoose');

jest.mock('../../middlewares/middleware-auth', () => (req, res, next) => next());
jest.mock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), delete: jest.fn() }));

jest.mock('../../models/Folder/Dossier', () => {
  const { Types } = require('mongoose');
  const ctor = jest.fn(function (data) {
    this.__data = data;
    this._id = ctor.FIXED_ID; // vrai ObjectId : l'affectation divorce.dossierId doit caster
    this.save = jest.fn(async () => { ctor.saved.push(this); return this; });
    this.toObject = () => ({ _id: this._id });
    this.markModified = jest.fn();
  });
  ctor.FIXED_ID = new Types.ObjectId();
  ctor.saved = [];
  ctor.deleteOne = jest.fn(async () => ({ deletedCount: 1 }));
  ctor.findById = jest.fn(async () => null);
  return ctor;
});

jest.mock('../../models/Folder/modelsLiaisons/UserDossier', () => {
  const ctor = jest.fn(function (data) {
    this.__data = data;
    this.save = jest.fn(async () => { ctor.saved.push(this); return this; });
  });
  ctor.saved = [];
  ctor.deleteOne = jest.fn(async () => ({ deletedCount: 1 }));
  return ctor;
});

// Modèles touchés par les synchronisations post-création (best effort, try/catch
// côté route) — simulés au minimum pour qu'elles sortent proprement.
jest.mock('../../models/Folder/Contact', () => {
  const ctor = jest.fn(function () { this.save = jest.fn().mockResolvedValue(this); });
  ctor.findById = jest.fn(async () => null);
  ctor.find = jest.fn(async () => []);
  return ctor;
});
jest.mock('../../models/Folder/PersonneCharge', () => {
  const ctor = jest.fn(function () { this.save = jest.fn().mockResolvedValue(this); });
  ctor.find = jest.fn(() => ({ lean: async () => [] }));
  ctor.findById = jest.fn(async () => null);
  return ctor;
});
jest.mock('../../models/Folder/modelsLiaisons/ContactPersonneCharge', () => {
  const ctor = jest.fn(function () { this.save = jest.fn().mockResolvedValue(this); });
  ctor.find = jest.fn(() => ({ lean: async () => [] }));
  return ctor;
});
jest.mock('../../models/Folder/modelsLiaisons/UserContact', () => {
  const ctor = jest.fn(function () { this.save = jest.fn().mockResolvedValue(this); });
  ctor.find = jest.fn(() => ({ lean: async () => [] }));
  return ctor;
});

const Dossier = require('../../models/Folder/Dossier');
const UserDossier = require('../../models/Folder/modelsLiaisons/UserDossier');
const DivorceCMData = require('../../models/Divorce/DivorceCMData');
const router = require('../divorceCM');
const { sanitizeObjectIdFields } = require('../divorceCM');

const USER_ID = new mongoose.Types.ObjectId().toString();

function extractPostHandler() {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/' && l.route.methods.post
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function fakeReqRes(divorceData) {
  const req = { body: { divorceData }, user: USER_ID, method: 'POST', originalUrl: '/api/divorce-cm' };
  const res = {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
  };
  return { req, res, next: jest.fn() };
}

async function settleHandler(handler, req, res, next) {
  handler(req, res, next);
  for (let i = 0; i < 200; i++) {
    if (res.json.mock.calls.length || next.mock.calls.length) break;
    await new Promise((r) => setImmediate(r));
  }
}

describe('sanitizeObjectIdFields (unitaire)', () => {
  test("'' -> null sur les clés *Id / contactId / pchId / enfantIdLocal / realisePar", () => {
    const payload = {
      epoux2: { contactId: '', avocat: { contactId: '', nom: 'X' } },
      notaire: { contactId: '' },
      enfants: [{ pchId: '', nom: 'E' }],
      adultesCharge: [{ pchId: '' }],
      pensionsAlimentaires: [{ enfantIdLocal: '' }],
      etapes: [{ realisePar: '' }],
    };
    sanitizeObjectIdFields(payload);
    expect(payload.epoux2.contactId).toBeNull();
    expect(payload.epoux2.avocat.contactId).toBeNull();
    expect(payload.notaire.contactId).toBeNull();
    expect(payload.enfants[0].pchId).toBeNull();
    expect(payload.adultesCharge[0].pchId).toBeNull();
    expect(payload.pensionsAlimentaires[0].enfantIdLocal).toBeNull();
    expect(payload.etapes[0].realisePar).toBeNull();
    expect(payload.epoux2.avocat.nom).toBe('X'); // champs métier intacts
  });

  test('id/_id numériques (Date.now() client) supprimés, ObjectId hex24 valides conservés', () => {
    const valid = new mongoose.Types.ObjectId().toString();
    const payload = {
      enfants: [
        { id: 1783151758576, _id: 1783151758576, nom: 'A' },
        { _id: valid, pchId: valid, nom: 'B' },
      ],
    };
    sanitizeObjectIdFields(payload);
    expect(payload.enfants[0]).not.toHaveProperty('id');
    expect(payload.enfants[0]).not.toHaveProperty('_id');
    expect(payload.enfants[1]._id).toBe(valid);
    expect(payload.enfants[1].pchId).toBe(valid);
  });
});

describe('POST /api/divorce-cm — création avec ObjectId vides + anti dossier fantôme', () => {
  let saveSpy;

  beforeEach(() => {
    Dossier.mockClear();
    Dossier.saved.length = 0;
    UserDossier.mockClear();
    UserDossier.saved.length = 0;
    saveSpy = jest.spyOn(DivorceCMData.prototype, 'save').mockResolvedValue(undefined);
  });

  afterEach(() => {
    saveSpy.mockRestore();
  });

  test("201 avec epoux2.avocat.contactId:'' (cas « mon cabinet est aussi l'avocat »)", async () => {
    const handler = extractPostHandler();
    const { req, res, next } = fakeReqRes({
      epoux1: { civilite: 'M.', nom: 'EPOUX', prenoms: 'Jean', avocat: { contactId: '', nom: 'Jalet' } },
      epoux2: { civilite: 'Mme', nom: 'EPOUSE', prenoms: 'Marie', avocat: { contactId: '', nom: '' } },
      mariage: { lieu: 'Paris' },
      enfants: [{ nom: 'ENFANT1', prenoms: 'Leo', sexe: 'M', pchId: '', id: 1783151758576 }],
      adultesCharge: [{ nom: 'ADULTE1', pchId: '' }],
      notaire: { contactId: '' },
    });

    await settleHandler(handler, req, res, next);

    expect(next).not.toHaveBeenCalled();      // l'ancien code partait en CastError ici
    expect(res.statusCode).toBe(201);
    expect(Dossier).toHaveBeenCalledTimes(1); // un seul Dossier construit, après validation de la fiche
    expect(Dossier.saved.length).toBeGreaterThanOrEqual(1); // save création (+ resave par la sync parties)
    expect(saveSpy).toHaveBeenCalled();
    // le dossierId provisoire a bien été remplacé par celui du Dossier créé
    const divorceInstance = saveSpy.mock.instances[0];
    expect(String(divorceInstance.dossierId)).toBe(String(Dossier.FIXED_ID));
  });

  test('fiche divorce invalide => AUCUN Dossier/UserDossier créé (anti fantôme)', async () => {
    const handler = extractPostHandler();
    const { req, res, next } = fakeReqRes({
      epoux1: { civilite: 'CIVILITE_INVALIDE', nom: 'X' }, // enum civilite -> ValidationError
      epoux2: {},
    });

    await settleHandler(handler, req, res, next);

    expect(next).toHaveBeenCalled();          // erreur remontée au handler global (400)
    expect(Dossier).not.toHaveBeenCalled();   // plus aucune écriture avant validation
    expect(Dossier.saved.length).toBe(0);
    expect(UserDossier.saved.length).toBe(0);
  });
});
