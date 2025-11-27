// src/hooks/useMemberAuth.js
import { useState, useEffect } from "react";
import Cookies from "js-cookie";

const COOKIE_KEY = "user";

/**
 * 读取当前会员信息（不依赖 React，可以在任何地方用）
 */
export function getCurrentMember() {
  try {
    const raw = Cookies.get(COOKIE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("[useMemberAuth] Failed to parse user cookie:", e);
    return null;
  }
}

/**
 * 覆盖当前会员信息到 Cookie
 */
export function setCurrentMember(member) {
  try {
    Cookies.set(COOKIE_KEY, JSON.stringify(member), { expires: 7 });
  } catch (e) {
    console.error("[useMemberAuth] Failed to set user cookie:", e);
  }
}

/**
 * React hook：在组件里方便使用当前会员信息
 */
export function useMemberAuth() {
  const [member, setMember] = useState(() => getCurrentMember());

  useEffect(() => {
    setMember(getCurrentMember());
  }, []);

  const isLoggedIn = !!member;

  return { member, isLoggedIn };
}
