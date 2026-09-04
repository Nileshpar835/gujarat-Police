import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  timeout: 10000,
});

// Attach the JWT (if we have one) to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cctv_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the token is missing/expired, the backend returns 401 — clear it and
// force back to the login screen rather than showing a broken dashboard.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("cctv_access_token");
      window.dispatchEvent(new Event("cctv-auth-expired"));
    }
    return Promise.reject(error);
  }
);

export const login = (username, password) => {
  const form = new URLSearchParams();
  form.append("username", username);
  form.append("password", password);
  return api
    .post("/auth/login", form, { headers: { "Content-Type": "application/x-www-form-urlencoded" } })
    .then((r) => r.data);
};

export const getMe = () => api.get("/auth/me").then((r) => r.data);

export const getCamerasGis = () => api.get("/cameras/gis").then((r) => r.data);
export const getCameras = (params) => api.get("/cameras", { params }).then((r) => r.data);
export const getAlerts = (params) => api.get("/alerts", { params }).then((r) => r.data);
export const acknowledgeAlert = (alertId) => api.post(`/alerts/${alertId}/acknowledge`).then((r) => r.data);
export const searchVehicles = (q) => api.get("/vehicles/search", { params: { q } }).then((r) => r.data);
export const getVehicleRoute = (registrationNumber) =>
  api.get(`/vehicles/${registrationNumber}/route`).then((r) => r.data);
export const getWatchlists = () => api.get("/watchlists").then((r) => r.data);
export const getDepartments = () => api.get("/departments").then((r) => r.data);

export default api;
