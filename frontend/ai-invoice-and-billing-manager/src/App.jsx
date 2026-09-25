import './App.css';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';

//Routes
import LandingPage from './pages/LandingPage/LandingPage';
import SignUp from './pages/Auth/SignUp';
import Login from './pages/Auth/Login';
const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path= "/" element = {<LandingPage />} />
          <Route path= "/signup" element = {<SignUp />} />
          <Route path= "/login" element = {<Login />} />

       
          

          {/* Protected */}
          <Route element = {<ProtectedRoute requiredRole = ""/>}>
            
            
          </Route>

          {/* Catch all routes */}
          <Route path="*" element={<Navigate to = "/" replace />} />
        </Routes>
      </Router>
      
    </AuthProvider>
  )
}

export default App