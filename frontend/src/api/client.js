const baseURL = process.env.REACT_APP_API_URL;

async function handleResponse(response) {
  if (response.status === 401) {
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
    const response = await fetch(`${baseURL}${path}`, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = await handleResponse(response);
    return { data };
  },

  async post(path, body) {
    const response = await fetch(`${baseURL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await handleResponse(response);
    return { data };
  },
};

export default client;
