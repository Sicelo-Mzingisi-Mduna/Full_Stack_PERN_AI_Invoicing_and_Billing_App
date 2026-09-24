/* eslint-disable no-unused-vars */
import React from 'react'
// import MotionScroll from '../../components/animations/MotionScroll'
import NavBar from './components/NavBar'
import HeroSection from './components/HeroSection'
import Footer from './components/Footer'
import { useAuth } from '../../context/AuthContext'

const LandingPage = () => {
  const {user, isAuthenticated} = useAuth();
  return (
    <>
    <NavBar />

    <HeroSection />
    
    <Footer/>

    </>
  )
}

export default LandingPage