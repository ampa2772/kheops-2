// Tests du durcissement des schémas contact (bornage longueur + saveAsContact).
// Vérifie : (1) champs riches préservés (unknown), (2) longueurs bornées,
// (3) pas de mutation de la donnée, (4) saveAsContactSchema.

const {
  createContactSchema,
  createContactPMPubliqueSchema,
  saveAsContactSchema,
} = require('../contactSchemas');

const opts = { abortEarly: false, stripUnknown: true, convert: true };

describe('createContactSchema — bornage + préservation', () => {
  test('accepte un contact valide et PRÉSERVE les champs riches inconnus', () => {
    const body = {
      contact: {
        nom: 'Dupont',
        prenoms: 'Jean',
        adresse: '12 rue de la Paix',
        // champ riche non déclaré → doit être conservé (unknown:true)
        detailMariage: { regime: 'communaute', date: '2020-01-01' },
        personnesCharge: [{ nom: 'Enfant' }],
      },
      options: { contactType: 'physique' },
    };
    const { value, error } = createContactSchema.validate(body, opts);
    expect(error).toBeUndefined();
    expect(value.contact.nom).toBe('Dupont');
    // champ riche préservé malgré stripUnknown global (grâce à unknown(true))
    expect(value.contact.detailMariage).toEqual({ regime: 'communaute', date: '2020-01-01' });
    expect(value.contact.personnesCharge).toEqual([{ nom: 'Enfant' }]);
  });

  test('rejette un nom au-delà de la limite (DoS champ géant)', () => {
    const body = { contact: { nom: 'x'.repeat(301) } };
    const { error } = createContactSchema.validate(body, opts);
    expect(error).toBeTruthy();
    expect(error.details.some((d) => d.path.join('.') === 'contact.nom')).toBe(true);
  });

  test('rejette une adresse > 1000 et un email > 254', () => {
    expect(createContactSchema.validate({ contact: { adresse: 'a'.repeat(1001) } }, opts).error).toBeTruthy();
    expect(createContactSchema.validate({ contact: { email: 'a'.repeat(250) + '@b.com' } }, opts).error).toBeTruthy();
  });

  test('NE MUTE PAS la donnée (pas de trim/lowercase)', () => {
    const body = { contact: { nom: '  Dupont  ', email: 'JEAN@Example.COM' } };
    const { value, error } = createContactSchema.validate(body, opts);
    expect(error).toBeUndefined();
    expect(value.contact.nom).toBe('  Dupont  '); // espaces conservés
    expect(value.contact.email).toBe('JEAN@Example.COM'); // casse conservée
  });

  test('accepte un nom à la limite exacte (300)', () => {
    expect(createContactSchema.validate({ contact: { nom: 'x'.repeat(300) } }, opts).error).toBeUndefined();
  });
});

describe('createContactPMPubliqueSchema — bloc contactData borné', () => {
  test('borne raisonSociale/denomination et préserve le reste', () => {
    const ok = createContactPMPubliqueSchema.validate(
      { contactData: { denomination: 'Tribunal', codeInsee: '75056' } },
      opts,
    );
    expect(ok.error).toBeUndefined();
    expect(ok.value.contactData.codeInsee).toBe('75056');
    const ko = createContactPMPubliqueSchema.validate(
      { contactData: { denomination: 'd'.repeat(401) } },
      opts,
    );
    expect(ko.error).toBeTruthy();
  });
});

describe('saveAsContactSchema — divorce CM', () => {
  test('accepte { kind, data, personnesCharge } valide', () => {
    const body = {
      kind: 'epoux',
      data: { nom: 'Martin', prenoms: 'Claire', adresse: '3 av. Foch' },
      personnesCharge: [{ nom: 'Léa', type: 'enfant' }],
    };
    const { value, error } = saveAsContactSchema.validate(body, opts);
    expect(error).toBeUndefined();
    expect(value.data.nom).toBe('Martin');
    expect(value.personnesCharge[0].nom).toBe('Léa');
  });

  test('exige data', () => {
    expect(saveAsContactSchema.validate({ kind: 'epoux' }, opts).error).toBeTruthy();
  });

  test('rejette > 50 personnes à charge et un champ géant dans data', () => {
    const many = { data: { nom: 'M' }, personnesCharge: new Array(51).fill({ nom: 'x' }) };
    expect(saveAsContactSchema.validate(many, opts).error).toBeTruthy();
    const giant = { data: { nom: 'x'.repeat(301) } };
    expect(saveAsContactSchema.validate(giant, opts).error).toBeTruthy();
  });

  test('strip les clés top-level inattendues mais garde data intact', () => {
    const body = { data: { nom: 'M', champRiche: { a: 1 } }, isAdmin: true };
    const { value } = saveAsContactSchema.validate(body, opts);
    expect(value.isAdmin).toBeUndefined(); // strippé
    expect(value.data.champRiche).toEqual({ a: 1 }); // préservé (unknown)
  });
});
