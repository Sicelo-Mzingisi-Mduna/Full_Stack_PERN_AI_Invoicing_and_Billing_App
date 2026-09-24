/* eslint-disable no-unused-vars */
import React from 'react'
import '../components_styles/NavBar.css'
import  {useNavigate} from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'


const NavBar = () => {
  const {user, isAuthenticated} = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <h1>Nav Bar</h1>
    </>
    
  )
}

export default NavBar