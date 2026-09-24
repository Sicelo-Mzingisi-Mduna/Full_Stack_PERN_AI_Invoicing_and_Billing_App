/* eslint-disable no-unused-vars */
import React, {useState} from 'react'
import '../Auth/components_styles/SignUp.css'
import '../Auth/components_styles/Loader.css'
import  {useNavigate} from 'react-router-dom'; 
import {API_PATHS} from '../utils/apiPaths.js';
import axiosInstance from '../utils/axiosinstance.js';
import {useAuth} from '../../context/AuthContext.jsx';



const SignUp = () => {
  const navigate = useNavigate();

  const {login} = useAuth()


  return (
    <>
      <h1>Sign Up Page</h1>
    </>
  );
};

export default SignUp