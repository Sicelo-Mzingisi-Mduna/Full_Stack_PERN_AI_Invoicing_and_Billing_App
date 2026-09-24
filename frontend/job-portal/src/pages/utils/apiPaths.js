export const BASE_URL = "http://localhost:8000";

const Auth_body = "/api/auth";
export const API_PATHS = {
  
  AUTH:{
    //--------------------------Auth-------------------------------------

    //1- (POST) Register_User(public)
    REGISTER:`${Auth_body}/register`,

    //2- (POST) Login_User(public)
    LOGIN:`${Auth_body}/login`,

  },
};