import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { clearAuthHeaders } from "../lib/api";
import type { AuthTokens } from "../types";

type AuthContextValue = {
  tokens: AuthTokens | null;
  userEmail: string | null;
  isAuthenticated: boolean;
  login: (tokens: AuthTokens, email?: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [tokens, setTokens] = useState<AuthTokens | null>(() => {
    const access = localStorage.getItem("accessToken");
    const refresh = localStorage.getItem("refreshToken");
    if (access && refresh) {
      return { access, refresh };
    }
    return null;
  });

  const [userEmail, setUserEmail] = useState<string | null>(() => localStorage.getItem("userEmail"));

  const login = (nextTokens: AuthTokens, email?: string) => {
    setTokens(nextTokens);
    localStorage.setItem("accessToken", nextTokens.access);
    localStorage.setItem("refreshToken", nextTokens.refresh);
    if (email) {
      setUserEmail(email);
      localStorage.setItem("userEmail", email);
    }
  };

  const logout = () => {
    setTokens(null);
    setUserEmail(null);
    clearAuthHeaders();
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userEmail");
  };

  const value = useMemo(
    () => ({
      tokens,
      userEmail,
      isAuthenticated: Boolean(tokens?.access),
      login,
      logout,
    }),
    [tokens, userEmail],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
