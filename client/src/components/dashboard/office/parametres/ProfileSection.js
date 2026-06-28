import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { updateProfileSettings } from '../../../../redux/slices/authSlice';
import villeToBarreau from '../../../../data/villeToBarreau.json';
import { useToast } from '../../../common/notifications/useToast';

const FONT_OPTIONS = ['Calibri', 'Arial', 'Times New Roman', 'Garamond', 'Georgia', 'Verdana', 'Courier New'];
const SIZE_OPTIONS = [8, 9, 10, 11, 12, 13, 14, 16, 18];
const WEIGHT_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'bold', label: 'Gras' },
  { value: '800', label: 'Très gras' },
];
const ALIGN_OPTIONS = [
  { value: 'left', title: 'Aligner à gauche' },
  { value: 'center', title: 'Centrer' },
  { value: 'right', title: 'Aligner à droite' },
  { value: 'justify', title: 'Justifier' },
];
const BARREAU_OPTIONS = [
  "Agen","l'Ain","Aix-en-Provence","Ajaccio","Albertville","Albi","Alençon","Alès",
  "des Alpes de Haute-Provence","Amiens","Angers","Annecy","l'Ardèche","des Ardennes","Argentan","l'Ariège",
  "Arras","l'Aube","Aurillac","Auxerre","Avesnes-sur-Helpe","l'Aveyron","Avignon","Bastia","Bayonne",
  "Beauvais","Belfort","Bergerac","Besançon","Béthune","Béziers","Blois","Bonneville","Bordeaux",
  "Boulogne-sur-Mer","Bourges","Bourgoin-Jallieu","Brest","Briey","Brive-la-Gaillarde","Caen","Cambrai",
  "Carcassonne","Carpentras","Castres","Chalon-sur-Saône","Chalons-en-Champagne","Chambéry","la Charente",
  "Chartres","Châteauroux","Cherbourg","Clermont-Ferrand","Colmar","Compiègne","Coutances","la Creuse",
  "Cusset-Vichy","Dax","des Deux-Sèvres","Dieppe","Dijon","Douai","Draguignan","la Drôme","Dunkerque",
  "Épinal","l'Essonne","l'Eure","Fontainebleau","du Gers","Grasse","Grenoble","la Guadeloupe","la Guyane",
  "la Haute-Loire","la Haute-Marne","la Haute-Saône","des Hautes-Alpes","des Hauts-de-Seine","Le Havre",
  "du Jura","La-Roche-sur-Yon","Laon","Laval","Libourne","Lille","Limoges","Lisieux","Lorient","du Lot",
  "la Lozère","Lyon","Mâcon","Le Mans","Marseille","la Martinique","Mayotte","Meaux","Melun","Metz",
  "la Meuse","Mont-de-Marsan","Montargis","Montbéliard","Montluçon","Montpellier","Moulins","Mulhouse",
  "Nancy","Nantes","Narbonne","Nevers","Nice","Nîmes","Nouméa","Orléans","Papeete","Paris","Pau","Périgueux",
  "Poitiers","des Pyrénées-Orientales","Quimper","Reims","Rennes","Roanne","La Rochelle","Rouen",
  "des Sables-d'Olonne","Saint-Brieuc","Saint-Denis de la Réunion","Saint-Étienne","Saint-Gaudens",
  "Saint-Malo-Dinan","Saint-Nazaire","Saint-Omer","Saint-Pierre de la Réunion","Saint-Quentin","Saintes",
  "Sarreguemines","Saumur","Saverne","la Seine-Saint-Denis","Senlis","Sens","Soissons","Strasbourg",
  "Tarascon","Tarbes","du Tarn-et-Garonne","Thionville","Thonon-les-Bains","Toulon","Toulouse","Tours",
  "Tulle","du Val-d'Oise","du Val-de-Marne","Valenciennes","Vannes","Versailles","Vienne",
  "Villefranche-sur-Saône",
];

// ====== Icônes inline ======
const Icon = {
  Pencil: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  Pin: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  Phone: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  Mail: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  Scale: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v8" />
      <path d="M5 10h14" />
      <path d="M5 10l-3 6h6l-3-6z" />
      <path d="M19 10l-3 6h6l-3-6z" />
      <path d="M9 22h6" />
      <path d="M12 18v4" />
    </svg>
  ),
  Check: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Reset: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  ),
  Upload: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Trash: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  ),
  ZoomIn: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  ZoomOut: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  AlignLeft: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="18" y2="18" />
    </svg>
  ),
  AlignCenter: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  ),
  AlignRight: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" />
    </svg>
  ),
  AlignJustify: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
};

const ALIGN_ICON = {
  left: Icon.AlignLeft,
  center: Icon.AlignCenter,
  right: Icon.AlignRight,
  justify: Icon.AlignJustify,
};

/** Construit "Avocat au Barreau de/du/des..." avec gestion des prepositions francaises. */
const buildBarreauLabel = (barreauNom) => {
  if (!barreauNom) return '';
  const lower = barreauNom.toLowerCase();
  if (lower.startsWith('du ') || lower.startsWith('des ')) return `Avocat au Barreau ${barreauNom}`;
  if ('aeiouyéèêëàâäùûüôöîï'.includes(lower.charAt(0))) return `Avocat au Barreau d'${barreauNom}`;
  return `Avocat au Barreau de ${barreauNom}`;
};

const buildHeaderFromFields = (firstName, lastName, barreau, city, address, phone) => {
  const lines = [];
  const fullName = `${firstName || ''} ${lastName || ''}`.trim();
  if (fullName) lines.push(fullName);
  if (barreau) lines.push(buildBarreauLabel(barreau));
  else if (city) lines.push(`Avocat au Barreau de ${city}`);
  if (address) lines.push(address);
  if (phone) lines.push(`Tél: ${phone}`);
  return lines.join('\n');
};

const getInitials = (firstName, lastName) => {
  const a = (firstName || '').trim()[0] || '';
  const b = (lastName || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
};

const ProfileSection = () => {
  const dispatch = useDispatch();
  const user = useSelector(state => state.login.user);
  const toast = useToast();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    city: '',
    barreau: '',
    address: '',
    phone: '',
    signature: '',
    header: '',
    headerFontFamily: 'Calibri',
    headerFontSize: 10,
    headerFontWeight: 'normal',
    headerTextAlign: 'center',
  });

  const [signatureImage, setSignatureImage] = useState('');
  const [signatureScale, setSignatureScale] = useState(1.5);
  const [saveStatus, setSaveStatus] = useState('');
  const [headerManuallyEdited, setHeaderManuallyEdited] = useState(false);

  const signatureFileRef = useRef(null);
  const isInitialMount = useRef(true);
  const isAlignInitial = useRef(true);
  const isBarreauInitial = useRef(true);
  const isHeaderInitial = useRef(true);

  useEffect(() => {
    if (user) {
      const autoGenerated = buildHeaderFromFields(
        user.firstName, user.lastName, user.barreau, user.city, user.address, user.phone
      );
      const savedHeader = user.header || '';
      const hasCustomHeader = savedHeader !== '';

      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        city: user.city || '',
        barreau: user.barreau || '',
        address: user.address || '',
        phone: user.phone || '',
        signature: user.signature || '',
        header: hasCustomHeader ? savedHeader : autoGenerated,
        headerFontFamily: user.headerFontFamily || 'Calibri',
        headerFontSize: user.headerFontSize || 10,
        headerFontWeight: user.headerFontWeight || 'normal',
        headerTextAlign: user.headerTextAlign || 'center',
      });
      setHeaderManuallyEdited(hasCustomHeader && savedHeader !== autoGenerated);
      setSignatureImage(user.signatureImage || '');
      setSignatureScale(user.signatureScale || 1.5);
    }
  }, [user]);

  useEffect(() => {
    if (isHeaderInitial.current) {
      isHeaderInitial.current = false;
      return;
    }
    if (!headerManuallyEdited) {
      const autoGenerated = buildHeaderFromFields(
        formData.firstName, formData.lastName, formData.barreau, formData.city, formData.address, formData.phone
      );
      setFormData(prev => ({ ...prev, header: autoGenerated }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.firstName, formData.lastName, formData.barreau, formData.city, formData.address, formData.phone, headerManuallyEdited]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    handleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureScale]);

  useEffect(() => {
    if (isAlignInitial.current) {
      isAlignInitial.current = false;
      return;
    }
    handleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.headerTextAlign]);

  useEffect(() => {
    if (isBarreauInitial.current) {
      isBarreauInitial.current = false;
      return;
    }
    handleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.barreau]);

  const normalizeCityForLookup = useCallback((city) => {
    return (city || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim()
      .replace(/[\u2019\u2018\u02BC]/g, "'")
      .replace(/\s+/g, '-');
  }, []);

  const handleCityBlur = useCallback((e) => {
    const cityValue = e.target.value.trim();
    if (cityValue) {
      const cityKey = normalizeCityForLookup(cityValue);
      const detectedBarreau = villeToBarreau[cityKey];
      if (detectedBarreau && detectedBarreau !== formData.barreau) {
        setFormData(prev => ({ ...prev, barreau: detectedBarreau }));
        return;
      }
    }
    handleSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.barreau, normalizeCityForLookup]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleHeaderChange = (e) => {
    setFormData(prev => ({ ...prev, header: e.target.value }));
    setHeaderManuallyEdited(true);
  };

  const performSave = async (dataOverrides = {}) => {
    setSaveStatus('saving');
    try {
      await dispatch(updateProfileSettings({
        ...formData,
        ...dataOverrides,
        signatureImage,
        signatureScale,
      })).unwrap();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      setSaveStatus('error');
      console.error('[ProfileSection] Erreur sauvegarde:', err);
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const handleSave = () => performSave();

  const handleResetHeader = () => {
    const autoGenerated = buildHeaderFromFields(
      formData.firstName, formData.lastName, formData.barreau, formData.city, formData.address, formData.phone
    );
    setFormData(prev => ({ ...prev, header: autoGenerated }));
    setHeaderManuallyEdited(false);
    performSave({ header: autoGenerated });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast.warning("L'image est trop volumineuse. Taille maximum : 500 Ko.");
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.warning('Veuillez sélectionner un fichier image (PNG, JPG, etc.).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => setSignatureImage(event.target.result);
    reader.readAsDataURL(file);
  };

  const handleRemoveSignatureImage = () => setSignatureImage('');

  // Helper pour rendre un champ avec icône + check de validation
  const renderField = ({ name, label, value, onChange, onBlur, placeholder, icon, type = 'input', options, readOnly = false, autoComplete }) => {
    const filled = !!(value || '').toString().trim();
    return (
      <div className={`pf-field ${filled ? 'is-filled' : ''} ${readOnly ? 'is-readonly' : ''}`}>
        <label className="pf-field-label" htmlFor={`pf-${name}`}>{label}</label>
        <div className="pf-field-control">
          {icon && <span className="pf-field-icon" aria-hidden="true">{icon}</span>}
          {type === 'select' ? (
            <select
              id={`pf-${name}`}
              name={name}
              value={value}
              onChange={onChange}
              onBlur={onBlur}
              disabled={readOnly}
            >
              {options}
            </select>
          ) : (
            <input
              id={`pf-${name}`}
              type={type}
              name={name}
              value={value}
              onChange={onChange}
              onBlur={onBlur}
              placeholder={placeholder}
              readOnly={readOnly}
              autoComplete={autoComplete}
            />
          )}
          {filled && (
            <span className="pf-field-check" aria-hidden="true"><Icon.Check /></span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pf-section">
      {/* === HERO === */}
      <div className="pf-hero">
        <div className="pf-hero-avatar" aria-hidden="true">
          {getInitials(formData.firstName, formData.lastName)}
        </div>
        <div className="pf-hero-info">
          <h2 className="pf-hero-title">Profil de l'avocat</h2>
          <p className="pf-hero-subtitle">
            Vos informations personnelles, en-tête de document et signature.
          </p>
          <div className="pf-hero-badges">
            <span className="pf-badge pf-badge-active">
              <span className="pf-badge-dot" aria-hidden="true" />
              Avocat actif
            </span>
          </div>
        </div>
      </div>

      {/* === IDENTITÉ === */}
      <div className="pf-card">
        <div className="pf-card-head">
          <span className="pf-card-icon" aria-hidden="true"><Icon.Pencil /></span>
          <h3 className="pf-card-title">IDENTITÉ</h3>
        </div>
        <div className="pf-card-body">
          <div className="pf-grid pf-grid-4">
            {renderField({
              name: 'firstName',
              label: 'PRÉNOM',
              value: formData.firstName,
              onChange: handleChange,
              onBlur: handleSave,
              placeholder: 'Prénom',
            })}
            {renderField({
              name: 'lastName',
              label: 'NOM',
              value: formData.lastName,
              onChange: handleChange,
              onBlur: handleSave,
              placeholder: 'Nom',
            })}
            {renderField({
              name: 'city',
              label: 'VILLE',
              value: formData.city,
              onChange: handleChange,
              onBlur: handleCityBlur,
              placeholder: 'Ville',
              icon: <Icon.Pin />,
            })}
            {renderField({
              name: 'barreau',
              label: 'BARREAU',
              value: formData.barreau,
              onChange: handleChange,
              onBlur: handleSave,
              icon: <Icon.Scale />,
              type: 'select',
              options: (
                <>
                  <option value="">-- Auto via ville --</option>
                  {BARREAU_OPTIONS.map(b => {
                    const lower = b.toLowerCase();
                    let prefix = 'de ';
                    if (lower.startsWith('du ') || lower.startsWith('des ')) prefix = '';
                    else if ('aeiouyéèêëàâäùûüôöîï'.includes(lower.charAt(0))) prefix = "d'";
                    return <option key={b} value={b}>Barreau {prefix}{b}</option>;
                  })}
                </>
              ),
            })}
          </div>
          <div className="pf-grid pf-grid-3">
            {renderField({
              name: 'address',
              label: 'ADRESSE',
              value: formData.address,
              onChange: handleChange,
              onBlur: handleSave,
              placeholder: 'Adresse postale',
              icon: <Icon.Pin />,
            })}
            {renderField({
              name: 'phone',
              label: 'TÉLÉPHONE',
              value: formData.phone,
              onChange: handleChange,
              onBlur: handleSave,
              placeholder: '+33 1 23 45 67 89',
              icon: <Icon.Phone />,
            })}
            {renderField({
              name: 'email',
              label: 'EMAIL',
              value: user?.email || '',
              onChange: () => {},
              onBlur: () => {},
              placeholder: '—',
              icon: <Icon.Mail />,
              readOnly: true,
            })}
          </div>
        </div>
      </div>

      {/* === EN-TÊTE DE DOCUMENT === */}
      <div className="pf-card">
        <div className="pf-card-head">
          <span className="pf-card-icon" aria-hidden="true"><Icon.Pencil /></span>
          <h3 className="pf-card-title">
            EN-TÊTE DE DOCUMENT
            <span className="pf-card-hint">
              {headerManuallyEdited ? '(personnalisé)' : '(auto)'}
            </span>
          </h3>
          {headerManuallyEdited && (
            <button type="button" className="pf-btn-ghost" onClick={handleResetHeader}>
              <Icon.Reset />
              <span>Réinitialiser</span>
            </button>
          )}
        </div>
        <div className="pf-card-body">
          <div className="pf-header-preview">
            <textarea
              className="pf-header-textarea"
              name="header"
              value={formData.header}
              onChange={handleHeaderChange}
              onBlur={handleSave}
              rows={5}
              style={{
                fontFamily: formData.headerFontFamily,
                fontSize: `${formData.headerFontSize}pt`,
                fontWeight: formData.headerFontWeight,
                textAlign: formData.headerTextAlign,
              }}
              placeholder="Remplissez les champs d'identité ou saisissez votre en-tête personnalisé"
            />
          </div>
          <div className="pf-toolbar">
            <select
              className="pf-toolbar-select pf-toolbar-font"
              name="headerFontFamily"
              value={formData.headerFontFamily}
              onChange={handleChange}
              onBlur={handleSave}
              aria-label="Police"
            >
              {FONT_OPTIONS.map(font => (
                <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
              ))}
            </select>
            <select
              className="pf-toolbar-select pf-toolbar-size"
              name="headerFontSize"
              value={formData.headerFontSize}
              onChange={(e) => setFormData({ ...formData, headerFontSize: parseInt(e.target.value, 10) })}
              onBlur={handleSave}
              aria-label="Taille"
            >
              {SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>{size} pt</option>
              ))}
            </select>
            <span className="pf-toolbar-sep" aria-hidden="true" />
            <select
              className="pf-toolbar-select pf-toolbar-weight"
              name="headerFontWeight"
              value={formData.headerFontWeight}
              onChange={handleChange}
              onBlur={handleSave}
              aria-label="Graisse"
              title="Graisse du texte"
            >
              {WEIGHT_OPTIONS.map(w => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
            <span className="pf-toolbar-sep" aria-hidden="true" />
            <div className="pf-toolbar-group" role="group" aria-label="Alignement">
              {ALIGN_OPTIONS.map(a => {
                const AIcon = ALIGN_ICON[a.value];
                const active = formData.headerTextAlign === a.value;
                return (
                  <button
                    key={a.value}
                    type="button"
                    title={a.title}
                    aria-label={a.title}
                    className={`pf-toolbar-btn ${active ? 'is-active' : ''}`}
                    onClick={() => setFormData(prev => ({ ...prev, headerTextAlign: a.value }))}
                  >
                    <AIcon />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* === SIGNATURE === */}
      <div className="pf-card">
        <div className="pf-card-head">
          <span className="pf-card-icon" aria-hidden="true"><Icon.Pencil /></span>
          <h3 className="pf-card-title">SIGNATURE</h3>
        </div>
        <div className="pf-card-body">
          <div className="pf-signature-layout">
            <div className="pf-signature-preview-col">
              <div className="pf-signature-preview">
                {signatureImage ? (
                  <img
                    src={signatureImage}
                    alt="Signature"
                    style={{ maxHeight: `${Math.round(80 * signatureScale)}px` }}
                  />
                ) : (
                  <span className="pf-signature-empty">Aucune signature</span>
                )}
              </div>
              {signatureImage && (
                <div className="pf-signature-zoom">
                  <button
                    type="button"
                    className="pf-zoom-btn"
                    onClick={() => setSignatureScale(prev => Math.max(0.5, Math.round((prev - 0.25) * 100) / 100))}
                    disabled={signatureScale <= 0.5}
                    title="Réduire la signature"
                    aria-label="Réduire la signature"
                  >
                    <Icon.ZoomOut />
                  </button>
                  <button
                    type="button"
                    className="pf-zoom-btn"
                    onClick={() => setSignatureScale(prev => Math.min(2.5, Math.round((prev + 0.25) * 100) / 100))}
                    disabled={signatureScale >= 2.5}
                    title="Agrandir la signature"
                    aria-label="Agrandir la signature"
                  >
                    <Icon.ZoomIn />
                  </button>
                </div>
              )}
            </div>

            <div className="pf-signature-actions-col">
              <button
                type="button"
                className="pf-btn-secondary"
                onClick={() => signatureFileRef.current?.click()}
              >
                <Icon.Upload />
                <span>{signatureImage ? 'Changer' : 'Ajouter'}</span>
              </button>
              <button
                type="button"
                className="pf-btn-danger"
                onClick={handleRemoveSignatureImage}
                disabled={!signatureImage}
              >
                <Icon.Trash />
                <span>Supprimer</span>
              </button>
            </div>

            <div className="pf-signature-name-col">
              {renderField({
                name: 'signature',
                label: 'NOM SOUS LA SIGNATURE',
                value: formData.signature,
                onChange: handleChange,
                onBlur: handleSave,
                placeholder: 'Maître Dupont, Avocat au Barreau de Paris',
              })}
              <p className="pf-signature-hint">
                Format recommandé : PNG transparent, 600 × 200 px.
              </p>
            </div>
          </div>
          <input
            ref={signatureFileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />
        </div>
      </div>

      {/* === Indicateur de sauvegarde === */}
      {saveStatus && (
        <div className="pf-save-status">
          {saveStatus === 'saving' && <span className="pf-save-saving">Sauvegarde…</span>}
          {saveStatus === 'saved' && <span className="pf-save-saved">Sauvegardé</span>}
          {saveStatus === 'error' && <span className="pf-save-error">Erreur de sauvegarde</span>}
        </div>
      )}
    </div>
  );
};

export default ProfileSection;
