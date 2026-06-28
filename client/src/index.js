import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { BrowserRouter as Router } from 'react-router-dom'; // <<< MODIFICATION ICI
import store from './redux/store';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Provider store={store}>
    <DndProvider backend={HTML5Backend}>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </Router>
    </DndProvider>
  </Provider>
);






