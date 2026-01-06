import { useEffect, useState } from 'react';

/**
 * Retrieves a LiveKit token from the backend token server.
 * Expects POST /token to return { server_url, token }.
 */
export function useConnectionDetails(): ConnectionDetails | undefined {
  const [details, setDetails] = useState<ConnectionDetails | undefined>(() => {
    return undefined;
  });

  useEffect(() => {
    fetchToken().then((newDetails) => {
      setDetails(newDetails);
    });
  }, []);

  return details;
}

export async function fetchToken(): Promise<ConnectionDetails | undefined> {
  const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  console.log("Fetching token from:", baseUrl); // <--- Log the URL
  if (!baseUrl) {
    console.error("Base URL is missing!");
    return undefined;
  }
  try {
    const response = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      console.error("Response not OK:", response.status);
      return undefined;
    }
    const json = await response.json();
    if (json?.server_url && json?.token) {
      return {
        url: json.server_url,
        token: json.token,
      };
    }
    return undefined;
  } catch (e) {
    console.error("Fetch error:", e); // <--- Log the actual error
    return undefined;
  }
}

export type ConnectionDetails = {
  url: string;
  token: string;
};
