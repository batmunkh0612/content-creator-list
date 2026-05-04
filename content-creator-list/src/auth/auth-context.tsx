"use client";

import {
	createContext, useCallback, useContext, useEffect, useState,
	type ReactNode,
} from "react";
import { authApi, type AuthCreds } from "@/lib/api-endpoints";

export type AuthUser = { email: string; name?: string | null };

type AuthState = {
	token: string | null;
	user: AuthUser | null;
	loading: boolean;
	hydrated: boolean;
	login: (creds: AuthCreds) => Promise<AuthUser>;
	register: (creds: AuthCreds) => Promise<AuthUser>;
	logout: () => void;
	changePassword: (data: { currentPassword: string; newPassword: string }) => Promise<AuthUser>;
};

const AuthCtx = createContext<AuthState | null>(null);

const readUser = (): AuthUser | null => {
	const raw = window.localStorage.getItem("user");
	return raw ? (JSON.parse(raw) as AuthUser) : null;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
	const [token, setToken] = useState<string | null>(null);
	const [user, setUser] = useState<AuthUser | null>(null);
	const [loading, setLoading] = useState(false);
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		setToken(window.localStorage.getItem("token"));
		setUser(readUser());
		setHydrated(true);
	}, []);

	useEffect(() => {
		if (!hydrated || !token || user) return;
		setLoading(true);
		authApi.me()
			.then((data) => {
				const d = data as { user: AuthUser };
				setUser(d.user);
				window.localStorage.setItem("user", JSON.stringify(d.user));
			})
			.catch(() => {
				window.localStorage.removeItem("token");
				window.localStorage.removeItem("user");
				setToken(null);
			})
			.finally(() => setLoading(false));
	}, [hydrated, token, user]);

	const persist = useCallback((nextToken: string, nextUser: AuthUser) => {
		window.localStorage.setItem("token", nextToken);
		window.localStorage.setItem("user", JSON.stringify(nextUser));
		setToken(nextToken);
		setUser(nextUser);
	}, []);

	const login = useCallback(async (creds: AuthCreds) => {
		const data = (await authApi.login(creds)) as { token: string; user: AuthUser };
		persist(data.token, data.user);
		return data.user;
	}, [persist]);

	const register = useCallback(async (creds: AuthCreds) => {
		const data = (await authApi.register(creds)) as { token: string; user: AuthUser };
		persist(data.token, data.user);
		return data.user;
	}, [persist]);

	const logout = useCallback(() => {
		window.localStorage.removeItem("token");
		window.localStorage.removeItem("user");
		setToken(null);
		setUser(null);
	}, []);

	const changePassword = useCallback(async (data: { currentPassword: string; newPassword: string }) => {
		const res = (await authApi.changePassword(data)) as { token: string; user: AuthUser };
		persist(res.token, res.user);
		return res.user;
	}, [persist]);

	return (
		<AuthCtx.Provider value={{ token, user, loading, hydrated, login, register, logout, changePassword }}>
			{children}
		</AuthCtx.Provider>
	);
};

export const useAuth = () => {
	const ctx = useContext(AuthCtx);
	if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
	return ctx;
};
