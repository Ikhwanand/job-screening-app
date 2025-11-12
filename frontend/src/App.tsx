import { ToastContainer } from "react-toastify";

import { AuthProvider } from "./context/AuthContext";
import JobsPage from "./pages/JobsPage";
import "./App.css";
import "react-toastify/dist/ReactToastify.css";

const App = () => {
  return (
    <AuthProvider>
      <JobsPage />
      <ToastContainer position="bottom-right" theme="dark" />
    </AuthProvider>
  );
};

export default App;
