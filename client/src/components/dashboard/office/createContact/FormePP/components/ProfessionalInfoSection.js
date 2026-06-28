import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setContactField } from '../../../../../../redux/slices/createContactSlice';
import { setProfessionModalIsOpen } from '../../../../../../redux/slices/layoutSlice';
import ProfessionModal from '../ProfessionModal';

const formatNumeroSecu = (num) => {
    const formattedNum = num.replace(/\D/g, '').split('').map((digit, index) => {
        if (index === 0 || index === 2 || index === 4 || index === 6 || index === 9 || index === 12) {
            return digit + ' ';
        }
        return digit;
    }).join('');
    return formattedNum.trim();
};

const ProfessionalInfoSection = ({ contact, errors, submitAttempted }) => {
    const dispatch = useDispatch();
    const professionModalIsOpen = useSelector(state => state.layout.professionModalIsOpen);

    const handleChange = (event) => {
        const { name, value } = event.target;
        let formattedValue = value;
        if (name === 'secu') {
            formattedValue = formatNumeroSecu(value);
        }
        dispatch(setContactField(name, formattedValue));
    };

    return (
        <fieldset className={`identity ${submitAttempted && (errors.profession || errors.secu) ? 'redFieldset' : ''}`}>
            <legend>Professionnel</legend>
            <div className="email_tel_contact">
                <div
                    className={`inputAddContact profession-selector ${submitAttempted && errors.profession ? 'error' : ''}`}
                    onClick={() => dispatch(setProfessionModalIsOpen(true))}
                >
                    {contact.profession || <span style={{ color: '#637085', fontWeight: 400 }}>Profession</span>}
                </div>
                <input
                    type="text"
                    name="secu"
                    value={contact.secu}
                    onChange={handleChange}
                    placeholder="N° Sécurité sociale"
                    required
                    className={`inputAddContact ${submitAttempted && errors.secu ? 'error' : ''}`}
                />
            </div>
            {professionModalIsOpen && <ProfessionModal />}
        </fieldset>
    );
};

export default ProfessionalInfoSection;
