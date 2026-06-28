import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import MainUserInfos from './mainUserInfos';
import MainUserIcon from './mainUserIcon';
import MainUserModal from './mainUserModal';
import '../_header-small.css';

const MainUser = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalPosition, setModalPosition] = useState({ top: 0, right: 0 });
  const modalRef = useRef();
  const modalRef2 = useRef();

  const calculatePosition = () => {
    if (modalRef2.current) {
      const rect = modalRef2.current.getBoundingClientRect();
      return {
        top: rect.bottom + 7,
        right: window.innerWidth - rect.right,
      };
    }
    return { top: 0, right: 0 };
  };

  const handleUserClick = () => {
    if (!isModalVisible) {
      setModalPosition(calculatePosition());
    }
    setIsModalVisible(!isModalVisible);
  };

  useEffect(() => {
    const handleResize = () => {
      if (isModalVisible && modalRef2.current) {
        setModalPosition(calculatePosition());
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isModalVisible]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target) && modalRef2.current && !modalRef2.current.contains(event.target)) {
        if (isModalVisible) setIsModalVisible(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isModalVisible, modalRef]);

  return (
    <div>
      <div className="main-user" onClick={handleUserClick} ref={modalRef2}>
        <MainUserInfos />
        <MainUserIcon />
      </div>
      {isModalVisible &&
        ReactDOM.createPortal(
          <div ref={modalRef}>
            <MainUserModal position={modalPosition} onClose={() => setIsModalVisible(false)} />
          </div>,
          document.body
        )
      }
    </div>
  );
};

export default MainUser;
