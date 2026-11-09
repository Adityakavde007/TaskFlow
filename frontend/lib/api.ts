import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

export async function apiRequest<T>(
  endpoint: string,
  method = "GET",
  body?: object
): Promise<T> {
  if (!API_URL) {
    throw new Error("Set NEXT_PUBLIC_API_URL in frontend/.env.local.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Please log in to continue.");
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();
  let result: unknown = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error("The API returned an invalid response.");
    }
  }
  if (!response.ok) {
    const message =
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : "The request failed. Please try again.";
    throw new Error(message);
  }

  return result as T;
}
