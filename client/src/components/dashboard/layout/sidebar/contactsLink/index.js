import React from 'react';
import ContactsLinkIcon from './contactsLinkIcon';
import ContactsLinkTitle from './contactsLinkTitle';
import { useSelector } from 'react-redux';

const ContactsLink = () => {
  const isSidebarOpen = useSelector((state) => state.layout.isSidebarOpen);

  return (
    <div className="boutonConteneur">
      {isSidebarOpen ? (
        <>
          <ContactsLinkIcon />
          <ContactsLinkTitle />
        </>
      ) : (
        <ContactsLinkIcon />
      )}
    </div>
  );
};

export default ContactsLink;
