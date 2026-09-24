import axios from "axios";
import {BASE_URL} from "../utils/apiPaths";

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 80000,
  headers: {
    //"Content-Type": "application/json",
    Accept: "application/json",
  },
});

//Request Interceptor

axiosInstance.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("token");
    if(accessToken){
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

//Response Interceptor
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    //Handle common errors globally
    if(error.response){
      if(error.response.status === 401){
        //Redirect to login page
        window.location.href = "/";
      }else if (error.response.status === 500){
        console.error("Internal Server Error. Please try again later.");
      }else if (error.response.status === 404){
        console.error("Resource not found.");
      }else if(error.response.status === 400){
        console.error("Bad Request. Please check your input.");
      }else if(error.response.status === 403){
        console.error("Forbidden. You don't have permission to access this resource.");
      }else if(error.response.status === 408){
        console.error("Request Timeout. Please try again later.");
      }else if(error.response.status === 429){
        console.error("Too Many Requests. Please slow down.");
      }else if(error.response.status === 503){
        console.error("Service Unavailable. Please try again later.");
      }else if(error.response.status === 504){
        console.error("Gateway Timeout. Please try again later.");
      }else if(error.response.status === 502){
        console.error("Bad Gateway. Please try again later.");
      }else if(error.response.status === "ECONNABORTED"){
        console.error("Request Timeout. Please try again later.");
      }
    return Promise.reject(error);
    }
  }
);

export default axiosInstance;