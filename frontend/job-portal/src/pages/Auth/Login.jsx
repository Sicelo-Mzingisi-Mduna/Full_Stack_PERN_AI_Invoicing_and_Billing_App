/* eslint-disable no-unused-vars */
import React, {useState} from 'react'
import '../Auth/components_styles/Login.css'
import '../Auth/components_styles/Loader.css'
import  {useNavigate} from 'react-router-dom';
import {API_PATHS} from '../utils/apiPaths.js';
import axiosInstance from '../utils/axiosinstance.js';
import {useAuth} from '../../context/AuthContext.jsx';

const Login = () => {

  const navigate = useNavigate();

  const {login} = useAuth()

  return (
    <>
    <h1>Login Page</h1>
    </>
  );
};

export default Login