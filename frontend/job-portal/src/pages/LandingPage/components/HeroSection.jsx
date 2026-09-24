/* eslint-disable no-unused-vars */
import React from 'react'
import  {useNavigate} from 'react-router-dom';
import '../components_styles/HeroSection.css'
import { useAuth } from '../../context/AuthContext'
const HeroSection = () => {
  const {user, isAuthenticated} = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <h1>Hero Section</h1>
    </>
  )
}

export default HeroSection