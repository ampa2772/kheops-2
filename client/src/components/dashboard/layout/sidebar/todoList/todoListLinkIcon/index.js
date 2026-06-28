import React from 'react';
import boutonTodoList from "../../../../../../assets/liste-de-choses-a-faire.svg";

const TodoListLinkIcon = () => {
  return (
    <div>
      <img src={boutonTodoList} alt="boutonAgenda" className="boutonSideBar" />
    </div>
  );
};

export default TodoListLinkIcon;