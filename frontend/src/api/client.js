const baseURL = process.env.REACT_APP_API_URL;

async function handleResponse(response) {
  if (response.status === 401) {
    const data = await response
      .clone()
      .json()
      .catch(() => ({}));
    // If it's a TastyTrade auth error, let the app handle it via the global fetch interceptor
    if (data.code === "TASTYTRADE_AUTH_REQUIRED") {
      throw new Error("TastyTrade authentication required");
    }
    // Otherwise redirect to login for app authentication issues
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

const client = {
  async get(path) {
    const token = localStorage.getItem("DS");
    const headers = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${baseURL}${path}`, {
      headers,
    });
    const data = await handleResponse(response);
    return { data };
  },

  async post(path, body) {
    const token = localStorage.getItem("DS");
    const headers = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${baseURL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await handleResponse(response);
    return { data };
  },
};

export default client;
