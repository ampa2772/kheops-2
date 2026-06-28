// Sous-composant reutilisable : formulaire d'identite d'un epoux + son avocat.
// Utilise par StepEpoux1 et StepEpoux2.
//
// Automatisations :
//  - Recherche du contact existant en haut de la section : si trouve,
//    pre-remplit l'ensemble des champs civils en un clic.
//  - Pour l'avocat de l'epoux client (StepEpoux1) : bouton "Pre-remplir
//    avec mon profil cabinet" qui injecte les infos du User connecte
//    (nom, prenom, barreau, adresse, telephone, email).
//  - Pour l'avocat de l'autre epoux (StepEpoux2) : recherche dans la
//    base des contacts professionnels.
//  - CommunePicker (CP <-> ville auto) sur l'adresse de domicile et
//    l'adresse du cabinet.
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setDraftField, addEnfant, addAdulte } from '../../../redux/slices/divorceCMSlice';
import { toDateInputValue } from '../divorceCMHelpers';
import ContactSearchBox from '../widgets/ContactSearchBox';
import CommunePicker from '../widgets/CommunePicker';
import apiClient from '../../../services/apiClient';
import { useConfirm } from '../../common/notifications/ConfirmProvider';

const capitalize = (s) => {
  if (!s) return '';
  return String(s).split(/\s+/).map(w =>
    w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''
  ).join(' ');
};

const EpouxFields = ({ epouxKey, titre, sousTitre, isClientCabinet }) => {
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const epoux = useSelector(s => s.divorceCM.draft?.[epouxKey]) || {};
  const epoux1 = useSelector(s => s.divorceCM.draft?.epoux1) || {};
  const enfantsExistants = useSelector(s => s.divorceCM.draft?.enfants || []);
  const adultesExistants = useSelector(s => s.divorceCM.draft?.adultesCharge || []);
  const partageAvocat = useSelector(s => s.divorceCM.draft?.partageAvocat ?? true);
  const constants = useSelector(s => s.divorceCM.constants);
  const userProfile = useSelector(s => s.login?.user);

  // Active uniquement pour l'epoux 2 : indique si on partage l'avocat avec
  // l'epoux 1 (= cabinet). Quand active, on cache la section avocat 2 et
  // on copie automatiquement avocat1 -> avocat2 a chaque changement.
  const showPartageToggle = epouxKey === 'epoux2';
  const partageActif = showPartageToggle && !!partageAvocat;

  const setField = (subpath, value) => dispatch(setDraftField({ path: [epouxKey, ...subpath], value }));
  const setAvocatField = (key, value) => dispatch(setDraftField({ path: [epouxKey, 'avocat', key], value }));

  // Cle de deduplication d'enfant (insensible a la casse)
  const enfantKey = (e) => {
    const nom = String(e?.nom || '').toLowerCase().trim();
    const prenoms = String(e?.prenoms || '').toLowerCase().trim();
    const dn = e?.dateNaissance ? new Date(e.dateNaissance).toISOString().slice(0, 10) : '';
    return `${nom}|${prenoms}|${dn}`;
  };

  // Mappe une PersonneCharge (modele BDD) vers un Enfant (modele wizard)
  const mapPersonneChargeToEnfant = (pc) => ({
    pchId: pc._id || null,
    nom: pc.nom || '',
    prenoms: pc.prenoms || '',
    sexe: (pc.genre === 'Feminin' || pc.genre === 'Féminin') ? 'F' : 'M',
    dateNaissance: pc.dateNaissance || null,
    lieuNaissance: pc.villeNaissance || '',
    cpNaissance: pc.codePostalNaissance || '',
    scolarite: { etablissement: '', classe: '', ville: '' },
    residence: { type: '', detailAlternance: '', droitVisiteHebergement: '', vacancesScolaires: '' },
    autoriteParentale: 'conjointe',
    souhaiteEtreEntendu: false,
  });

  // Mappe une PersonneCharge (modele BDD) vers un Adulte a charge (wizard)
  const mapPersonneChargeToAdulte = (pc) => ({
    pchId: pc._id || null,
    nom: pc.nom || '',
    prenoms: pc.prenoms || '',
    sexe: (pc.genre === 'Feminin' || pc.genre === 'Féminin') ? 'F' : 'M',
    dateNaissance: pc.dateNaissance || null,
    lieuNaissance: pc.villeNaissance || '',
    adresse: pc.adresse || '',
    codePostal: pc.codePostal || '',
    ville: pc.ville || '',
    lien: '',
    motif: '',
    aLaChargeDe: 'commun',
  });

  // --------- Auto-fill depuis un contact existant (epoux) ----------
  const handleSelectContact = async (c) => {
    if (!c) return;
    const fields = {
      civilite: c.genre === 'Feminin' || c.genre === 'Féminin' ? 'Mme' : 'M.',
      nom: c.nom || '',
      nomDeNaissance: c.nom_de_naissance || c.nomDeNaissance || '',
      prenoms: c.prenoms || '',
      dateNaissance: c.dateNaissance || null,
      lieuNaissance: c.villeNaissance || c.lieuNaissance || '',
      paysNaissance: c.paysNaissance || 'France',
      nationalite: c.nationalite || 'francaise',
      profession: c.profession || '',
      adresse: c.adresse || '',
      codePostal: c.codePostal || '',
      ville: c.ville || '',
      pays: c.pays || 'France',
      email: c.email || '',
      telephone: c.telephone || '',
      contactId: c._id || null,
    };
    Object.entries(fields).forEach(([k, v]) => setField([k], v));

    // Import auto des personnes a charge attachees a ce contact, separees
    // en enfants (type='enfant' ou non specifie) et adultes a charge
    // (type='adulte'). Dedoublonnage avec les listes deja dans le wizard.
    const allPCH = c.personnesCharge || [];
    const enfantsPCH = allPCH.filter(p => !p.type || String(p.type).toLowerCase() === 'enfant');
    const adultesPCH = allPCH.filter(p => String(p.type || '').toLowerCase() === 'adulte');

    const dejaEnfants = new Set(enfantsExistants.map(enfantKey));
    const dejaAdultes = new Set(adultesExistants.map(enfantKey));
    const enfantsAImporter = enfantsPCH.filter(p => !dejaEnfants.has(enfantKey(p)));
    const adultesAImporter = adultesPCH.filter(p => !dejaAdultes.has(enfantKey(p)));

    if (enfantsAImporter.length === 0 && adultesAImporter.length === 0) return;

    const fmt = (p) => `• ${p.prenoms || '(prenom inconnu)'} ${p.nom || ''}${p.dateNaissance ? ` (${new Date(p.dateNaissance).toLocaleDateString('fr-FR')})` : ''}`;
    const lines = [];
    if (enfantsAImporter.length > 0) {
      lines.push(`Enfants (${enfantsAImporter.length}) :`);
      lines.push(enfantsAImporter.map(fmt).join('\n'));
    }
    if (adultesAImporter.length > 0) {
      if (lines.length) lines.push('');
      lines.push(`Adultes a charge (${adultesAImporter.length}) :`);
      lines.push(adultesAImporter.map(fmt).join('\n'));
    }

    const ok = await confirm({
      title: `Importer ${enfantsAImporter.length + adultesAImporter.length} personne(s) à charge ?`,
      message: `Ce contact a déjà des personnes à charge dans sa fiche :\n\n${lines.join('\n')}\n\nVous pourrez préciser résidence, scolarité, etc. à l'étape "Enfants".`,
      confirmLabel: 'Oui, importer',
      cancelLabel: 'Non, passer',
    });
    if (ok) {
      for (const p of enfantsAImporter) {
        dispatch(addEnfant(mapPersonneChargeToEnfant(p)));
      }
      for (const p of adultesAImporter) {
        dispatch(addAdulte(mapPersonneChargeToAdulte(p)));
      }
    }
  };

  // --------- Auto-fill depuis un avocat existant ----------
  const handleSelectAvocat = (c) => {
    if (!c) return;
    const fields = {
      contactId: c._id || null,             // tracage : pour ne pas re-proposer en sauvegarde
      prenoms: c.prenoms || '',
      nom: c.nom || c.raisonSociale || '',
      barreau: c.barreau || '',
      cabinet: c.raisonSociale || c.cabinet || '',
      adresse: c.adresse || '',
      codePostal: c.codePostal || '',
      ville: c.ville || '',
      email: c.email || '',
      telephone: c.telephone || '',
      estTitulaire: false,
    };
    Object.entries(fields).forEach(([k, v]) => setAvocatField(k, v));
  };

  // --------- Pre-remplir l'avocat client depuis mon profil cabinet ----------
  const handlePrefillFromCabinet = async () => {
    // 1) Essayer le state Redux (User deja charge)
    if (userProfile && (userProfile.firstName || userProfile.lastName)) {
      const a = {
        prenoms: userProfile.firstName || '',
        nom: userProfile.lastName || '',
        email: userProfile.email || '',
        telephone: userProfile.phone || '',
        adresse: userProfile.address || '',
        ville: userProfile.city || '',
        codePostal: userProfile.postalCode || '',
        barreau: userProfile.barreau || '',
        cabinet: (userProfile.firstName && userProfile.lastName)
          ? `Cabinet de Maitre ${userProfile.firstName} ${userProfile.lastName}`
          : '',
        estTitulaire: true,
      };
      Object.entries(a).forEach(([k, v]) => setAvocatField(k, v));
      return;
    }
    // 2) Fallback : recuperer depuis l'API
    try {
      const r = await apiClient.get('/api/divorce-cm/cabinet-profile');
      const a = r.data?.avocat || {};
      Object.entries(a).forEach(([k, v]) => setAvocatField(k, v));
    } catch (_e) {
      // silencieux
    }
  };

  // Auto-pre-remplir l'avocat de l'epoux 1 au montage si vide
  React.useEffect(() => {
    if (isClientCabinet && (!epoux.avocat?.nom && !epoux.avocat?.prenoms)) {
      handlePrefillFromCabinet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClientCabinet]);

  // Sync auto avocat1 -> avocat2 quand partageAvocat est actif
  React.useEffect(() => {
    if (!partageActif) return;
    const av1 = epoux1.avocat || {};
    const targetKeys = [
      'contactId', 'nom', 'prenoms', 'barreau', 'cabinet',
      'adresse', 'codePostal', 'ville', 'email', 'telephone',
      'rpva', 'toque',
    ];
    for (const k of targetKeys) {
      const newVal = av1[k] !== undefined && av1[k] !== null ? av1[k] : '';
      if ((epoux.avocat || {})[k] !== newVal) {
        setAvocatField(k, newVal);
      }
    }
    if (epoux.avocat?.estTitulaire !== true) {
      setAvocatField('estTitulaire', true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    partageActif,
    epoux1.avocat?.nom,
    epoux1.avocat?.prenoms,
    epoux1.avocat?.barreau,
    epoux1.avocat?.cabinet,
    epoux1.avocat?.adresse,
    epoux1.avocat?.codePostal,
    epoux1.avocat?.ville,
    epoux1.avocat?.email,
    epoux1.avocat?.telephone,
  ]);

  const togglePartageAvocat = (active) => {
    dispatch(setDraftField({ path: ['partageAvocat'], value: active }));
    if (!active) {
      const targetKeys = [
        'contactId', 'nom', 'prenoms', 'barreau', 'cabinet',
        'adresse', 'codePostal', 'ville', 'email', 'telephone',
        'rpva', 'toque',
      ];
      for (const k of targetKeys) setAvocatField(k, '');
      setAvocatField('estTitulaire', false);
    }
  };

  return (
    <div className="k-dcm-card">
      <h3 className="k-dcm-card-title">{titre}</h3>
      <p className="k-dcm-card-subtitle">{sousTitre}</p>

      {/* Recherche de contact existant — gain de temps majeur */}
      <ContactSearchBox
        kind="epoux"
        label="Le client est-il deja un contact ?"
        placeholder="Tapez le nom ou prenom..."
        onSelect={handleSelectContact}
      />

      <div className="k-dcm-grid cols-3">
        <div className="k-dcm-field">
          <label>Civilite</label>
          <select value={epoux.civilite || ''} onChange={e => setField(['civilite'], e.target.value)}>
            <option value="">— Choisir —</option>
            {(constants?.civilites || [{ code: 'M.', label: 'Monsieur' }, { code: 'Mme', label: 'Madame' }])
              .map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
        <div className="k-dcm-field">
          <label>Prenom(s)</label>
          <input
            type="text"
            value={epoux.prenoms || ''}
            onChange={e => setField(['prenoms'], e.target.value)}
            onBlur={e => setField(['prenoms'], capitalize(e.target.value))}
          />
        </div>
        <div className="k-dcm-field">
          <label>Nom (de famille)</label>
          <input
            type="text"
            value={epoux.nom || ''}
            onChange={e => setField(['nom'], e.target.value)}
            onBlur={e => setField(['nom'], (e.target.value || '').toUpperCase())}
          />
        </div>

        <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
          <label>Nom de naissance (si different)</label>
          <input
            type="text"
            value={epoux.nomDeNaissance || ''}
            onChange={e => setField(['nomDeNaissance'], e.target.value)}
            onBlur={e => setField(['nomDeNaissance'], (e.target.value || '').toUpperCase())}
          />
        </div>

        <div className="k-dcm-field">
          <label>Date de naissance</label>
          <input
            type="date"
            value={toDateInputValue(epoux.dateNaissance)}
            onChange={e => setField(['dateNaissance'], e.target.value || null)}
          />
        </div>
        <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
          <label>Lieu de naissance (commune + CP)</label>
          <CommunePicker
            ville={epoux.lieuNaissance}
            codePostal={epoux.cpNaissance || ''}
            onChange={({ ville, codePostal }) => {
              setField(['lieuNaissance'], ville);
              setField(['cpNaissance'], codePostal);
            }}
            villeLabel="Ville de naissance"
            cpLabel="CP"
          />
        </div>
        <div className="k-dcm-field">
          <label>Pays de naissance</label>
          <input type="text" value={epoux.paysNaissance || 'France'} onChange={e => setField(['paysNaissance'], e.target.value)} />
        </div>

        <div className="k-dcm-field">
          <label>Nationalite</label>
          <input type="text" value={epoux.nationalite || 'francaise'} onChange={e => setField(['nationalite'], e.target.value)} />
        </div>
        <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
          <label>Profession</label>
          <input type="text" value={epoux.profession || ''} onChange={e => setField(['profession'], e.target.value)} />
        </div>

        <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
          <label>Adresse</label>
          <input type="text" value={epoux.adresse || ''} onChange={e => setField(['adresse'], e.target.value)} />
        </div>
        <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
          <label>Ville + Code postal</label>
          <CommunePicker
            ville={epoux.ville}
            codePostal={epoux.codePostal}
            onChange={({ ville, codePostal }) => {
              setField(['ville'], ville);
              setField(['codePostal'], codePostal);
            }}
          />
        </div>
        <div className="k-dcm-field">
          <label>Pays</label>
          <input type="text" value={epoux.pays || 'France'} onChange={e => setField(['pays'], e.target.value)} />
        </div>

        <div className="k-dcm-field">
          <label>Email</label>
          <input type="email" value={epoux.email || ''} onChange={e => setField(['email'], e.target.value)} />
        </div>
        <div className="k-dcm-field">
          <label>Telephone</label>
          <input type="tel" value={epoux.telephone || ''} onChange={e => setField(['telephone'], e.target.value)} />
        </div>
      </div>

      {/* --- Section avocat --- */}
      <h4 className="k-dcm-card-title" style={{ marginTop: '1.25rem' }}>
        Avocat de cet epoux
        {isClientCabinet && <span style={{ marginLeft: '0.5rem', fontWeight: 400, fontSize: '0.78rem', color: '#10b981' }}>(votre cabinet)</span>}
        {partageActif && <span style={{ marginLeft: '0.5rem', fontWeight: 400, fontSize: '0.78rem', color: '#10b981' }}>(idem epoux 1)</span>}
      </h4>

      {/* Toggle "meme avocat" — visible seulement sur Epoux 2 */}
      {showPartageToggle && (
        <div className={`k-dcm-info-banner ${partageActif ? 'k-dcm-info-banner--success' : 'k-dcm-info-banner--warning'}`}>
          <label className="k-dcm-info-banner__toggle-label">
            <input
              type="checkbox"
              checked={partageActif}
              onChange={(e) => togglePartageAvocat(e.target.checked)}
              className="k-dcm-info-banner__checkbox"
            />
            <span className="k-dcm-info-banner__body">
              <strong>Mon cabinet est aussi l'avocat de cet epoux</strong>
              <div className="k-dcm-info-banner__subtext">
                {partageActif
                  ? '✓ L\'avocat de l\'epoux 2 reprend automatiquement votre profil cabinet. Aucune saisie supplementaire.'
                  : 'Decoche : un avocat adverse different sera renseigne ci-dessous.'}
              </div>
            </span>
          </label>
        </div>
      )}

      {isClientCabinet ? (
        // C'est nous : pre-remplissage automatique depuis le profil utilisateur
        <div className="k-dcm-info-banner k-dcm-info-banner--success k-dcm-info-banner--with-action">
          <div className="k-dcm-info-banner__body">
            <strong>✓ Pre-rempli automatiquement avec votre profil cabinet</strong>
            <div className="k-dcm-info-banner__subtext">
              Nom, prenom, adresse, barreau, telephone, email recuperes de vos parametres de compte.
              Modifiez ci-dessous si necessaire.
            </div>
          </div>
          <button
            type="button"
            className="k-dcm-btn k-dcm-btn-secondary k-dcm-info-banner__action"
            onClick={handlePrefillFromCabinet}
          >
            ↻ Re-synchroniser avec mon profil
          </button>
        </div>
      ) : !partageActif ? (
        // Avocat de l'autre epoux : recherche dans les contacts pro
        <>
          <p className="k-dcm-card-subtitle">
            Cherchez votre confrere dans la base s'il y est deja, sinon saisissez ses coordonnees.
          </p>
          <ContactSearchBox
            kind="avocat"
            label="L'avocat adverse est-il deja un contact pro ?"
            placeholder="Tapez le nom du confrere..."
            onSelect={handleSelectAvocat}
          />
        </>
      ) : null /* partage actif : pas de form, pas de search */}

      {!partageActif && (
      <div className="k-dcm-grid cols-3">
        <div className="k-dcm-field">
          <label>Prenom(s) avocat</label>
          <input type="text" value={epoux.avocat?.prenoms || ''} onChange={e => setAvocatField('prenoms', e.target.value)} />
        </div>
        <div className="k-dcm-field">
          <label>Nom avocat</label>
          <input type="text" value={epoux.avocat?.nom || ''} onChange={e => setAvocatField('nom', e.target.value)} />
        </div>
        <div className="k-dcm-field">
          <label>Barreau</label>
          <input type="text" value={epoux.avocat?.barreau || ''} onChange={e => setAvocatField('barreau', e.target.value)} />
        </div>

        <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
          <label>Cabinet / structure</label>
          <input type="text" value={epoux.avocat?.cabinet || ''} onChange={e => setAvocatField('cabinet', e.target.value)} />
        </div>
        <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
          <label>Adresse du cabinet</label>
          <input type="text" value={epoux.avocat?.adresse || ''} onChange={e => setAvocatField('adresse', e.target.value)} />
        </div>
        <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
          <label>Ville + CP</label>
          <CommunePicker
            ville={epoux.avocat?.ville}
            codePostal={epoux.avocat?.codePostal}
            onChange={({ ville, codePostal }) => {
              setAvocatField('ville', ville);
              setAvocatField('codePostal', codePostal);
            }}
          />
        </div>
        <div className="k-dcm-field">
          <label>Toque</label>
          <input type="text" value={epoux.avocat?.toque || ''} onChange={e => setAvocatField('toque', e.target.value)} />
        </div>

        <div className="k-dcm-field">
          <label>Email</label>
          <input type="email" value={epoux.avocat?.email || ''} onChange={e => setAvocatField('email', e.target.value)} />
        </div>
        <div className="k-dcm-field">
          <label>Telephone</label>
          <input type="tel" value={epoux.avocat?.telephone || ''} onChange={e => setAvocatField('telephone', e.target.value)} />
        </div>
        <div className="k-dcm-field">
          <label>RPVA / e-Barreau</label>
          <input type="text" value={epoux.avocat?.rpva || ''} onChange={e => setAvocatField('rpva', e.target.value)} />
        </div>
      </div>
      )}
    </div>
  );
};

export default EpouxFields;
