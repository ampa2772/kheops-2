import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ConfirmProvider,useConfirm} from '../ConfirmProvider';
import BaseModal from '../../BaseModal';
test('Entrée sur Annuler n’autorise jamais le transfert',async()=>{
  const answered=jest.fn();
  function Action(){const confirm=useConfirm();return <button onClick={async()=>answered(await confirm({title:'Transfert',message:'Copie de recette',danger:true}))}>Ouvrir</button>;}
  render(<ConfirmProvider><Action/></ConfirmProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Ouvrir'}));
  const cancel=await screen.findByRole('button',{name:'Annuler'});
  expect(cancel).toHaveFocus();userEvent.keyboard('{enter}');
  await waitFor(()=>expect(answered).toHaveBeenCalledWith(false));
});

test('la confirmation imbriquée reçoit le clic sans fermer sa fenêtre parente',async()=>{
  const answered=jest.fn(),closed=jest.fn();
  function Action(){const confirm=useConfirm();return <BaseModal onClose={closed}><button onClick={async()=>answered(await confirm({title:'Terminer',message:'Copie de recette'}))}>Fermer la copie</button></BaseModal>;}
  render(<ConfirmProvider><Action/></ConfirmProvider>);
  userEvent.click(screen.getByRole('button',{name:'Fermer la copie'}));
  const dialog=await screen.findByRole('dialog',{name:'Terminer'});
  expect(dialog.parentElement).toBe(document.body);
  userEvent.click(screen.getByRole('button',{name:'Confirmer'}));
  await waitFor(()=>expect(answered).toHaveBeenCalledWith(true));
  expect(closed).not.toHaveBeenCalled();
});

test('Échap annule seulement la confirmation imbriquée',async()=>{
  const answered=jest.fn(),closed=jest.fn();
  function Action(){const confirm=useConfirm();return <BaseModal onClose={closed}><button onClick={async()=>answered(await confirm({title:'Terminer'}))}>Fermer la copie</button></BaseModal>;}
  render(<ConfirmProvider><Action/></ConfirmProvider>);
  userEvent.click(screen.getByRole('button',{name:'Fermer la copie'}));
  await screen.findByRole('dialog',{name:'Terminer'});
  userEvent.keyboard('{esc}');
  await waitFor(()=>expect(answered).toHaveBeenCalledWith(false));
  expect(closed).not.toHaveBeenCalled();
});
