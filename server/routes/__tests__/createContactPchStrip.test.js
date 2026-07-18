// Test de non-régression — fix 2026-07-04 (bug bloquant trouvé au test fonctionnel prod).
// POST /api/folder/contact : le client (pchSlice) envoie dans options.personnesCharge
// des fiches portant un `id` temporaire Date.now() (+ position). Sans strip, Mongoose
// mappe `id` -> `_id` => CastError => 400 APRES la création du contact (écriture
// partielle : contact + liaison créés sans ses personnes à charge => doublons
// silencieux au re-clic). Le fix réplique le strip { _id, id, position } déjà en
// place dans la boucle diff du PUT /contact/:id.
//
// Même approche que deleteDossierGuard.test.js : handler extrait du routeur,
// modèles simulés, settleHandler pour attendre la réponse (asyncHandler ne
// renvoie pas la promesse).

const mongoose = require('mongoose');

// --- Mocks des modules touchés par le chemin POST /contact -----------------

jest.mock('../../middlewares/middleware-auth', () => (req, res, next) => next());
jest.mock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), delete: jest.fn() }));

jest.mock('../../models/Folder/Contact', () => {
  const ctor = jest.fn(function (data) {
    Object.assign(this, data);
    this._id = 'CONTACT_ID';
    this.save = jest.fn().mockResolvedValue(this);
    this.toObject = () => ({ ...data, _id: this._id });
  });
  return ctor;
});

jest.mock('../../models/Folder/modelsLiaisons/UserContact', () => {
  const ctor = jest.fn(function (data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
  });
  return ctor;
});

jest.mock('../../models/Folder/PersonneCharge', () => {
  const ctor = jest.fn(function (data) {
    ctor.received.push(data); // payload EXACT passé au modèle (après strip)
    Object.assign(this, data);
    this._id = 'PCH_' + ctor.received.length;
    this.save = jest.fn().mockResolvedValue(this);
  });
  ctor.received = [];
  return ctor;
});

jest.mock('../../models/Folder/modelsLiaisons/ContactPersonneCharge', () => {
  const ctor = jest.fn(function (data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
  });
  return ctor;
});

const PersonneCharge = require('../../models/Folder/PersonneCharge');
const router = require('../folder/folderContacts');

function extractPostContactHandler() {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/contact' && l.route.methods.post
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function fakeReqRes(body) {
  const req = {
    body,
    user: new mongoose.Types.ObjectId().toString(),
    method: 'POST',
    originalUrl: '/api/folder/contact',
  };
  const res = {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
  };
  return { req, res, next: jest.fn() };
}

async function settleHandler(handler, req, res, next) {
  handler(req, res, next);
  for (let i = 0; i < 100; i++) {
    if (res.json.mock.calls.length || next.mock.calls.length) break;
    await new Promise((r) => setImmediate(r));
  }
}

describe('POST /contact — strip des ids temporaires des personnes à charge', () => {
  beforeEach(() => {
    PersonneCharge.received.length = 0;
    PersonneCharge.mockClear();
  });

  test('création OK (pas de 400) avec des PCH portant id numérique Date.now() + position', async () => {
    const handler = extractPostContactHandler();
    const { req, res, next } = fakeReqRes({
      contact: { nom: 'TEST-EPOUX', prenoms: 'Jean', pro_contact: false },
      options: {
        personnesCharge: [
          { nom: 'ENFANT1', prenoms: 'Leo', type: 'enfant', genre: 'Masculin', id: 1783151758576, position: 0 },
          { nom: 'ADULTE1', prenoms: 'Renee', type: 'adulte', genre: 'Feminin', id: 1783151803610, position: 1 },
        ],
      },
    });

    await settleHandler(handler, req, res, next);

    expect(next).not.toHaveBeenCalled();          // pas d'erreur (l'ancien code CastError-ait ici)
    expect(res.statusCode).toBe(200);             // res.json direct (contrat existant du POST PP)
    expect(res.json).toHaveBeenCalled();
    expect(PersonneCharge).toHaveBeenCalledTimes(2);

    for (const data of PersonneCharge.received) {
      expect(data).not.toHaveProperty('id');       // id temporaire client jamais persisté
      expect(data).not.toHaveProperty('_id');
      expect(data).not.toHaveProperty('position');
    }
    expect(PersonneCharge.received[0].nom).toBe('ENFANT1');
    expect(PersonneCharge.received[1].type).toBe('adulte');
  });

  test('les champs métier des PCH sont transmis intacts', async () => {
    const handler = extractPostContactHandler();
    const { req, res, next } = fakeReqRes({
      contact: { nom: 'X', pro_contact: false },
      options: {
        personnesCharge: [{
          nom: 'E', prenoms: 'Zoe', type: 'enfant', genre: 'Feminin',
          dateNaissance: '2015-05-10', maritalStatus: 'Célibataire',
          id: 1700000000000, position: 0,
        }],
      },
    });

    await settleHandler(handler, req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(PersonneCharge.received[0]).toMatchObject({
      nom: 'E', prenoms: 'Zoe', type: 'enfant', genre: 'Feminin',
      dateNaissance: '2015-05-10', maritalStatus: 'Célibataire',
    });
  });
});
