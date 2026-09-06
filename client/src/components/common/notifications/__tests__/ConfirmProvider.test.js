import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ConfirmProvider,useConfirm} from '../ConfirmProvider';
test('Entrée sur Annuler n’autorise jamais le transfert',async()=>{
  const answered=jest.fn();
  function Action(){const confirm=useConfirm();return <button onClick={async()=>answered(await confirm({title:'Transfert',message:'Copie de recette',danger:true}))}>Ouvrir</button>;}
  render(<ConfirmProvider><Action/></ConfirmProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Ouvrir'}));
  const cancel=await screen.findByRole('button',{name:'Annuler'});
  expect(cancel).toHaveFocus();userEvent.keyboard('{enter}');
  await waitFor(()=>expect(answered).toHaveBeenCalledWith(false));
});
