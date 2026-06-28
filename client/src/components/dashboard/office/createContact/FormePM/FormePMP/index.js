// FormePM/FormePMP/index.js

import React from 'react';
import PersonneMoralePub from './PersonneMoralePub';

const FormePMP = ({ fromCreatePartie, onContactCreatedSuccessfully }) => {
  return (
    <PersonneMoralePub fromCreatePartie={fromCreatePartie} onContactCreatedSuccessfully={onContactCreatedSuccessfully} />
  );
};

export default FormePMP;