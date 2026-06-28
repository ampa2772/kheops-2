import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { verifyEmailToken } from '../redux/slices/authSlice'; // Importez l'action de vérification du token
import { loadUser } from  '../redux/slices/authSlice';
import { createOfficeUser } from  '../redux/slices/officeUserSlice'; // Importez la fonction createOfficeUser

const useEmailConfirmation = (token) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      const verifyTokenAndFetchUser = async () => {
        try {
          // Vérifiez si le token est valide
          const isTokenValid = dispatch(verifyEmailToken(token));

          if (isTokenValid) {
            // Créez un OfficeUser et une entrée dans la table UserOfficeUser
            await dispatch(createOfficeUser()); // Ajoutez 'await' ici
            dispatch(loadUser({ token, rememberMe: false, navigate }));
          }
           else {
            console.error("Token is not valid");
            // Gérez les erreurs en conséquence, par exemple, en affichant un message d'erreur
          }
        } catch (err) {
          console.error(err);
          // Handle errors accordingly, e.g., dispatch an error action
        }
      };

      verifyTokenAndFetchUser();
    }
  }, [dispatch, token, navigate]);
};

export default useEmailConfirmation;


