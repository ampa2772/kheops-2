import React, { forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import './styles.css';
import { createAdditionalOfficeUser, updateOfficeUser } from '../../../../../../../redux/slices/officeUserSlice';
import hommeIMG from '../../../../../../../assets/homme.svg';
import femmeIMG from '../../../../../../../assets/femme.svg';

const DEFAULT_DATA = {
  nomOfficeUser: '',
  prenomOfficeUser: '',
  genre: 'Masculin',
  roleOfficeUser: 'Avocat',
};

const OfficeUserForm = forwardRef(({ initialData = {}, setInitialData }, ref) => {
  const [formData, setFormData] = useState({ ...DEFAULT_DATA, ...(initialData || {}) });
  const [errors, setErrors] = useState({});
  const [formSubmitted, setFormSubmitted] = useState(false);

  const dispatch = useDispatch();
  const editMode = useSelector(state => state.officeUser.editMode);
  const initialDataRedux = useSelector(state => state.officeUser.initialData);

  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      setFormData(prev => ({ ...prev, ...initialData }));
    } else {
      setFormData({ ...DEFAULT_DATA });
    }
  }, [initialData]);

  useEffect(() => {
    if (setInitialData) setInitialData(initialDataRedux);
  }, [initialDataRedux, setInitialData]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleGenreChange = (genre) => {
    setFormData(prev => {
      const next = { ...prev, genre };
      // Si le rôle actuel ne correspond pas au nouveau genre, on l'ajuste
      const masculin = ['Avocat', 'Assistant', 'Secrétaire'];
      const feminin = ['Avocate', 'Assistante', 'Secrétaire'];
      if (genre === 'Masculin' && !masculin.includes(prev.roleOfficeUser)) {
        const idx = feminin.indexOf(prev.roleOfficeUser);
        next.roleOfficeUser = idx >= 0 ? masculin[idx] : 'Avocat';
      } else if (genre === 'Feminin' && !feminin.includes(prev.roleOfficeUser)) {
        const idx = masculin.indexOf(prev.roleOfficeUser);
        next.roleOfficeUser = idx >= 0 ? feminin[idx] : 'Avocate';
      }
      return next;
    });
  };

  const handleRoleChange = (role) => {
    setFormData(prev => ({ ...prev, roleOfficeUser: role }));
  };

  const validate = (data) => {
    const errs = {};
    if (!data.nomOfficeUser) errs.nomOfficeUser = 'Le nom est requis';
    if (!data.prenomOfficeUser) errs.prenomOfficeUser = 'Le prénom est requis';
    if (!data.genre) errs.genre = 'Le genre est requis';
    if (!data.roleOfficeUser) errs.roleOfficeUser = 'Le rôle est requis';
    return errs;
  };

  const submitInternal = () => {
    const errs = validate(formData);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setFormSubmitted(true);
      return false;
    }
    if (editMode) {
      dispatch(updateOfficeUser(formData));
    } else {
      dispatch(createAdditionalOfficeUser(formData));
    }
    setErrors({});
    setFormSubmitted(false);
    setFormData({ ...DEFAULT_DATA });
    return true;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    submitInternal();
  };

  useImperativeHandle(ref, () => ({
    submit: () => submitInternal(),
  }), [formData, editMode]);

  useEffect(() => {
    if (formSubmitted) setErrors(validate(formData));
  }, [formData, formSubmitted]);

  const masculinRoles = [
    { value: 'Avocat', label: 'Avocat' },
    { value: 'Assistant', label: 'Assistant' },
    { value: 'Secrétaire', label: 'Secrétaire' },
  ];
  const femininRoles = [
    { value: 'Avocate', label: 'Avocate' },
    { value: 'Assistante', label: 'Assistante' },
    { value: 'Secrétaire', label: 'Secrétaire' },
  ];
  const roles = formData.genre === 'Feminin' ? femininRoles : masculinRoles;

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form onSubmit={handleSubmit} className="ou-form" onClick={(e) => e.stopPropagation()}>
      {hasErrors && (
        <div className="ou-form__errors" role="alert">
          {errors.nomOfficeUser && <span className="ou-form__error-pill">{errors.nomOfficeUser}</span>}
          {errors.prenomOfficeUser && <span className="ou-form__error-pill">{errors.prenomOfficeUser}</span>}
          {errors.genre && <span className="ou-form__error-pill">{errors.genre}</span>}
          {errors.roleOfficeUser && <span className="ou-form__error-pill">{errors.roleOfficeUser}</span>}
        </div>
      )}

      <div className="ou-form__row">
        <div className="ou-form__field">
          <label htmlFor="nomOfficeUser" className="ou-form__label">Nom</label>
          <input
            type="text"
            id="nomOfficeUser"
            name="nomOfficeUser"
            className={`ou-form__input ${errors.nomOfficeUser ? 'is-invalid' : ''}`}
            value={formData.nomOfficeUser || ''}
            onChange={handleChange}
            placeholder="Ex. Dupont"
            autoComplete="off"
          />
        </div>
        <div className="ou-form__field">
          <label htmlFor="prenomOfficeUser" className="ou-form__label">Prénom</label>
          <input
            type="text"
            id="prenomOfficeUser"
            name="prenomOfficeUser"
            className={`ou-form__input ${errors.prenomOfficeUser ? 'is-invalid' : ''}`}
            value={formData.prenomOfficeUser || ''}
            onChange={handleChange}
            placeholder="Ex. Marie"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="ou-form__section">
        <div className="ou-form__label ou-form__label--block">Avatar</div>
        <div className="ou-avatar-grid" role="radiogroup" aria-label="Sélection du genre">
          <button
            type="button"
            className={`ou-avatar-card ${formData.genre === 'Masculin' ? 'is-selected' : ''}`}
            onClick={() => handleGenreChange('Masculin')}
            aria-pressed={formData.genre === 'Masculin'}
            aria-label="Masculin"
          >
            <span className="ou-avatar-card__icon">
              <img src={hommeIMG} alt="" aria-hidden="true" />
            </span>
            <span className="ou-avatar-card__text">
              <span className="ou-avatar-card__title">Homme</span>
              <span className="ou-avatar-card__subtitle">Silhouette</span>
            </span>
          </button>
          <button
            type="button"
            className={`ou-avatar-card ${formData.genre === 'Feminin' ? 'is-selected' : ''}`}
            onClick={() => handleGenreChange('Feminin')}
            aria-pressed={formData.genre === 'Feminin'}
            aria-label="Féminin"
          >
            <span className="ou-avatar-card__icon">
              <img src={femmeIMG} alt="" aria-hidden="true" />
            </span>
            <span className="ou-avatar-card__text">
              <span className="ou-avatar-card__title">Femme</span>
              <span className="ou-avatar-card__subtitle">Silhouette</span>
            </span>
          </button>
        </div>
      </div>

      <div className="ou-form__section">
        <div className="ou-form__label ou-form__label--block">Rôle</div>
        <div className={`ou-role-segment ${errors.roleOfficeUser ? 'is-invalid' : ''}`} role="radiogroup" aria-label="Rôle">
          {roles.map(role => (
            <button
              key={role.value}
              type="button"
              className={`ou-role-segment__btn ${formData.roleOfficeUser === role.value ? 'is-active' : ''}`}
              onClick={() => handleRoleChange(role.value)}
              aria-pressed={formData.roleOfficeUser === role.value}
            >
              {role.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
});

OfficeUserForm.displayName = 'OfficeUserForm';

export default OfficeUserForm;
