import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toggleModal } from '../../../../../redux/slices/layoutSlice';
import CurrentUserChangeIcon from './currentUserChangeIcon';
import CurrentUserAffiche from './currentUserAffiche';
import Modal from '../currentUser/currentUserChangeModal';
import '../_header-small.css';

import { toggleDeleteModal } from '../../../../../redux/slices/layoutSlice';

import { resetEditMode, resetInitialData } from '../../../../../redux/slices/officeUserSlice';
const CurrentUser = () => {
  const dispatch = useDispatch();


  const modalIsOpen = useSelector(state => state.layout.modalIsOpen);

  const deleteModalIsOpen = useSelector(state => state.layout.deleteModalIsOpen);







  const handleClick = (event) => {
    if (!deleteModalIsOpen) {

      event.stopPropagation();
      
      dispatch(toggleModal());
      dispatch(resetEditMode());
      dispatch(resetInitialData());
    } else {
      dispatch(toggleDeleteModal());
    }
  };

  return (
    <div className='current-user-aff-icon' onClick={handleClick}>
      <CurrentUserChangeIcon />
      <CurrentUserAffiche />
      {modalIsOpen && <Modal />}
    </div>
  );
};

export default CurrentUser;

