import React from 'react';
import TodoListLinkIcon from "./todoListLinkIcon";
import TodoListLinkTitle from './todoListLinkTitle';
import { useSelector } from 'react-redux';

const TodoListLink = () => {
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);

  return (
    <div className="boutonConteneur">
      {isSidebarOpen ? (
        <>
          <TodoListLinkIcon />
          <TodoListLinkTitle />
        </>
      ) : (
        <TodoListLinkIcon />
      )}
    </div>
  );
};

export default TodoListLink;
