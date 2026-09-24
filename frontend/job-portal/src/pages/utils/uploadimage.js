import {API_PATHS} from "./apiPaths";
import axiosInstance from "./axiosinstance";

const uploadImage = async (imageFile) => {
  const formData = new FormData();
  formData.append("image", imageFile); // imageFile is now a File object

  try {
    const response = await axiosInstance.post(
      API_PATHS.IMAGE.UPLOAD_IMAGE,
      formData
      // No headers needed – axios sets the correct multipart boundary
    );
    return response;
  } catch (error) {
	  console.error("Error uploading image:", error.response?.data || error);
	  throw error;
}
};

export default uploadImage