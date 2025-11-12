import { useEffect, useState } from "react";
import { FiLogIn, FiUserPlus, FiX } from "react-icons/fi";
import { toast } from "react-toastify";

import apiClient from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { AuthTokens } from "../types";

export type AuthMode = "login" | "register";

type AuthModalProps = {
  open: boolean;
  mode: AuthMode;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
};

const initialForm = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
};

const AuthModal = ({ open, mode, onClose, onModeChange }: AuthModalProps) => {
  const { login, isAuthenticated } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm((prev) => ({ ...initialForm, email: prev.email }));
    }
  }, [open, mode]);

  useEffect(() => {
    if (isAuthenticated && open) {
      onClose();
    }
  }, [isAuthenticated, open, onClose]);

  if (!open) return null;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.email || !form.password) {
      toast.error("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "register") {
        await apiClient.post("/auth/register", {
          email: form.email,
          password: form.password,
          first_name: form.firstName,
          last_name: form.lastName,
        });
        toast.success("Registration successful. Please log in.");
        onModeChange("login");
        setForm((prev) => ({ ...prev, password: "" }));
      } else {
        const { data } = await apiClient.post<AuthTokens>("/token/pair", {
          username: form.email,
          password: form.password,
        });
        login(data, form.email);
        toast.success("Welcome back!");
        onClose();
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        "Unable to authenticate.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal__overlay" onClick={onClose} aria-hidden="true" />
      <div className="modal__panel" role="dialog" aria-modal="true">
        <button className="modal__close" type="button" onClick={onClose} aria-label="Close auth modal">
          <FiX />
        </button>
        <div className="auth-card auth-modal-card">
          <div className="auth-card__header">
            <button
              className={`auth-tab ${mode === "login" ? "auth-tab--active" : ""}`}
              type="button"
              onClick={() => onModeChange("login")}
            >
              <FiLogIn />
              Login
            </button>
            <button
              className={`auth-tab ${mode === "register" ? "auth-tab--active" : ""}`}
              type="button"
              onClick={() => onModeChange("register")}
            >
              <FiUserPlus />
              Register
            </button>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="modal-email">Email</label>
              <input
                id="modal-email"
                name="email"
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="modal-password">Password</label>
              <input
                id="modal-password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>
            {mode === "register" && (
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="modal-first-name">First name</label>
                  <input
                    id="modal-first-name"
                    name="firstName"
                    value={form.firstName}
                    onChange={handleChange}
                    placeholder="Jane"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="modal-last-name">Last name</label>
                  <input
                    id="modal-last-name"
                    name="lastName"
                    value={form.lastName}
                    onChange={handleChange}
                    placeholder="Doe"
                  />
                </div>
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
